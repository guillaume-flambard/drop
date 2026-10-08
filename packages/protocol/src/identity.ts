import { z } from 'zod';
import { fromBase64Url, toBase64Url } from './encoding.ts';
import { getSodium } from './sodium.ts';

/** base64url of the 32-byte Ed25519 public key. */
export const NodeIdSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'NodeId must be base64url of 32 bytes');
export type NodeId = z.infer<typeof NodeIdSchema>;

export const OwnerKindSchema = z.enum(['human', 'team', 'machine', 'service']);
export type OwnerKind = z.infer<typeof OwnerKindSchema>;

export const IdentitySchema = z.object({
  nodeId: NodeIdSchema,
  publicKey: z.string(),
  secretKey: z.string(),
  createdAt: z.string(),
  displayName: z.string().min(1).max(80),
});
export type Identity = z.infer<typeof IdentitySchema>;

export async function generateIdentity(displayName: string, now: Date = new Date()): Promise<Identity> {
  const sodium = await getSodium();
  const pair = sodium.crypto_sign_keypair();
  const nodeId = toBase64Url(pair.publicKey);
  return {
    nodeId,
    publicKey: nodeId,
    secretKey: toBase64Url(pair.privateKey),
    createdAt: now.toISOString(),
    displayName,
  };
}

export async function signDetached(identity: Identity, message: string): Promise<string> {
  const sodium = await getSodium();
  return toBase64Url(sodium.crypto_sign_detached(message, fromBase64Url(identity.secretKey)));
}

export async function verifyDetached(nodeId: NodeId, message: string, signature: string): Promise<boolean> {
  const sodium = await getSodium();
  try {
    return sodium.crypto_sign_verify_detached(fromBase64Url(signature), message, fromBase64Url(nodeId));
  } catch {
    // Malformed signature or key bytes: an invalid signature, reported by the caller as E_SIG.
    return false;
  }
}

/** X25519 keys derived from the Ed25519 identity, used for crypto_box. */
export async function boxKeys(identity: Identity): Promise<{ publicKey: Uint8Array; secretKey: Uint8Array }> {
  const sodium = await getSodium();
  return {
    publicKey: sodium.crypto_sign_ed25519_pk_to_curve25519(fromBase64Url(identity.publicKey)),
    secretKey: sodium.crypto_sign_ed25519_sk_to_curve25519(fromBase64Url(identity.secretKey)),
  };
}

export async function boxPublicKey(nodeId: NodeId): Promise<Uint8Array> {
  const sodium = await getSodium();
  return sodium.crypto_sign_ed25519_pk_to_curve25519(fromBase64Url(nodeId));
}
