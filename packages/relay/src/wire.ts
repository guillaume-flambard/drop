import { z } from 'zod';
import { EnvelopeSchema, NodeIdSchema } from '@drop/protocol';

/** Frames exchanged on the relay socket. Envelopes stay opaque: the relay never sees a message type. */
export const ServerFrameSchema = z.discriminatedUnion('type', [
  // Exactly 32 random bytes: a node never signs anything else for a relay (no LAN proof, ticket or receipt, D63).
  z.object({ type: z.literal('challenge'), challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }),
  z.object({ type: z.literal('ready'), nodeId: NodeIdSchema }),
  z.object({ type: z.literal('envelope'), envelope: EnvelopeSchema }),
  z.object({ type: z.literal('ack'), id: z.string(), status: z.enum(['delivered', 'queued']) }),
  z.object({
    type: z.literal('error'),
    id: z.string().optional(),
    error: z.enum(['E_SCHEMA', 'E_TOO_LARGE', 'E_RATE', 'E_QUEUE_FULL']),
  }),
]);
export type ServerFrame = z.infer<typeof ServerFrameSchema>;

export const ClientFrameSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('auth'),
    nodeId: NodeIdSchema,
    sig: z.string(),
    admission: z.unknown().optional(),
    /** The fingerprint of the organization policy this node runs under (T4.10, D81). */
    policy: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  }),
  z.object({ type: z.literal('envelope'), envelope: z.unknown() }),
]);
export type ClientFrame = z.infer<typeof ClientFrameSchema>;

export const CLOSE_UNAUTHORIZED = 4401;
export const CLOSE_SPOOFED_FROM = 4403;
export const CLOSE_REPLACED = 4409;

export function parseFrame<T>(schema: z.ZodType<T>, data: unknown): T | undefined {
  try {
    const parsed = schema.safeParse(JSON.parse(String(data)));
    return parsed.success ? parsed.data : undefined;
  } catch {
    // Not JSON: treated like any malformed frame by the caller.
    return undefined;
  }
}
