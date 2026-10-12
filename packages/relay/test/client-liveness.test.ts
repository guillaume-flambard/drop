import { createServer, type Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { generateIdentity, sealEnvelope, type Identity } from '@drop/protocol';
import { RelayClient, type RelayClientLogEntry, type SendOutcome } from '../src/index.ts';

/**
 * How the fake relay treats one connection, by order of arrival:
 * - normal: challenge, ready, acknowledges every envelope;
 * - silent: after ready, drops whatever it reads and never answers, without closing (a half-open link);
 * - half-close: after ready, sends the TCP FIN without a WebSocket close frame and keeps its side open;
 * - no-ack: answers pings but never acknowledges an envelope;
 * - mute: accepts the TCP connection and never answers the HTTP upgrade;
 * - reorder: leaves the first envelope unanswered, acknowledges the second, then sends an error without id (T4.39).
 */
type Mode = 'normal' | 'silent' | 'half-close' | 'no-ack' | 'mute' | 'reorder';

interface FakeRelay {
  url: string;
  connections: number;
  /** Envelope frames read on every connection, answered or not. */
  envelopes: number;
  /** Raw sockets of every connection, in order of arrival, with whether each one has closed. */
  sockets: { socket: Duplex; closed: boolean }[];
  /**
   * Sends the TCP FIN of one connection without a close frame, keeps its side open and discards what it reads. With
   * `unread`, a last text frame goes out just before the FIN.
   */
  halfClose: (index: number, unread?: boolean) => void;
  close: () => Promise<void>;
}

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** Timers are simulated: the defaults (15 s) run in milliseconds. Real time still moves them, so sockets work. */
function fakeTimers(): void {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    shouldAdvanceTime: true,
  });
}

