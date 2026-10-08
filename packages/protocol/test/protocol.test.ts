import { describe, expect, it } from 'vitest';
import {
  canonical,
  canTransition,
  createInvite,
  decodeInvite,
  DropError,
  encodeInvite,
  envelopeSize,
  generateIdentity,
  MAX_ENVELOPE_BYTES,
  openEnvelope,
  protocolJsonSchemas,
  ReplayCache,
  sealEnvelope,
  sha256Hex,
  signCard,
  signDetached,
  signReceipt,
  verifyCard,
  verifyDetached,
  verifyReceipt,
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

  it('encodes invites that expire after 15 minutes', async () => {
    const { alice } = await pair();
    const invite = createInvite(alice, 'wss://relay.example', NOW);
    expect(decodeInvite(encodeInvite(invite), NOW + 60_000)).toEqual(invite);
    expect(() => decodeInvite(encodeInvite(invite), NOW + 15 * 60_000)).toThrow(DropError);
    expect(() => decodeInvite('not-a-code', NOW)).toThrow(DropError);
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
