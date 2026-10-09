import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canonical,
  canTransition,
  ADMISSION_TTL_MS,
  CapabilityCardSchema,
  createAdmission,
  createInvite,
  verifyAdmission,
  decodeInvite,
  DropError,
  encodeInvite,
  envelopeSize,
  generateIdentity,
  MAX_ENVELOPE_BYTES,
  MessageSchema,
  NodeIdSchema,
  openEnvelope,
  OwnerKindSchema,
  OwnerSchema,
  protocolJsonSchemas,
  ReceiptSchema,
  REPLAY_WINDOW_MS,
  ReplayCache,
  sealEnvelope,
  sha256Hex,
  signCard,
  signDetached,
  signReceipt,
  verifyCard,
  verifyDetached,
  verifyReceipt,
  type Admission,
  type CapabilityCard,
  type Envelope,
  type Identity,
  type Message,
} from '../src/index.ts';
import { getSodium } from '../src/sodium.ts';

const NOW = 1_791_460_000_000;
const DROP_ID = '0199c5a0-0000-7000-8000-000000000001';

async function pair(): Promise<{ alice: Identity; bob: Identity }> {
  return { alice: await generateIdentity('Alice'), bob: await generateIdentity('Bob') };
}

function catalogRequest(): Message {
  return { type: 'catalog_request' };
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toSatisfy((error: unknown) => error instanceof DropError && error.code === code);
}

describe('canonical()', () => {
  it('fixed vectors for canonical()', () => {
    expect(canonical({ b: 1, a: [true, null, 'x'], c: { z: 0, y: 'é' } })).toBe(
      '{"a":[true,null,"x"],"b":1,"c":{"y":"é","z":0}}',
    );
    expect(canonical({ k: undefined, j: 2 })).toBe('{"j":2}');
    expect(canonical([1, undefined])).toBe('[1,null]');
    expect(() => canonical({ n: Number.NaN })).toThrow();
    expect(sha256Hex({ a: 1 })).toBe('015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862');
  });
});

