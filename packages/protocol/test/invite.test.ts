import { describe, expect, it } from 'vitest';
import {
  createAdmission,
  createInvite,
  decodeInvite,
  DEFAULT_JOIN_PAGE,
  encodeInvite,
  ERROR_CODES,
  generateIdentity,
  INVITE_TTL_MS,
  inviteCodeFrom,
  isDropError,
  joinLink,
  relayUrlAllowed,
  signDetached,
  canonical,
  verifyInvite,
} from '../src/index.ts';

const NOW = 1_800_000_000_000;
const RELAY = 'wss://drop.memolabs.dev/v1';

/** The same JSON, re-encoded without re-signing: what someone editing a link in transit produces. */
function tamper(code: string, change: (invite: Record<string, unknown>) => void): string {
  const invite = JSON.parse(Buffer.from(code, 'base64url').toString('utf8')) as Record<string, unknown>;
  change(invite);
  return Buffer.from(JSON.stringify(invite), 'utf8').toString('base64url');
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return isDropError(error) ? error.code : 'not a DropError';
  }
  return 'accepted';
}

describe('invites (T4.23)', () => {
  it('signs every field with the inviter node and refuses a modified invite (E_INVITE_SIG)', async () => {
    const guillaume = await generateIdentity('Guillaume');
    const mallory = await generateIdentity('Mallory');
    const admission = await createAdmission(guillaume, NOW);
    const team = { teamId: 'atelier-team-0001', name: 'Atelier' };
    const code = encodeInvite(await createInvite(guillaume, RELAY, NOW, admission, team));
    const invite = await verifyInvite(code, NOW + 60_000);
    expect(invite).toMatchObject({ displayName: 'Guillaume', team, relayUrl: RELAY, nodeId: guillaume.nodeId });
    for (const change of [
      (raw: Record<string, unknown>) => (raw.relayUrl = 'wss://evil.example/v1'),
      (raw: Record<string, unknown>) => (raw.displayName = 'Julie'),
      (raw: Record<string, unknown>) => (raw.team = { ...team, name: 'Autre' }),
      (raw: Record<string, unknown>) => (raw.expiresAt = NOW + 1000),
      (raw: Record<string, unknown>) => (raw.nodeId = mallory.nodeId),
    ])
      expect(await refusal(verifyInvite(tamper(code, change), NOW))).toBe('E_INVITE_SIG');
    // Unsigned, as before T4.23: refused, never trusted.
    expect(
      await refusal(
        verifyInvite(
          tamper(code, (raw) => delete raw.sig),
          NOW,
        ),
      ),
    ).toBe('E_INVITE');
  });

  it('refuses an expired invite, or one meant to outlive a day (E_INVITE_EXPIRED)', async () => {
    const guillaume = await generateIdentity('Guillaume');
    const invite = await createInvite(guillaume, RELAY, NOW);
    const code = encodeInvite(invite);
    expect(decodeInvite(code, NOW + INVITE_TTL_MS - 1).oneTimeToken).toBe(invite.oneTimeToken);
    expect(await refusal(verifyInvite(code, NOW + INVITE_TTL_MS))).toBe('E_INVITE_EXPIRED');
    // Signed by the inviter but dated a year ahead: refused like an admission ticket that lives too long.
    const forever = { ...invite, expiresAt: NOW + 365 * INVITE_TTL_MS };
    forever.sig = await signDetached(guillaume, `drop-invite-v1|${canonical({ ...forever, sig: undefined })}`);
    expect(await refusal(verifyInvite(encodeInvite(forever), NOW))).toBe('E_INVITE_EXPIRED');
  });

  it('refuses malformed codes, unsafe names and an admission sponsored by another node (E_INVITE)', async () => {
    const guillaume = await generateIdentity('Guillaume');
    const other = await generateIdentity('Other');
    expect(await refusal(verifyInvite('not a code', NOW))).toBe('E_INVITE');
    expect(await refusal(verifyInvite('A'.repeat(4000), NOW))).toBe('E_INVITE');
    const spoofed = await generateIdentity('Guil\u202elaume');
    await expect(createInvite(spoofed, RELAY, NOW)).rejects.toThrow();
    await expect(createInvite(guillaume, 'https://drop.memolabs.dev/v1', NOW)).rejects.toThrow();
    const foreign = await createInvite(guillaume, RELAY, NOW, await createAdmission(other, NOW));
    expect(await refusal(verifyInvite(encodeInvite(foreign), NOW))).toBe('E_INVITE');
  });

  it('reads the invite out of a code, a join link, drop://join and drop://pair', async () => {
    const code = encodeInvite(await createInvite(await generateIdentity('Guillaume'), RELAY, NOW));
    const link = joinLink(code);
    expect(link).toBe(`${DEFAULT_JOIN_PAGE}#${code}`);
    expect(new URL(link).pathname).toBe('/join');
    for (const input of [code, ` ${code}\n`, link, `drop://join?invite=${code}`, `drop://pair?code=${code}`])
      expect(inviteCodeFrom(input)).toBe(code);
    for (const input of ['drop://link?session=x', 'https://drop.memolabs.dev/join', 'javascript:alert(1)', 'a b'])
      expect(() => inviteCodeFrom(input), input).toThrow();
  });

  it('allows ws relays on private addresses only and wss relays by DNS name', () => {
    for (const ok of ['wss://drop.memolabs.dev/v1', 'ws://127.0.0.1:7780/v1', 'ws://10.0.0.2/v1', 'wss://[fd00::1]/v1'])
      expect(relayUrlAllowed(ok), ok).toBe(true);
    for (const refused of [
      'ws://drop.memolabs.dev/v1',
      'wss://8.8.8.8/v1',
      'ws://8.8.8.8/v1',
      'wss://user:secret@drop.memolabs.dev/v1',
      'wss://drop.memolabs.dev/v1?token=x',
      'wss://drop.memolabs.dev/v1#x',
      'wss://localhost/v1',
      'https://drop.memolabs.dev/v1',
      'wss://0x7f.0.0.1/v1',
      `wss://${'a'.repeat(600)}.example/v1`,
    ])
      expect(relayUrlAllowed(refused), refused).toBe(false);
  });
});

describe('invite hardening (T4.33)', () => {
  it('signs under the drop-invite-v1| domain: a bare or foreign-domain signature does not verify (E_INVITE_SIG)', async () => {
    const guillaume = await generateIdentity('Guillaume');
    const invite = await createInvite(guillaume, RELAY, NOW);
    expect(await refusal(verifyInvite(encodeInvite(invite), NOW))).toBe('accepted');
    const body = canonical({ ...invite, sig: undefined });
    const signedOver = async (text: string) =>
      refusal(verifyInvite(encodeInvite({ ...invite, sig: await signDetached(guillaume, text) }), NOW));
    // The format T4.23 shipped: the bare canonical JSON. Then another drop domain over the same fields.
    expect(await signedOver(body)).toBe('E_INVITE_SIG');
    expect(await signedOver(`drop-policy-v1|${body}`)).toBe('E_INVITE_SIG');
    expect(await signedOver(`drop-invite-v1|${body}`)).toBe('accepted');
  });

  it('lists E_LOCKED and E_CONFLICT among the stable error codes', () => {
    expect(ERROR_CODES).toContain('E_LOCKED');
    expect(ERROR_CODES).toContain('E_CONFLICT');
  });
});
