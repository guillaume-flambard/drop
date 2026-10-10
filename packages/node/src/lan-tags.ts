/**
 * Rotating local-network announcements (T4.2c, D67): a node announces a tag only its paired peers can recognize,
 * renewed every 15 minutes, plus one tag per live invite that only the invite's holder can recognize. Never its id.
 */
import { createHmac, randomBytes } from 'node:crypto';

export const LAN_EPOCH_MS = 15 * 60 * 1000;
export const MAX_INVITE_TAGS = 3;

/** What a node announces on the local network. */
export interface LanAnnouncement {
  tag: string;
  invites: string[];
}

export function lanEpoch(now: number): number {
  return Math.floor(now / LAN_EPOCH_MS);
}

function mac(key: Uint8Array | string, label: string): string {
  return createHmac('sha256', key).update(label).digest('base64url').slice(0, 22);
}

export function lanTag(key: Uint8Array, epoch: number): string {
  return mac(key, `drop-lan-tag|${String(epoch)}`);
}

export function inviteTag(token: string, epoch: number): string {
  return mac(token, `drop-lan-invite|${String(epoch)}`);
}

export function newLanKey(): string {
  return randomBytes(32).toString('base64url');
}

export function decodeLanKey(key: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]{43}$/.test(key)) return undefined;
  const bytes = Buffer.from(key, 'base64url');
  return bytes.length === 32 ? new Uint8Array(bytes) : undefined;
}

/** True when `seen` carries the tag of `key` for this epoch or a neighbouring one (rotation, clocks ahead or behind). */
export function carriesTag(seen: LanAnnouncement, key: Uint8Array, now: number): boolean {
  const epoch = lanEpoch(now);
  return [epoch - 1, epoch, epoch + 1].some((candidate) => seen.tag === lanTag(key, candidate));
}

export function carriesInvite(seen: LanAnnouncement, token: string, now: number): boolean {
  const epoch = lanEpoch(now);
  return [epoch - 1, epoch, epoch + 1].some((candidate) => seen.invites.includes(inviteTag(token, candidate)));
}

/**
 * Before anything else on a session, the dialer proves it holds the secret of the node it wants: that node's
 * discovery key, or the token of the invite being used (T4.2c review). A connection that cannot knock gets nothing,
 * not even the node id; the answer proves the responder holds the same secret before the dialer reveals its own id.
 */
export function knockMac(secret: string, nonce: string): string {
  return createHmac('sha256', secret).update(`drop-lan-knock|${nonce}`).digest('base64url');
}

export function knockAnswerMac(secret: string, nonce: string): string {
  return createHmac('sha256', secret).update(`drop-lan-knock-ok|${nonce}`).digest('base64url');
}
