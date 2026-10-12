import { describe, expect, it, vi } from 'vitest';
import { generateIdentity } from '@drop/protocol';
import { startLocalApi } from '../src/api.ts';
import { NodeEngine } from '../src/engine.ts';
import { MemoryStore } from './helpers.ts';
import { canRestartForUpdate } from '../src/update-readiness.ts';

type Input = Parameters<typeof canRestartForUpdate>[0];
const idle = {
  memoryStats: () => ({ executing: 0, inbox: 0, outbox: 0 }),
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
