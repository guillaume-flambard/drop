import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { ADMISSION_TTL_MS, AdmissionSchema, type Admission } from './admission.ts';
import { canonical } from './canonical.ts';
import { MAX_CLOCK_SKEW_MS } from './envelope.ts';
import { DropError } from './errors.ts';
import { NodeIdSchema, signDetached, verifyDetached, type Identity } from './identity.ts';
import { IrohAddrSchema, type IrohAddr } from './iroh.ts';
import { TeamSchema, type Team } from './team.ts';
import { isUnsafeLabel } from './text-guards.ts';

/** A day: an invite is a link sent by message, opened later (D26). It used to be 15 minutes. */
export const INVITE_TTL_MS = ADMISSION_TTL_MS;

/** The page a join link opens (T4.23, D95). The invite rides in the fragment, which no browser sends to a server. */
export const DEFAULT_JOIN_PAGE = 'https://drop.memolabs.dev/join';

/** An encoded invite longer than this is refused before decoding: it also has to fit in a `drop://` link. */
export const MAX_INVITE_CODE_CHARS = 3_500;

/** A name shown on the confirmation card: one line, no control character, no bidi override (T4.23). */
const LabelSchema = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !isUnsafeLabel(value), 'unsafe label');

/** Shape only: whether this relay may be adopted is `relayUrlAllowed`'s, applied where the URL is used (D95). */
const InviteRelaySchema = z
  .string()
  .max(512)
  .refine((raw) => {
    try {
      const url = new URL(raw);
      return (url.protocol === 'ws:' || url.protocol === 'wss:') && !url.username && !url.password && !url.hash;
    } catch {
      return false;
    }
  }, 'ws or wss relay URL required');

const InviteBodySchema = z.object({
  relayUrl: InviteRelaySchema,
  nodeId: NodeIdSchema,
  displayName: LabelSchema(80),
  oneTimeToken: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  expiresAt: z.number().int(),
  /** Lets a newcomer join the relay without an allowlist edit (T2.1). */
  admission: AdmissionSchema.optional(),
  /** The inviter's team, joined on pairing (T2.9). */
  team: TeamSchema.extend({ name: LabelSchema(60) }).optional(),
  /** The inviter's iroh addresses, so that pairing works without a drop relay (T4.2b). */
  iroh: IrohAddrSchema.optional(),
});

/**
 * A pairing code (T2.1, T4.23). The inviter's node signs every other field with its identity key, under the invite
 * domain (T4.33), so the name, team and relay shown before « Rejoindre » are the ones that node issued; it does not
 * prove who the human is.
 */
export const InviteSchema = InviteBodySchema.extend({ sig: z.string().regex(/^[A-Za-z0-9_-]{86}$/) });
export type Invite = z.infer<typeof InviteSchema>;

/**
 * Signed under a domain of its own (T4.33), as the organization policy is under `drop-policy-v1|`: no other drop
 * signature over the same JSON can pass for an invite.
 */
const INVITE_DOMAIN = 'drop-invite-v1|';

/** The domain, then every field but the signature: canonical JSON drops the `undefined` member. */
function signedPart(invite: Omit<Invite, 'sig'> & { sig?: string }): string {
  return `${INVITE_DOMAIN}${canonical({ ...invite, sig: undefined })}`;
}

export async function createInvite(
  identity: Identity,
  relayUrl: string,
  now: number = Date.now(),
  admission?: Admission,
  team?: Team,
  iroh?: IrohAddr,
): Promise<Invite> {
  const body = InviteBodySchema.parse({
    relayUrl,
    nodeId: identity.nodeId,
    displayName: identity.displayName,
    oneTimeToken: randomBytes(24).toString('base64url'),
    expiresAt: now + INVITE_TTL_MS,
    ...(admission ? { admission } : {}),
    ...(team ? { team } : {}),
    ...(iroh ? { iroh } : {}),
  });
  return { ...body, sig: await signDetached(identity, signedPart(body)) };
}

export function encodeInvite(invite: Invite): string {
  return Buffer.from(JSON.stringify(InviteSchema.parse(invite)), 'utf8').toString('base64url');
}

/**
 * Shape and dates, synchronously: E_INVITE for a code that does not parse, E_INVITE_EXPIRED for one past its date or
 * meant to outlive the 24 h TTL. The signature is `verifyInvite`'s: never act on a code it did not check.
 */
export function decodeInvite(code: string, now: number = Date.now()): Invite {
  const trimmed = code.trim();
  let invite: Invite;
  try {
    if (trimmed.length > MAX_INVITE_CODE_CHARS || !/^[A-Za-z0-9_-]+$/.test(trimmed)) throw new Error('shape');
    invite = InviteSchema.parse(JSON.parse(Buffer.from(trimmed, 'base64url').toString('utf8')));
  } catch {
    throw new DropError('E_INVITE', 'invalid invite code');
  }
  if (invite.expiresAt <= now) throw new DropError('E_INVITE_EXPIRED', 'invite expired');
  if (invite.expiresAt > now + INVITE_TTL_MS + MAX_CLOCK_SKEW_MS)
    throw new DropError('E_INVITE_EXPIRED', 'invite outlives its 24 h validity');
  return invite;
}

/**
 * Decodes, then checks that the inviter's node signed every field (E_INVITE_SIG) and that an admission ticket, if
 * any, is sponsored by that same node (E_INVITE). The admission's own signature stays the relay's to check.
 */
export async function verifyInvite(code: string, now: number = Date.now()): Promise<Invite> {
  const invite = decodeInvite(code, now);
  if (!(await verifyDetached(invite.nodeId, signedPart(invite), invite.sig)))
    throw new DropError('E_INVITE_SIG', 'invite signature does not verify');
  if (invite.admission && invite.admission.sponsor !== invite.nodeId)
    throw new DropError('E_INVITE', 'admission sponsored by another node');
  return invite;
}

/** The link to send (T4.23): the join page, the invite in its fragment. */
export function joinLink(code: string, page: string = DEFAULT_JOIN_PAGE): string {
  return `${page}#${code}`;
}

/**
 * The invite code out of whatever the person pasted or opened: the code itself, a join link (`…/join#code`), a
 * `drop://join?invite=code` or a `drop://pair?code=code` link. Anything else is E_INVITE.
 */
export function inviteCodeFrom(input: string): string {
  const text = input.trim();
  if (/^[A-Za-z0-9_-]+$/.test(text)) return text;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new DropError('E_INVITE', 'invalid invite code');
  }
  const candidate =
    url.protocol === 'https:' || url.protocol === 'http:'
      ? url.hash.slice(1)
      : url.protocol === 'drop:' && url.hostname === 'join'
        ? (url.searchParams.get('invite') ?? '')
        : url.protocol === 'drop:' && url.hostname === 'pair'
          ? (url.searchParams.get('code') ?? '')
          : '';
  if (!/^[A-Za-z0-9_-]+$/.test(candidate)) throw new DropError('E_INVITE', 'invalid invite code');
  return candidate;
}
