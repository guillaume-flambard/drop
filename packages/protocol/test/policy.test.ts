import { describe, expect, it } from 'vitest';
import {
  generateIdentity,
  policyExpired,
  policyFingerprint,
  signPolicy,
  verifyPolicy,
  type Policy,
} from '../src/index.ts';

export function samplePolicy(issuer: string, now = Date.now()): Policy {
  return {
    v: 1,
    policyId: 'atlas-default',
    version: 3,
    issuer,
    issuedAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 30 * 86_400_000).toISOString(),
    allowedClients: ['claude_code', 'codex'],
    allowedProviders: ['https://10.0.0.5:8443'],
    relays: ['wss://relay.atlas.internal/v1'],
    requireInternalRelay: true,
    gateways: { allowed: false, nodeIds: [] },
  };
}

describe('enterprise policy (T4.10)', () => {
  it('signs a policy, verifies it against its issuer and refuses any change', async () => {
    const [org, other] = await Promise.all([generateIdentity('Atlas IT'), generateIdentity('Someone')]);
    const signed = await signPolicy(org, samplePolicy(org.nodeId));
    expect(await verifyPolicy(signed, org.nodeId)).toBe(true);
    expect(await verifyPolicy(signed, other.nodeId)).toBe(false);
    const widened = { ...signed, policy: { ...signed.policy, requireInternalRelay: false } };
    expect(await verifyPolicy(widened, org.nodeId)).toBe(false);
    // Signed by another key while naming the organization as issuer: refused.
    const forged = await signPolicy(other, samplePolicy(org.nodeId));
    expect(await verifyPolicy(forged, org.nodeId)).toBe(false);
    // A garbled document is refused, never thrown.
    expect(await verifyPolicy({ policy: { v: 2 }, sig: 'x' }, org.nodeId)).toBe(false);

    const fingerprint = policyFingerprint(signed);
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    const next = await signPolicy(org, { ...samplePolicy(org.nodeId), version: 4 });
    expect(policyFingerprint(next)).not.toBe(fingerprint);
    // The fingerprint covers the signature too: the same terms signed by someone else are another policy.
    expect(policyFingerprint({ ...signed, sig: forged.sig })).not.toBe(fingerprint);

    // Valid between its issue date, with five minutes of clock skew, and its expiry.
    const now = Date.parse(signed.policy.issuedAt);
    expect(policyExpired(signed.policy, now)).toBe(false);
    expect(policyExpired(signed.policy, now - 4 * 60_000)).toBe(false);
    expect(policyExpired(signed.policy, now - 6 * 60_000)).toBe(true);
    expect(policyExpired(signed.policy, Date.parse(signed.policy.expiresAt))).toBe(true);
  });
});
