import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createAdmission,
  generateIdentity,
  sealEnvelope,
  signDetached,
  type Envelope,
  type Identity,
} from '@drop/protocol';
import {
  RelayClient,
  readRelayConfig,
  revokeNode,
  RelayConfigSchema,
  startRelay,
  type RelayHandle,
  type RelayLogEntry,
} from '../src/index.ts';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function relayFor(
  identities: Identity[],
  extra: {
    rateLimitPerMinute?: number;
    admittedPath?: string;
    revokedPath?: string;
    maxAdmissionsPerSponsorPerDay?: number;
    maxAdmissionsPerDay?: number;
  } = {},
) {
  const logs: RelayLogEntry[] = [];
  const relay = await startRelay(
    { port: 0, allowedNodeIds: identities.map((identity) => identity.nodeId), ...extra },
    { logger: (entry) => logs.push(entry), revocationPollMs: 20 },
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
  it('reads relay.config.json, with the admission settings optional', () => {
    const dir = mkdtempSync(join(tmpdir(), 'relay-config-'));
    const minimal = join(dir, 'minimal.json');
    writeFileSync(minimal, JSON.stringify({ port: 8787, allowedNodeIds: ['a'] }));
    expect(RelayConfigSchema.parse(readRelayConfig(minimal))).toMatchObject({
      port: 8787,
      allowedNodeIds: ['a'],
      maxQueuePerNode: 100,
      rateLimitPerMinute: 60,
      maxAdmissionsPerSponsorPerDay: 20,
      maxAdmissionsPerDay: 100,
    });
    const full = join(dir, 'full.json');
    const admittedPath = join(dir, 'admitted.json');
    writeFileSync(
      full,
      JSON.stringify({ port: 1, allowedNodeIds: [], admittedPath, maxAdmissionsPerSponsorPerDay: 0 }),
    );
    expect(readRelayConfig(full)).toMatchObject({ admittedPath, maxAdmissionsPerSponsorPerDay: 0 });
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

  it('revokes a node without a restart: cut off at once, never back, and no longer a sponsor (T2.19)', async () => {
    const [julie, natha, paul] = await Promise.all(['Julie', 'Natha', 'Paul'].map((name) => generateIdentity(name)));
    if (!julie || !natha || !paul) throw new Error('identities');
    const dir = mkdtempSync(join(tmpdir(), 'relay-revoke-'));
    const revokedPath = join(dir, 'revoked.json');
    const { relay, logs } = await relayFor([julie], { admittedPath: join(dir, 'admitted.json'), revokedPath });
    const n = client(relay, natha, await createAdmission(julie));
    await n.instance.waitReady();

    revokeNode(revokedPath, natha.nodeId);
    expect(statSync(revokedPath).mode & 0o777).toBe(0o600);
    await until(() => n.statuses.includes('unauthorized'));
    expect(logs).toContainEqual(
      expect.objectContaining({ event: 'revocation', outcome: 'revoked', nodeId: natha.nodeId }),
    );

    // A fresh ticket from an admitted sponsor does not bring a revoked node back, and its own tickets are worthless.
    const again = client(relay, natha, await createAdmission(julie));
    await until(() => again.statuses.includes('unauthorized'));
    const viaNatha = client(relay, paul, await createAdmission(natha));
    await until(() => viaNatha.statuses.includes('unauthorized'));
    const outcomes = logs.filter((entry) => entry.event === 'admission').map((entry) => entry.outcome);
    expect(outcomes).toEqual(expect.arrayContaining(['revoked', 'sponsor_not_admitted']));
    // Julie, who invited her, keeps her place.
    const j = client(relay, julie);
    await j.instance.waitReady();
  });

  it('revoking with --with-invited also cuts off the nodes it admitted, transitively (T2.19)', async () => {
    const [julie, natha, paul, zoe] = await Promise.all(
      ['Julie', 'Natha', 'Paul', 'Zoé'].map((name) => generateIdentity(name)),
    );
    if (!julie || !natha || !paul || !zoe) throw new Error('identities');
    const dir = mkdtempSync(join(tmpdir(), 'relay-cascade-'));
    const revokedPath = join(dir, 'revoked.json');
    const { relay } = await relayFor([julie], { admittedPath: join(dir, 'admitted.json'), revokedPath });
    const n = client(relay, natha, await createAdmission(julie));
    await n.instance.waitReady();
    const p = client(relay, paul, await createAdmission(natha));
    await p.instance.waitReady();
    const z = client(relay, zoe, await createAdmission(julie));
    await z.instance.waitReady();

    revokeNode(revokedPath, natha.nodeId, { withInvited: true });
    await until(() => n.statuses.includes('unauthorized') && p.statuses.includes('unauthorized'));
    expect(z.statuses).not.toContain('unauthorized');
    expect(readFileSync(revokedPath, 'utf8')).toContain('"withInvited": true');
  });

  it('caps admissions per day across all sponsors (T2.19)', async () => {
    const [julie, bob, a, b, c] = await Promise.all(
      ['Julie', 'Bob', 'A', 'B', 'C'].map((name) => generateIdentity(name)),
    );
    if (!julie || !bob || !a || !b || !c) throw new Error('identities');
    const { relay, logs } = await relayFor([julie, bob], { maxAdmissionsPerDay: 2 });
    await client(relay, a, await createAdmission(julie)).instance.waitReady();
    await client(relay, b, await createAdmission(bob)).instance.waitReady();
    const third = client(relay, c, await createAdmission(julie));
    await until(() => third.statuses.includes('unauthorized'));
    expect(logs).toContainEqual(expect.objectContaining({ event: 'admission', outcome: 'global_quota' }));
  });
});
