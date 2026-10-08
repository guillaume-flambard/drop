import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { generateIdentity, sealEnvelope, signDetached, type Envelope, type Identity } from '@drop/protocol';
import { RelayClient, startRelay, type RelayHandle, type RelayLogEntry } from '../src/index.ts';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function relayFor(identities: Identity[], extra: { rateLimitPerMinute?: number } = {}) {
  const logs: RelayLogEntry[] = [];
  const relay = await startRelay(
    { port: 0, allowedNodeIds: identities.map((identity) => identity.nodeId), ...extra },
    { logger: (entry) => logs.push(entry) },
  );
  cleanups.push(() => relay.close());
  return { relay, logs };
}

function client(relay: RelayHandle, identity: Identity) {
  const received: Envelope[] = [];
  const statuses: string[] = [];
  const instance = new RelayClient({
    identity,
    url: relay.url,
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
});
