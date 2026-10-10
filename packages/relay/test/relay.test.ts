import { afterEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { mkdtempSync, readFileSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createAdmission,
  generateIdentity,
  MAX_ENVELOPE_BYTES,
  sealEnvelope,
  signDetached,
  verifyDetached,
  type Envelope,
  type Identity,
} from '@drop/protocol';
import {
  RelayClient,
  startRelay,
  revokeNode,
  readRelayConfig,
  type RelayHandle,
  type RelayLogEntry,
} from '../src/index.ts';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function relayFor(
  identities: Identity[],
  extra: { rateLimitPerMinute?: number; admittedPath?: string; maxAdmissionsPerSponsorPerDay?: number } = {},
  options: { now?: () => number; pingIntervalMs?: number } = {},
) {
  const logs: RelayLogEntry[] = [];
  const relay = await startRelay(
    { port: 0, allowedNodeIds: identities.map((identity) => identity.nodeId), ...extra },
    { logger: (entry) => logs.push(entry), ...options },
  );
  cleanups.push(() => relay.close());
  return { relay, logs };
}

function client(relay: RelayHandle, identity: Identity, admission?: unknown) {
  const received: Envelope[] = [];
  const statuses: string[] = [];
  const instance = new RelayClient({
    identity,
    url: relay.url,
    ...(admission === undefined ? {} : { admission: () => admission }),
    onEnvelope: (envelope) => received.push(envelope),
    onStatus: (status) => statuses.push(status),
    minBackoffMs: 20,
    maxBackoffMs: 50,
  });
  instance.start();
  cleanups.push(() => {
    instance.close();
  });
  return { instance, received, statuses };
}

async function until(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('relay', () => {
  it('keeps revoked members and their sponsored invitations refused after restore', async () => {
    const alice = await generateIdentity('Alice');
    const bob = await generateIdentity('Bob');
    const newcomer = await generateIdentity('New');
    const dir = mkdtempSync(join(tmpdir(), 'drop-revoked-'));
    cleanups.push(() => {
      rmSync(dir, { recursive: true, force: true });
    });
    const configPath = join(dir, 'relay.config.json');
    const statePath = join(dir, 'admitted.json');
    writeFileSync(configPath, JSON.stringify({ port: 0, allowedNodeIds: [alice.nodeId], admittedPath: statePath }));
    writeFileSync(
      statePath,
      JSON.stringify({ admitted: [{ nodeId: bob.nodeId, sponsor: alice.nodeId, at: Date.now() }], spentNonces: [] }),
    );
    expect(revokeNode(configPath, bob.nodeId)).toBe(true);
    expect(revokeNode(configPath, bob.nodeId)).toBe(false);
    // Restoration uses both the config (revocations) and admissions, including the revoked member's old entry.
    const restoredConfig = readRelayConfig(configPath);
    const relay = await startRelay(restoredConfig, { logger: () => undefined });
    cleanups.push(() => relay.close());
    const ticket = await createAdmission(alice, Date.now());
    const denied = client(relay, bob, ticket);
    const sponsored = client(relay, newcomer, await createAdmission(bob, Date.now()));
    const permitted = client(relay, alice);
    await permitted.instance.waitReady();
    await until(() => denied.statuses.includes('unauthorized') && sponsored.statuses.includes('unauthorized'));
    expect(denied.instance.connected).toBe(false);
    expect(sponsored.instance.connected).toBe(false);
  });

  it('direct delivery between two in-memory nodes', async () => {
    const alice = await generateIdentity('Alice');
    const bob = await generateIdentity('Bob');
    const { relay } = await relayFor([alice, bob]);
    const a = client(relay, alice);
    const b = client(relay, bob);
    await Promise.all([a.instance.waitReady(), b.instance.waitReady()]);
    const envelope = await sealEnvelope(alice, bob.nodeId, { type: 'catalog_request' });
    expect(await a.instance.send(envelope)).toBe('delivered');
    await until(() => b.received.length === 1);
    expect(b.received[0]).toEqual(envelope);
  });

  it('deferred delivery after reconnect', async () => {
    const alice = await generateIdentity('Alice');
    const bob = await generateIdentity('Bob');
    const { relay } = await relayFor([alice, bob]);
    const a = client(relay, alice);
    await a.instance.waitReady();
    const envelope = await sealEnvelope(alice, bob.nodeId, { type: 'catalog_request' });
    expect(await a.instance.send(envelope)).toBe('queued');
    const b = client(relay, bob);
    await until(() => b.received.length === 1);
    expect(b.received[0]?.id).toBe(envelope.id);
  });

  it('drops a queued envelope once it expires', async () => {
    const alice = await generateIdentity('Alice');
    const bob = await generateIdentity('Bob');
    const { relay } = await relayFor([alice, bob]);
    const a = client(relay, alice);
    await a.instance.waitReady();
    const envelope = await sealEnvelope(alice, bob.nodeId, { type: 'catalog_request' }, { ttlMs: 30 });
    expect(await a.instance.send(envelope)).toBe('queued');
    await new Promise((resolve) => setTimeout(resolve, 60));
    const b = client(relay, bob);
    await b.instance.waitReady();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(b.received).toEqual([]);
  });

  it('rejects a spoofed from', async () => {
    const alice = await generateIdentity('Alice');
    const bob = await generateIdentity('Bob');
    const mallory = await generateIdentity('Mallory');
    const { relay, logs } = await relayFor([alice, bob, mallory]);
    const m = client(relay, mallory);
    await m.instance.waitReady();
    const forged = await sealEnvelope(alice, bob.nodeId, { type: 'catalog_request' });
    expect(await m.instance.send(forged)).toBe('offline');
    expect(logs).toContainEqual(expect.objectContaining({ outcome: 'spoofed_from', from: alice.nodeId }));
  });

  it('signs only a 32-byte challenge, never another text a relay sends', async () => {
    const alice = await generateIdentity('Alice');
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    cleanups.push(
      () =>
        new Promise<void>((resolve) => {
          for (const socket of server.clients) socket.terminate();
          server.close(() => {
            resolve();
          });
        }),
    );
    const answers: string[] = [];
    server.on('connection', (socket) => {
      socket.on('message', (data) => answers.push(Buffer.isBuffer(data) ? data.toString('utf8') : ''));
      // A text another protocol would accept as proof (a local network session, D63): no answer expected.
      socket.send(JSON.stringify({ type: 'challenge', challenge: `drop-lan-v1|${'a'.repeat(43)}|x|y` }));
      setTimeout(() => {
        socket.send(JSON.stringify({ type: 'challenge', challenge: 'b'.repeat(43) }));
      }, 200);
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const client = new RelayClient({
      identity: alice,
      url: `ws://127.0.0.1:${String(port)}/v1`,
      onEnvelope: () => undefined,
    });
    cleanups.push(() => {
      client.close();
    });
    client.start();
    await until(() => answers.length > 0);
    expect(answers).toHaveLength(1);
    const auth = JSON.parse(answers[0] ?? '{}') as { type: string; sig: string };
    expect(auth.type).toBe('auth');
    expect(await verifyDetached(alice.nodeId, 'b'.repeat(43), auth.sig)).toBe(true);
  });

  it('rejects a node that is not allowed', async () => {
    const alice = await generateIdentity('Alice');
    const stranger = await generateIdentity('Stranger');
    const { relay } = await relayFor([alice]);
    const code = await new Promise<number>((resolve) => {
      const socket = new WebSocket(relay.url);
      socket.on('message', (data) => {
        const frame = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : '{}') as { challenge: string };
        void signDetached(stranger, frame.challenge).then((sig) => {
          socket.send(JSON.stringify({ type: 'auth', nodeId: stranger.nodeId, sig }));
        }, resolve);
      });
      socket.on('close', (closeCode) => {
        resolve(closeCode);
      });
    });
    expect(code).toBe(4401);
  });

  it('rate limit', async () => {
    const alice = await generateIdentity('Alice');
    const bob = await generateIdentity('Bob');
    const { relay } = await relayFor([alice, bob], { rateLimitPerMinute: 3 });
    const a = client(relay, alice);
    await a.instance.waitReady();
    const outcomes: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      outcomes.push(await a.instance.send(await sealEnvelope(alice, bob.nodeId, { type: 'catalog_request' })));
    }
    expect(outcomes).toEqual(['queued', 'queued', 'queued', 'E_RATE']);
  });

  it('restores a sender once its rate window has passed, with idle windows swept', async () => {
    const alice = await generateIdentity('Alice');
    const bob = await generateIdentity('Bob');
    const clock = { now: Date.now() };
    const { relay } = await relayFor(
      [alice, bob],
      { rateLimitPerMinute: 1 },
      { now: () => clock.now, pingIntervalMs: 20 },
    );
    const sender = client(relay, alice);
    await sender.instance.waitReady();
    const send = async () => sender.instance.send(await sealEnvelope(alice, bob.nodeId, { type: 'catalog_request' }));
    expect(await send()).toBe('queued');
    expect(await send()).toBe('E_RATE');
    clock.now += 60_001;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(await send()).toBe('queued');
    expect(await send()).toBe('E_RATE');
  });

  it('keeps a node rate limit after reconnect', async () => {
    const alice = await generateIdentity('Alice');
    const bob = await generateIdentity('Bob');
    const { relay } = await relayFor([alice, bob], { rateLimitPerMinute: 2 });
    const first = client(relay, alice);
    await first.instance.waitReady();
    for (let index = 0; index < 2; index += 1) {
      expect(await first.instance.send(await sealEnvelope(alice, bob.nodeId, { type: 'catalog_request' }))).toBe(
        'queued',
      );
    }
    first.instance.close();
    const second = client(relay, alice);
    await second.instance.waitReady();
    expect(await second.instance.send(await sealEnvelope(alice, bob.nodeId, { type: 'catalog_request' }))).toBe(
      'E_RATE',
    );
  });

  it('counts oversized envelopes against the sender rate limit', async () => {
    const alice = await generateIdentity('Alice');
    const bob = await generateIdentity('Bob');
    const { relay } = await relayFor([alice, bob], { rateLimitPerMinute: 1 });
    const a = client(relay, alice);
    await a.instance.waitReady();
    const oversized = await sealEnvelope(alice, bob.nodeId, { type: 'catalog_request' });
    oversized.body = 'A'.repeat(MAX_ENVELOPE_BYTES);
    expect(await a.instance.send(oversized)).toBe('E_TOO_LARGE');
    expect(await a.instance.send(await sealEnvelope(alice, bob.nodeId, { type: 'catalog_request' }))).toBe('E_RATE');
  });

  it('counts a frame rejected by the WebSocket payload limit before reconnect', async () => {
    const alice = await generateIdentity('Alice');
    const bob = await generateIdentity('Bob');
    const { relay, logs } = await relayFor([alice, bob], { rateLimitPerMinute: 1 });
    const socket = new WebSocket(relay.url);
    cleanups.push(() => {
      socket.terminate();
    });
    let ready = false;
    let closed = false;
    socket.on('message', (data) => {
      const frame = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : '') as {
        type: string;
        challenge?: string;
      };
      if (frame.type === 'challenge' && frame.challenge) {
        void signDetached(alice, frame.challenge).then(
          (sig) => {
            socket.send(JSON.stringify({ type: 'auth', nodeId: alice.nodeId, sig }));
          },
          () => {
            socket.close();
          },
        );
      }
      if (frame.type === 'ready') ready = true;
    });
    socket.on('close', () => {
      closed = true;
    });
    await until(() => ready);
    socket.send('X'.repeat(MAX_ENVELOPE_BYTES * 2 + 1));
    await until(() => closed);
    const reconnected = client(relay, alice);
    await reconnected.instance.waitReady();
    expect(await reconnected.instance.send(await sealEnvelope(alice, bob.nodeId, { type: 'catalog_request' }))).toBe(
      'E_RATE',
    );
    expect(logs).toContainEqual(expect.objectContaining({ nodeId: alice.nodeId, outcome: 'E_TOO_LARGE' }));
  });

  it('counts invalid UTF-8 frames rejected by WebSocket before reconnect', async () => {
    const alice = await generateIdentity('Alice');
    const bob = await generateIdentity('Bob');
    const { relay, logs } = await relayFor([alice, bob], { rateLimitPerMinute: 1 });
    const socket = new WebSocket(relay.url);
    cleanups.push(() => {
      socket.terminate();
    });
    let ready = false;
    let closed = false;
    socket.on('message', (data) => {
      const frame = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : '') as {
        type: string;
        challenge?: string;
      };
      if (frame.type === 'challenge' && frame.challenge) {
        void signDetached(alice, frame.challenge).then(
          (sig) => {
            socket.send(JSON.stringify({ type: 'auth', nodeId: alice.nodeId, sig }));
          },
          () => {
            socket.close();
          },
        );
      }
      if (frame.type === 'ready') ready = true;
    });
    socket.on('close', () => {
      closed = true;
    });
    await until(() => ready);
    socket.send(Buffer.from([0xff]), { binary: false });
    await until(() => closed);
    const reconnected = client(relay, alice);
    await reconnected.instance.waitReady();
    expect(await reconnected.instance.send(await sealEnvelope(alice, bob.nodeId, { type: 'catalog_request' }))).toBe(
      'E_RATE',
    );
    expect(logs).toContainEqual(expect.objectContaining({ nodeId: alice.nodeId, outcome: 'E_SCHEMA' }));
  });

  it('counts malformed authenticated frames before parsing', async () => {
    const alice = await generateIdentity('Alice');
    const bob = await generateIdentity('Bob');
    const { relay } = await relayFor([alice, bob], { rateLimitPerMinute: 1 });
    const socket = new WebSocket(relay.url);
    cleanups.push(() => {
      socket.terminate();
    });
    const frames: { type?: string; challenge?: string; error?: string; id?: string }[] = [];
    socket.on('message', (data) => {
      const frame = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : '') as (typeof frames)[number];
      frames.push(frame);
      if (frame.type === 'challenge' && frame.challenge) {
        void signDetached(alice, frame.challenge)
          .then((sig) => {
            socket.send(JSON.stringify({ type: 'auth', nodeId: alice.nodeId, sig }));
          })
          .catch(() => {
            frames.push({ error: 'E_AUTH_TEST' });
          });
      }
    });
    await until(() => frames.some((frame) => frame.type === 'ready'));
    socket.send('not-json');
    await until(() => frames.some((frame) => frame.error === 'E_SCHEMA'));
    const envelope = await sealEnvelope(alice, bob.nodeId, { type: 'catalog_request' });
    socket.send(JSON.stringify({ type: 'envelope', envelope }));
    await until(() => frames.some((frame) => frame.id === envelope.id));
    expect(frames.find((frame) => frame.id === envelope.id)?.error).toBe('E_RATE');
  });

  it('closes an exhausted connection when a valid frame has an uncorrelatable late id', async () => {
    const alice = await generateIdentity('Alice');
    const bob = await generateIdentity('Bob');
    const { relay } = await relayFor([alice, bob], { rateLimitPerMinute: 1 });
    const socket = new WebSocket(relay.url);
    cleanups.push(() => {
      socket.terminate();
    });
    const frames: { type?: string; challenge?: string; id?: string; error?: string }[] = [];
    let closed = false;
    socket.on('close', () => {
      closed = true;
    });
    socket.on('message', (data) => {
      const frame = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : '') as (typeof frames)[number];
      frames.push(frame);
      if (frame.type === 'challenge' && frame.challenge) {
        void signDetached(alice, frame.challenge).then(
          (sig) => {
            socket.send(JSON.stringify({ type: 'auth', nodeId: alice.nodeId, sig }));
          },
          () => {
            socket.close();
          },
        );
      }
    });
    await until(() => frames.some((frame) => frame.type === 'ready'));
    const first = await sealEnvelope(alice, bob.nodeId, { type: 'catalog_request' });
    socket.send(JSON.stringify({ type: 'envelope', envelope: first }));
    await until(() => frames.some((frame) => frame.id === first.id));
    const second = await sealEnvelope(alice, bob.nodeId, { type: 'catalog_request' });
    const { id, ...rest } = second;
    const lateIdFrame = JSON.stringify({ type: 'envelope', envelope: { ...rest, id } });
    expect(lateIdFrame.indexOf('"id"')).toBeGreaterThan(256);
    socket.send(lateIdFrame);
    await until(() => frames.some((frame) => frame.error === 'E_RATE'));
    expect(frames.find((frame) => frame.error === 'E_RATE')?.id).toBeUndefined();
    await until(() => closed);
  });

  it('closes an exhausted connection even when a decoy id appears before the envelope id', async () => {
    const alice = await generateIdentity('Alice');
    const bob = await generateIdentity('Bob');
    const { relay } = await relayFor([alice, bob], { rateLimitPerMinute: 1 });
    const socket = new WebSocket(relay.url);
    cleanups.push(() => {
      socket.terminate();
    });
    const frames: { type?: string; challenge?: string; id?: string; error?: string }[] = [];
    let closed = false;
    socket.on('close', () => {
      closed = true;
    });
    socket.on('message', (data) => {
      const frame = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : '') as (typeof frames)[number];
      frames.push(frame);
      if (frame.type === 'challenge' && frame.challenge) {
        void signDetached(alice, frame.challenge).then(
          (sig) => {
            socket.send(JSON.stringify({ type: 'auth', nodeId: alice.nodeId, sig }));
          },
          () => {
            socket.close();
          },
        );
      }
    });
    await until(() => frames.some((frame) => frame.type === 'ready'));
    const first = await sealEnvelope(alice, bob.nodeId, { type: 'catalog_request' });
    socket.send(JSON.stringify({ type: 'envelope', envelope: first }));
    await until(() => frames.some((frame) => frame.id === first.id));
    const second = await sealEnvelope(alice, bob.nodeId, { type: 'catalog_request' });
    const { id, ...rest } = second;
    const decoy = '550e8400-e29b-41d4-a716-446655440000';
    const frame = JSON.stringify({ type: 'envelope', id: decoy, envelope: { ...rest, id } });
    expect(frame.indexOf(`"id":"${id}"`)).toBeGreaterThan(256);
    socket.send(frame);
    await until(() => frames.some((candidate) => candidate.error === 'E_RATE'));
    expect(frames.find((candidate) => candidate.error === 'E_RATE')?.id).toBe(decoy);
    await until(() => closed);
  });

  it('no body field in the logs', async () => {
    const alice = await generateIdentity('Alice');
    const bob = await generateIdentity('Bob');
    const { relay, logs } = await relayFor([alice, bob]);
    const a = client(relay, alice);
    const b = client(relay, bob);
    await Promise.all([a.instance.waitReady(), b.instance.waitReady()]);
    const envelope = await sealEnvelope(alice, bob.nodeId, { type: 'catalog_request' });
    await a.instance.send(envelope);
    const serialized = JSON.stringify(logs);
    expect(logs.some((entry) => entry.outcome === 'delivered')).toBe(true);
    expect(serialized).not.toContain('"body"');
    expect(serialized).not.toContain(envelope.body);
    expect(serialized).not.toContain(envelope.sig);
  });

  it('answers GET /health for probes, and nothing else over plain HTTP', async () => {
    const alice = await generateIdentity('Alice');
    const { relay } = await relayFor([alice]);
    const base = relay.url.replace('ws://', 'http://').replace('/v1', '');
    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true, nodes: 0 });
    expect((await fetch(`${base}/peers`)).status).toBe(404);
  });

  it('client reconnects after the relay restarts', async () => {
    const alice = await generateIdentity('Alice');
    const first = await startRelay({ port: 0, allowedNodeIds: [alice.nodeId] }, { logger: () => undefined });
    const a = client(first, alice);
    await a.instance.waitReady();
    const port = first.port;
    await first.close();
    await until(() => !a.instance.connected);
    const second = await startRelay({ port, allowedNodeIds: [alice.nodeId] }, { logger: () => undefined });
    cleanups.push(() => second.close());
    await until(() => a.instance.connected);
    expect(a.statuses.filter((status) => status === 'connected')).toHaveLength(2);
  });

  it('admits a newcomer who presents a ticket signed by an admitted node, once, and remembers it', async () => {
    const julie = await generateIdentity('Julie');
    const natha = await generateIdentity('Natha');
    const stranger = await generateIdentity('Stranger');
    const admittedPath = join(mkdtempSync(join(tmpdir(), 'relay-')), 'admitted.json');
    const { relay, logs } = await relayFor([julie], { admittedPath });
    const ticket = await createAdmission(julie);

    const n = client(relay, natha, ticket);
    await n.instance.waitReady();
    expect(logs).toContainEqual(
      expect.objectContaining({ event: 'admission', outcome: 'admitted', nodeId: natha.nodeId, sponsor: julie.nodeId }),
    );
    expect(readFileSync(admittedPath, 'utf8')).toContain(natha.nodeId);
    expect(statSync(admittedPath).mode & 0o777).toBe(0o600);

    const s = client(relay, stranger, ticket);
    await until(() => s.statuses.includes('unauthorized'));
    expect(logs).toContainEqual(expect.objectContaining({ event: 'admission', outcome: 'ticket_spent' }));

    n.instance.close();
    await relay.close();
    const { relay: restarted } = await relayFor([julie], { admittedPath });
    const again = client(restarted, natha);
    await again.instance.waitReady();
    expect(again.statuses).toContain('connected');
  });

  it('refuses tickets from a sponsor it does not admit, forged tickets and a sponsor over quota', async () => {
    const julie = await generateIdentity('Julie');
    const outsider = await generateIdentity('Outsider');
    const [a, b, c] = await Promise.all(['A', 'B', 'C'].map((name) => generateIdentity(name)));
    if (!a || !b || !c) throw new Error('identities');
    const { relay, logs } = await relayFor([julie], { maxAdmissionsPerSponsorPerDay: 1 });

    const fromOutsider = client(relay, a, await createAdmission(outsider));
    await until(() => fromOutsider.statuses.includes('unauthorized'));
    const forged = { ...(await createAdmission(outsider)), sponsor: julie.nodeId };
    const withForged = client(relay, b, forged);
    await until(() => withForged.statuses.includes('unauthorized'));
    const first = client(relay, c, await createAdmission(julie));
    await first.instance.waitReady();
    const overQuota = client(relay, a, await createAdmission(julie));
    await until(() => overQuota.statuses.filter((status) => status === 'unauthorized').length > 0);

    const outcomes = logs.filter((entry) => entry.event === 'admission').map((entry) => entry.outcome);
    expect(outcomes).toEqual(
      expect.arrayContaining(['sponsor_not_admitted', 'bad_signature', 'admitted', 'sponsor_quota']),
    );
  });
});
