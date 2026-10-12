import { afterEach, describe, expect, it, vi } from 'vitest';
import { startLocalApi, type ApiLogEntry, type LocalApi } from '../src/api.ts';
import { fakeCapability, startMesh, until, type Mesh } from './helpers.ts';

const TOKEN = 'test-token-0123456789abcdefghijklmnop';
const LOW = 'test.service_state';
let mesh: Mesh | undefined;
let api: LocalApi | undefined;

afterEach(async () => {
  await api?.close();
  await mesh?.close();
  api = undefined;
  mesh = undefined;
});

/** Three nodes on a real relay, and the approver's local API, as the Mac app reaches it. */
async function setup(log?: (entry: ApiLogEntry) => void): Promise<{ m: Mesh; port: number }> {
  const m = await startMesh([fakeCapability(LOW, 'low')]);
  mesh = m;
  api = await startLocalApi({
    engine: m.approver.engine,
    token: TOKEN,
    port: 0,
    relayUrl: m.relay.url,
    refreshCatalogs: () => Promise.resolve(),
    now: () => m.clock.now,
    ...(log ? { log } : {}),
  });
  return { m, port: api.port };
}

async function ask(m: Mesh): Promise<string> {
  const drop = await m.requester.engine.requestDrop({
    capabilityId: LOW,
    input: { mode: 'ok' },
    purpose: 'Comprendre un incident en prod',
    agent: 'claude_code',
  });
  await until(() => m.approver.engine.pending().some((item) => item.dropId === drop.dropId));
  return drop.dropId;
}

async function post(
  port: number,
  path: string,
  body: string,
  type = 'application/json',
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`http://127.0.0.1:${String(port)}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': type },
    body,
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const deny = (port: number, dropId: string) => post(port, '/ui/notification/deny', JSON.stringify({ dropId }));

describe('notification actions (T4.30)', () => {
  it('AC refuses from the notification through the same decision path as the card', async () => {
    const { m, port } = await setup();
    const decide = vi.spyOn(m.approver.engine, 'decideApproval');
    const dropId = await ask(m);
    expect(await deny(port, dropId)).toEqual({ status: 200, body: { ok: true } });
    expect(decide).toHaveBeenCalledWith(dropId, 'deny');
    await until(() => m.requester.engine.drop(dropId)?.error !== undefined);
    expect(m.requester.engine.drop(dropId)).toMatchObject({ state: 'denied', error: { code: 'E_DENIED' } });
    expect(m.executor.store.receiptList[0]).toMatchObject({ decision: 'deny', toolCalls: [] });
    expect(m.approver.engine.pending()).toEqual([]);
    // The card's route goes through the same function.
    const second = await ask(m);
    expect(
      await post(port, '/ui/decide', `dropId=${second}&decision=deny`, 'application/x-www-form-urlencoded'),
    ).toEqual({ status: 200, body: { ok: true } });
    expect(decide).toHaveBeenLastCalledWith(second, 'deny');
  });

  it('AC ignores a late Refuser with a stable code: decided, expired or unknown, nothing is sent', async () => {
    const logs: ApiLogEntry[] = [];
    const { m, port } = await setup((entry) => logs.push(entry));
    const send = vi.spyOn(m.approver.transport, 'send');

    // Already decided from the card: the notification's Refuser changes nothing.
    const decided = await ask(m);
    await m.approver.engine.decide(decided, 'allow_once');
    await until(() => m.requester.engine.drop(decided)?.state === 'receipted');
    const sent = send.mock.calls.length;
    expect(await deny(port, decided)).toEqual({ status: 409, body: { ok: false, code: 'E_NOT_PENDING' } });
    expect(m.requester.engine.drop(decided)?.state).toBe('receipted');
    expect(send.mock.calls.length).toBe(sent);

    // Expired, even before the engine's tick removed it.
    const expired = await ask(m);
    const item = m.approver.engine.pending().find((entry) => entry.dropId === expired);
    m.clock.now = (item?.expiresAt ?? 0) + 1;
    const before = send.mock.calls.length;
    expect(await deny(port, expired)).toEqual({ status: 409, body: { ok: false, code: 'E_EXPIRED' } });
    // The card refuses it the same way: an expired card is never decided.
    expect(
      await post(port, '/ui/decide', `dropId=${expired}&decision=allow_once`, 'application/x-www-form-urlencoded'),
    ).toEqual({ status: 404, body: { ok: false, code: 'E_EXPIRED' } });
    expect(send.mock.calls.length).toBe(before);

    // An identifier that never waited here.
    expect(await deny(port, '0199c5a0-0000-7000-8000-000000000099')).toEqual({
      status: 409,
      body: { ok: false, code: 'E_NOT_PENDING' },
    });
    expect(send.mock.calls.length).toBe(before);
    expect(sent).toBeGreaterThan(0);
    expect(logs.filter((entry) => entry.event === 'notification_deny').map((entry) => entry.code)).toEqual([
      'E_NOT_PENDING',
      'E_EXPIRED',
      'E_NOT_PENDING',
    ]);
  });

  it('AC never authorizes from a notification, whatever its body says', async () => {
    const { m, port } = await setup();
    const decide = vi.spyOn(m.approver.engine, 'decideApproval');
    const dropId = await ask(m);
    for (const body of [
      JSON.stringify({ dropId, decision: 'allow_once' }),
      JSON.stringify({ dropId: 'not-a-drop' }),
      JSON.stringify({}),
      'dropId=' + dropId,
    ]) {
      const answer = await post(port, '/ui/notification/deny', body);
      expect(answer.status).toBe(400);
      expect(answer.body).toMatchObject({ ok: false, code: 'E_SCHEMA' });
    }
    // An oversized body is refused as such, before any parsing.
    const large = await post(port, '/ui/notification/deny', JSON.stringify({ dropId, pad: 'x'.repeat(4096) }));
    expect(large).toEqual({ status: 413, body: { ok: false, code: 'E_TOO_LARGE' } });
    expect(decide).not.toHaveBeenCalled();
    expect(m.approver.engine.pending().map((entry) => entry.dropId)).toEqual([dropId]);
    // Without the local token, nothing either.
    const anonymous = await fetch(`http://127.0.0.1:${String(port)}/ui/notification/deny`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dropId }),
    });
    expect(anonymous.status).toBe(401);
    expect(decide).not.toHaveBeenCalled();
    // The only decision this route can make is a refusal.
    expect(await deny(port, dropId)).toEqual({ status: 200, body: { ok: true } });
    expect(decide.mock.calls).toEqual([[dropId, 'deny']]);
    await until(() => m.requester.engine.drop(dropId)?.state === 'denied');
    expect(m.executor.store.receiptList.map((receipt) => receipt.decision)).toEqual(['deny']);
  });
});
