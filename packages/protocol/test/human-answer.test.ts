import { describe, expect, it } from 'vitest';
import {
  canTransition,
  envelopeSize,
  MAX_ENVELOPE_BYTES,
  sealEnvelope,
  generateIdentity,
  HumanAnswerSchema,
  MessageSchema,
  sha256Hex,
  signReceipt,
  verifyReceipt,
  type UnsignedReceipt,
} from '../src/index.ts';

const DROP_ID = '01923456-789a-7bcd-8ef0-123456789abc';

describe('human answer (T4.3)', () => {
  it('accepts a text or text-file answer within the limits and refuses an empty, oversized or non-text one', () => {
    const file = (content: string, mediaType = 'text/csv') => ({ name: 'stock.csv', mediaType, content });
    expect(HumanAnswerSchema.safeParse({ kind: 'human', text: 'Le déploiement est prévu jeudi.' }).success).toBe(true);
    expect(HumanAnswerSchema.safeParse({ kind: 'human', text: '', file: file('ref;qte\nA12;4\n') }).success).toBe(true);
    expect(HumanAnswerSchema.safeParse({ kind: 'human', text: 'x'.repeat(8000) }).success).toBe(true);

    // Nothing to send.
    expect(HumanAnswerSchema.safeParse({ kind: 'human', text: '   ' }).success).toBe(false);
    // Over the limits.
    expect(HumanAnswerSchema.safeParse({ kind: 'human', text: 'x'.repeat(8001) }).success).toBe(false);
    expect(
      HumanAnswerSchema.safeParse({ kind: 'human', text: '', file: file('a'.repeat(128 * 1024 + 1)) }).success,
    ).toBe(false);
    // Escaping can make the JSON bigger than the raw file: the whole answer must still fit in an envelope.
    expect(
      HumanAnswerSchema.safeParse({ kind: 'human', text: '"'.repeat(8000), file: file('"'.repeat(128 * 1024)) })
        .success,
    ).toBe(false);
    // Binary content or a type the secret scanner cannot read.
    expect(HumanAnswerSchema.safeParse({ kind: 'human', text: '', file: file('PK\u0003\u0004zip') }).success).toBe(
      false,
    );
    expect(
      HumanAnswerSchema.safeParse({ kind: 'human', text: '', file: file('%PDF-1.7', 'application/pdf') }).success,
    ).toBe(false);

    // C1 controls (U+009B is an 8-bit terminal escape) and control or bidi characters in a file name.
    expect(HumanAnswerSchema.safeParse({ kind: 'human', text: '', file: file('a\u009b31m') }).success).toBe(false);
    for (const name of ['a\u0000.csv', 'a\u001b.csv', 'a\n.csv', 'facture\u202Efdp.csv'])
      expect(HumanAnswerSchema.safeParse({ kind: 'human', text: '', file: { ...file('ok'), name } }).success).toBe(
        false,
      );

    const message = MessageSchema.safeParse({
      type: 'human_answer',
      dropId: DROP_ID,
      answer: { kind: 'human', text: 'Oui, la facture est partie.' },
      decidedAt: Date.now(),
    });
    expect(message.success).toBe(true);
  });

  it('fits the largest accepted answer into a sealed envelope', async () => {
    const sender = await generateIdentity('Julie');
    const recipient = await generateIdentity('VPS');
    // Escaped backslashes double in JSON: fill the file up to the JSON bound of the whole answer.
    const base = {
      kind: 'human' as const,
      text: 'é'.repeat(8000),
      file: { name: 'n.txt', mediaType: 'text/plain' as const, content: '' },
    };
    const room = 160 * 1024 - Buffer.byteLength(JSON.stringify(base));
    const answer = { ...base, file: { ...base.file, content: '\\'.repeat(Math.floor(room / 2)) } };
    expect(HumanAnswerSchema.safeParse(answer).success).toBe(true);
    expect(
      HumanAnswerSchema.safeParse({ ...answer, file: { ...answer.file, content: answer.file.content + '\\' } }).success,
    ).toBe(false);
    for (const message of [
      { type: 'human_answer' as const, dropId: DROP_ID, answer, decidedAt: Date.now() },
      { type: 'drop_result' as const, dropId: DROP_ID, output: answer, outputSchemaHash: 'a'.repeat(64) },
    ]) {
      const envelope = await sealEnvelope(sender, recipient.nodeId, message);
      expect(envelopeSize(envelope)).toBeLessThan(MAX_ENVELOPE_BYTES);
    }
  });

  it('signs and verifies a receipt that says a human answered', async () => {
    const executor = await generateIdentity('VPS');
    const requester = await generateIdentity('Guillaume');
    const unsigned: UnsignedReceipt = {
      dropId: DROP_ID,
      capabilityId: 'service.status',
      capabilityVersion: '1.0.0',
      requester: requester.nodeId,
      executor: executor.nodeId,
      approver: executor.nodeId,
      inputHash: sha256Hex({ mode: 'ok' }),
      outputHash: sha256Hex({ kind: 'human', text: 'Oui.' }),
      decision: 'allow_once',
      reviewed: true,
      answeredBy: 'human',
      toolCalls: [],
      timestamps: { requested: 1, decided: 2, delivered: 3 },
    };
    const receipt = await signReceipt(executor, unsigned);
    expect(receipt.answeredBy).toBe('human');
    expect(await verifyReceipt(receipt)).toBe(true);
    expect(await verifyReceipt({ ...receipt, answeredBy: 'capability' })).toBe(false);
  });

  it('allows approved to delivered for a hand-written answer, never awaiting_approval to delivered', () => {
    expect(canTransition('approved', 'delivered')).toBe(true);
    expect(canTransition('awaiting_approval', 'delivered')).toBe(false);
    expect(canTransition('awaiting_approval', 'running')).toBe(false);
  });
});
