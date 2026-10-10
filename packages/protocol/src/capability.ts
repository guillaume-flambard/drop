import { z } from 'zod';
import { NodeIdSchema, OwnerKindSchema } from './identity.ts';
import { isUnsafeLabel } from './text-guards.ts';

export const CapabilityIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, 'e.g. production.error_summary');

export const OwnerSchema = z.object({
  kind: OwnerKindSchema,
  displayName: z.string().min(1).max(80),
  nodeId: NodeIdSchema,
});
export type Owner = z.infer<typeof OwnerSchema>;

/** A JSON Schema document, as produced by z.toJSONSchema. */
export const JsonSchemaSchema = z.record(z.string(), z.unknown());

export const CapabilityCardSchema = z.object({
  id: CapabilityIdSchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'semver'),
  owner: OwnerSchema,
  executorNodeId: NodeIdSchema,
  approverNodeIds: z.array(NodeIdSchema).min(1),
  title: z.string().min(1).max(120),
  sensitivity: z.enum(['low', 'high']),
  inputSchema: JsonSchemaSchema,
  outputSchema: JsonSchemaSchema,
  receives: z.array(z.string().min(1)).min(1),
  neverReceives: z.array(z.string().min(1)).min(1),
  // v1 asks every time unless the card says otherwise.
  approval: z.enum(['always', 'auto_low']).default('always'),
  /** Words that route a question to this card without a model (T4.4); facts only so far. */
  keywords: z
    .array(
      z
        .string()
        .min(1)
        .max(40)
        .refine((keyword) => !isUnsafeLabel(keyword), 'control or bidi character'),
    )
    .max(8)
    .optional(),
  maxOutputChars: z.number().int().positive(),
  budget: z.object({
    maxSeconds: z.number().positive(),
    maxUsd: z.number().positive().optional(),
    maxToolCalls: z.number().int().positive().optional(),
  }),
});
export type CapabilityCard = z.infer<typeof CapabilityCardSchema>;

/** A card as published in a catalog: signed by its executor over canonical(card). */
export const SignedCapabilityCardSchema = z.object({ card: CapabilityCardSchema, sig: z.string() });
export type SignedCapabilityCard = z.infer<typeof SignedCapabilityCardSchema>;
