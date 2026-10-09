import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateIdentity, sealEnvelope, uuidv7 } from '@drop/protocol';
import { MAX_OUTBOUND_DROPS, NodeEngine } from '../src/engine.ts';
import { fakeCapability, MemoryStore, startMesh, type Mesh } from './helpers.ts';

const CAPABILITY = 'test.memory';
let mesh: Mesh | undefined;

afterEach(async () => {
  await mesh?.close();
  mesh = undefined;
});

async function ask(m: Mesh): Promise<string> {
  const drop = await m.requester.engine.requestDrop({
    capabilityId: CAPABILITY,
    input: { mode: 'ok' },
    purpose: 'Test mémoire',
    agent: 'codex',
  });
  return drop.dropId;
}

describe('bounded requester memory', () => {
  it('evicts the oldest finished drop while retaining every active drop', async () => {
    const m = (mesh = await startMesh([fakeCapability(CAPABILITY, 'low')]));
    vi.spyOn(m.requester.transport, 'send').mockResolvedValue('queued');
    const first = await ask(m);
    await m.requester.engine.handleEnvelope(
      await sealEnvelope(
        m.executor.identity,
        m.requester.identity.nodeId,
        { type: 'drop_error', dropId: first, code: 'E_DENIED', message: 'Refus.' },
        { now: m.clock.now },
      ),
    );
    for (let index = 1; index < MAX_OUTBOUND_DROPS; index += 1) await ask(m);
    expect(m.requester.engine.memoryStats().outbound).toBe(MAX_OUTBOUND_DROPS);
    const newest = await ask(m);
    expect(m.requester.engine.memoryStats().outbound).toBe(MAX_OUTBOUND_DROPS);
    expect(m.requester.engine.drop(first)).toBeUndefined();
    expect(m.requester.engine.drop(newest)).toBeDefined();
  }, 60_000);

  it('refuses an extra active request before funding or transport', async () => {
    let minted = 0;
    const m = (mesh = await startMesh([fakeCapability(CAPABILITY, 'low')], {
      requester: {
        funder: {
          mint: () => {
            minted += 1;
            return Promise.resolve(undefined);
          },
          release: () => Promise.resolve(),
        },
      },
    }));
    vi.spyOn(m.requester.transport, 'send').mockResolvedValue('queued');
    for (let index = 0; index < MAX_OUTBOUND_DROPS; index += 1) await ask(m);
    expect(m.requester.engine.memoryStats().outbound).toBe(MAX_OUTBOUND_DROPS);
    const before = minted;
    await expect(ask(m)).rejects.toMatchObject({ code: 'E_RATE' });
    expect(minted).toBe(before);
    expect(m.requester.engine.memoryStats().outbound).toBe(MAX_OUTBOUND_DROPS);
  }, 60_000);

  it('does not retain an unsent request when funding creation fails', async () => {
    const m = (mesh = await startMesh([fakeCapability(CAPABILITY, 'low')], {
      requester: {
        funder: {
          mint: () => Promise.reject(new Error('funding offline')),
          release: () => Promise.resolve(),
        },
      },
    }));
    await expect(ask(m)).rejects.toThrow('funding offline');
    expect(m.requester.engine.memoryStats().outbound).toBe(0);
  });

  async function checkRelayRefusal(outcome: string): Promise<void> {
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
    vi.spyOn(m.requester.transport, 'send').mockResolvedValue(outcome);
    await expect(ask(m)).rejects.toMatchObject({ code: 'E_RATE' });
    expect(m.requester.engine.memoryStats().outbound).toBe(0);
    expect(released).toHaveLength(1);
  }

  it('releases funding and active memory when the relay returns E_RATE', async () => {
    await checkRelayRefusal('E_RATE');
  });

  it('releases funding and active memory when the relay returns E_QUEUE_FULL', async () => {
    await checkRelayRefusal('E_QUEUE_FULL');
  });

  it('does not leave an offline drop request in volatile memory', async () => {
    await checkRelayRefusal('offline');
    expect(mesh?.requester.engine.memoryStats().outbox).toBe(0);
  });

  it('releases funding and active memory when the initial envelope is too large', async () => {
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
    await expect(
      m.requester.engine.requestDrop({
        capabilityId: CAPABILITY,
        input: { mode: 'ok', filler: 'x'.repeat(300_000) },
        purpose: 'Test mémoire',
        agent: 'codex',
      }),
    ).rejects.toMatchObject({ code: 'E_TOO_LARGE' });
    expect(m.requester.engine.memoryStats().outbound).toBe(0);
    expect(released).toHaveLength(1);
  });
});