describe('signature', () => {
  it('fixed vectors for the signature', async () => {
    // RFC 8032 §7.1, TEST 1: empty message.
    const sodium = await getSodium();
    const seed = Buffer.from('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'hex');
    const keys = sodium.crypto_sign_seed_keypair(seed);
    const identity: Identity = {
      nodeId: Buffer.from(keys.publicKey).toString('base64url'),
      publicKey: Buffer.from(keys.publicKey).toString('base64url'),
      secretKey: Buffer.from(keys.privateKey).toString('base64url'),
      createdAt: '2026-10-08T00:00:00.000Z',
      displayName: 'Vector',
    };
    expect(identity.nodeId).toBe('11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo');
    const sig = await signDetached(identity, '');
    expect(Buffer.from(sig, 'base64url').toString('hex')).toBe(
      'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
    );
    expect(await verifyDetached(identity.nodeId, '', sig)).toBe(true);
    expect(await verifyDetached(identity.nodeId, 'x', sig)).toBe(false);
  });
});

describe('envelope', () => {
  it('round trip sign, encrypt, verify, decrypt', async () => {
    const { alice, bob } = await pair();
    const envelope = await sealEnvelope(alice, bob.nodeId, catalogRequest(), { now: NOW });
    expect(envelope.body).not.toContain('catalog');
    const opened = await openEnvelope(bob, envelope, {
      isKnownPeer: (id) => id === alice.nodeId,
      replay: new ReplayCache(),
      now: NOW,
    });
    expect(opened.message).toEqual(catalogRequest());
    expect(opened.envelope.from).toBe(alice.nodeId);
  });

  it('every error code in the specified order', async () => {
    const { alice, bob } = await pair();
    const mallory = await generateIdentity('Mallory');
    const known = { isKnownPeer: (id: string) => id === alice.nodeId };
    const good = await sealEnvelope(alice, bob.nodeId, catalogRequest(), { now: NOW });
    const open = (raw: unknown, now = NOW, replay = new ReplayCache()) =>
      openEnvelope(bob, raw, { ...known, replay, now });

    // E_SCHEMA wins over everything, including a bad signature.
    await expectCode(open({ ...good, v: 2, sig: 'x' }), 'E_SCHEMA');
    // E_SIG before E_UNKNOWN_PEER: a forged envelope from an unknown node is a signature failure.
    await expectCode(open({ ...good, from: mallory.nodeId }), 'E_SIG');
    // E_UNKNOWN_PEER before E_EXPIRED.
    const fromMallory = await sealEnvelope(mallory, bob.nodeId, catalogRequest(), { now: NOW - 60 * 60_000 });
    await expectCode(open(fromMallory), 'E_UNKNOWN_PEER');
    // E_EXPIRED: past exp, and ts too far in the future.
    await expectCode(open(good, NOW + 16 * 60_000), 'E_EXPIRED');
    await expectCode(
      open(await sealEnvelope(alice, bob.nodeId, catalogRequest(), { now: NOW + 6 * 60_000 })),
      'E_EXPIRED',
    );
    // E_REPLAY before E_DECRYPT.
    const replay = new ReplayCache();
    await open(good, NOW, replay);
    await expectCode(open(good, NOW, replay), 'E_REPLAY');
    // E_DECRYPT: valid signature over a body encrypted for someone else.
    const forCarol = await sealEnvelope(alice, mallory.nodeId, catalogRequest(), { now: NOW });
    const resigned = await resign(alice, { ...forCarol, to: bob.nodeId });
    await expectCode(open(resigned), 'E_DECRYPT');
    // E_MESSAGE_SCHEMA: decrypts fine but is not a protocol message.
    await expectCode(open(await sealRaw(alice, bob, '{"type":"nope"}')), 'E_MESSAGE_SCHEMA');
  });

  it('refuses an oversized envelope before sending', async () => {
    const { alice, bob } = await pair();
    const message: Message = {
      type: 'drop_result',
      dropId: DROP_ID,
      output: { text: 'x'.repeat(MAX_ENVELOPE_BYTES) },
      outputSchemaHash: 'h',
    };
    await expectCode(sealEnvelope(alice, bob.nodeId, message, { now: NOW }), 'E_TOO_LARGE');
    const small = await sealEnvelope(alice, bob.nodeId, catalogRequest(), { now: NOW });
    expect(envelopeSize(small)).toBeLessThan(MAX_ENVELOPE_BYTES);
  });

  it('accepts an unknown sender only for a pair_request with a valid token', async () => {
    const { alice, bob } = await pair();
    const pairRequest: Message = {
      type: 'pair_request',
      oneTimeToken: 'a'.repeat(32),
      displayName: 'Alice',
      ownerKind: 'human',
    };
    const envelope = await sealEnvelope(alice, bob.nodeId, pairRequest, { now: NOW });
    const base = { isKnownPeer: () => false, now: NOW };
    const opened = await openEnvelope(bob, envelope, {
      ...base,
      replay: new ReplayCache(),
      acceptPairToken: (t) => t === 'a'.repeat(32),
    });
    expect(opened.message.type).toBe('pair_request');
    await expectCode(
      openEnvelope(bob, envelope, { ...base, replay: new ReplayCache(), acceptPairToken: () => false }),
      'E_UNKNOWN_PEER',
    );
    const notPairing = await sealEnvelope(alice, bob.nodeId, catalogRequest(), { now: NOW });
    await expectCode(
      openEnvelope(bob, notPairing, { ...base, replay: new ReplayCache(), acceptPairToken: () => true }),
      'E_UNKNOWN_PEER',
    );
  });
});

describe('cards, receipts, invites, lifecycle, schemas', () => {
  it('signs a capability card that only its executor can vouch for', async () => {
    const { alice, bob } = await pair();
    const card: CapabilityCard = {
      id: 'production.error_summary',
      version: '1.0.0',
      owner: { kind: 'machine', displayName: 'VPS', nodeId: alice.nodeId },
      executorNodeId: alice.nodeId,
      approverNodeIds: [bob.nodeId],
      title: 'Résumer les erreurs de production',
      sensitivity: 'low',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      receives: ['Des comptes par code'],
      neverReceives: ['Une ligne de log'],
      approval: 'always',
      maxOutputChars: 4000,
      budget: { maxSeconds: 10 },
    };
    const signed = await signCard(alice, card);
    expect(await verifyCard(signed, alice.nodeId)).toBe(true);
    expect(await verifyCard(signed, bob.nodeId)).toBe(false);
    expect(await verifyCard({ ...signed, card: { ...card, title: 'Autre' } }, alice.nodeId)).toBe(false);
  });

  it('signs receipts that carry hashes only', async () => {
    const { alice, bob } = await pair();
    const receipt = await signReceipt(alice, {
      dropId: DROP_ID,
      capabilityId: 'production.error_summary',
      capabilityVersion: '1.0.0',
      requester: bob.nodeId,
      executor: alice.nodeId,
      approver: bob.nodeId,
      inputHash: sha256Hex({ service: 'api' }),
      outputHash: sha256Hex({ total: 3 }),
      decision: 'allow_once',
      reviewed: false,
      toolCalls: [{ name: 'journalctl', count: 1 }],
      timestamps: { requested: NOW, decided: NOW + 1, started: NOW + 2, finished: NOW + 3, delivered: NOW + 4 },
    });
    expect(await verifyReceipt(receipt)).toBe(true);
    expect(await verifyReceipt({ ...receipt, decision: 'deny' })).toBe(false);
  });

  it('encodes invites that expire after a day', async () => {
    const { alice } = await pair();
    const invite = createInvite(alice, 'wss://relay.example', NOW);
    expect(decodeInvite(encodeInvite(invite), NOW + 23 * 3_600_000)).toEqual(invite);
    expect(() => decodeInvite(encodeInvite(invite), NOW + 24 * 3_600_000)).toThrow(DropError);
    expect(() => decodeInvite('not-a-code', NOW)).toThrow(DropError);
  });

  it('signs single-use admission tickets that only the sponsor can produce', async () => {
    const { alice, bob } = await pair();
    const ticket = await createAdmission(alice, NOW);
    expect(await verifyAdmission(ticket, NOW + 60_000)).toBe('ok');
    expect(await verifyAdmission(ticket, NOW + ADMISSION_TTL_MS)).toBe('expired');
    expect(await verifyAdmission({ ...ticket, sponsor: bob.nodeId }, NOW)).toBe('bad_signature');
    expect(await verifyAdmission({ ...ticket, expiresAt: ticket.expiresAt + 1 }, NOW)).toBe('bad_signature');
    expect(await verifyAdmission({ v: 1 }, NOW)).toBe('invalid');
    const forever = { ...ticket, expiresAt: NOW + 365 * ADMISSION_TTL_MS };
    const longLived = { ...forever, sig: await signDetached(alice, canonical(omitSig(forever))) };
    expect(await verifyAdmission(longLived, NOW)).toBe('too_long');
    const invite = createInvite(alice, 'wss://relay.example', NOW, ticket);
    expect(decodeInvite(encodeInvite(invite), NOW).admission).toEqual(ticket);
  });

  it('enforces the drop lifecycle', () => {
    expect(canTransition('awaiting_approval', 'approved')).toBe(true);
    expect(canTransition('running', 'delivered')).toBe(true);
    expect(canTransition('awaiting_approval', 'running')).toBe(false);
    expect(canTransition('denied', 'approved')).toBe(false);
  });

  it('zod schemas export their JSON Schema', () => {
    const schemas = protocolJsonSchemas();
    expect(Object.keys(schemas)).toEqual(['Envelope', 'Message', 'CapabilityCard', 'Receipt']);
    expect(schemas.CapabilityCard).toMatchObject({ type: 'object' });
  });
});

/** A copy of `record` without `field`. */
function without(record: object, field: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== field));
}

