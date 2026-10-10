import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { ADMISSION_TTL_MS, AdmissionSchema, type Admission } from './admission.ts';
import { DropError } from './errors.ts';
import { NodeIdSchema, type Identity } from './identity.ts';
import { IrohAddrSchema, type IrohAddr } from './iroh.ts';
import { TeamSchema, type Team } from './team.ts';

/** A day: an invite is a link sent by message, opened later (D26). It used to be 15 minutes. */
export const INVITE_TTL_MS = ADMISSION_TTL_MS;

export const InviteSchema = z.object({
  relayUrl: z.url(),
  nodeId: NodeIdSchema,
  displayName: z.string().min(1).max(80),
  oneTimeToken: z.string().min(16),
  expiresAt: z.number().int(),
  /** Lets a newcomer join the relay without an allowlist edit (T2.1). */
  admission: AdmissionSchema.optional(),
  /** The inviter's team, joined on pairing (T2.9). */
  team: TeamSchema.optional(),
  /** The inviter's iroh addresses, so that pairing works without a drop relay (T4.2b). */
  iroh: IrohAddrSchema.optional(),
});
export type Invite = z.infer<typeof InviteSchema>;

export function createInvite(
  identity: Identity,
  relayUrl: string,
  now: number = Date.now(),
  admission?: Admission,
  team?: Team,
  iroh?: IrohAddr,
): Invite {
  return {
    relayUrl,
    nodeId: identity.nodeId,
    displayName: identity.displayName,
    oneTimeToken: randomBytes(24).toString('base64url'),
    expiresAt: now + INVITE_TTL_MS,
    ...(admission ? { admission } : {}),
    ...(team ? { team } : {}),
    ...(iroh ? { iroh } : {}),
  };
}

export function encodeInvite(invite: Invite): string {
  return Buffer.from(JSON.stringify(InviteSchema.parse(invite)), 'utf8').toString('base64url');
}

export function decodeInvite(code: string, now: number = Date.now()): Invite {
  let invite: Invite;
  try {
    invite = InviteSchema.parse(JSON.parse(Buffer.from(code.trim(), 'base64url').toString('utf8')));
  } catch {
    throw new DropError('E_INVITE', 'invalid invite code');
  }
  if (invite.expiresAt <= now) throw new DropError('E_INVITE', 'invite expired');
  return invite;
}
