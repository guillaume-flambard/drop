import { z } from 'zod';
import { CapabilityCardSchema } from './capability.ts';
import { EnvelopeSchema } from './envelope.ts';
import { MessageSchema } from './messages.ts';
import { ReceiptSchema } from './receipt.ts';

/** JSON Schema of a zod schema, used in capability cards and by the requester MCP. */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { unrepresentable: 'any' });
}

export function protocolJsonSchemas(): Record<string, Record<string, unknown>> {
  return {
    Envelope: toJsonSchema(EnvelopeSchema),
    Message: toJsonSchema(MessageSchema),
    CapabilityCard: toJsonSchema(CapabilityCardSchema),
    Receipt: toJsonSchema(ReceiptSchema),
  };
}
