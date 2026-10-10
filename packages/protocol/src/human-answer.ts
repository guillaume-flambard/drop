import { z } from 'zod';
import { isBinary, isUnsafeLabel } from './text-guards.ts';

/** A hand-written answer (T4.3, D64): the owner answers instead of running the capability. */
export const HUMAN_ANSWER_MAX_TEXT = 8000;
/** Raw bytes of an attached text file. */
export const HUMAN_ANSWER_MAX_FILE_BYTES = 128 * 1024;
/** Whole answer as JSON: with escaping and the envelope's base64, it still fits in MAX_ENVELOPE_BYTES. */
export const HUMAN_ANSWER_MAX_JSON_BYTES = 160 * 1024;
/** Text the secret scanner can read. Binary formats come later, with a control of their own. */
export const HUMAN_ANSWER_MEDIA_TYPES = ['text/plain', 'text/markdown', 'text/csv', 'application/json'] as const;

const utf8Bytes = (value: string): number => new TextEncoder().encode(value).length;

const PlainText = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => !isBinary(value), 'binary content');

export const HumanAnswerFileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine((name) => !isUnsafeLabel(name), 'unsafe file name'),
  mediaType: z.enum(HUMAN_ANSWER_MEDIA_TYPES),
  content: PlainText(HUMAN_ANSWER_MAX_FILE_BYTES).refine(
    (content) => utf8Bytes(content) <= HUMAN_ANSWER_MAX_FILE_BYTES,
    'file too large',
  ),
});

export const HumanAnswerSchema = z
  .object({
    kind: z.literal('human'),
    text: PlainText(HUMAN_ANSWER_MAX_TEXT),
    file: HumanAnswerFileSchema.optional(),
  })
  .strict()
  .refine((answer) => answer.text.trim().length > 0 || answer.file !== undefined, 'empty answer')
  .refine((answer) => utf8Bytes(JSON.stringify(answer)) <= HUMAN_ANSWER_MAX_JSON_BYTES, 'answer too large');
export type HumanAnswer = z.infer<typeof HumanAnswerSchema>;

/** Fixed output schema of a hand-written answer: its hash in drop_result tells the requester a person wrote it. */
export const HUMAN_ANSWER_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'text'],
  properties: {
    kind: { const: 'human' },
    text: { type: 'string', maxLength: HUMAN_ANSWER_MAX_TEXT },
    file: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'mediaType', 'content'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 120 },
        mediaType: { enum: [...HUMAN_ANSWER_MEDIA_TYPES] },
        content: { type: 'string' },
      },
    },
  },
} as const;

/** True when the answer breaks a size limit, so callers can tell E_TOO_LARGE from a malformed answer. */
export function humanAnswerTooLarge(answer: Record<string, unknown>): boolean {
  const text = typeof answer.text === 'string' ? answer.text : '';
  const file = typeof answer.file === 'object' && answer.file !== null ? (answer.file as Record<string, unknown>) : {};
  const content = typeof file.content === 'string' ? file.content : '';
  return (
    text.length > HUMAN_ANSWER_MAX_TEXT ||
    utf8Bytes(content) > HUMAN_ANSWER_MAX_FILE_BYTES ||
    utf8Bytes(JSON.stringify(answer)) > HUMAN_ANSWER_MAX_JSON_BYTES
  );
}
