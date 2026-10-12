import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateIdentity, type Envelope } from '@drop/protocol';
import { startLocalApi, type LocalApi } from '../src/api.ts';
import { NodeEngine, type CatalogEntry } from '../src/engine.ts';
import { fakeCapability, MemoryStore, startMesh, until, type Mesh } from './helpers.ts';

const CAPABILITY = 'test.unconfirmed';
const TOKEN = 'test-token-0123456789abcdefghijklmnop';
let mesh: Mesh | undefined;
let api: LocalApi | undefined;

afterEach(async () => {
  await api?.close();
  api = undefined;
  await mesh?.close();
  mesh = undefined;
});

/** A requester whose capped keys are recorded, so a release would show. */
async function meshWithFunding(): Promise<{ m: Mesh; released: string[] }> {
  const released: string[] = [];
  const m = (mesh = await startMesh([fakeCapability(CAPABILITY, 'low')], {
    requester: {
      funder: {
        mint: () =>
          Promise.resolve({
            kind: 'capped_key',
            baseUrl: 'https://example.test/v1',
            apiKey: 'sk-test-0123456789abcdef',
            maxUsd: 0.1,
          }),
        release: (dropId) => {
          released.push(dropId);
          return Promise.resolve();
        },
      },
    },
  }));
  return { m, released };
}

function ask(m: Mesh) {
  return m.requester.engine.requestDrop({
    capabilityId: CAPABILITY,
    input: { mode: 'ok' },
    purpose: 'Test réception',
    agent: 'codex',
  });
}

describe('unconfirmed drop request (T4.39)', () => {
  it('keeps a drop request the relay never answered, sends it again, and confirms it once the executor answers', async () => {
    const { m, released } = await meshWithFunding();
    const { transport } = m.requester;
    const real = transport.send.bind(transport);
    // The frame reaches the executor, then the relay connection goes away before its answer.
    vi.spyOn(transport, 'send').mockImplementationOnce(async (envelope: Envelope) => {
      await real(envelope);
      return 'unconfirmed';
    });
    const drop = await ask(m);
    expect(m.requester.engine.drop(drop.dropId)).toMatchObject({ state: 'proposed', delivery: 'unconfirmed' });
    expect(released).toEqual([]);
    expect(m.requester.engine.memoryStats()).toMatchObject({ outbound: 1, outbox: 1 });
    // The executor got it: its first word about this drop is the proof of receipt.
    await until(() => m.requester.engine.drop(drop.dropId)?.delivery === undefined);
    expect(m.requester.engine.drop(drop.dropId)?.state).not.toBe('proposed');
    // The copy waiting in the outbox goes again and is set aside by the executor's anti-replay.
    await m.requester.engine.flushOutbox();
    expect(m.requester.engine.memoryStats().outbox).toBe(0);
    expect(m.executor.engine.memoryStats().executing).toBe(1);
    expect(released).toEqual([]);
  });

  it('clears the unconfirmed delivery once the relay acknowledges the resent request', async () => {
    const { m, released } = await meshWithFunding();
    // The frame never reached anyone, but the client cannot know it.
    vi.spyOn(m.requester.transport, 'send').mockResolvedValueOnce('unconfirmed');
    const drop = await ask(m);
    expect(m.requester.engine.drop(drop.dropId)?.delivery).toBe('unconfirmed');
    expect(m.executor.engine.memoryStats().executing).toBe(0);
    const changes: number[] = [];
    m.requester.engine.on('change', () => changes.push(1));
    await m.requester.engine.flushOutbox();
    expect(m.requester.engine.drop(drop.dropId)?.delivery).toBeUndefined();
    expect(changes.length).toBeGreaterThan(0);
    await until(() => m.executor.engine.memoryStats().executing === 1);
    expect(released).toEqual([]);
  });

  it('answers 201 with delivery unconfirmed on POST /drops and keeps it on GET /drops/:id', async () => {
    const julie = await generateIdentity('Julie');
    const engine = new NodeEngine({
      identity: await generateIdentity('Guillaume'),
      ownerKind: 'human',
      store: new MemoryStore(),
      capabilities: [],
      transport: { send: () => Promise.resolve('unconfirmed') },
    });
    vi.spyOn(engine, 'catalog').mockReturnValue([
      {
        card: {
          id: 'mcp.answer.github',
          version: '1.0.0',
          title: 'GitHub',
          executorNodeId: julie.nodeId,
          receives: ['Une question'],
          inputSchema: { properties: { question: { type: 'string' } }, required: ['question'] },
        },
        ownerNodeId: julie.nodeId,
        ownerName: 'Julie',
        online: true,
      } as unknown as CatalogEntry,
    ]);
    vi.spyOn(engine, 'catalogIsFresh').mockReturnValue(true);
    api = await startLocalApi({
      engine,
      token: TOKEN,
      port: 0,
      relayUrl: 'ws://127.0.0.1:1/v1',
      refreshCatalogs: () => Promise.resolve(),
    });
    const base = `http://127.0.0.1:${String(api.port)}`;
    const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
    const created = await fetch(`${base}/drops`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ capabilityId: 'mcp.answer.github', input: { question: 'Où ?' }, purpose: 'Test' }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { dropId: string; delivery?: string };
    expect(body).toMatchObject({ owner: 'Julie', delivery: 'unconfirmed' });
    const view = await fetch(`${base}/drops/${body.dropId}`, { headers });
    expect(await view.json()).toMatchObject({ state: 'proposed', delivery: 'unconfirmed' });
    const asked = await fetch(`${base}/ask`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ question: 'Où en est le ticket GitHub ?', agent: 'codex' }),
    });
    expect(await asked.json()).toMatchObject({ asked: [{ delivery: 'unconfirmed' }] });
  });
});
