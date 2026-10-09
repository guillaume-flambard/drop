import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Funding } from '@drop/protocol';
import type { CapabilityImpl } from '@drop/runner';
import { FundingConfigSchema, openRouterFunder, type Funder } from '../src/funding.ts';
import { costLine } from '../src/ui.ts';
import { startMesh, until, type Mesh } from './helpers.ts';

const KEY = 'sk-or-v1-capped-0123456789abcdef';
let mesh: Mesh | undefined;
afterEach(async () => {
  await mesh?.close();
  mesh = undefined;
});

/** A capability that reports which key the run received, without returning it. */
function keyWitness(seen: (Funding | undefined)[]): CapabilityImpl<{ question: string }> {
  return {
    card: {
      id: 'test.paid_answer',
      version: '1.0.0',
      title: 'Répondre avec un modèle payant',
      sensitivity: 'low',
      receives: ['Une réponse'],
      neverReceives: ['Les données brutes'],
      approval: 'always',
      maxOutputChars: 2000,
      budget: { maxSeconds: 5 },
    },
    input: z.object({ question: z.string() }),
    output: z.object({ answer: z.string() }),
    configSchema: z.object({}),
    preview: (input) => input.question,
    cost: () => ({ kind: 'unmeasured' }),
    execute: (_input, ctx) => {
      seen.push(ctx.funding);
      return Promise.resolve({ answer: ctx.funding ? 'payé par le demandeur' : 'payé par le propriétaire' });
    },
  };
}

function fakeFunder(): Funder & { released: string[] } {
  const released: string[] = [];
  return {
    released,
    mint: () =>
      Promise.resolve({ kind: 'capped_key', baseUrl: 'https://openrouter.ai/api/v1', apiKey: KEY, maxUsd: 0.1 }),
    release: (dropId) => {
      released.push(dropId);
      return Promise.resolve();
    },
  };
}

describe('the requester pays with a capped key (T2.3, D27)', () => {
  it('refuses unsolicited funding in an owner-paid private profile before consent', async () => {
    const seen: (Funding | undefined)[] = [];
    const m = (mesh = await startMesh([keyWitness(seen)], {
      requester: { funder: fakeFunder() },
      executor: { privateProfile: true, payer: 'owner' },
    }));
    const drop = await m.requester.engine.requestDrop({
      capabilityId: 'test.paid_answer',
      input: { question: 'État du projet ?' },
      purpose: 'Test privé',
      agent: 'codex',
    });
    await until(() => m.requester.engine.drop(drop.dropId)?.error?.code === 'E_DENIED');
    expect(m.approver.engine.pending()).toEqual([]);
    expect(seen).toEqual([]);
    expect(JSON.stringify(m.executor.store.receiptList)).not.toContain(KEY);
  });

  it('sends the key to the executor only, shows who pays on the card, and deletes the key when the drop ends', async () => {
    const seen: (Funding | undefined)[] = [];
    const funder = fakeFunder();
    const m = (mesh = await startMesh([keyWitness(seen)], { requester: { funder } }));
    const drop = await m.requester.engine.requestDrop({
      capabilityId: 'test.paid_answer',
      input: { question: 'Où en est le projet ?' },
      purpose: 'Préparer la réunion de suivi',
      agent: 'codex',
    });
    await until(() => m.approver.engine.pending().length === 1);
    const item = m.approver.engine.pending()[0];
    expect(item).toMatchObject({ card: { paidBy: 'requester', cost: { kind: 'capped', maxUsd: 0.1 } } });
    expect(JSON.stringify(item)).not.toContain(KEY);
    if (item?.kind !== 'approval') throw new Error('approval expected');
    expect(costLine(item.card.cost, 'Guillaume')).toBe('Coût max : 0,10 $, payé par Guillaume.');

    await m.approver.engine.decide(drop.dropId, 'allow_once');
    await until(() => m.requester.engine.drop(drop.dropId)?.state === 'receipted');
    expect(seen.map((funding) => funding?.apiKey)).toEqual([KEY]);
    expect(m.requester.engine.drop(drop.dropId)?.result?.output).toEqual({ answer: 'payé par le demandeur' });
    await until(() => funder.released.length > 0);
    expect(funder.released).toEqual([drop.dropId]);
    for (const store of [m.requester.store, m.executor.store, m.approver.store])
      expect(JSON.stringify(store.receiptList)).not.toContain(KEY);
  });

  it('an owner who pays ignores the key and the card says the cost is theirs', async () => {
    const seen: (Funding | undefined)[] = [];
    const m = (mesh = await startMesh([keyWitness(seen)], {
      requester: { funder: fakeFunder() },
      executor: { payer: 'owner' },
    }));
    const drop = await m.requester.engine.requestDrop({
      capabilityId: 'test.paid_answer',
      input: { question: 'Où en est le projet ?' },
      purpose: 'Préparer la réunion de suivi',
      agent: 'codex',
    });
    await until(() => m.approver.engine.pending().length === 1);
    expect(m.approver.engine.pending()[0]).toMatchObject({ card: { paidBy: 'owner', cost: { kind: 'unmeasured' } } });
    await m.approver.engine.decide(drop.dropId, 'allow_once');
    await until(() => m.requester.engine.drop(drop.dropId)?.state === 'receipted');
    expect(seen).toEqual([undefined]);
  });
});