function cardFor(node: Identity, approver: Identity): CapabilityCard {
  return {
    id: 'production.error_summary',
    version: '1.0.0',
    owner: { kind: 'machine', displayName: 'VPS', nodeId: node.nodeId },
    executorNodeId: node.nodeId,
    approverNodeIds: [approver.nodeId],
    title: 'Résumer les erreurs de production',
    sensitivity: 'low',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    receives: ['Des comptes par code'],
    neverReceives: ['Une ligne de log'],
    approval: 'always',
    maxOutputChars: 4000,
    budget: { maxSeconds: 10 },
  };
}

/** Seals `body` as raw JSON for `recipient`, then opens it as `recipient` would, from a known peer. */
async function openRaw(sender: Identity, recipient: Identity, body: unknown): Promise<Message> {
  const envelope = await sealRaw(sender, recipient, JSON.stringify(body));
  const opened = await openEnvelope(recipient, envelope, {
    isKnownPeer: (id) => id === sender.nodeId,
    replay: new ReplayCache(),
    now: NOW,
  });
  return opened.message;
}

describe('protocol contract', () => {
  it('imports nothing that does I/O: only zod, libsodium and node:crypto for hashes and random bytes', () => {
    const src = join(import.meta.dirname, '..', 'src');
    for (const file of readdirSync(src)) {
      const text = readFileSync(join(src, file), 'utf8');
      const imports = [...text.matchAll(/from '([^']+)'/g)].map((match) => match[1] ?? '');
      for (const specifier of imports)
        expect(['zod', 'libsodium-wrappers', 'node:crypto'].includes(specifier) || specifier.startsWith('./')).toBe(
          true,
        );
      expect(text).not.toMatch(/\b(?:process\.|fetch\(|require\(|import\()/);
    }
  });

  it('is the only package that declares the cards, envelopes, messages and receipts', () => {
    const packages = join(import.meta.dirname, '..', '..');
    const declarations =
      /executorNodeId: z\.|inputHash: z\.|nonce: z\.string\(\)\.regex|z\.literal\('(?:pair_request|pair_accept|catalog_request|catalog|drop_request|drop_status|approval_request|approval_decision|review_request|review_decision|drop_result|drop_error|receipt)'\)/;
    for (const name of readdirSync(packages)) {
      if (name === 'protocol') continue;
      const src = join(packages, name, 'src');
      let files: string[];
      try {
        files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.ts'));
      } catch {
        continue;
      }
      for (const file of files) expect(readFileSync(join(src, file), 'utf8')).not.toMatch(declarations);
    }
  });

  it('derives the NodeId from the Ed25519 public key, in base64url', async () => {
    const identity = await generateIdentity('Alice');
    const secret = Buffer.from(identity.secretKey, 'base64url');
    // libsodium's Ed25519 secret key is seed || public key: crypto_sign_keypair made this pair.
    expect(secret).toHaveLength(64);
    expect(identity.nodeId).toBe(secret.subarray(32).toString('base64url'));
    expect(identity.publicKey).toBe(identity.nodeId);
    expect(NodeIdSchema.safeParse(identity.nodeId).success).toBe(true);
    expect(NodeIdSchema.safeParse(secret.toString('base64url')).success).toBe(false);
    expect(await verifyDetached(identity.nodeId, 'm', await signDetached(identity, 'm'))).toBe(true);
  });

  it('refuses an owner kind outside human, team, machine and service', () => {
    for (const kind of ['human', 'team', 'machine', 'service'])
      expect(OwnerKindSchema.safeParse(kind).success).toBe(true);
    expect(OwnerKindSchema.safeParse('bot').success).toBe(false);
  });

  it('accepts a complete owner and refuses one without a nodeId', async () => {
    const { alice } = await pair();
    expect(OwnerSchema.safeParse({ kind: 'human', displayName: 'Guillaume', nodeId: alice.nodeId }).success).toBe(true);
    expect(OwnerSchema.safeParse({ kind: 'human', displayName: 'Guillaume' }).success).toBe(false);
  });

  it('refuses a card without approver, with a non-semver version, an unknown sensitivity or no maxSeconds', async () => {
    const { alice, bob } = await pair();
    const card = cardFor(alice, bob);
    expect(CapabilityCardSchema.safeParse(card).success).toBe(true);
    for (const broken of [
      { ...card, approverNodeIds: [] },
      { ...card, version: 'v1' },
      { ...card, sensitivity: 'medium' },
      { ...card, budget: { maxUsd: 1 } },
    ])
      expect(CapabilityCardSchema.safeParse(broken).success).toBe(false);
  });

  it('defaults approval to always when the card does not say', async () => {
    const { alice, bob } = await pair();
    expect(CapabilityCardSchema.parse(without(cardFor(alice, bob), 'approval')).approval).toBe('always');
  });

  it('refuses a drop state outside the lifecycle', () => {
    const status = { type: 'drop_status', dropId: DROP_ID, state: 'running' };
    expect(MessageSchema.safeParse(status).success).toBe(true);
    expect(MessageSchema.safeParse({ ...status, state: 'cancelled' }).success).toBe(false);
  });

  it('refuses an envelope of another version, or with a decimal ts, as E_SCHEMA', async () => {
    const { alice, bob } = await pair();
    const good = await sealEnvelope(alice, bob.nodeId, catalogRequest(), { now: NOW });
    const open = (raw: Envelope) =>
      openEnvelope(bob, raw, { isKnownPeer: () => true, replay: new ReplayCache(), now: NOW });
    await expectCode(open(await resign(alice, { ...good, v: 2 as 1 })), 'E_SCHEMA');
    await expectCode(open(await resign(alice, { ...good, ts: NOW + 0.5 })), 'E_SCHEMA');
  });

  it('refuses an envelope that expires more than 15 minutes after its ts', async () => {
    const { alice, bob } = await pair();
    const good = await sealEnvelope(alice, bob.nodeId, catalogRequest(), { now: NOW, ttlMs: 60 * 60_000 });
    expect(good.exp - good.ts).toBe(15 * 60_000);
    const tooLong = await resign(alice, { ...good, exp: good.ts + 16 * 60_000 });
    await expectCode(
      openEnvelope(bob, tooLong, { isKnownPeer: () => true, replay: new ReplayCache(), now: NOW }),
      'E_EXPIRED',
    );
  });

  it('encrypts the body with crypto_box for the X25519 keys derived from both Ed25519 identities', async () => {
    const sodium = await getSodium();
    const { alice, bob } = await pair();
    const message: Message = { type: 'drop_status', dropId: DROP_ID, state: 'running' };
    const envelope = await sealEnvelope(alice, bob.nodeId, message, { now: NOW });
    const plain = sodium.crypto_box_open_easy(
      Buffer.from(envelope.body, 'base64url'),
      Buffer.from(envelope.nonce, 'base64url'),
      sodium.crypto_sign_ed25519_pk_to_curve25519(Buffer.from(alice.nodeId, 'base64url')),
      sodium.crypto_sign_ed25519_sk_to_curve25519(Buffer.from(bob.secretKey, 'base64url')),
    );
    expect(JSON.parse(sodium.to_string(plain))).toEqual(message);
  });

  it('shows no message type in the clear fields of an envelope', async () => {
    const { alice, bob } = await pair();
    for (const message of [
      catalogRequest(),
      { type: 'drop_status', dropId: DROP_ID, state: 'running' } satisfies Message,
      { type: 'drop_result', dropId: DROP_ID, output: { ok: true }, outputSchemaHash: 'h' } satisfies Message,
    ]) {
      const envelope = await sealEnvelope(alice, bob.nodeId, message, { now: NOW });
      expect(Object.keys(envelope).sort()).toEqual(['body', 'exp', 'from', 'id', 'nonce', 'sig', 'to', 'ts', 'v']);
      const clear = JSON.stringify({ ...envelope, body: undefined });
      expect(clear).not.toContain(message.type);
      expect(Buffer.from(envelope.body, 'base64url').toString('latin1')).not.toContain(message.type);
    }
  });

  it('fails E_SIG when any signed field changes after signing', async () => {
    const { alice, bob } = await pair();
    const good = await sealEnvelope(alice, bob.nodeId, catalogRequest(), { now: NOW });
    const other = await sealEnvelope(alice, bob.nodeId, catalogRequest(), { now: NOW });
    for (const altered of [
      { ...good, id: other.id },
      { ...good, ts: NOW - 1 },
      { ...good, exp: good.exp - 1 },
      { ...good, nonce: other.nonce },
      { ...good, body: other.body },
    ])
      await expectCode(
        openEnvelope(bob, altered, { isKnownPeer: () => true, replay: new ReplayCache(), now: NOW }),
        'E_SIG',
      );
  });

  it('sorts keys and adds no whitespace in canonical()', () => {
    expect(canonical({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('reports E_SIG for an envelope that is both forged and expired', async () => {
    const { alice, bob } = await pair();
    const good = await sealEnvelope(alice, bob.nodeId, catalogRequest(), { now: NOW });
    await expectCode(
      openEnvelope(
        bob,
        { ...good, sig: good.sig.slice(0, -2) + 'AA' },
        {
          isKnownPeer: () => true,
          replay: new ReplayCache(),
          now: NOW + 60 * 60_000,
        },
      ),
      'E_SIG',
    );
  });

  it('remembers an envelope id for 30 minutes', () => {
    const replay = new ReplayCache();
    expect(REPLAY_WINDOW_MS).toBe(30 * 60_000);
    expect(replay.check('id', NOW)).toBe(true);
    expect(replay.check('id', NOW + 29 * 60_000)).toBe(false);
    expect(replay.check('id', NOW + 30 * 60_000 + 1)).toBe(true);
  });

  it('refuses a drop message without dropId, as E_MESSAGE_SCHEMA', async () => {
    const { alice, bob } = await pair();
    await expectCode(
      openRaw(alice, bob, { type: 'drop_result', output: {}, outputSchemaHash: 'h' }),
      'E_MESSAGE_SCHEMA',
    );
    expect((await openRaw(alice, bob, catalogRequest())).type).toBe('catalog_request');
  });

  it('requires the token, name and owner kind in pair_request and pair_accept', () => {
    const pairing = { oneTimeToken: 'a'.repeat(32), displayName: 'Alice', ownerKind: 'human' };
    for (const type of ['pair_request', 'pair_accept']) {
      expect(MessageSchema.safeParse({ type, ...pairing }).success).toBe(true);
      for (const field of Object.keys(pairing)) {
        expect(MessageSchema.safeParse(without({ type, ...pairing }, field)).success).toBe(false);
      }
    }
  });

  it('refuses a drop_request with a purpose over 140 characters or an unknown agent, as E_MESSAGE_SCHEMA', async () => {
    const { alice, bob } = await pair();
    const request = {
      type: 'drop_request',
      dropId: DROP_ID,
      capabilityId: 'production.error_summary',
      capabilityVersion: '1.0.0',
      input: { service: 'api' },
      purpose: 'x'.repeat(140),
      requestedBy: { nodeId: alice.nodeId, displayName: 'Alice', agent: 'claude_code' },
    };
    expect((await openRaw(alice, bob, request)).type).toBe('drop_request');
    await expectCode(openRaw(alice, bob, { ...request, purpose: 'x'.repeat(141) }), 'E_MESSAGE_SCHEMA');
    await expectCode(
      openRaw(alice, bob, { ...request, requestedBy: { ...request.requestedBy, agent: 'copilot' } }),
      'E_MESSAGE_SCHEMA',
    );
  });

  it('requires every consent field in approval_request', async () => {
    const { alice } = await pair();
    const request = {
      type: 'approval_request',
      dropId: DROP_ID,
      card: {
        capabilityId: 'production.error_summary',
        title: 'Résumer les erreurs de production',
        receives: ['Des comptes par code'],
        neverReceives: ['Une ligne de log'],
        sensitivity: 'low',
        executorName: 'VPS',
      },
      inputPreview: 'service api',
      purpose: 'Comprendre un incident',
      requestedBy: { nodeId: alice.nodeId, displayName: 'Alice', agent: 'codex' },
      expiresAt: NOW,
    };
    expect(MessageSchema.safeParse(request).success).toBe(true);
    for (const field of ['dropId', 'card', 'inputPreview', 'purpose', 'requestedBy', 'expiresAt']) {
      expect(MessageSchema.safeParse(without(request, field)).success).toBe(false);
    }
    for (const field of ['title', 'receives', 'neverReceives', 'sensitivity']) {
      const card = without(request.card, field);
      expect(MessageSchema.safeParse({ ...request, card }).success).toBe(false);
    }
  });

  it('refuses an approval decision other than allow_once, deny and not_now, as E_MESSAGE_SCHEMA', async () => {
    const { alice, bob } = await pair();
    const decision = { type: 'approval_decision', dropId: DROP_ID, decision: 'not_now', decidedAt: NOW };
    expect((await openRaw(alice, bob, decision)).type).toBe('approval_decision');
    await expectCode(openRaw(alice, bob, { ...decision, decision: 'allow_always' }), 'E_MESSAGE_SCHEMA');
  });

  it('accepts a review decision that sends with JSON paths to withhold', () => {
    const parsed = MessageSchema.parse({
      type: 'review_decision',
      dropId: DROP_ID,
      decision: 'send',
      redactions: ['/stack'],
    });
    expect(parsed).toMatchObject({ decision: 'send', redactions: ['/stack'] });
    expect(MessageSchema.safeParse({ type: 'review_decision', dropId: DROP_ID, decision: 'edit' }).success).toBe(false);
  });

  it('requires dropId, output and outputSchemaHash in drop_result', () => {
    const result = { type: 'drop_result', dropId: DROP_ID, output: { total: 3 }, outputSchemaHash: 'h' };
    expect(MessageSchema.safeParse(result).success).toBe(true);
    expect(MessageSchema.safeParse(without(result, 'outputSchemaHash')).success).toBe(false);
  });

  it('refuses a drop_error code outside the closed list, as E_MESSAGE_SCHEMA', async () => {
    const { alice, bob } = await pair();
    const error = { type: 'drop_error', dropId: DROP_ID, code: 'E_RUNNER', message: 'Échec.' };
    expect((await openRaw(alice, bob, error)).type).toBe('drop_error');
    await expectCode(openRaw(alice, bob, { ...error, code: 'E_FOO' }), 'E_MESSAGE_SCHEMA');
  });

  it('requires the six identification fields in a receipt, and accepts a refusal without run timestamps', async () => {
    const { alice, bob } = await pair();
    const receipt = await signReceipt(alice, {
      dropId: DROP_ID,
      capabilityId: 'production.error_summary',
      capabilityVersion: '1.0.0',
      requester: bob.nodeId,
      executor: alice.nodeId,
      approver: bob.nodeId,
      inputHash: sha256Hex({ service: 'api' }),
      decision: 'deny',
      reviewed: false,
      toolCalls: [],
      timestamps: { requested: NOW, decided: NOW + 1 },
    });
    expect(ReceiptSchema.safeParse(receipt).success).toBe(true);
    for (const field of ['dropId', 'capabilityId', 'capabilityVersion', 'requester', 'executor', 'approver']) {
      expect(ReceiptSchema.safeParse(without(receipt, field)).success).toBe(false);
    }
    expect(ReceiptSchema.safeParse({ ...receipt, inputHash: 'not-a-hash' }).success).toBe(false);
  });
});

async function resign(sender: Identity, envelope: Envelope): Promise<Envelope> {
  const { v, id, from, to, ts, exp, nonce, body } = envelope;
  return { ...envelope, sig: await signDetached(sender, canonical({ v, id, from, to, ts, exp, nonce, body })) };
}

async function sealRaw(sender: Identity, recipient: Identity, plain: string): Promise<Envelope> {
  const sodium = await getSodium();
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const body = sodium.crypto_box_easy(
    plain,
    nonce,
    sodium.crypto_sign_ed25519_pk_to_curve25519(Buffer.from(recipient.nodeId, 'base64url')),
    sodium.crypto_sign_ed25519_sk_to_curve25519(Buffer.from(sender.secretKey, 'base64url')),
  );
  return resign(sender, {
    v: 1,
    id: '0199c5a0-0000-7000-8000-0000000000ff',
    from: sender.nodeId,
    to: recipient.nodeId,
    ts: NOW,
    exp: NOW + 60_000,
    nonce: Buffer.from(nonce).toString('base64url'),
    body: Buffer.from(body).toString('base64url'),
    sig: '',
  });
}

function omitSig({ v, sponsor, nonce, expiresAt }: Admission): Omit<Admission, 'sig'> {
  return { v, sponsor, nonce, expiresAt };
}
