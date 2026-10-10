import { z } from 'zod';

export const DropStateSchema = z.enum([
  'proposed',
  'awaiting_approval',
  'denied',
  'expired',
  'not_now',
  'approved',
  'running',
  'failed',
  'in_review',
  'delivered',
  'receipted',
]);
export type DropState = z.infer<typeof DropStateSchema>;

/**
 * Allowed transitions. `running → delivered` is the low-sensitivity path; `in_review` exists only for `high` (D17);
 * `approved → delivered` is a hand-written answer, reviewed in the panel before it leaves, and `approved → failed`
 * one the executor refuses on its own checks (T4.3).
 */
const TRANSITIONS: Record<DropState, readonly DropState[]> = {
  proposed: ['awaiting_approval'],
  awaiting_approval: ['denied', 'expired', 'not_now', 'approved'],
  denied: [],
  expired: [],
  not_now: [],
  approved: ['running', 'delivered', 'failed'],
  running: ['failed', 'in_review', 'delivered'],
  failed: [],
  in_review: ['delivered', 'failed'],
  delivered: ['receipted'],
  receipted: [],
};

export function canTransition(from: DropState, to: DropState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(state: DropState): boolean {
  return TRANSITIONS[state].length === 0;
}
