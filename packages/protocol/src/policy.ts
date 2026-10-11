import { z } from 'zod';
import { canonical } from './canonical.ts';
import { sha256Hex } from './encoding.ts';
import { MAX_CLOCK_SKEW_MS } from './envelope.ts';
import { NodeIdSchema, signDetached, verifyDetached, type Identity } from './identity.ts';

/**
 * An organization's policy (T4.10, D54, D81): deployed by its IT through MDM, applied by every node and checked again by
 * the internal relay. Signed with the organization's Ed25519 key over a domain of its own, so that no other drop
 * signature can pass for a policy.
 */
const POLICY_DOMAIN = 'drop-policy-v1|';

const OriginSchema = z
  .string()
  .max(200)
  .refine((raw) => {
    try {
      return new URL(raw).origin === raw;
    } catch {
      return false;
    }
  }, 'an origin, such as https://10.0.0.5:8443');

export const PolicySchema = z.strictObject({
  v: z.literal(1),
  policyId: z.string().min(1).max(64),
  version: z.number().int().min(1),
  issuer: NodeIdSchema,
  issuedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  /** Clients offered for connection; absent: all of them. */
  allowedClients: z.array(z.string().min(1).max(40)).max(32).optional(),
  /** Origins a model may be reached at; absent: any. */
  allowedProviders: z.array(OriginSchema).max(100).optional(),
  /** The relays this organization runs; the node's relay must be one of them. */
  relays: z
    .array(
      z
        .string()
        .max(300)
        .refine((raw) => /^wss?:\/\//.test(raw), 'a ws:// or wss:// URL'),
    )
    .min(1)
    .max(20),
  /** Everything goes through the internal relay: no local network session, no iroh. */
  requireInternalRelay: z.boolean().default(true),
  gateways: z
    .strictObject({ allowed: z.boolean().default(false), nodeIds: z.array(NodeIdSchema).max(20).default([]) })
    .default({ allowed: false, nodeIds: [] }),
});
export type Policy = z.input<typeof PolicySchema>;
export type ParsedPolicy = z.output<typeof PolicySchema>;

export const SignedPolicySchema = z.strictObject({ policy: PolicySchema, sig: z.string().min(1).max(200) });
export type SignedPolicy = z.output<typeof SignedPolicySchema>;

function signedText(policy: ParsedPolicy): string {
  return `${POLICY_DOMAIN}${canonical(policy)}`;
}

export async function signPolicy(issuer: Identity, policy: Policy): Promise<SignedPolicy> {
  const parsed = PolicySchema.parse(policy);
  return { policy: parsed, sig: await signDetached(issuer, signedText(parsed)) };
}

/** True only for a well-formed policy whose issuer is `issuerKey` and whose signature matches. Never throws. */
export async function verifyPolicy(raw: unknown, issuerKey: string): Promise<boolean> {
  const parsed = SignedPolicySchema.safeParse(raw);
  if (!parsed.success || parsed.data.policy.issuer !== issuerKey) return false;
  return verifyDetached(parsed.data.policy.issuer, signedText(parsed.data.policy), parsed.data.sig);
}

/** What a node presents to its relay: the SHA-256 of the canonical signed policy. */
export function policyFingerprint(signed: SignedPolicy): string {
  return sha256Hex({ policy: signed.policy, sig: signed.sig });
}

/** Expired, or issued further ahead of this clock than the protocol's clock skew (5 minutes). */
export function policyExpired(policy: ParsedPolicy, now: number): boolean {
  return Date.parse(policy.expiresAt) <= now || Date.parse(policy.issuedAt) > now + MAX_CLOCK_SKEW_MS;
}
