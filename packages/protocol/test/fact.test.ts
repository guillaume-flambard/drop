import { describe, expect, it } from 'vitest';
import {
  canTransition,
  factCapabilityId,
  FactSchema,
  generateIdentity,
  signFact,
  verifyFact,
  type Fact,
} from '../src/index.ts';

const DAY = 24 * 60 * 60 * 1000;

async function sample(): Promise<{ fact: Fact; owner: Awaited<ReturnType<typeof generateIdentity>> }> {
  const owner = await generateIdentity('Julie');
  const publishedAt = Date.UTC(2026, 9, 10);
  const fact: Fact = {
    factId: '01923456-789a-7bcd-8ef0-123456789abc',
    revision: 1,
    owner: { kind: 'human', displayName: 'Julie', nodeId: owner.nodeId },
    topic: 'Date du prochain déploiement',
    keywords: ['déploiement', 'mise en production'],
    statement: 'Le prochain déploiement est prévu jeudi 15 octobre à 10 h.',
    source: { label: 'Planning des releases', url: 'https://example.com/releases' },
    publishedAt,
    validTo: publishedAt + 30 * DAY,
    audience: { kind: 'team' },
    sensitivity: 'low',
    status: 'active',
  };
  return { fact, owner };
}

describe('published facts (T4.4)', () => {
  it('accepts a fact within its limits and refuses an overlong, too long-lived, high or control-character one', async () => {
    const { fact } = await sample();
    expect(FactSchema.safeParse(fact).success).toBe(true);
    expect(FactSchema.safeParse({ ...fact, audience: { kind: 'peers', nodeIds: [fact.owner.nodeId] } }).success).toBe(
      true,
    );
    const refused = [
      { ...fact, statement: 'x'.repeat(1001) },
      { ...fact, statement: '' },
      { ...fact, topic: 't'.repeat(121) },
      { ...fact, keywords: Array.from({ length: 9 }, (_, index) => `mot${String(index)}`) },
      { ...fact, keywords: ['k'.repeat(41)] },
      { ...fact, source: { label: 's'.repeat(201) } },
      { ...fact, source: { label: 'Wiki', url: 'http://example.com' } },
      { ...fact, source: { label: 'Wiki', url: 'javascript:alert(1)' } },
      { ...fact, validTo: fact.publishedAt + 366 * DAY },
      { ...fact, validTo: fact.publishedAt - 1 },
      { ...fact, sensitivity: 'high' },
      { ...fact, statement: 'ligne\u0007cloche' },
      { ...fact, topic: 'sujet‮esrever' },
      { ...fact, audience: { kind: 'peers', nodeIds: [] } },
      { ...fact, revision: 0 },
      { ...fact, source: { label: 'Wiki', url: 'https://user:secret@example.com/' } },
      { ...fact, keywords: ['déploiement', 'déploiement'] },
      { ...fact, keywords: ['a,b'] },
      { ...fact, topic: 'sujet\u2028caché' },
      { ...fact, topic: 'sujet\u200bcaché' },
      { ...fact, audience: { kind: 'peers', nodeIds: [fact.owner.nodeId, fact.owner.nodeId] } },
    ];
    for (const candidate of refused) expect(FactSchema.safeParse(candidate).success).toBe(false);
    // The capability id is derived from the fact id and fits the capability id grammar.
    expect(factCapabilityId(fact.factId)).toBe('fact.f01923456789a7bcd8ef0123456789abc');
  });

  it('signs a fact and refuses it once a field changes or another key signed it', async () => {
    const { fact, owner } = await sample();
    const signed = await signFact(owner, fact);
    expect(await verifyFact(signed)).toBe(true);
    expect(await verifyFact({ ...signed, fact: { ...signed.fact, statement: 'Mercredi.' } })).toBe(false);
    expect(await verifyFact({ ...signed, fact: { ...signed.fact, validTo: signed.fact.validTo + DAY } })).toBe(false);
    const other = await generateIdentity('Mallory');
    const forged = await signFact(other, { ...fact, owner: { ...fact.owner, nodeId: owner.nodeId } }).catch(
      () => undefined,
    );
    expect(forged).toBeUndefined();
    // A signature made by another key over the same fact never verifies.
    const foreign = await signFact(other, { ...fact, owner: { ...fact.owner, nodeId: other.nodeId } });
    expect(await verifyFact({ fact, sig: foreign.sig })).toBe(false);
  });

  it('allows proposed to approved for a published fact, never proposed to running', () => {
    expect(canTransition('proposed', 'approved')).toBe(true);
    expect(canTransition('proposed', 'running')).toBe(false);
    expect(canTransition('proposed', 'delivered')).toBe(false);
  });
});
