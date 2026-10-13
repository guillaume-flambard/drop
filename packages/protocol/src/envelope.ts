import { z } from 'zod';
import { canonical } from './canonical.ts';
import { fromBase64Url, toBase64Url, uuidv7 } from './encoding.ts';
import { DropError } from './errors.ts';
import {
  boxKeys,
  boxPublicKey,
  NodeIdSchema,
  signDetached,
  verifyDetached,
  type Identity,
  type NodeId,
} from './identity.ts';
import { MessageSchema, type Message } from './messages.ts';
import { getSodium } from './sodium.ts';

export const MAX_ENVELOPE_BYTES = 256 * 1024;
export const MAX_TTL_MS = 15 * 60_000;
export const MAX_CLOCK_SKEW_MS = 5 * 60_000;
export const REPLAY_WINDOW_MS = 30 * 60_000;

export const EnvelopeSchema = z.object({
  v: z.literal(1),
  id: z.uuid(),
  from: NodeIdSchema,
  to: NodeIdSchema,
  ts: z.number().int(),
  exp: z.number().int(),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{32}$/, '24 bytes base64url'),
  body: z.string().min(1),
  sig: z.string().min(1),
});
export type Envelope = z.infer<typeof EnvelopeSchema>;

function signedPart(envelope: Omit<Envelope, 'sig'>): string {
  const { v, id, from, to, ts, exp, nonce, body } = envelope;
  return canonical({ v, id, from, to, ts, exp, nonce, body });
}

export function envelopeSize(envelope: Envelope): number {
  return Buffer.byteLength(JSON.stringify(envelope), 'utf8');
}

export interface SealOptions {
  now?: number;
  ttlMs?: number;
}

/** Encrypts `message` for `to` with crypto_box, then signs the envelope with Ed25519. */
export async function sealEnvelope(
  sender: Identity,
  to: NodeId,
  message: Message,
  options: SealOptions = {},
): Promise<Envelope> {
  const sodium = await getSodium();
  const now = options.now ?? Date.now();
  const ttl = Math.min(options.ttlMs ?? MAX_TTL_MS, MAX_TTL_MS);
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const keys = await boxKeys(sender);
  const cipher = sodium.crypto_box_easy(
    canonical(MessageSchema.parse(message)),
    nonce,
    await boxPublicKey(to),
    keys.secretKey,
  );
  const unsigned = {
    v: 1 as const,
    id: uuidv7(now),
    from: sender.nodeId,
    to,
    ts: now,
    exp: now + ttl,
    nonce: toBase64Url(nonce),
    body: toBase64Url(cipher),
  };
  const envelope: Envelope = { ...unsigned, sig: await signDetached(sender, signedPart(unsigned)) };
  if (envelopeSize(envelope) > MAX_ENVELOPE_BYTES) throw new DropError('E_TOO_LARGE', 'envelope exceeds 256 KiB');
  return envelope;
}

/** Remembers envelope ids for the replay window. */
export class ReplayCache {
  private readonly entries = new Map<string, number>();
  private readonly windowMs: number;
  private readonly maxEntries: number;

  constructor(windowMs: number = REPLAY_WINDOW_MS, maxEntries = 65_536) {
    this.windowMs = windowMs;
    this.maxEntries = maxEntries;
  }

  /** Returns false when the id was already seen inside the window; otherwise remembers it. */
  check(id: string, now: number): boolean {
    this.purge(now);
    if (this.seen(id, now)) return false;
    // Full: a clock that jumped forward may have left a far-future entry that stops the purge; sweep it all once.
    if (this.entries.size >= this.maxEntries)
      for (const [key, expiresAt] of this.entries) if (expiresAt <= now) this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) return false;
    // Re-inserted at the end: the map stays in writing order, which the purge relies on.
    this.entries.delete(id);
    this.entries.set(id, now + this.windowMs);
    return true;
  }

  /** Whether the id was already seen inside the window, without remembering it (T4.2d). */
  seen(id: string, now: number): boolean {
    return (this.entries.get(id) ?? 0) > now;
  }

  size(): number {
    return this.entries.size;
  }

  /**
   * Drops expired entries from the oldest, stopping at the first live one: expiries grow with the clock, so the rest
   * is live too. If the clock went back, an expired entry may stay behind a live one; seen() never counts it.
   */
  private purge(now: number): void {
    for (const [key, expiresAt] of this.entries) {
      if (expiresAt > now) return;
      this.entries.delete(key);
    }
  }
}

// A response to malformed requests must be bounded to authenticated, paired
// senders; invalid messages never become accepted protocol messages.
const RejectedDropReference = z.object({ type: z.literal('drop_request'), dropId: z.uuid() });

