import { request as httpRequest } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { generateIdentity, openEnvelope, ReplayCache, sealEnvelope, uuidv7, type Envelope } from '@drop/protocol';
import { startLocalApi } from '../src/api.ts';
import { NodeEngine } from '../src/engine.ts';
import { MemoryStore } from './helpers.ts';
import { canRestartForUpdate } from '../src/update-readiness.ts';

type Input = Parameters<typeof canRestartForUpdate>[0];
const idle = {
  memoryStats: () => ({ executing: 0, inbox: 0, outbox: 0, incoming: 0, maintenance: 0 }),
  outboundDrops: () =>
    [] as Array<{ state: 'receipted' | 'proposed' | 'running' | 'delivered' | 'failed'; delivery?: 'unconfirmed' }>,
};
const ready = (override: Partial<ReturnType<Input['memoryStats']>>, drops = idle.outboundDrops()) =>
  canRestartForUpdate({
    memoryStats: () => ({ ...idle.memoryStats(), ...override }) as ReturnType<Input['memoryStats']>,
    outboundDrops: () => drops as ReturnType<Input['outboundDrops']>,
  });

describe('automatic updater maintenance gate', () => {
  it('allows idle machines and completed request history', () => {
    expect(ready({})).toBe(true);
    expect(ready({}, [{ state: 'receipted' }, { state: 'failed' }])).toBe(true);
  });
  it('blocks execution, consent, queued envelopes and unfinished responses', () => {
    expect(ready({ executing: 1 })).toBe(false);
    expect(ready({ inbox: 1 })).toBe(false);
    expect(ready({ outbox: 1 })).toBe(false);
    expect(ready({ incoming: 1 })).toBe(false);
    expect(ready({ maintenance: 1 })).toBe(false);
    for (const state of ['proposed', 'running', 'delivered'] as const) {
      expect(ready({}, [{ state }])).toBe(false);
    }
    expect(ready({}, [{ state: 'receipted', delivery: 'unconfirmed' }])).toBe(false);
  });
});

it('exposes readiness only to the shell with local bearer authentication', async () => {
  const engine = new NodeEngine({
    identity: await generateIdentity('Tester update'),
    ownerKind: 'human',
    store: new MemoryStore(),
    capabilities: [],
    transport: { send: () => Promise.resolve('offline') },
  });
  const server = await startLocalApi({
    engine,
    token: 'update-readiness-test-token',
    port: 0,
    shellInstance: 'shell-test',
    relayUrl: 'ws://127.0.0.1:1/v1',
    refreshCatalogs: () => Promise.resolve(),
  });
  const url = `http://127.0.0.1:${String(server.port)}/_shell/update-ready`;
  const headers = { Authorization: 'Bearer update-readiness-test-token' };
  try {
    expect((await fetch(url)).status).toBe(401);
    const initial = await fetch(url, { headers });
    expect(initial.status).toBe(200);
    expect(await initial.json()).toEqual({ ready: true });
    vi.spyOn(engine, 'memoryStats').mockImplementation(() => ({
      executing: 1,
      inbox: 0,
      outbox: 0,
      incoming: 0,
      maintenance: 0,
      outbound: 0,
      completedErrors: 0,
      replay: 0,
      invites: 0,
      factRequests: 0,
    }));
    const busy = await fetch(url, { headers });
    expect(await busy.json()).toEqual({ ready: false });
  } finally {
    await server.close();
  }
});

it('grants an atomic shell-only lease, blocks local mutations, and restores them on cancellation', async () => {
  const engine = new NodeEngine({
    identity: await generateIdentity('Updater lease'),
    ownerKind: 'human',
    store: new MemoryStore(),
    capabilities: [],
    transport: { send: () => Promise.resolve('offline') },
  });
  const server = await startLocalApi({
    engine,
    token: 'maintenance-secret',
    port: 0,
    shellInstance: 'lease-shell',
    relayUrl: 'ws://127.0.0.1:1/v1',
    refreshCatalogs: () => Promise.resolve(),
  });
  const url = 'http://127.0.0.1:' + String(server.port);
  const headers = { Authorization: 'Bearer maintenance-secret' };
  try {
    expect((await fetch(url + '/_shell/update-prepare', { method: 'POST' })).status).toBe(401);
    expect((await fetch(url + '/_shell/update-prepare', { method: 'POST', headers })).status).toBe(200);
    expect(engine.preparingUpdate()).toBe(true);
    expect(await (await fetch(url + '/_shell/update-ready', { headers })).json()).toEqual({ ready: false });
    const mutation = await fetch(url + '/drops', { method: 'POST', headers, body: '{}' });
    expect(mutation.status).toBe(503);
    expect(await mutation.json()).toMatchObject({ error: 'E_UPDATE_IN_PROGRESS' });
    await expect(
      engine.requestDrop({ capabilityId: 'none', input: {}, purpose: 'later', agent: 'codex' }),
    ).rejects.toMatchObject({ code: 'E_RATE' });
    const cancelled = await fetch(url + '/_shell/update-cancel', { method: 'POST', headers });
    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toEqual({ cancelled: true });
    expect(engine.preparingUpdate()).toBe(false);
    expect(await (await fetch(url + '/_shell/update-ready', { headers })).json()).toEqual({ ready: true });
  } finally {
    await server.close();
  }
});

