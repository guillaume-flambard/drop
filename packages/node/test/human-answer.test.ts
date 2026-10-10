import { afterEach, describe, expect, it } from 'vitest';
import { HUMAN_ANSWER_OUTPUT_SCHEMA, sealEnvelope, sha256Hex, type Message } from '@drop/protocol';
import type { CapabilityImpl } from '@drop/runner';
import { startLocalApi, type LocalApi } from '../src/api.ts';
import { allReceiptsValid, fakeCapability, startMesh, until, type Mesh } from './helpers.ts';

const CAPABILITY = 'service.status';
const TOKEN = 'test-token-0123456789abcdefghijklmnop';
let mesh: Mesh | undefined;
let api: LocalApi | undefined;
let executions = 0;

afterEach(async () => {
  await api?.close();
  api = undefined;
  await mesh?.close();
  mesh = undefined;
  executions = 0;
});

/** The capability under test counts its runs: a hand-written answer must never execute it. */
function counted(): CapabilityImpl<{ mode: string }> {
  const base = fakeCapability(CAPABILITY, 'low');
  return {
    ...base,
    execute: (input, context) => {
      executions += 1;
      return base.execute(input, context);
    },
  };
}

async function ask(m: Mesh): Promise<string> {
  const drop = await m.requester.engine.requestDrop({
    capabilityId: CAPABILITY,
    input: { mode: 'ok' },
    purpose: 'Savoir quand part le déploiement',
    agent: 'claude_code',
  });
  await until(() => m.approver.engine.pending().some((item) => item.dropId === drop.dropId));
  return drop.dropId;
}

