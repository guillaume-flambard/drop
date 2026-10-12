import type { Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { generateIdentity, sealEnvelope, signDetached, type Envelope, type Identity } from '@drop/protocol';
import { RelayClient, startRelay, type RelayHandle, type SendOutcome } from '../src/index.ts';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function relayFor(identities: Identity[], pingIntervalMs?: number): Promise<RelayHandle> {
  const relay = await startRelay(
    { port: 0, allowedNodeIds: identities.map((identity) => identity.nodeId) },
    { logger: () => undefined, ...(pingIntervalMs === undefined ? {} : { pingIntervalMs }) },
  );
  cleanups.push(() => relay.close());
  return relay;
}

/** A raw authenticated connection: every frame the relay sends is kept, and the network socket is reachable. */
function rawAuthed(relay: RelayHandle, identity: Identity, autoPong = true) {
  const socket = new WebSocket(relay.url, { autoPong });
  const frames: { type: string; id?: string; error?: string }[] = [];
  let network: Socket | undefined;
  socket.on('upgrade', (response) => {
    network = response.socket;
  });
  const closed = new Promise<number>((resolve) => {
    socket.on('close', (code) => {
      resolve(code);
    });
  });
  const ready = new Promise<void>((resolve, reject) => {
    socket.on('message', (data) => {
      const frame = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : '{}') as {
        type: string;
        challenge?: string;
      };
      frames.push(frame);
      if (frame.type === 'challenge')
        void signDetached(identity, frame.challenge ?? '').then((sig) => {
          socket.send(JSON.stringify({ type: 'auth', nodeId: identity.nodeId, sig }));
        }, reject);
      if (frame.type === 'ready') resolve();
    });
  });
  cleanups.push(() => {
    socket.terminate();
  });
  return { socket, frames, ready, closed, network: () => network };
}

async function until(check: () => boolean, ms = 3_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('E_TEST_TIMEOUT condition not reached');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** An envelope the relay's schema refuses before reading its id: it answers E_SCHEMA without one. */
function malformed(envelope: Envelope): Envelope {
  return { ...envelope, v: 99 } as unknown as Envelope;
}

describe('relay answers and liveness (T4.39)', () => {
  it('answers every envelope frame once, in the order received, including an error without id', async () => {
    const alice = await generateIdentity('Alice');
    const bob = await generateIdentity('Bob');
    const relay = await relayFor([alice, bob]);
    const raw = rawAuthed(relay, alice);
    await raw.ready;
    const first = await sealEnvelope(alice, bob.nodeId, { type: 'catalog_request' });
    const second = await sealEnvelope(alice, bob.nodeId, { type: 'catalog_request' });
    const third = await sealEnvelope(alice, bob.nodeId, { type: 'catalog_request' });
    for (const envelope of [first, malformed(second), third])
      raw.socket.send(JSON.stringify({ type: 'envelope', envelope }));
    const answers = () => raw.frames.filter((frame) => frame.type === 'ack' || frame.type === 'error');
    await until(() => answers().length === 3);
    expect(answers()).toEqual([
      { type: 'ack', id: first.id, status: 'queued' },
      { type: 'error', error: 'E_SCHEMA' },
      { type: 'ack', id: third.id, status: 'queued' },
    ]);
  });

  it('resolves at once, with E_SCHEMA, a send the real relay answers without an id', async () => {
    const alice = await generateIdentity('Alice');
    const bob = await generateIdentity('Bob');
    const relay = await relayFor([alice, bob]);
    const statuses: string[] = [];
    const client = new RelayClient({
      identity: alice,
      url: relay.url,
      onEnvelope: () => undefined,
      onStatus: (status) => statuses.push(status),
    });
    cleanups.push(() => {
      client.close();
    });
    client.start();
    await client.waitReady();
    const started = Date.now();
    const outcomes: SendOutcome[] = await Promise.all([
      client.send(await sealEnvelope(alice, bob.nodeId, { type: 'catalog_request' })),
      client.send(malformed(await sealEnvelope(alice, bob.nodeId, { type: 'catalog_request' }))),
      client.send(await sealEnvelope(alice, bob.nodeId, { type: 'catalog_request' })),
    ]);
    expect(outcomes).toEqual(['queued', 'E_SCHEMA', 'queued']);
    // Not released by the 15 s acknowledgement delay, and the connection was not given up.
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(client.connected).toBe(true);
    expect(statuses).toEqual(['connected']);
  });

  it('keeps a node whose slow uplink is still carrying a frame, and cuts it once its bytes stop', async () => {
    const alice = await generateIdentity('Alice');
    const relay = await relayFor([alice], 100);
    // No pong at all: only the bytes of a frame that never ends can keep it.
    const raw = rawAuthed(relay, alice, false);
    await raw.ready;
    const network = raw.network();
    if (!network) throw new Error('E_TEST_SOCKET');
    let closedAt: number | undefined;
    raw.closed.then(
      () => {
        closedAt = Date.now();
      },
      () => undefined,
    );
    // A masked client text frame announcing 10 000 bytes, then a few bytes every 50 ms for 1 s (ten ping intervals).
    network.write(Buffer.from([0x81, 0xfe, 0x27, 0x10, 0x01, 0x02, 0x03, 0x04]));
    for (let step = 0; step < 20; step += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      network.write(Buffer.alloc(8, 0x61));
    }
    expect(closedAt).toBeUndefined();
    const stoppedAt = Date.now();
    await raw.closed;
    // Two pings without a byte or a pong, then the cut: within three intervals and some scheduling margin.
    expect((closedAt ?? Infinity) - stoppedAt).toBeLessThan(1_000);
  });
});
