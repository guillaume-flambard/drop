import { z } from 'zod';
import { CapabilityIdSchema, SignedCapabilityCardSchema } from './capability.ts';
import { NodeIdSchema, OwnerKindSchema } from './identity.ts';
import { DropStateSchema } from './lifecycle.ts';
import { ReceiptSchema } from './receipt.ts';

const DropId = z.uuid();
const Timestamp = z.number().int().nonnegative();

export const RequestedBySchema = z.object({
  nodeId: NodeIdSchema,
  displayName: z.string().min(1).max(80),
  agent: z.enum(['claude_code', 'codex', 'cursor', 'other']),
});
export type RequestedBy = z.infer<typeof RequestedBySchema>;

/** What the approver reads on the consent card: never a scope or a tool name. */
export const ConsentCardSchema = z.object({
  capabilityId: CapabilityIdSchema,
  title: z.string(),
  receives: z.array(z.string()),
  neverReceives: z.array(z.string()),
  sensitivity: z.enum(['low', 'high']),
  executorName: z.string(),
});
export type ConsentCard = z.infer<typeof ConsentCardSchema>;

/** Codes a requester can receive in drop_error (E_SCHEMA added by D17: the runner rejects invalid input with it). */
export const DropErrorCodeSchema = z.enum([
  'E_SCHEMA',
  'E_DENIED',
  'E_NOT_NOW',
  'E_EXPIRED',
  'E_BUDGET',
  'E_OUTPUT_INVALID',
  'E_SECRET_DETECTED',
  'E_RUNNER',
]);
export type DropErrorCode = z.infer<typeof DropErrorCodeSchema>;

export const MessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('pair_request'),
    oneTimeToken: z.string().min(16),
    displayName: z.string().min(1).max(80),
    ownerKind: OwnerKindSchema,
  }),
  z.object({
    type: z.literal('pair_accept'),
    oneTimeToken: z.string().min(16),
    displayName: z.string().min(1).max(80),
    ownerKind: OwnerKindSchema,
  }),
  z.object({ type: z.literal('catalog_request') }),
  z.object({ type: z.literal('catalog'), cards: z.array(SignedCapabilityCardSchema) }),
  z.object({
    type: z.literal('drop_request'),
    dropId: DropId,
    capabilityId: CapabilityIdSchema,
    capabilityVersion: z.string(),
    input: z.unknown(),
    purpose: z.string().min(1).max(140),
    requestedBy: RequestedBySchema,
  }),
  z.object({ type: z.literal('drop_status'), dropId: DropId, state: DropStateSchema }),
  z.object({
    type: z.literal('approval_request'),
    dropId: DropId,
    card: ConsentCardSchema,
    inputPreview: z.string().max(2000),
    purpose: z.string().min(1).max(140),
    requestedBy: RequestedBySchema,
    expiresAt: Timestamp,
  }),
  z.object({
    type: z.literal('approval_decision'),
    dropId: DropId,
    decision: z.enum(['allow_once', 'deny', 'not_now']),
    decidedAt: Timestamp,
  }),
  z.object({ type: z.literal('review_request'), dropId: DropId, output: z.unknown(), expiresAt: Timestamp }),
  z.object({
    type: z.literal('review_decision'),
    dropId: DropId,
    decision: z.enum(['send', 'discard']),
    redactions: z.array(z.string()).optional(),
  }),
  z.object({ type: z.literal('drop_result'), dropId: DropId, output: z.unknown(), outputSchemaHash: z.string() }),
  z.object({
    type: z.literal('drop_error'),
    dropId: DropId,
    code: DropErrorCodeSchema,
    message: z.string().max(300),
  }),
  z.object({ type: z.literal('receipt'), receipt: ReceiptSchema }),
]);
export type Message = z.infer<typeof MessageSchema>;
export type MessageOf<T extends Message['type']> = Extract<Message, { type: T }>;