describe('human answer (T4.3)', () => {
  it('delivers a hand-written answer with the same consent and a receipt marked human', async () => {
    const m = (mesh = await startMesh([counted()]));
    const dropId = await ask(m);

    expect(await m.approver.engine.answer(dropId, { text: 'Le déploiement est prévu jeudi.' })).toBe(true);
    await until(() => m.requester.engine.drop(dropId)?.state === 'receipted');
    expect(m.requester.engine.drop(dropId)?.result).toEqual({
      output: { kind: 'human', text: 'Le déploiement est prévu jeudi.' },
      outputSchemaHash: sha256Hex(HUMAN_ANSWER_OUTPUT_SCHEMA),
    });
    expect(executions).toBe(0);
    expect(m.approver.engine.pending()).toEqual([]);
    await until(() => m.approver.store.receiptList.length === 1);
    for (const store of [m.requester.store, m.executor.store, m.approver.store]) {
      expect(await allReceiptsValid(store.receiptList)).toBe(true);
      expect(store.receiptList[0]).toMatchObject({
        dropId,
        decision: 'allow_once',
        answeredBy: 'human',
        reviewed: true,
        toolCalls: [],
        outputHash: sha256Hex({ kind: 'human', text: 'Le déploiement est prévu jeudi.' }),
      });
      expect(JSON.stringify(store.receiptList[0])).not.toContain('jeudi');
    }
  });

  it('answers by hand when the owner approves on the node that holds the capability', async () => {
    const m = (mesh = await startMesh([counted()]));
    const published = m.executor.store.publishedList[0];
    if (published) published.approverNodeIds = [m.executor.identity.nodeId];
    const drop = await m.requester.engine.requestDrop({
      capabilityId: CAPABILITY,
      input: { mode: 'ok' },
      purpose: 'Savoir quand part le déploiement',
      agent: 'other',
    });
    await until(() => m.executor.engine.pending().length === 1);
    expect(await m.executor.engine.answer(drop.dropId, { text: 'Vendredi matin.' })).toBe(true);
    await until(() => m.requester.engine.drop(drop.dropId)?.state === 'receipted');
    expect(m.requester.engine.drop(drop.dropId)?.result?.output).toEqual({ kind: 'human', text: 'Vendredi matin.' });
    expect(m.executor.store.receiptList[0]).toMatchObject({
      answeredBy: 'human',
      approver: m.executor.identity.nodeId,
    });
    expect(executions).toBe(0);
  });

  it('refuses a hand-written answer that carries a secret, before anything is sent', async () => {
    const m = (mesh = await startMesh([counted()]));
    const dropId = await ask(m);
    const sent: Message['type'][] = [];
    const original = m.approver.transport.send.bind(m.approver.transport);
    m.approver.transport.send = (envelope) => {
      sent.push('human_answer');
      return original(envelope);
    };

    await expect(
      m.approver.engine.answer(dropId, { text: 'Prends ma clé sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123' }),
    ).rejects.toMatchObject({ code: 'E_SECRET_DETECTED' });
    await expect(
      m.approver.engine.answer(dropId, {
        text: '',
        file: {
          name: 'env.txt',
          mediaType: 'text/plain',
          content: 'OPENAI=sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123',
        },
      }),
    ).rejects.toMatchObject({ code: 'E_SECRET_DETECTED' });
    expect(sent).toEqual([]);
    // The card stays pending: the owner fixes the answer and sends again.
    expect(m.approver.engine.pending().map((item) => item.dropId)).toEqual([dropId]);
    expect(await m.approver.engine.answer(dropId, { text: 'Demande à Natha, elle a la clé.' })).toBe(true);
    await until(() => m.requester.engine.drop(dropId)?.state === 'receipted');
    // The recorder sees the corrected answer leave: the empty list above is a real absence of sending.
    expect(sent.length).toBeGreaterThan(0);
  });

  it('accepts a hand-written answer from a remote approver and from no one else', async () => {
    const m = (mesh = await startMesh([counted()]));
    const dropId = await ask(m);

    // The requester is paired with the executor but is not an approver of the card.
    const forged = await sealEnvelope(m.requester.identity, m.executor.identity.nodeId, {
      type: 'human_answer',
      dropId,
      answer: { kind: 'human', text: 'Je me réponds à moi-même.' },
      decidedAt: m.clock.now,
    });
    await m.executor.engine.handleEnvelope(forged);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(m.requester.engine.drop(dropId)?.result).toBeUndefined();

    // Julie, the remote approver, answers: only her answer is delivered.
    expect(await m.approver.engine.answer(dropId, { text: 'Jeudi, après la revue.' })).toBe(true);
    await until(() => m.requester.engine.drop(dropId)?.state === 'receipted');
    expect(m.requester.engine.drop(dropId)?.result?.output).toEqual({ kind: 'human', text: 'Jeudi, après la revue.' });
    // A second answer for the same drop changes nothing.
    expect(await m.approver.engine.answer(dropId, { text: 'Finalement vendredi.' })).toBe(false);
    expect(executions).toBe(0);

    // The executor checks again: an approver node that skipped the check cannot push a secret through, and the
    // requester learns only that the answer was refused, not what the draft held.
    const next = await ask(m);
    const unchecked = await sealEnvelope(m.approver.identity, m.executor.identity.nodeId, {
      type: 'human_answer',
      dropId: next,
      answer: { kind: 'human', text: 'La clé : sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123' },
      decidedAt: m.clock.now,
    });
    await m.executor.engine.handleEnvelope(unchecked);
    await until(() => m.requester.engine.drop(next)?.error !== undefined);
    expect(m.requester.engine.drop(next)?.result).toBeUndefined();
    expect(m.requester.engine.drop(next)?.error).toEqual({
      code: 'E_SECRET_DETECTED',
      message: 'Le propriétaire a répondu, mais sa réponse n’a pas passé les contrôles.',
    });
  });

  it('answers by hand through the panel route, which refuses an empty or oversized answer', async () => {
    const m = (mesh = await startMesh([counted()]));
    const dropId = await ask(m);
    api = await startLocalApi({
      engine: m.approver.engine,
      token: TOKEN,
      port: 0,
      relayUrl: 'ws://127.0.0.1:1/v1',
      refreshCatalogs: () => Promise.resolve(),
    });
    const post = async (body: unknown) => {
      const res = await fetch(`http://127.0.0.1:${String(api?.port)}/ui/answer`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: (await res.json()) as { ok?: boolean; code?: string } };
    };

    // The card names who receives a hand-written answer first, from the local peer store.
    const pending = await fetch(`http://127.0.0.1:${String(api.port)}/ui/pending`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(((await pending.json()) as { pending: { executorName?: string }[] }).pending[0]?.executorName).toBe('VPS');
    expect(await post({ dropId, text: '  ' })).toMatchObject({ status: 400, body: { code: 'E_SCHEMA' } });
    expect(
      await post({ dropId, text: '', file: { name: 'n'.repeat(121), mediaType: 'text/plain', content: 'ok' } }),
    ).toMatchObject({
      status: 400,
      body: { code: 'E_SCHEMA', message: 'Nom de fichier trop long : 120 caractères au plus.' },
    });
    expect(await post({ dropId, text: 'x'.repeat(210 * 1024) })).toMatchObject({
      status: 413,
      body: { code: 'E_TOO_LARGE' },
    });
    // A malformed body is a refusal with a code, never an internal error.
    const malformed = await fetch(`http://127.0.0.1:${String(api.port)}/ui/answer`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: '{not json',
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ code: 'E_SCHEMA' });
    expect(
      await post({
        dropId,
        text: '',
        file: { name: 'gros.txt', mediaType: 'text/plain', content: 'a'.repeat(140_000) },
      }),
    ).toMatchObject({ status: 400, body: { code: 'E_TOO_LARGE' } });
    const csv = { name: 'stock.csv', mediaType: 'text/csv', content: 'ref;qte\nA12;4\n' };
    expect(await post({ dropId, text: 'Voici le stock.', file: csv })).toMatchObject({
      status: 200,
      body: { ok: true },
    });
    await until(() => m.requester.engine.drop(dropId)?.state === 'receipted');
    expect(m.requester.engine.drop(dropId)?.result?.output).toEqual({
      kind: 'human',
      text: 'Voici le stock.',
      file: csv,
    });
    expect(await post({ dropId, text: 'Encore ?' })).toMatchObject({ status: 404 });
  });
});
