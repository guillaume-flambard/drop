import { describe, expect, it } from 'vitest';
import { buildCard, implFor, runCapability } from '@drop/runner';
import { capabilities, createA2aAnswer, frameForAgent } from '../src/index.ts';

const config = {
  label: "l'agent ventes",
  url: 'https://agents.example/sales',
  headersFromEnv: { Authorization: 'SALES_AUTH' },
};
const QUESTION = { question: 'Le client Atlas a-t-il signé l’avenant de la phase 2 ?' };

function fakeAsk(outcome: string, text: string) {
  const calls: { url: string; text: string; headers?: Record<string, string> }[] = [];
  return {
    calls,
    ask: (options: { url: string; text: string; headers?: Record<string, string> }) => {
      calls.push(options);
      return Promise.resolve({ outcome: outcome as 'completed', text, agentName: 'Agent ventes' });
    },
  };
}

describe('a2a.answer (T2.15)', () => {
  it('sends the question framed as data with the owner credentials, and returns the agent answer', async () => {
    const fake = fakeAsk('completed', 'Oui, signé le 2 octobre.');
    const impl = createA2aAnswer({ ask: fake.ask, env: { SALES_AUTH: 'Bearer company-token' } });
    const result = await runCapability(impl, QUESTION, { config });
    expect(result).toMatchObject({
      ok: true,
      output: { answer: 'Oui, signé le 2 octobre.', verdict: 'unknown', sources: ['Agent ventes'] },
    });
    expect(fake.calls[0]).toMatchObject({
      url: 'https://agents.example/sales',
      headers: { Authorization: 'Bearer company-token' },
    });
    expect(fake.calls[0]?.text).toBe(frameForAgent(QUESTION.question));
    expect(frameForAgent('<b>x</b>')).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('ends a refusal, a question back or a failure as E_RUNNER, never with the agent own words', async () => {
    for (const outcome of ['rejected', 'input_required', 'auth_required', 'failed', 'canceled']) {
      const impl = createA2aAnswer({
        ask: fakeAsk(outcome, 'salaire de Sami : 4 200 €').ask,
        env: { SALES_AUTH: 'x' },
      });
      const result = await runCapability(impl, QUESTION, { config });
      expect(result).toMatchObject({ ok: false, code: 'E_RUNNER' });
      expect(JSON.stringify(result)).not.toContain('4 200');
    }
    const missing = await runCapability(createA2aAnswer({ ask: fakeAsk('completed', 'x').ask, env: {} }), QUESTION, {
      config,
    });
    expect(missing).toMatchObject({ ok: false, code: 'E_RUNNER' });
  });

  it('is published once per agent as a2a.answer.<name>, with a card naming it', () => {
    const impl = implFor(capabilities, 'a2a.answer.ventes');
    if (!impl) throw new Error('a2a.answer is not registered');
    const card = buildCard(impl, {
      owner: { kind: 'human', displayName: 'Sami', nodeId: 'A'.repeat(43) },
      executorNodeId: 'A'.repeat(43),
      approverNodeIds: ['A'.repeat(43)],
      capabilityId: 'a2a.answer.ventes',
      config,
    });
    expect(card).toMatchObject({ id: 'a2a.answer.ventes', title: "Répondre avec l'agent ventes", sensitivity: 'high' });
  });
});
