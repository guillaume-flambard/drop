import { describe, expect, it, vi } from 'vitest';
import {
  canonical,
  generateIdentity,
  openEnvelope,
  ReplayCache,
  signDetached,
  type Envelope,
  type Identity,
} from '@drop/protocol';
import { getSodium } from '../../protocol/src/sodium.ts';
import { NodeEngine } from '../src/engine.ts';
import { MemoryStore } from './helpers.ts';

/** An authenticated but malformed message: sealEnvelope intentionally refuses to create it. */
async function sealMalformed(sender: Identity, recipient: Identity, body: unknown): Promise<Envelope> {
  const sodium = await getSodium();
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const cipher = sodium.crypto_box_easy(
    JSON.stringify(body),
    nonce,
    sodium.crypto_sign_ed25519_pk_to_curve25519(Buffer.from(recipient.nodeId, 'base64url')),
    sodium.crypto_sign_ed25519_sk_to_curve25519(Buffer.from(sender.secretKey, 'base64url')),
  );
  const now = Date.now();
  const unsigned = {
    v: 1 as const,
    id: crypto.randomUUID(),
    from: sender.nodeId,
    to: recipient.nodeId,
    ts: now,
    exp: now + 60_000,
    nonce: Buffer.from(nonce).toString('base64url'),
    body: Buffer.from(cipher).toString('base64url'),
  };
  return { ...unsigned, sig: await signDetached(sender, canonical(unsigned)) };
}

describe('T3.1d malformed authenticated requests', () => {
  it('replies E_SCHEMA for signed UUIDv4 drop_request without producing a consent card', async () => {
    const requester = await generateIdentity('Requester');
    const owner = await generateIdentity('Owner');
    const store = new MemoryStore();
    store.savePeer({
      nodeId: requester.nodeId,
      displayName: requester.displayName,
      ownerKind: 'human',
      pairedAt: new Date().toISOString(),
    });
    const sent: Envelope[] = [];
    const transport = {
      send: vi.fn((envelope: Envelope) => {
        sent.push(envelope);
        return Promise.resolve('delivered' as const);
      }),
    };
    const logs: Array<{ event: string; code?: string }> = [];
    const engine = new NodeEngine({
      identity: owner,
      ownerKind: 'human',
      store,
      capabilities: [],
      transport,
      log: (entry) => logs.push(entry),
    });

    const legacyId = '550e8400-e29b-41d4-a716-446655440000';
    const forged = await sealMalformed(requester, owner, {
      type: 'drop_request',
      dropId: legacyId.toUpperCase(),
      capabilityId: 'test.state',
      capabilityVersion: '1.0.0',
      input: {},
      purpose: 'Wrong UUID version',
      requestedBy: { nodeId: requester.nodeId, displayName: 'Requester', agent: 'codex' },
    });
    await engine.handleEnvelope(forged);

    expect(sent).toHaveLength(1);
    const opened = await openEnvelope(requester, sent[0], {
      isKnownPeer: (id) => id === owner.nodeId,
      replay: new ReplayCache(),
    });
    expect(opened.message).toMatchObject({
      type: 'drop_error',
      dropId: legacyId,
      code: 'E_SCHEMA',
    });
    expect(engine.pending()).toEqual([]);
    expect(engine.memoryStats().executing).toBe(0);
    expect(logs).toContainEqual(expect.objectContaining({ event: 'envelope_rejected', code: 'E_MESSAGE_SCHEMA' }));
  });
});