export interface OpenOptions {
  isKnownPeer: (nodeId: NodeId) => boolean;
  replay: ReplayCache;
  now?: number;
  /**
   * Called when the sender is unknown and this node has a pending invite. The envelope is then decrypted and accepted
   * only if it is a `pair_request` whose token this returns true for. Without it, an unknown sender fails at
   * E_UNKNOWN_PEER, in spec order.
   */
  acceptPairToken?: (token: string) => boolean;
  /**
   * The gateway's counterpart of acceptPairToken (T2.13): an unknown node may send a `link_grant` for a link session
   * this returns true for. That is how a user's node first reaches the gateway, after approving the link in its app.
   * It MUST claim the session: true at most once per session, so that a grant cannot be replayed (T4.2d, D78).
   */
  acceptLinkSession?: (sessionId: string) => boolean;
  /** Called only for a signed, decrypted and replay-checked message from a known
   * peer that fails full schema validation but identifies a valid drop request.
   * This is a best-effort explicit protocol refusal, never an authorization. */
  onInvalidDropRequest?: (from: NodeId, dropId: string) => Promise<void> | void;
}

export interface Opened {
  envelope: Envelope;
  message: Message;
}

/**
 * Verifies and decrypts an envelope addressed to `recipient`. Checks run in this order, each with a stable code:
 * E_SCHEMA, E_SIG, E_UNKNOWN_PEER, E_EXPIRED, E_REPLAY, E_DECRYPT, E_MESSAGE_SCHEMA.
 */
export async function openEnvelope(recipient: Identity, raw: unknown, options: OpenOptions): Promise<Opened> {
  const now = options.now ?? Date.now();
  const parsed = EnvelopeSchema.safeParse(raw);
  if (!parsed.success || parsed.data.to !== recipient.nodeId) throw new DropError('E_SCHEMA', 'malformed envelope');
  const envelope = parsed.data;

  if (!(await verifyDetached(envelope.from, signedPart(envelope), envelope.sig))) {
    throw new DropError('E_SIG', 'bad signature');
  }

  const known = options.isKnownPeer(envelope.from);
  if (!known && !options.acceptPairToken && !options.acceptLinkSession)
    throw new DropError('E_UNKNOWN_PEER', 'sender is not a paired peer');

  if (envelope.exp <= now || envelope.ts > now + MAX_CLOCK_SKEW_MS || envelope.exp > envelope.ts + MAX_TTL_MS) {
    throw new DropError('E_EXPIRED', 'envelope expired or out of time window');
  }

  // A known peer's id is remembered now. An unknown sender's is only looked up: it is remembered once its pairing is
  // accepted below, so that refused envelopes cannot fill the cache every peer shares (T4.2d, D78).
  if (known ? !options.replay.check(envelope.id, now) : options.replay.seen(envelope.id, now))
    throw new DropError('E_REPLAY', 'envelope id already seen');

  const sodium = await getSodium();
  let plain: string;
  try {
    const keys = await boxKeys(recipient);
    plain = sodium.to_string(
      sodium.crypto_box_open_easy(
        fromBase64Url(envelope.body),
        fromBase64Url(envelope.nonce),
        await boxPublicKey(envelope.from),
        keys.secretKey,
      ),
    );
  } catch {
    // libsodium throws on any authentication failure; it is reported as the stable code below.
    throw new DropError('E_DECRYPT', 'cannot decrypt body');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(plain);
  } catch {
    throw new DropError('E_MESSAGE_SCHEMA', 'invalid message');
  }
  const parsedMessage = MessageSchema.safeParse(decoded);
  if (!parsedMessage.success) {
    // The response is strictly narrower than accepting a malformed message:
    // only a known, authenticated peer and a syntactically valid UUID can be
    // identified. Anonymous pairing attempts and invalid signatures get silence.
    if (known && options.onInvalidDropRequest) {
      const reference = RejectedDropReference.safeParse(decoded);
      if (reference.success) {
        await options.onInvalidDropRequest(envelope.from, reference.data.dropId.toLowerCase());
      }
    }
    throw new DropError('E_MESSAGE_SCHEMA', 'invalid message');
  }
  const message: Message = parsedMessage.data;

  const pairing = message.type === 'pair_request' && options.acceptPairToken?.(message.oneTimeToken) === true;
  const linking = message.type === 'link_grant' && options.acceptLinkSession?.(message.sessionId) === true;
  if (!known && !pairing && !linking) {
    throw new DropError('E_UNKNOWN_PEER', 'sender is not a paired peer');
  }
  // A link needs no place: acceptLinkSession claims its session once, so the same grant can never pass again.
  if (pairing && !known && !options.replay.check(envelope.id, now))
    throw new DropError('E_REPLAY', 'envelope id already seen');
  return { envelope, message };
}