it('never enters maintenance when the engine has an in-flight envelope or pending work', async () => {
  const engine = new NodeEngine({
    identity: await generateIdentity('Updater guard'),
    ownerKind: 'human',
    store: new MemoryStore(),
    capabilities: [],
    transport: { send: () => Promise.resolve('offline') },
  });
  const original = engine.memoryStats.bind(engine);
  const busy = vi.spyOn(engine, 'memoryStats').mockImplementation(() => ({ ...original(), incoming: 1 }));
  expect(engine.prepareUpdate()).toBe(false);
  busy.mockRestore();
  expect(engine.prepareUpdate()).toBe(true);
  expect(engine.prepareUpdate()).toBe(false);
  engine.cancelUpdate();
  expect(engine.prepareUpdate()).toBe(true);
  engine.cancelUpdate();
});

it('cannot enter maintenance while a local write is still reading its request body', async () => {
  const engine = new NodeEngine({
    identity: await generateIdentity('Updater local mutation'),
    ownerKind: 'human',
    store: new MemoryStore(),
    capabilities: [],
    transport: { send: () => Promise.resolve('offline') },
  });
  const server = await startLocalApi({
    engine,
    token: 'slow-request-token',
    port: 0,
    shellInstance: 'mutation-shell',
    relayUrl: 'ws://127.0.0.1:1/v1',
    refreshCatalogs: () => Promise.resolve(),
  });
  const base = 'http://127.0.0.1:' + String(server.port);
  const headers = { Authorization: 'Bearer slow-request-token' };
  const pending = httpRequest(base + '/ui/answer', { method: 'POST', headers });
  const completed = new Promise<void>((resolve, reject) => {
    pending.once('error', reject);
    pending.once('response', (response) => {
      response.resume();
      response.once('end', resolve);
      response.once('error', reject);
    });
  });
  try {
    // Do not finish sending the JSON body: the daemon must see an active write
    // even though no engine state has been mutated yet.
    pending.write('{');
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    const busy = await fetch(base + '/_shell/update-prepare', { method: 'POST', headers });
    expect(busy.status).toBe(409);
    expect(await busy.json()).toEqual({ ready: false });
    pending.end('}');
    await completed;
    const idleAgain = await fetch(base + '/_shell/update-prepare', { method: 'POST', headers });
    expect(idleAgain.status).toBe(200);
    expect(await idleAgain.json()).toEqual({ ready: true });
    const cancelled = await fetch(base + '/_shell/update-cancel', { method: 'POST', headers });
    expect(cancelled.status).toBe(200);
  } finally {
    pending.destroy();
    await server.close();
  }
});

it('refuses a new signed remote drop with a retryable error during maintenance', async () => {
  const [owner, peer] = await Promise.all([generateIdentity('Update owner'), generateIdentity('Peer')]);
  const store = new MemoryStore();
  store.savePeer({
    nodeId: peer.nodeId,
    displayName: peer.displayName,
    ownerKind: 'human',
    pairedAt: new Date().toISOString(),
  });
  const replies: Envelope[] = [];
  const engine = new NodeEngine({
    identity: owner,
    ownerKind: 'human',
    store,
    capabilities: [],
    transport: {
      send: (message) => {
        replies.push(message);
        return Promise.resolve('delivered');
      },
    },
  });
  expect(engine.prepareUpdate()).toBe(true);
  const dropId = uuidv7(Date.now());
  await engine.handleEnvelope(
    await sealEnvelope(peer, owner.nodeId, {
      type: 'drop_request',
      dropId,
      capabilityId: 'any.capability',
      capabilityVersion: '1.0.0',
      input: {},
      purpose: 'should retry after restart',
      requestedBy: { nodeId: peer.nodeId, displayName: peer.displayName, agent: 'codex' },
    }),
  );
  expect(engine.memoryStats().executing).toBe(0);
  expect(replies).toHaveLength(1);
  const response = await openEnvelope(peer, replies[0], {
    isKnownPeer: (id) => id === owner.nodeId,
    replay: new ReplayCache(),
    now: Date.now(),
  });
  expect(response.message).toMatchObject({ type: 'drop_error', dropId, code: 'E_RATE' });
  engine.cancelUpdate();
});
