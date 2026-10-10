import { z } from 'zod';
import { TeamMemberSchema, TeamSchema } from './team.ts';
import { CapabilityIdSchema, SignedCapabilityCardSchema } from './capability.ts';
import { NodeIdSchema, OwnerKindSchema } from './identity.ts';
import { DropStateSchema } from './lifecycle.ts';
import { ReceiptSchema } from './receipt.ts';
import { HumanAnswerSchema } from './human-answer.ts';

const DropId = z.uuid();
// overwrite keeps the UUIDv7 pattern in the exported JSON Schema, unlike refine/transform.
const NewDropId = z.uuidv7().overwrite((id) => id.toLowerCase());
const Timestamp = z.number().int().nonnegative();

/** The thirteen MCP clients of D55 and `other` (T4.5, D66): which agent asked, shown on the consent card. */
export const REQUESTER_AGENTS = [
  'claude_code',
  'claude_desktop',
  'cursor',
  'codex',
  'opencode',
  'gemini_cli',
  'devin_desktop',
  'zed',
  'goose',
  'vscode',
  'cline',
  'roo_code',
  'jetbrains',
  'other',
] as const;
export const RequesterAgentSchema = z.enum(REQUESTER_AGENTS);

export const RequestedBySchema = z.object({
  nodeId: NodeIdSchema,
  displayName: z.string().min(1).max(80),
  // An agent this node does not know yet (a newer peer) reads as `other`, never as an invalid request (T4.5 review).
  agent: RequesterAgentSchema.catch('other'),
});
export type RequestedBy = z.infer<typeof RequestedBySchema>;

/** Who pays and how much, shown to the approver before deciding. The capability owner always pays (D21). */
export const ConsentCostSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('free') }),
  z.object({ kind: z.literal('capped'), maxUsd: z.number().positive() }),
  z.object({ kind: z.literal('unmeasured') }),
]);
export type ConsentCost = z.infer<typeof ConsentCostSchema>;

/**
 * The requester pays for the model (D27): a key minted for this one drop, capped at `maxUsd`, sent end-to-end encrypted
 * inside drop_request to the executor only. Never forwarded to an approver, never written to disk, never in a receipt.
 */
export const FundingSchema = z.object({
  kind: z.literal('capped_key'),
  baseUrl: z.url(),
  apiKey: z.string().min(10).max(300),
  maxUsd: z.number().positive().max(50),
  model: z.string().min(1).max(200).optional(),
});
export type Funding = z.infer<typeof FundingSchema>;

/** What the approver reads on the consent card: never a scope or a tool name. */
export const ConsentCardSchema = z.object({
  capabilityId: CapabilityIdSchema,
  title: z.string(),
  receives: z.array(z.string()),
  neverReceives: z.array(z.string()),
  sensitivity: z.enum(['low', 'high']),
  executorName: z.string(),
  cost: ConsentCostSchema.optional(),
  /** Who pays the model: the owner (D21) or the requester with a capped key (D27). */
  paidBy: z.enum(['owner', 'requester']).optional(),
});
export type ConsentCard = z.infer<typeof ConsentCardSchema>;

/** Codes a requester can receive in drop_error (E_SCHEMA added by D17: the runner rejects invalid input with it). */
export const DropErrorCodeSchema = z.enum([
  'E_SCHEMA',
  'E_DENIED',
  'E_NOT_NOW',
  'E_EXPIRED',
  'E_RATE',
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
  // A node's local-network discovery key, sent to each of its peers (T4.2c, D67): 32 bytes, base64url.
  z.object({ type: z.literal('lan_key'), key: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }),
  z.object({
    type: z.literal('team_roster'),
    team: TeamSchema,
    members: z.array(TeamMemberSchema).max(200),
  }),
  // A user's own assistant (Claude, ChatGPT) reaching their node through the gateway (T2.13, D31).
  // `link_grant` repeats what the user saw in the app (the assistant, its OAuth client, the domain the answer returns
  // to): the gateway binds the session only if all of it is the session's own, so a forged link cannot pass for Claude.
  z.object({
    type: z.literal('link_grant'),
    sessionId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
    clientId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
    clientName: z.string().min(1).max(80),
    redirectHost: z.string().min(1).max(253),
  }),
  // `clientId` names the linked assistant the call comes from, so removing one link cuts off that assistant only.
  z.object({
    type: z.literal('agent_call'),
    callId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
    clientId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
    tool: z.enum(['ask_team', 'get_drop_results', 'list_capabilities']),
    args: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal('agent_reply'),
    callId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
    text: z.string().max(60_000),
    isError: z.boolean(),
  }),
  z.object({ type: z.literal('catalog_request') }),
  z.object({ type: z.literal('catalog'), cards: z.array(SignedCapabilityCardSchema) }),
  z.object({
    type: z.literal('drop_request'),
    dropId: NewDropId,
    capabilityId: CapabilityIdSchema,
    capabilityVersion: z.string(),
    input: z.unknown(),
    purpose: z.string().min(1).max(140),
    requestedBy: RequestedBySchema,
    funding: FundingSchema.optional(),
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
  // In place of approval_decision: the approver answers by hand, which consents to this request only (T4.3).
  z.object({ type: z.literal('human_answer'), dropId: DropId, answer: HumanAnswerSchema, decidedAt: Timestamp }),
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
