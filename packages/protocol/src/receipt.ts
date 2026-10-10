import { z } from 'zod';
import { canonical } from './canonical.ts';
import { NodeIdSchema, signDetached, verifyDetached, type Identity } from './identity.ts';

const Optional = z.number().int().optional();

export const ReceiptSchema = z.object({
  dropId: z.uuid(),
  capabilityId: z.string(),
  capabilityVersion: z.string(),
  requester: NodeIdSchema,
  executor: NodeIdSchema,
  approver: NodeIdSchema,
  inputHash: z.string().regex(/^[0-9a-f]{64}$/),
  outputHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  decision: z.enum(['allow_once', 'deny', 'not_now', 'expired']),
  reviewed: z.boolean(),
  /** Who produced the output: absent on receipts written before T4.3. */
  answeredBy: z.enum(['capability', 'human', 'fact']).optional(),
  toolCalls: z.array(z.object({ name: z.string(), count: z.number().int().nonnegative() })),
  costUsd: z.number().nonnegative().optional(),
  errorCode: z.string().optional(),
  timestamps: z.object({
    requested: Optional,
    decided: Optional,
    started: Optional,
    finished: Optional,
    delivered: Optional,
  }),
  sig: z.string(),
});
export type Receipt = z.infer<typeof ReceiptSchema>;
export type UnsignedReceipt = Omit<Receipt, 'sig'>;

export async function signReceipt(executor: Identity, receipt: UnsignedReceipt): Promise<Receipt> {
  return { ...receipt, sig: await signDetached(executor, canonical(receipt)) };
}

export async function verifyReceipt(receipt: Receipt): Promise<boolean> {
  const { sig, ...unsigned } = receipt;
  return verifyDetached(receipt.executor, canonical(unsigned), sig);
}
