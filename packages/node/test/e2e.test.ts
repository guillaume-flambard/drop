import { afterEach, describe, expect, it } from 'vitest';
import { sealEnvelope } from '@drop/protocol';
import { allReceiptsValid, fakeCapability, startMesh, until, type Mesh } from './helpers.ts';

const LOW = 'test.service_state';
const HIGH = 'test.private_answer';
let mesh: Mesh | undefined;

afterEach(async () => {
  await mesh?.close();
  mesh = undefined;
});

async function setup(): Promise<Mesh> {
  mesh = await startMesh([fakeCapability(LOW, 'low'), fakeCapability(HIGH, 'high')]);
  return mesh;
}

async function ask(m: Mesh, capabilityId: string, mode: string) {
  const drop = await m.requester.engine.requestDrop({
    capabilityId,
    input: { mode },
    purpose: 'Comprendre un incident en prod',
    agent: 'claude_code',
  });
  await until(() => m.approver.engine.pending().some((item) => item.dropId === drop.dropId));
  return drop.dropId;
}

describe('end to end, in memory: relay and three nodes', () => {
  it('allow once: the requester gets the filtered result and every side keeps a signed receipt', async () => {
    const m = await setup();
    const dropId = await ask(m, LOW, 'ok');
    const item = m.approver.engine.pending()[0];
    expect(item).toMatchObject({
      kind: 'approval',
      inputPreview: 'mode ok',
      purpose: 'Comprendre un incident en prod',
    });
    expect(JSON.stringify(item)).not.toContain(m.requester.identity.secretKey);

    await m.approver.engine.decide(dropId, 'allow_once');
    await until(() => m.requester.engine.drop(dropId)?.state === 'receipted');
    expect(m.requester.engine.drop(dropId)?.result?.output).toEqual({ status: 'ok', detail: 'tout va bien' });
    await until(() => m.approver.store.receiptList.length === 1);
    for (const store of [m.requester.store, m.executor.store, m.approver.store]) {
      expect(store.receiptList).toHaveLength(1);
      expect(await allReceiptsValid(store.receiptList)).toBe(true);
      expect(store.receiptList[0]).toMatchObject({ decision: 'allow_once', dropId });
      expect(JSON.stringify(store.receiptList[0])).not.toContain('tout va bien');
    }
  });

  it('deny: the requester receives E_DENIED and nothing runs', async () => {
    const m = await setup();
    const dropId = await ask(m, LOW, 'ok');
    await m.approver.engine.decide(dropId, 'deny');
    await until(() => m.requester.engine.drop(dropId)?.error !== undefined);
    expect(m.requester.engine.drop(dropId)).toMatchObject({ state: 'denied', error: { code: 'E_DENIED' } });
    expect(m.executor.store.receiptList[0]).toMatchObject({ decision: 'deny', toolCalls: [] });
  });

  it('not now: the requester receives E_NOT_NOW', async () => {
    const m = await setup();
    const dropId = await ask(m, LOW, 'ok');
    await m.approver.engine.decide(dropId, 'not_now');
    await until(() => m.requester.engine.drop(dropId)?.error !== undefined);
    expect(m.requester.engine.drop(dropId)?.error?.code).toBe('E_NOT_NOW');
  });

  it('expired: an undecided drop expires after 10 minutes on a simulated clock', async () => {
    const m = await setup();
    const dropId = await ask(m, LOW, 'ok');
    m.clock.now += 10 * 60_000 + 1;
    await m.executor.engine.tick();
    await m.approver.engine.tick();
    await until(() => m.requester.engine.drop(dropId)?.error !== undefined);
    expect(m.requester.engine.drop(dropId)).toMatchObject({ state: 'expired', error: { code: 'E_EXPIRED' } });
    expect(m.approver.engine.pending()).toEqual([]);
    expect(m.executor.store.receiptList[0]?.decision).toBe('expired');
  });

  it('invalid output: rejected with E_OUTPUT_INVALID, never repaired', async () => {
    const m = await setup();
    const dropId = await ask(m, LOW, 'invalid');
    await m.approver.engine.decide(dropId, 'allow_once');
    await until(() => m.requester.engine.drop(dropId)?.error !== undefined);
    expect(m.requester.engine.drop(dropId)).toMatchObject({ state: 'failed', error: { code: 'E_OUTPUT_INVALID' } });
    expect(m.requester.engine.drop(dropId)?.result).toBeUndefined();
  });

  it('secret detected: nothing leaves, E_SECRET_DETECTED', async () => {
    const m = await setup();
    const dropId = await ask(m, LOW, 'secret');
    await m.approver.engine.decide(dropId, 'allow_once');
    await until(() => m.requester.engine.drop(dropId)?.error !== undefined);
    const drop = m.requester.engine.drop(dropId);
    expect(drop?.error?.code).toBe('E_SECRET_DETECTED');
    expect(JSON.stringify(drop)).not.toContain('sk-ant-');
  });

  it('invalid input is refused before any approval request', async () => {
    const m = await setup();
    const drop = await m.requester.engine.requestDrop({
      capabilityId: LOW,
      input: { mode: 'rm -rf' },
      purpose: 'Test',
      agent: 'codex',
    });
    await until(() => m.requester.engine.drop(drop.dropId)?.error !== undefined);
    expect(m.requester.engine.drop(drop.dropId)?.error?.code).toBe('E_SCHEMA');
    expect(m.approver.engine.pending()).toEqual([]);
  });

  it('high sensitivity: the approver reviews the output and can withhold a field', async () => {
    const m = await setup();
    const dropId = await ask(m, HIGH, 'ok');
    await m.approver.engine.decide(dropId, 'allow_once');
    await until(() => m.approver.engine.pending().some((item) => item.kind === 'review'));
    expect(m.requester.engine.drop(dropId)?.result).toBeUndefined();
    await m.approver.engine.review(dropId, 'send', ['detail']);
    await until(() => m.requester.engine.drop(dropId)?.result !== undefined);
    expect(m.requester.engine.drop(dropId)?.result?.output).toEqual({ status: 'ok' });
    await until(() => m.executor.store.receiptList.length === 1);
    expect(m.executor.store.receiptList[0]?.reviewed).toBe(true);
  });

  it('a node that is not an approver cannot decide', async () => {
    const m = await setup();
    const dropId = await ask(m, LOW, 'ok');
    // The requester forges an approval_decision for its own drop, correctly signed by itself: the executor ignores it.
    const forged = await sealEnvelope(
      m.requester.identity,
      m.executor.identity.nodeId,
      {
        type: 'approval_decision',
        dropId,
        decision: 'allow_once',
        decidedAt: m.clock.now,
      },
      { now: m.clock.now },
    );
    expect(await m.requester.client.send(forged)).toBe('delivered');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(m.requester.engine.drop(dropId)?.state).toBe('awaiting_approval');
    expect(m.executor.store.receiptList).toEqual([]);
    // The real approver still decides.
    await m.approver.engine.decide(dropId, 'allow_once');
    await until(() => m.requester.engine.drop(dropId)?.result !== undefined);
  });
});
