import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { canonical } from './canonical.ts';
import { NodeIdSchema, signDetached, verifyDetached, type Identity } from './identity.ts';

/** How long an admission ticket, and the invite that carries it, stays valid: a day, for a link sent by message (D26). */
export const ADMISSION_TTL_MS = 24 * 60 * 60_000;

/**
 * An admission ticket lets a node the relay does not know yet join it, without editing the allowlist (T2.1, D26). It is
 * signed by a sponsor the relay already admits and is single-use: the relay remembers its nonce. It does not name the
 * newcomer, whose key is often created after the invite is received; joining the relay grants no access to anyone,
 * pairing still needs the invite's own one-time token.
 */
export const AdmissionSchema = z.object({
  v: z.literal(1),
  sponsor: NodeIdSchema,
  nonce: z.string().min(16).max(64),
  expiresAt: z.number().int(),
  sig: z.string(),
});
export type Admission = z.infer<typeof AdmissionSchema>;

function signedPart(ticket: Omit<Admission, 'sig'>): string {
  return canonical({ v: ticket.v, sponsor: ticket.sponsor, nonce: ticket.nonce, expiresAt: ticket.expiresAt });
}

export async function createAdmission(sponsor: Identity, now: number = Date.now()): Promise<Admission> {
  const body = {
    v: 1 as const,
    sponsor: sponsor.nodeId,
    nonce: randomBytes(18).toString('base64url'),
    expiresAt: now + ADMISSION_TTL_MS,
  };
  return { ...body, sig: await signDetached(sponsor, signedPart(body)) };
}

export type AdmissionCheck = 'ok' | 'invalid' | 'expired' | 'bad_signature';

/** Checks shape, expiry and the sponsor's signature. Whether the sponsor is admitted and the nonce unused is the relay's. */
export async function verifyAdmission(raw: unknown, now: number = Date.now()): Promise<AdmissionCheck> {
  const parsed = AdmissionSchema.safeParse(raw);
  if (!parsed.success) return 'invalid';
  if (parsed.data.expiresAt <= now) return 'expired';
  const valid = await verifyDetached(parsed.data.sponsor, signedPart(parsed.data), parsed.data.sig).catch(() => false);
  return valid ? 'ok' : 'bad_signature';
}
