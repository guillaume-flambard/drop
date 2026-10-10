import { z } from 'zod';
import { canonical } from './canonical.ts';
import { OwnerSchema } from './capability.ts';
import { NodeIdSchema, signDetached, verifyDetached, type Identity } from './identity.ts';
import { isUnsafeLabel } from './text-guards.ts';

/** A published fact (T4.4, D50 level 1, D51, D65): served as is, without a model, until it expires. */
export const FACT_MAX_STATEMENT = 1000;
export const FACT_MAX_VALIDITY_MS = 365 * 24 * 60 * 60 * 1000;
export const FACT_DEFAULT_VALIDITY_MS = 30 * 24 * 60 * 60 * 1000;
const FACT_DOMAIN = 'drop-fact-v1|';

const Label = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !isUnsafeLabel(value), 'control or bidi character');

/** Line breaks and tabs are fine in a statement; any other control or bidi character is not. */
const Statement = z
  .string()
  .trim()
  .min(1)
  .max(FACT_MAX_STATEMENT)
  .refine((value) => !isUnsafeLabel(value.replace(/[\t\n\r]/g, ' ')), 'control or bidi character');

export const FactAudienceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('team') }),
  z.object({
    kind: z.literal('peers'),
    nodeIds: z
      .array(NodeIdSchema)
      .min(1)
      .max(50)
      .refine((ids) => new Set(ids).size === ids.length, 'duplicate peer'),
  }),
]);
export type FactAudience = z.infer<typeof FactAudienceSchema>;

export const FactSchema = z
  .object({
    factId: z.uuid(),
    revision: z.number().int().positive(),
    owner: OwnerSchema,
    topic: Label(120),
    keywords: z
      .array(Label(40).refine((keyword) => !keyword.includes(','), 'comma in keyword'))
      .max(8)
      .refine((words) => new Set(words).size === words.length, 'duplicate keyword'),
    statement: Statement,
    source: z
      .object({
        label: Label(200),
        url: z
          .url({ protocol: /^https$/ })
          .max(500)
          .refine((url) => {
            const parsed = new URL(url);
            return parsed.username === '' && parsed.password === '';
          }, 'credentials in link')
          .optional(),
      })
      .strict(),
    publishedAt: z.number().int().nonnegative(),
    validTo: z.number().int().nonnegative(),
    audience: FactAudienceSchema,
    sensitivity: z.literal('low'),
    status: z.enum(['active', 'retired']),
  })
  .strict()
  .refine((fact) => fact.validTo > fact.publishedAt, 'ends before it starts')
  .refine((fact) => fact.validTo - fact.publishedAt <= FACT_MAX_VALIDITY_MS, 'valid for more than a year');
export type Fact = z.infer<typeof FactSchema>;

export const SignedFactSchema = z.object({ fact: FactSchema, sig: z.string().min(1).max(200) });
export type SignedFact = z.infer<typeof SignedFactSchema>;

/** Only the owner signs a fact, under its own domain so that no other signature can stand for one. */
export async function signFact(owner: Identity, fact: Fact): Promise<SignedFact> {
  const parsed = FactSchema.parse(fact);
  if (parsed.owner.nodeId !== owner.nodeId) throw new Error('E_SIG a fact is signed by its owner only');
  return { fact: parsed, sig: await signDetached(owner, FACT_DOMAIN + canonical(parsed)) };
}

export async function verifyFact(signed: SignedFact): Promise<boolean> {
  const parsed = FactSchema.safeParse(signed.fact);
  if (!parsed.success) return false;
  return verifyDetached(parsed.data.owner.nodeId, FACT_DOMAIN + canonical(parsed.data), signed.sig).catch(() => false);
}

/** `fact.f` + the fact id without dashes: a valid capability id, stable across revisions. */
export function factCapabilityId(factId: string): string {
  return `fact.f${factId.replaceAll('-', '').toLowerCase()}`;
}

export function isFactCapabilityId(capabilityId: string): boolean {
  return /^fact\.f[0-9a-f]{32}$/.test(capabilityId);
}

/** What a requester receives for a fact: the signed fact itself, so it can check who said it and until when. */
export const FACT_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'fact', 'sig'],
  properties: {
    kind: { const: 'fact' },
    fact: { type: 'object' },
    sig: { type: 'string' },
  },
} as const;

export const FactOutputSchema = z.object({ kind: z.literal('fact'), fact: FactSchema, sig: z.string() }).strict();
export type FactOutput = z.infer<typeof FactOutputSchema>;