/** Lets real I/O run (not faked), up to two seconds of real time. */
async function settle(check: () => boolean): Promise<void> {
  const deadline = performance.now() + 2_000;
  while (!check()) {
    if (performance.now() > deadline) throw new Error('E_TEST_TIMEOUT condition not reached');
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function fakeRelay(identity: Identity, modes: Mode[]): Promise<FakeRelay> {
  const http: Server = createServer();
  const wss = new WebSocketServer({ noServer: true });
  const relay: FakeRelay = {
    url: '',
    connections: 0,
    envelopes: 0,
    sockets: [],
    halfClose: (index, unread = false) => {
      const entry = relay.sockets[index];
      if (!entry) return;
      // Out of ws's hands: it would otherwise end the connection for good once its own side is done.
      for (const event of ['data', 'end', 'close', 'finish', 'error']) entry.socket.removeAllListeners(event);
      entry.socket.on('error', () => undefined);
      entry.socket.on('close', () => {
        entry.closed = true;
      });
      entry.socket.resume();
      // An unmasked server text frame carrying `{}`, which the client ignores as a malformed frame.
      if (unread) entry.socket.write(Buffer.from([0x81, 0x02, 0x7b, 0x7d]));
      entry.socket.end();
    },
    close: () => Promise.resolve(),
  };
  http.on('upgrade', (request, socket, head) => {
    const mode = modes[relay.connections] ?? 'normal';
    relay.connections += 1;
    const entry = { socket, closed: false };
    relay.sockets.push(entry);
    socket.on('close', () => {
      entry.closed = true;
    });
    socket.on('error', () => undefined);
    if (mode === 'mute') {
      // HTTP sockets are half-open capable: end this side too once the client ends its own, so the close shows.
      socket.on('end', () => socket.end());
      socket.resume();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.on('error', () => undefined);
      ws.send(JSON.stringify({ type: 'challenge', challenge: 'a'.repeat(43) }));
      let authed = false;
      let seen = 0;
      ws.on('message', (data: Buffer) => {
        if (!authed) {
          authed = true;
          ws.send(JSON.stringify({ type: 'ready', nodeId: identity.nodeId }));
          // Reads and drops everything without answering: no pong, no ack, no FIN. Reading on lets the test see the
          // client's own FIN when it gives the connection up.
          if (mode === 'silent') {
            socket.removeAllListeners('data');
            socket.on('data', () => undefined);
          }
          if (mode === 'half-close') relay.halfClose(relay.connections - 1);
          return;
        }
        const frame = JSON.parse(data.toString()) as { envelope: { id: string } };
        relay.envelopes += 1;
        seen += 1;
        if (mode === 'normal') ws.send(JSON.stringify({ type: 'ack', id: frame.envelope.id, status: 'delivered' }));
        if (mode === 'reorder' && seen === 2) {
          ws.send(JSON.stringify({ type: 'ack', id: frame.envelope.id, status: 'delivered' }));
          ws.send(JSON.stringify({ type: 'error', error: 'E_SCHEMA' }));
        }
      });
    });
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('E_TEST_ADDRESS');
  relay.url = `ws://127.0.0.1:${String(address.port)}/v1`;
  relay.close = () =>
    new Promise<void>((resolve) => {
      for (const { socket } of relay.sockets) socket.destroy();
      http.close(() => {
        resolve();
      });
    });
  cleanups.push(() => relay.close());
  return relay;
}

async function setup(modes: Mode[]) {
  const identity = await generateIdentity('Liveness');
  const relay = await fakeRelay(identity, modes);
  const statuses: string[] = [];
  const logs: RelayClientLogEntry[] = [];
  const client = new RelayClient({
    identity,
    url: relay.url,
    onEnvelope: () => undefined,
    onStatus: (status) => statuses.push(status),
    log: (entry) => logs.push(entry),
  });
  cleanups.push(() => {
    client.close();
  });
  const connected = () => statuses.filter((status) => status === 'connected').length;
  return { identity, relay, client, statuses, logs, connected };
}

/** Lets a frame just sent leave the process: the acknowledgement delay starts once it is written. */
async function written(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) await new Promise((resolve) => setImmediate(resolve));
}

/** Starts a send and records its outcome when it settles. */
function track(promise: Promise<SendOutcome>): { outcome: SendOutcome | undefined } {
  const result: { outcome: SendOutcome | undefined } = { outcome: undefined };
  promise.then(
    (outcome) => {
      result.outcome = outcome;
    },
    () => undefined,
  );
  return result;
}

describe('relay client liveness', () => {
  it('reconnects within two heartbeat intervals when the relay stops answering without closing', async () => {
    fakeTimers();
    const { relay, client, statuses, logs, connected } = await setup(['silent']);
    client.start();
    await settle(() => connected() === 1);
    await vi.advanceTimersByTimeAsync(14_000);
    expect(statuses).toEqual(['connected']);
    await vi.advanceTimersByTimeAsync(16_000);
    await settle(() => statuses.includes('disconnected'));
    expect(logs).toContainEqual(expect.objectContaining({ code: 'E_RELAY_TIMEOUT', reason: 'heartbeat' }));
    // The dead connection is destroyed, not left open on the client side.
    await settle(() => relay.sockets[0]?.closed === true);
    await vi.advanceTimersByTimeAsync(1_000);
    await settle(() => connected() === 2);
    expect(relay.connections).toBe(2);
  });

  it('reconnects at once when the relay half-closes the connection without a close frame', async () => {
    fakeTimers();
    const { relay, client, statuses, connected } = await setup(['half-close']);
    client.start();
    await settle(() => statuses.includes('disconnected'));
    expect(statuses[0]).toBe('connected');
    await vi.advanceTimersByTimeAsync(1_000);
    await settle(() => connected() === 2);
    expect(relay.connections).toBe(2);
  });

  it('releases a send left without acknowledgement as unconfirmed after 15 s and reconnects', async () => {
    fakeTimers();
    const { identity, relay, client, logs, connected } = await setup(['no-ack']);
    client.start();
    await settle(() => connected() === 1);
    const envelope = await sealEnvelope(identity, identity.nodeId, { type: 'catalog_request' });
    const sent = track(client.send(envelope));
    await written();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(sent.outcome).toBeUndefined();
    // 15 s plus the time its few hundred bytes take at the floor rate (T4.39).
    await vi.advanceTimersByTimeAsync(1_000);
    await settle(() => sent.outcome !== undefined);
    // The frame was handed to the connection: the relay may have it (T4.39).
    expect(sent.outcome).toBe('unconfirmed');
    expect(logs).toContainEqual(expect.objectContaining({ code: 'E_RELAY_TIMEOUT', reason: 'ack' }));
    await vi.advanceTimersByTimeAsync(1_000);
    await settle(() => connected() === 2);
    // The next connection acknowledges: the same envelope goes through.
    expect(await client.send(envelope)).toBe('delivered');
    expect(relay.connections).toBe(2);
  });

  it('keeps backing off after giving up, instead of redialing every second a relay that never acknowledges', async () => {
    fakeTimers();
    const { identity, relay, client, connected } = await setup(['no-ack', 'no-ack', 'no-ack']);
    client.start();
    await settle(() => connected() === 1);
    // A new envelope each time: the same one would see its own delay doubled (T4.39).
    const giveUp = async () => {
      const envelope = await sealEnvelope(identity, identity.nodeId, { type: 'catalog_request' });
      const sent = track(client.send(envelope));
      await written();
      // 15 s plus about 0.1 s for its 429 bytes at the floor rate.
      await vi.advanceTimersByTimeAsync(15_500);
      await settle(() => sent.outcome === 'unconfirmed');
    };
    await giveUp();
    // First give-up: the usual first delay.
    await vi.advanceTimersByTimeAsync(1_000);
    await settle(() => connected() === 2);
    // This connection is ready but has not proven itself: the next delay doubles instead of starting over.
    await giveUp();
    await vi.advanceTimersByTimeAsync(1_000);
    // Real I/O time for a redial to reach the relay, had one been made: none comes.
    const until = performance.now() + 300;
    while (performance.now() < until) await new Promise((resolve) => setImmediate(resolve));
    expect(relay.connections).toBe(2);
    await vi.advanceTimersByTimeAsync(1_000);
    await settle(() => connected() === 3);
    expect(relay.connections).toBe(3);
  });

  it('gives up a connection attempt whose handshake is never answered and tries again', async () => {
    fakeTimers();
    const { relay, client, logs, connected } = await setup(['mute']);
    client.start();
    await settle(() => relay.connections === 1);
    await vi.advanceTimersByTimeAsync(14_000);
    expect(relay.connections).toBe(1);
    expect(connected()).toBe(0);
    await vi.advanceTimersByTimeAsync(1_000);
    await settle(() => logs.some((entry) => entry.reason === 'connect'));
    expect(logs).toContainEqual(expect.objectContaining({ code: 'E_RELAY_TIMEOUT', reason: 'connect' }));
    await settle(() => relay.sockets[0]?.closed === true);
    await vi.advanceTimersByTimeAsync(1_000);
    await settle(() => connected() === 1);
    expect(relay.connections).toBe(2);
  });

  it('releases a socket it stopped reading, left in CLOSE_WAIT, and reconnects', async () => {
    fakeTimers();
    const { relay, client, statuses, logs, connected } = await setup(['normal']);
    client.start();
    await settle(() => connected() === 1);
    // The client stops reading its socket, then the relay sends one more frame and closes its side. With bytes still
    // unread, Node never emits 'end': the FIN stays with the system and the socket sits in CLOSE_WAIT, as in T4.6a.
    const inner = (client as unknown as { socket: WebSocket | undefined }).socket;
    inner?.pause();
    relay.halfClose(0, true);
    await vi.advanceTimersByTimeAsync(14_000);
    expect(statuses).toEqual(['connected']);
    await vi.advanceTimersByTimeAsync(16_000);
    await settle(() => statuses.includes('disconnected'));
    expect(logs).toContainEqual(expect.objectContaining({ code: 'E_RELAY_TIMEOUT', reason: 'heartbeat' }));
    await settle(() => relay.sockets[0]?.closed === true);
    await vi.advanceTimersByTimeAsync(1_000);
    await settle(() => connected() === 2);
  });

  it('settles pending sends as unconfirmed on close', async () => {
    const { identity, client, connected } = await setup(['no-ack']);
    client.start();
    await settle(() => connected() === 1);
    const envelope = await sealEnvelope(identity, identity.nodeId, { type: 'catalog_request' });
    const sent = track(client.send(envelope));
    client.close();
    await settle(() => sent.outcome !== undefined);
    expect(sent.outcome).toBe('unconfirmed');
  });

  it('settles a send made without a ready connection as offline', async () => {
    const { identity, client } = await setup(['normal']);
    const envelope = await sealEnvelope(identity, identity.nodeId, { type: 'catalog_request' });
    // Never started: the frame cannot leave this node.
    expect(await client.send(envelope)).toBe('offline');
  });

  it('does not attribute an error without id once the relay answered out of order', async () => {
    fakeTimers();
    const { identity, relay, client, logs, connected } = await setup(['reorder']);
    client.start();
    await settle(() => connected() === 1);
    const first = track(client.send(await sealEnvelope(identity, identity.nodeId, { type: 'catalog_request' })));
    const second = track(client.send(await sealEnvelope(identity, identity.nodeId, { type: 'catalog_request' })));
    await settle(() => second.outcome !== undefined);
    expect(second.outcome).toBe('delivered');
    // The error came after an answer out of order: nothing proves which send it is for.
    await written();
    await vi.advanceTimersByTimeAsync(14_000);
    expect(first.outcome).toBeUndefined();
    await vi.advanceTimersByTimeAsync(2_000);
    await settle(() => first.outcome !== undefined);
    expect(first.outcome).toBe('unconfirmed');
    expect(logs).toContainEqual(expect.objectContaining({ code: 'E_RELAY_TIMEOUT', reason: 'ack' }));
    expect(relay.envelopes).toBe(2);
  });

  it('waits for a big envelope at the floor rate, through silent heartbeat intervals, before giving up its acknowledgement', async () => {
    fakeTimers();
    const { identity, client, statuses, logs, connected } = await setup(['silent']);
    client.start();
    await settle(() => connected() === 1);
    const sealed = await sealEnvelope(identity, identity.nodeId, { type: 'catalog_request' });
    // About 200 000 bytes: 50 s at 32 kbit/s on top of the 15 s base. The fake relay never sees its shape.
    const big = { ...sealed, pad: 'x'.repeat(200_000) } as typeof sealed;
    const sent = track(client.send(big));
    await written();
    // Four heartbeat intervals without a single frame from the relay: the uplink may still be busy with the envelope.
    await vi.advanceTimersByTimeAsync(64_000);
    expect(sent.outcome).toBeUndefined();
    expect(statuses).toEqual(['connected']);
    await vi.advanceTimersByTimeAsync(3_000);
    await settle(() => sent.outcome !== undefined);
    expect(sent.outcome).toBe('unconfirmed');
    expect(logs).toEqual([expect.objectContaining({ code: 'E_RELAY_TIMEOUT', reason: 'ack' })]);
  });

  it('doubles the acknowledgement delay for an envelope that already caused a give-up', async () => {
    fakeTimers();
    const { identity, client, logs, connected } = await setup(['no-ack', 'no-ack']);
    client.start();
    await settle(() => connected() === 1);
    const envelope = await sealEnvelope(identity, identity.nodeId, { type: 'catalog_request' });
    const first = track(client.send(envelope));
    await written();
    await vi.advanceTimersByTimeAsync(16_000);
    await settle(() => first.outcome === 'unconfirmed');
    await vi.advanceTimersByTimeAsync(1_000);
    await settle(() => connected() === 2);
    const again = track(client.send(envelope));
    await written();
    await vi.advanceTimersByTimeAsync(29_000);
    expect(again.outcome).toBeUndefined();
    await vi.advanceTimersByTimeAsync(2_000);
    await settle(() => again.outcome !== undefined);
    expect(again.outcome).toBe('unconfirmed');
    expect(logs.filter((entry) => entry.reason === 'ack')).toHaveLength(2);
  });

  it('stops sending an envelope that caused three acknowledgement give-ups', async () => {
    fakeTimers();
    const { identity, relay, client, logs, connected } = await setup(['no-ack', 'no-ack', 'no-ack', 'no-ack']);
    client.start();
    await settle(() => connected() === 1);
    const envelope = await sealEnvelope(identity, identity.nodeId, { type: 'catalog_request' });
    // 15 s, then 30 s, then 60 s (plus the floor-rate allowance), with the growing redial delay in between.
    for (const [index, wait] of [16_000, 31_000, 61_000].entries()) {
      const sent = track(client.send(envelope));
      await written();
      await vi.advanceTimersByTimeAsync(wait);
      await settle(() => sent.outcome === 'unconfirmed');
      await vi.advanceTimersByTimeAsync(5_000);
      await settle(() => connected() === index + 2);
    }
    expect(relay.envelopes).toBe(3);
    expect(await client.send(envelope)).toBe('E_RELAY_TIMEOUT');
    expect(logs).toContainEqual(expect.objectContaining({ code: 'E_RELAY_TIMEOUT', reason: 'ack_retries' }));
    await written();
    expect(relay.envelopes).toBe(3);
    // Another envelope still goes out on the same connection.
    track(client.send(await sealEnvelope(identity, identity.nodeId, { type: 'catalog_request' })));
    await settle(() => relay.envelopes === 4);
  });

  it('keeps a connection while a big inbound frame trickles in, and gives it up once the bytes stop', async () => {
    fakeTimers();
    const { relay, client, statuses, logs, connected } = await setup(['silent']);
    client.start();
    await settle(() => connected() === 1);
    const raw = relay.sockets[0]?.socket;
    if (!raw) throw new Error('E_TEST_SOCKET');
    // An unmasked server text frame announcing 1 000 bytes, of which only a few arrive every 10 s.
    raw.write(Buffer.from([0x81, 126, 0x03, 0xe8]));
    for (let step = 0; step < 6; step += 1) {
      await vi.advanceTimersByTimeAsync(10_000);
      raw.write(Buffer.from('xxxxxxxxxx'));
      await pause(50);
    }
    // 60 s without a whole frame: the bytes alone kept it.
    expect(statuses).toEqual(['connected']);
    await vi.advanceTimersByTimeAsync(31_000);
    await settle(() => statuses.includes('disconnected'));
    expect(logs).toEqual([expect.objectContaining({ code: 'E_RELAY_TIMEOUT', reason: 'heartbeat' })]);
  });
});

/** Real time for I/O to land while timers are faked. */
async function pause(ms: number): Promise<void> {
  const until = performance.now() + ms;
  while (performance.now() < until) await new Promise((resolve) => setImmediate(resolve));
}
