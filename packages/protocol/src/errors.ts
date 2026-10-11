/** Stable error codes shared by every package. Order of the envelope checks lives in envelope.ts. */
export const ERROR_CODES = [
  'E_SCHEMA',
  'E_SIG',
  'E_UNKNOWN_PEER',
  'E_EXPIRED',
  'E_REPLAY',
  'E_DECRYPT',
  'E_MESSAGE_SCHEMA',
  'E_TOO_LARGE',
  'E_DENIED',
  'E_NOT_NOW',
  'E_RATE',
  /** The relay holds no more deferred envelopes for that recipient (maxQueuePerNode or maxQueueBytes). */
  'E_QUEUE_FULL',
  'E_BUDGET',
  'E_OUTPUT_INVALID',
  'E_SECRET_DETECTED',
  'E_RUNNER',
  'E_INVITE',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class DropError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string = code) {
    super(message);
    this.name = 'DropError';
    this.code = code;
  }
}

export function isDropError(error: unknown, code?: ErrorCode): error is DropError {
  return error instanceof DropError && (code === undefined || error.code === code);
}