describe('OpenRouter capped keys', () => {
  const config = FundingConfigSchema.parse({ kind: 'openrouter', perDropUsd: 0.25 });

  it('mints a key capped and expiring, then deletes it by hash', async () => {
    const requests: { url: string; method: string; body?: unknown; auth: string | null }[] = [];
    const fetchStub: typeof fetch = (input, init) => {
      const headers = new Headers(init?.headers);
      requests.push({
        url: input instanceof Request ? input.url : input.toString(),
        method: init?.method ?? 'GET',
        auth: headers.get('Authorization'),
        ...(typeof init?.body === 'string' ? { body: JSON.parse(init.body) as unknown } : {}),
      });
      return Promise.resolve(
        init?.method === 'POST'
          ? Response.json({ key: KEY, data: { hash: 'abc123' } }, { status: 201 })
          : new Response(null, { status: 200 }),
      );
    };
    const funder = openRouterFunder(config, {
      env: { OPENROUTER_MANAGEMENT_KEY: 'mgmt-key' },
      fetch: fetchStub,
      now: () => Date.parse('2026-10-08T16:00:00.000Z'),
    });
    expect(await funder.mint('drop-1')).toEqual({
      kind: 'capped_key',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: KEY,
      maxUsd: 0.25,
    });
    await funder.release('drop-1');
    await funder.release('drop-1');
    expect(requests).toEqual([
      {
        url: 'https://openrouter.ai/api/v1/keys',
        method: 'POST',
        auth: 'Bearer mgmt-key',
        body: { name: 'drop drop-1', limit: 0.25, expires_at: '2026-10-08T18:00:00Z' },
      },
      { url: 'https://openrouter.ai/api/v1/keys/abc123', method: 'DELETE', auth: 'Bearer mgmt-key' },
    ]);
  });

  it('sends no key when the management key is missing or the API refuses', async () => {
    const codes: string[] = [];
    const log = (code: string) => {
      codes.push(code);
    };
    expect(await openRouterFunder(config, { env: {}, log }).mint('d')).toBeUndefined();
    const refusing = openRouterFunder(config, {
      env: { OPENROUTER_MANAGEMENT_KEY: 'mgmt-key' },
      fetch: () => Promise.resolve(new Response('no', { status: 401 })),
      log,
    });
    expect(await refusing.mint('d')).toBeUndefined();
    expect(codes).toEqual(['E_FUNDING_NO_MANAGEMENT_KEY', 'E_FUNDING_HTTP_401']);
  });
});