describe('bounded transient node memory', () => {
  it('refuses extra approval cards and excessive expiration without evicting a pending card', async () => {
    const m = (mesh = await startMesh([fakeCapability(CAPABILITY, 'low')]));
    const sendApproval = async (index: number, expiresAt: number) => {
      const dropId = uuidv7(m.clock.now + index);
      await m.requester.engine.handleEnvelope(
        await sealEnvelope(
          m.executor.identity,
          m.requester.identity.nodeId,
          {
            type: 'approval_request',
            dropId,
            card: {
              capabilityId: CAPABILITY,
              title: 'État',
              receives: ['Un état'],
              neverReceives: [],
              sensitivity: 'low',
              executorName: 'Executor',
            },
            inputPreview: 'Test',
            purpose: 'Test mémoire',
            requestedBy: { nodeId: m.requester.identity.nodeId, displayName: 'Requester', agent: 'codex' },
            expiresAt,
          },
          { now: m.clock.now },
        ),
      );
      return dropId;
    };
    await sendApproval(0, m.clock.now + 16 * 60_000);
    expect(m.requester.engine.pending()).toHaveLength(0);
    const first = await sendApproval(1, m.clock.now + 10 * 60_000);
    for (let index = 2; index <= 1_024; index += 1) await sendApproval(index, m.clock.now + 10 * 60_000);
    expect(m.requester.engine.memoryStats().inbox).toBe(1_024);
    await sendApproval(1_025, m.clock.now + 10 * 60_000);
    expect(m.requester.engine.pending()).toHaveLength(1_024);
    expect(m.requester.engine.pending().some((item) => item.dropId === first)).toBe(true);
  }, 60_000);

  it('caps offline envelopes and logs the oldest envelope dropped at capacity', async () => {
    const identity = await generateIdentity('Owner');
    const logs: { code?: string; reason?: string }[] = [];
    const engine = new NodeEngine({
      identity,
      ownerKind: 'human',
      store: new MemoryStore(),
      capabilities: [],
      transport: { send: () => Promise.resolve('offline') },
      log: (entry) => logs.push(entry),
    });
    for (let index = 0; index < 1_025; index += 1) await engine.refreshCatalogs();
    expect(engine.memoryStats().outbox).toBe(1_024);
    expect(logs).toContainEqual(expect.objectContaining({ code: 'E_RATE', reason: 'outbox_capacity' }));
  }, 60_000);

  it('keeps a queued envelope after a temporary relay refusal on flush', async () => {
    const identity = await generateIdentity('Owner');
    const logs: { code?: string }[] = [];
    const transport = { send: vi.fn().mockResolvedValueOnce('offline').mockResolvedValueOnce('E_RATE') };
    const engine = new NodeEngine({
      identity,
      ownerKind: 'human',
      store: new MemoryStore(),
      capabilities: [],
      transport,
      log: (entry) => logs.push(entry),
    });
    await engine.refreshCatalogs();
    expect(engine.memoryStats().outbox).toBe(1);
    await engine.flushOutbox();
    expect(engine.memoryStats().outbox).toBe(1);
    expect(logs).toContainEqual(expect.objectContaining({ code: 'E_RATE' }));
  });
});
