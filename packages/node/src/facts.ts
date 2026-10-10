/**
 * Published facts (T4.4, D65): the owner publishes a short signed statement; it is served as is, without a model and
 * without a decision, to the peers of its audience, until it expires or is retired.
 */
import { z } from 'zod';
import {
  DropError,
  factCapabilityId,
  FACT_DEFAULT_VALIDITY_MS,
  FACT_MAX_VALIDITY_MS,
  FACT_OUTPUT_SCHEMA,
  FactAudienceSchema,
  FactOutputSchema,
  FactSchema,
  isFactCapabilityId,
  sha256Hex,
  verifyFact,
  type CapabilityCard,
  type Fact,
  type Owner,
  type SignedFact,
} from '@drop/protocol';
import { scanSecrets, type CapabilityImpl } from '@drop/runner';

export interface StoredFact {
  signed: SignedFact;
  /** How many times it was served: shown to the owner. */
  served: number;
}

export const StoredFactSchema = z.object({
  signed: z.object({ fact: FactSchema, sig: z.string() }),
  served: z.number().int().nonnegative(),
});

const DAY = 24 * 60 * 60 * 1000;

/** What the panel sends to publish or edit a fact. */
export const FactInputSchema = z
  .object({
    topic: z.string(),
    keywords: z.array(z.string()).max(8).default([]),
    statement: z.string(),
    source: z.object({ label: z.string(), url: z.string().optional() }).strict(),
    validDays: z
      .number()
      .int()
      .positive()
      .max(FACT_MAX_VALIDITY_MS / DAY)
      .default(FACT_DEFAULT_VALIDITY_MS / DAY),
    audience: FactAudienceSchema.default({ kind: 'team' }),
  })
  .strict();
export type FactInput = z.input<typeof FactInputSchema>;

/** Builds and checks a fact before it is signed: shape and limits, then the secret scanner. Never repaired. */
export function draftFact(
  raw: unknown,
  base: { factId: string; revision: number; owner: Owner; now: number; peers: string[] },
): Fact {
  const input = FactInputSchema.safeParse(raw);
  if (!input.success)
    throw new DropError('E_SCHEMA', 'Fait incomplet : sujet, énoncé, source et durée sont nécessaires.');
  const { topic, keywords, statement, source, validDays, audience } = input.data;
  const kinds = scanSecrets({ topic, keywords, statement, source });
  if (kinds.length > 0)
    throw new DropError('E_SECRET_DETECTED', `Secret détecté (${kinds.join(', ')}) : retire-le, rien n’est publié.`);
  if (audience.kind === 'peers' && !audience.nodeIds.every((nodeId) => base.peers.includes(nodeId)))
    throw new DropError('E_SCHEMA', 'Public inconnu : choisis parmi tes pairs appairés.');
  const fact = FactSchema.safeParse({
    factId: base.factId,
    revision: base.revision,
    owner: base.owner,
    topic,
    keywords: [...new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))],
    statement,
    source: { label: source.label, ...(source.url?.trim() ? { url: source.url.trim() } : {}) },
    publishedAt: base.now,
    validTo: base.now + validDays * DAY,
    audience,
    sensitivity: 'low',
    status: 'active',
  });
  if (!fact.success)
    throw new DropError(
      'E_SCHEMA',
      'Fait invalide : sujet de 120 caractères, énoncé de 1 000, source de 200, lien https, 8 mots-clés de 40 au plus.',
    );
  return fact.data;
}

export function isLive(fact: Fact, now: number): boolean {
  return fact.status === 'active' && fact.validTo > now;
}

export function inAudience(fact: Fact, nodeId: string, peers: string[]): boolean {
  return fact.audience.kind === 'team' ? peers.includes(nodeId) : fact.audience.nodeIds.includes(nodeId);
}

/** The catalog card of a fact: its topic and keywords, never its statement. */
export function factCard(fact: Fact, ownerNodeId: string): CapabilityCard {
  return {
    id: factCapabilityId(fact.factId),
    version: `1.${String(fact.revision)}.0`,
    owner: fact.owner,
    executorNodeId: ownerNodeId,
    approverNodeIds: [ownerNodeId],
    title: fact.topic,
    sensitivity: 'low',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    outputSchema: { ...FACT_OUTPUT_SCHEMA },
    receives: ['Un fait publié, signé, avec sa source et sa date de fin'],
    neverReceives: ['Rien d’autre que ce fait'],
    approval: 'auto_low',
    keywords: fact.keywords,
    maxOutputChars: 4000,
    budget: { maxSeconds: 1 },
  };
}

/** A fact is never executed: this only satisfies the drop record, whose output is the signed fact itself. */
export const FACT_IMPL: CapabilityImpl = {
  card: {
    id: 'fact.served',
    version: '1.0.0',
    title: 'Fait publié',
    sensitivity: 'low',
    receives: ['Un fait publié'],
    neverReceives: ['Rien d’autre'],
    approval: 'auto_low',
    maxOutputChars: 4000,
    budget: { maxSeconds: 1 },
  },
  input: z.object({}).strict(),
  output: FactOutputSchema,
  configSchema: z.object({}),
  preview: () => 'Fait publié',
  execute: () => Promise.reject(new Error('E_RUNNER a published fact is never executed')),
};

export const FACT_OUTPUT_HASH = sha256Hex(FACT_OUTPUT_SCHEMA);

/** Requester side: the fact must be signed by the executor, match the card asked for, and still be valid. */
export async function factResultHolds(
  output: unknown,
  outputSchemaHash: string,
  expected: { capabilityId: string; executor: string; now: number },
): Promise<boolean> {
  if (!isFactCapabilityId(expected.capabilityId) || outputSchemaHash !== FACT_OUTPUT_HASH) return false;
  const parsed = FactOutputSchema.safeParse(output);
  if (!parsed.success) return false;
  const { fact, sig } = parsed.data;
  return (
    fact.owner.nodeId === expected.executor &&
    factCapabilityId(fact.factId) === expected.capabilityId &&
    isLive(fact, expected.now) &&
    (await verifyFact({ fact, sig }))
  );
}
