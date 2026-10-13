import { afterEach, describe, expect, it } from 'vitest';
import { openEnvelope, ReplayCache, sealEnvelope, uuidv7 } from '@drop/protocol';
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
    expect(m.requester.engine.drop(dropId)?.provenance).toMatchObject({
      executor: m.executor.identity.nodeId,
      approver: m.approver.identity.nodeId,
    });
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

  it('a late executor update cannot rewrite a finished outbound drop', async () => {
    const m = await setup();
    const dropId = await ask(m, LOW, 'ok');
    await m.approver.engine.decide(dropId, 'deny');
    await until(() => m.requester.engine.drop(dropId)?.state === 'denied');
    for (const message of [
      { type: 'drop_error' as const, dropId, code: 'E_EXPIRED' as const, message: 'Demande expirée.' },
      { type: 'drop_status' as const, dropId, state: 'awaiting_approval' as const },
    ]) {
      await m.requester.engine.handleEnvelope(
        await sealEnvelope(m.executor.identity, m.requester.identity.nodeId, message, { now: m.clock.now }),
      );
    }
    expect(m.requester.engine.drop(dropId)).toMatchObject({ state: 'denied', error: { code: 'E_DENIED' } });
  });

  it('a real result still lands after an overtaking refusal or a premature delivered status, and funding is released once', async () => {
    const released: string[] = [];
    mesh = await startMesh([fakeCapability(LOW, 'low')], {
      requester: {
        funder: {
          mint: () => Promise.resolve(undefined),
          release: (id) => {
            released.push(id);
            return Promise.resolve();
          },
        },
      },
    });
    const m = mesh;
    const dropId = await ask(m, LOW, 'ok');
    await until(() => m.requester.engine.drop(dropId)?.state === 'awaiting_approval');
    const forge = async (message: Parameters<typeof sealEnvelope>[2]) =>
      m.requester.engine.handleEnvelope(
        await sealEnvelope(m.executor.identity, m.requester.identity.nodeId, message, { now: m.clock.now }),
      );
    await forge({ type: 'drop_status', dropId, state: 'delivered' });
    expect(m.requester.engine.drop(dropId)?.state).toBe('awaiting_approval');
    await forge({ type: 'drop_error', dropId, code: 'E_DENIED', message: 'Demande déjà reçue.' });
    expect(m.requester.engine.drop(dropId)?.state).toBe('denied');
    await m.approver.engine.decide(dropId, 'allow_once');
    await until(() => m.requester.engine.drop(dropId)?.state === 'receipted');
    expect(m.requester.engine.drop(dropId)?.result?.output).toEqual({ status: 'ok', detail: 'tout va bien' });
    expect(m.requester.engine.drop(dropId)?.error).toBeUndefined();
    await forge({ type: 'drop_error', dropId, code: 'E_EXPIRED', message: 'Demande expirée.' });
    expect(m.requester.engine.drop(dropId)?.state).toBe('receipted');
    expect(released).toEqual([dropId]);
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

  it('records one result and receipt when the approver repeats a review decision concurrently', async () => {
    const m = await setup();
    const dropId = await ask(m, HIGH, 'ok');
    await m.approver.engine.decide(dropId, 'allow_once');
    await until(() => m.approver.engine.pending().some((item) => item.kind === 'review'));
    const outgoing: Parameters<typeof m.executor.transport.send>[0][] = [];
    const originalSend = m.executor.transport.send.bind(m.executor.transport);
    m.executor.transport.send = (envelope) => {
      outgoing.push(envelope);
      return originalSend(envelope);
    };
    const decision = { type: 'review_decision' as const, dropId, decision: 'send' as const };
    const first = await sealEnvelope(m.approver.identity, m.executor.identity.nodeId, decision, { now: m.clock.now });
    const second = await sealEnvelope(m.approver.identity, m.executor.identity.nodeId, decision, { now: m.clock.now });
    await Promise.all([m.executor.engine.handleEnvelope(first), m.executor.engine.handleEnvelope(second)]);
    expect(m.executor.store.receiptList).toHaveLength(1);
    expect(m.executor.store.receiptList[0]).toMatchObject({ dropId, decision: 'allow_once' });
    let results = 0;
    for (const envelope of outgoing.filter((item) => item.to === m.requester.identity.nodeId)) {
      const opened = await openEnvelope(m.requester.identity, envelope, {
        isKnownPeer: (id) => id === m.executor.identity.nodeId,
        replay: new ReplayCache(),
        now: m.clock.now,
      });
      if (opened.message.type === 'drop_result') results += 1;
    }
    expect(results).toBe(1);
    await until(() => m.requester.engine.drop(dropId)?.state === 'receipted');
  });

  it('does not expire a review while its accepted result is being sent', async () => {
    const m = await setup();
    const dropId = await ask(m, HIGH, 'ok');
    await m.approver.engine.decide(dropId, 'allow_once');
    await until(() => m.approver.engine.pending().some((item) => item.kind === 'review'));
    let releaseSend: (() => void) | undefined;
    let sending = false;
    const gate = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    const originalSend = m.executor.transport.send.bind(m.executor.transport);
    m.executor.transport.send = async (envelope) => {
      sending = true;
      await gate;
      return originalSend(envelope);
    };
    const decision = await sealEnvelope(
      m.approver.identity,
      m.executor.identity.nodeId,
      { type: 'review_decision', dropId, decision: 'send' },
      { now: m.clock.now },
    );
    const pending = m.executor.engine.handleEnvelope(decision);
    await until(() => sending);
    m.clock.now += 10 * 60_000 + 1;
    await m.executor.engine.tick();
    expect(m.executor.store.receiptList).toEqual([]);
    releaseSend?.();
    await pending;
    expect(m.executor.store.receiptList).toHaveLength(1);
    expect(m.executor.store.receiptList[0]).toMatchObject({ dropId, decision: 'allow_once' });
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

  it('shows a paired requester under the name stored at pairing, not the name its request claims', async () => {
    const m = await setup();
    const dropId = uuidv7(m.clock.now);
    // The requester signs its own drop_request but claims someone else's name.
    await m.executor.engine.handleEnvelope(
      await sealEnvelope(
        m.requester.identity,
        m.executor.identity.nodeId,
        {
          type: 'drop_request',
          dropId,
          capabilityId: LOW,
          capabilityVersion: '1.0.0',
          input: { mode: 'ok' },
          purpose: 'Comprendre un incident en prod',
          requestedBy: { nodeId: m.requester.identity.nodeId, displayName: 'Alice (CTO)', agent: 'claude_code' },
        },
        { now: m.clock.now },
      ),
    );
    await until(() => m.approver.engine.pending().some((item) => item.dropId === dropId));
    expect(m.approver.engine.pending()[0]).toMatchObject({
      kind: 'approval',
      requestedBy: { nodeId: m.requester.identity.nodeId, displayName: 'Guillaume', agent: 'claude_code' },
    });

    // The approver applies the same rule to an approval request naming one of its own peers.
    const forgedId = uuidv7(m.clock.now + 1);
    await m.approver.engine.handleEnvelope(
      await sealEnvelope(
        m.executor.identity,
        m.approver.identity.nodeId,
        {
          type: 'approval_request',
          dropId: forgedId,
          card: {
            capabilityId: LOW,
            title: 'Donner un état de service',
            receives: ['Un état'],
            neverReceives: [],
            sensitivity: 'low',
            executorName: 'VPS',
          },
          inputPreview: 'mode ok',
          purpose: 'Comprendre un incident en prod',
          requestedBy: { nodeId: m.executor.identity.nodeId, displayName: 'Alice (CTO)', agent: 'codex' },
          expiresAt: m.clock.now + 60_000,
        },
        { now: m.clock.now },
      ),
    );
    const forged = m.approver.engine.pending().find((item) => item.dropId === forgedId);
    expect(forged).toMatchObject({ requestedBy: { displayName: 'VPS' } });
    expect(JSON.stringify(m.approver.engine.pending())).not.toContain('Alice (CTO)');
  });
});
