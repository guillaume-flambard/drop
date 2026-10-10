/**
 * Local network mode (T4.2, D59 to D63): nodes on the same network find each other by mDNS and exchange their
 * already encrypted and signed envelopes over a direct WebSocket, with no server at all.
 *
 * A session starts with a challenge signed both ways with the announced Ed25519 key (D60); nothing passes before
 * both proofs. Outbound sessions only go to a paired peer or the inviter being joined; inbound sessions only come
 * from a paired peer, a pairing in progress, or anyone while an invite is live. An announced address is only a hint:
 * the handshake decides who is on the other end.
 *
 * The session itself is not a secure channel: someone on the network can relay or cut it. So an envelope only counts
 * as delivered once the recipient returns an acknowledgement signed with its own key (D63); without one, the node
 * falls back to the relay, and the engine's replay check drops a late duplicate.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import WebSocket, { WebSocketServer } from 'ws';
import { z } from 'zod';
import { signDetached, verifyDetached, type Envelope, type Identity } from '@drop/protocol';
import { knockAnswerMac, knockMac, type LanAnnouncement } from './lan-tags.ts';

const DOMAIN = 'drop-lan-v1';
const ACK_DOMAIN = 'drop-lan-ack-v1';
const HANDSHAKE_MS = 5_000;
const CONNECT_MS = 3_000;
const ACK_MS = 5_000;
const PING_MS = 15_000;
/** After a failed dial, the relay is used for that peer without trying the local network again for a while. */
const RETRY_MS = 30_000;
/** Same order of magnitude as the relay's frame bound: an envelope never needs more. */
const MAX_FRAME_BYTES = 512 * 1024;
const MAX_SOCKETS = 64;
const MAX_SESSIONS = 64;
const MAX_EARLY_FRAMES = 16;
const MAX_FRAMES_PER_SECOND = 100;
/** After a refusal: 30 s, 1 min, 2 min, then every 5 min (T4.2c). */
const RETRY_DELAYS_MS = [30_000, 60_000, 120_000, 300_000];
/** How long the mode must hold before the delays start over. */
const CALM_MS = 10 * 60_000;
export const LAN_SERVICE_TYPE = 'drop';

const Base64Url43 = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const FrameSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('knock'), nonce: Base64Url43, mac: Base64Url43 }),
  z.object({ t: z.literal('knock_ok'), mac: Base64Url43 }),
  z.object({ t: z.literal('hello'), id: Base64Url43, nonce: Base64Url43 }),
  z.object({ t: z.literal('proof'), sig: z.string().min(1).max(200) }),
  z.object({ t: z.literal('env'), envelope: z.unknown() }),
  z.object({ t: z.literal('ack'), id: z.uuid(), sig: z.string().min(1).max(200) }),
]);
type Frame = z.infer<typeof FrameSchema>;
const EnvelopeIdSchema = z.object({ id: z.uuid() });

/**
 * Keeps the addresses a session may target: private IPv4 and IPv6 ULA, as in the private network policy. Loopback is
 * only kept when asked (tests, simulation): from the network it would point a node at its own local services.
 */
export function privateAddresses(addresses: readonly string[], options: { loopback?: boolean } = {}): string[] {
  return addresses.filter((address) => {
    const family = isIP(address);
    if (family === 4) {
      const [a, b] = address.split('.').map(Number);
      if (a === 127) return options.loopback === true;
      return a === 10 || (a === 172 && b !== undefined && b >= 16 && b <= 31) || (a === 192 && b === 168);
    }
    if (family !== 6) return false;
    if (address === '::1') return options.loopback === true;
    return /^f[cd][0-9a-f]{2}:/i.test(address);
  });
}

export interface LanPeer {
  addresses: string[];
  port: number;
}

/**
 * Where nodes announce themselves and are found (T4.2c): an announcement carries only rotating tags, so finding a
 * peer means asking which announcement it would make. mDNS in production (lan-mdns.ts), in memory in tests.
 */
export interface LanDiscovery {
  /** `onError` reports later multicast failures, which is how a refused macOS permission shows up. */
  start(self: { port: number; announcement: () => LanAnnouncement }, onError?: (reason: string) => void): Promise<void>;
  /** Every announcement that matches, newest first: a stale or copied one must not hide the live one. */
  find(matches: (seen: LanAnnouncement) => boolean): LanPeer[];
  stop(): Promise<void>;
}

interface BoardEntry {
  announcement: () => LanAnnouncement;
  peer: LanPeer;
}

/** A shared in-memory announcement board, for tests and the simulation bench. */
export function memoryDiscovery() {
  const board = new Map<string, BoardEntry>();
  const find = (except: string | undefined, matches: (seen: LanAnnouncement) => boolean) =>
    [...board]
      .filter(([key, entry]) => key !== except && matches(entry.announcement()))
      .map(([, entry]) => entry.peer)
      .reverse();
  return {
    /** Puts an announcement on the board by hand, as anyone on the network could. */
    announce: (key: string, announcement: LanAnnouncement, addresses: string[], port: number) => {
      board.set(key, {
        announcement: () => announcement,
        peer: { addresses: privateAddresses(addresses, { loopback: true }), port },
      });
    },
    /** What everyone on the network sees right now. */
    seen: (): LanAnnouncement[] => [...board.values()].map((entry) => entry.announcement()),
    find: (matches: (seen: LanAnnouncement) => boolean) => find(undefined, matches),
    for: (key: string): LanDiscovery => ({
      start: (self) => {
        board.set(key, { announcement: self.announcement, peer: { addresses: ['127.0.0.1'], port: self.port } });
        return Promise.resolve();
      },
      find: (matches) => find(key, matches),
      stop: () => {
        board.delete(key);
        return Promise.resolve();
      },
    }),
  };
}

export type LanState = 'off' | 'starting' | 'on' | 'denied';

export interface LanOptions {
  identity: Identity;
  discovery: LanDiscovery;
  /** D60: may this node open a direct session toward that peer? */
  canReach: (nodeId: string) => boolean;
  /** D60: may that key open a session here? A paired peer, a pairing in progress, or anyone while an invite is live. */
  canAccept: (nodeId: string) => boolean;
  onEnvelope: (envelope: unknown) => void;
  /** What this node announces now: rotating tags only (T4.2c). */
  announcement: () => LanAnnouncement;
  /** Whether an announcement seen on the network is that peer's, from its key or from the invite being used. */
  recognizes: (nodeId: string, seen: LanAnnouncement) => boolean;
  /** Secrets a dialer may knock with to reach this node: its discovery key and live invite tokens (T4.2c). */
  knockSecrets: () => string[];
  /** The secret this node knocks with to reach that peer: its shared key, or the token of the invite being used. */
  secretFor: (nodeId: string) => string | undefined;
  /** Delays between retries after a refusal; tests shorten them. */
  retryDelaysMs?: number[];
  enabled?: boolean;
  /** Listening address; every interface by default, loopback in tests. */
  host?: string;
  port?: number;
  /** Lets discovery hand out loopback addresses: tests and the simulation bench only. */
  allowLoopback?: boolean;
  /** How long to wait for a signed acknowledgement; tests shorten it. */
  ackMs?: number;
  log?: (entry: Record<string, unknown>) => void;
}

interface Session {
  ws: WebSocket;
  peerId?: string;
  alive: boolean;
  acks: Map<string, (sig: string) => void>;
}

export class LanService {
  private server: WebSocketServer | undefined;
  private status: LanState = 'off';
  private stopped = false;
  private pinger: ReturnType<typeof setInterval> | undefined;
  private readonly sessions = new Map<string, Session>();
  private readonly dialing = new Map<string, Promise<Session | undefined>>();
  private readonly retryAfter = new Map<string, number>();
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private attempts = 0;
  private calm: ReturnType<typeof setTimeout> | undefined;

  private readonly options: LanOptions;

  constructor(options: LanOptions) {
    this.options = options;
  }

  state(): LanState {
    return this.status;
  }

  /** Starts listening and announcing; returns the port, or 0 when the local mode is off or refused. Never throws. */
  async start(): Promise<number> {
    if (this.options.enabled === false) {
      this.status = 'off';
      return 0;
    }
    this.stopped = false;
    this.status = 'starting';
    const server = new WebSocketServer({
      host: this.options.host ?? '0.0.0.0',
      port: this.options.port ?? 0,
      maxPayload: MAX_FRAME_BYTES,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
      });
    } catch (error) {
      server.close();
      this.denied(error instanceof Error ? error.message : 'unknown');
      return 0;
    }
    if (this.halted()) {
      server.close();
      return 0;
    }
    this.server = server;
    server.on('error', (error) => {
      this.options.log?.({ event: 'lan_server_error', code: 'E_LAN_SOCKET', reason: error.message });
    });
    server.on('connection', (ws) => {
      if (server.clients.size > MAX_SOCKETS) {
        this.options.log?.({ event: 'lan_session_refused', code: 'E_LAN_BUSY' });
        ws.terminate();
        return;
      }
      this.handshake(ws, undefined).catch(() => undefined);
    });
    this.pinger = setInterval(() => {
      this.ping();
    }, PING_MS);
    const address = server.address();
    const port = address !== null && typeof address === 'object' ? address.port : 0;
    await this.announce(port);
    return port;
  }

  private port(): number {
    const address = this.server?.address();
    return typeof address === 'object' && address !== null ? address.port : 0;
  }

  /** Starts the discovery; a refusal, now or later, puts the mode in `denied` and schedules a retry. */
  private async announce(port: number): Promise<void> {
    const outcome = { refused: false };
    const refuse = (reason: string) => {
      if (outcome.refused) return;
      outcome.refused = true;
      this.denied(reason);
    };
    try {
      await this.options.discovery.start({ port, announcement: this.options.announcement }, refuse);
      if (this.stopped) {
        // Stopped while starting: nothing this attempt opened may outlive stop().
        await this.options.discovery.stop().catch(() => undefined);
        return;
      }
      if (outcome.refused) return;
      const restored = this.attempts > 0;
      this.status = 'on';
      if (restored) this.options.log?.({ event: 'lan_restored' });
      // Growing delays start over only once the mode has held for a while: a refusal right after each start must
      // not turn into a restart every 30 s forever.
      clearTimeout(this.calm);
      this.calm = setTimeout(
        () => {
          this.attempts = 0;
        },
        this.options.retryDelaysMs ? (this.options.retryDelaysMs.at(-1) ?? 0) * 2 : CALM_MS,
      );
    } catch (error) {
      refuse(error instanceof Error ? error.message : 'unknown');
    }
  }

  // macOS refused local network access, multicast is unavailable or the port is taken: the relay remains the way,
  // and the local mode tries again, at growing intervals, since the refusal may only be passing (T4.2c).
  private denied(reason: string): void {
    this.status = 'denied';
    clearTimeout(this.calm);
    this.options.log?.({ event: 'lan_denied', code: 'E_LAN_DENIED', reason });
    if (this.stopped || this.retryTimer) return;
    const delays = this.options.retryDelaysMs ?? RETRY_DELAYS_MS;
    const delay = delays[Math.min(this.attempts, delays.length - 1)] ?? 300_000;
    this.attempts += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.recover().catch(() => undefined);
    }, delay);
  }

  private async recover(): Promise<void> {
    if (this.stopped) return;
    if (!this.server) {
      await this.start();
      return;
    }
    await this.options.discovery.stop().catch(() => undefined);
    if (this.halted()) return;
    await this.announce(this.port());
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearInterval(this.pinger);
    clearTimeout(this.retryTimer);
    clearTimeout(this.calm);
    this.retryTimer = undefined;
    for (const session of this.sessions.values()) session.ws.terminate();
    this.sessions.clear();
    this.retryAfter.clear();
    await this.options.discovery.stop().catch(() => undefined);
    const server = this.server;
    this.server = undefined;
    if (server) {
      for (const client of server.clients) client.terminate();
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    }
    this.status = 'off';
  }

  /**
   * Delivers over an authenticated local session, opening one if the peer is reachable. `delivered` only once the
   * recipient has signed the acknowledgement; anything else is `unreachable`, and the caller uses the relay. Never throws.
   */
  async send(envelope: Envelope): Promise<'delivered' | 'unreachable'> {
    if (this.status !== 'on') return 'unreachable';
    const target = envelope.to;
    let session = this.sessions.get(target);
    if (!session) {
      if (!this.options.canReach(target) || (this.retryAfter.get(target) ?? 0) > Date.now()) return 'unreachable';
      session = await this.dial(target);
    }
    if (session?.ws.readyState !== WebSocket.OPEN) return 'unreachable';
    const open = session;
    const me = this.options.identity.nodeId;
    const acked = new Promise<string | undefined>((resolve) => {
      const timer = setTimeout(() => {
        open.acks.delete(envelope.id);
        resolve(undefined);
      }, this.options.ackMs ?? ACK_MS);
      open.acks.set(envelope.id, (sig) => {
        clearTimeout(timer);
        open.acks.delete(envelope.id);
        resolve(sig);
      });
    });
    open.ws.send(JSON.stringify({ t: 'env', envelope }));
    const sig = await acked;
    const valid =
      sig !== undefined &&
      (await verifyDetached(target as never, `${ACK_DOMAIN}|${envelope.id}|${target}|${me}`, sig).catch(() => false));
    if (valid) return 'delivered';
    // No proof of receipt: this session cannot be trusted to carry anything else.
    this.options.log?.({ event: 'lan_unacknowledged', code: 'E_LAN_ACK', peer: target });
    open.ws.terminate();
    return 'unreachable';
  }

  /** Read through a method: `stop()` may flip it while a dial awaits. */
  private halted(): boolean {
    return this.stopped;
  }

  private ping(): void {
    for (const session of this.sessions.values()) {
      if (!session.alive) {
        session.ws.terminate();
        continue;
      }
      session.alive = false;
      session.ws.ping();
    }
  }

  private dial(target: string): Promise<Session | undefined> {
    const pending = this.dialing.get(target);
    if (pending) return pending;
    const attempt = this.connect(target).finally(() => {
      this.dialing.delete(target);
    });
    this.dialing.set(target, attempt);
    return attempt;
  }

  private async connect(target: string): Promise<Session | undefined> {
    // Without a secret to knock with, this node could only reveal itself: it does not dial (T4.2c review).
    const secret = this.options.secretFor(target);
    if (secret === undefined) return undefined;
    const loopback = this.options.allowLoopback === true;
    const candidates = this.options.discovery
      .find((seen) => this.options.recognizes(target, seen))
      .flatMap((peer) =>
        privateAddresses(peer.addresses, { loopback }).map((address) => ({ address, port: peer.port })),
      );
    const addresses = candidates.map((candidate) => candidate.address);
    for (const { address, port } of candidates) {
      if (this.halted()) return undefined;
      const host = isIP(address) === 6 ? `[${address}]` : address;
      const ws = new WebSocket(`ws://${host}:${String(port)}/`, {
        maxPayload: MAX_FRAME_BYTES,
        handshakeTimeout: CONNECT_MS,
      });
      // Listen before the socket opens: the peer's hello may arrive in the same packet as the upgrade response.
      const proven = this.handshake(ws, target, secret);
      proven.catch(() => undefined);
      try {
        await new Promise<void>((resolve, reject) => {
          ws.once('open', () => {
            resolve();
          });
          ws.once('error', reject);
        });
        if ((await proven) === target && !this.halted()) {
          this.retryAfter.delete(target);
          return this.sessions.get(target);
        }
        ws.terminate();
      } catch {
        ws.terminate();
        this.options.log?.({ event: 'lan_connect_failed', code: 'E_LAN_UNREACHABLE', peer: target });
      }
    }
    if (addresses.length > 0) this.retryAfter.set(target, Date.now() + RETRY_MS);
    return undefined;
  }

  /**
   * Mutual proof of keys. Resolves with the proven peer id once the peer's proof is verified and ours is sent; any
   * deviation closes the socket. Frames that arrive while the peer's proof is being checked wait for the outcome.
   */
  private handshake(ws: WebSocket, expected: string | undefined, secret?: string): Promise<string> {
    const me = this.options.identity.nodeId;
    const myNonce = randomBytes(32).toString('base64url');
    const knockNonce = randomBytes(32).toString('base64url');
    const knock = { done: false };
    const session: Session = { ws, alive: true, acks: new Map() };
    const state = { proven: false, failed: false, verifying: false, sentProof: false, verified: false, frames: 0 };
    const early: Frame[] = [];
    const rate = { started: Date.now() };
    return new Promise<string>((resolve, reject) => {
      const fail = (code: string) => {
        if (state.failed) return;
        state.failed = true;
        this.options.log?.({ event: 'lan_session_refused', code, ...(session.peerId ? { peer: session.peerId } : {}) });
        // Before the knock, not even a close reason: a connection without the secret learns nothing.
        if (knock.done) ws.close(4401, code);
        ws.terminate();
        reject(new Error(code));
      };
      const timer = setTimeout(() => {
        fail('E_LAN_HANDSHAKE');
      }, HANDSHAKE_MS);
      const established = () => {
        const peerId = session.peerId;
        if (!peerId || state.proven || !state.verified || !state.sentProof) return;
        if (this.stopped) {
          fail('E_LAN_CLOSED');
          return;
        }
        const previous = this.sessions.get(peerId);
        if (!previous && this.sessions.size >= MAX_SESSIONS) {
          fail('E_LAN_BUSY');
          return;
        }
        // Both sides dialed at once: keep the session opened by the smaller id on both ends, not one each.
        const dialer = expected === undefined ? peerId : me;
        if (previous?.ws.readyState === WebSocket.OPEN && dialer !== (me < peerId ? me : peerId)) {
          fail('E_LAN_DUPLICATE');
          return;
        }
        state.proven = true;
        clearTimeout(timer);
        previous?.ws.close(4000, 'replaced');
        this.sessions.set(peerId, session);
        ws.once('close', () => {
          if (this.sessions.get(peerId) === session) this.sessions.delete(peerId);
        });
        resolve(peerId);
        for (const frame of early.splice(0)) carry(frame);
      };
      // After both proofs: envelopes go to the engine, which verifies them, and acknowledgements go to the sender.
      const carry = (frame: Frame) => {
        const peerId = session.peerId;
        if (!peerId) return;
        if (frame.t === 'ack') {
          session.acks.get(frame.id)?.(frame.sig);
          return;
        }
        if (frame.t !== 'env') {
          fail('E_LAN_HANDSHAKE');
          return;
        }
        this.options.onEnvelope(frame.envelope);
        const parsed = EnvelopeIdSchema.safeParse(frame.envelope);
        if (!parsed.success) return;
        const id = parsed.data.id;
        signDetached(this.options.identity, `${ACK_DOMAIN}|${id}|${me}|${peerId}`).then(
          (sig) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'ack', id, sig }));
          },
          () => {
            fail('E_LAN_ACK');
          },
        );
      };
      ws.on('error', (error) => {
        // Oversized, malformed or unmasked frames end up here: close this socket, never the node.
        this.options.log?.({ event: 'lan_socket_error', code: 'E_LAN_SOCKET', reason: error.message });
        ws.terminate();
      });
      ws.on('pong', () => {
        session.alive = true;
      });
      ws.on('message', (raw: Buffer) => {
        const now = Date.now();
        if (now - rate.started >= 1000) {
          rate.started = now;
          state.frames = 0;
        }
        if (++state.frames > MAX_FRAMES_PER_SECOND) {
          fail('E_LAN_RATE');
          return;
        }
        let frame: Frame;
        try {
          frame = FrameSchema.parse(JSON.parse(raw.toString('utf8')));
        } catch {
          fail('E_SCHEMA');
          return;
        }
        if (state.proven) {
          carry(frame);
          return;
        }
        if (!knock.done) {
          // Responder: the first frame must prove the dialer holds this node's key or a live invite token.
          if (expected === undefined && frame.t === 'knock') {
            const matched = this.options
              .knockSecrets()
              .find((candidate) => sameMac(knockMac(candidate, frame.nonce), frame.mac));
            if (matched === undefined) {
              fail('E_LAN_KNOCK');
              return;
            }
            knock.done = true;
            ws.send(JSON.stringify({ t: 'knock_ok', mac: knockAnswerMac(matched, frame.nonce) }));
            hello();
            return;
          }
          // Dialer: the answer proves the responder holds the same secret; only then does this node say who it is.
          if (expected !== undefined && frame.t === 'knock_ok' && secret !== undefined) {
            if (!sameMac(knockAnswerMac(secret, knockNonce), frame.mac)) {
              fail('E_LAN_KNOCK');
              return;
            }
            knock.done = true;
            hello();
            return;
          }
          fail('E_LAN_KNOCK');
          return;
        }
        if (frame.t === 'knock' || frame.t === 'knock_ok') {
          fail('E_LAN_HANDSHAKE');
          return;
        }
        if (frame.t === 'hello') {
          if (session.peerId || frame.id === me || (expected && frame.id !== expected)) {
            fail('E_LAN_IDENTITY');
            return;
          }
          if (!expected && !this.options.canAccept(frame.id)) {
            session.peerId = frame.id;
            fail('E_LAN_UNKNOWN');
            return;
          }
          session.peerId = frame.id;
          signDetached(this.options.identity, `${DOMAIN}|${frame.nonce}|${me}|${frame.id}`).then(
            (sig) => {
              if (ws.readyState !== WebSocket.OPEN) return;
              ws.send(JSON.stringify({ t: 'proof', sig }));
              state.sentProof = true;
              established();
            },
            () => {
              fail('E_LAN_HANDSHAKE');
            },
          );
          return;
        }
        if (frame.t === 'proof') {
          const peerId = session.peerId;
          if (!peerId || state.verifying) {
            fail('E_LAN_HANDSHAKE');
            return;
          }
          state.verifying = true;
          verifyDetached(peerId as never, `${DOMAIN}|${myNonce}|${peerId}|${me}`, frame.sig).then(
            (valid) => {
              if (!valid) {
                fail('E_LAN_IDENTITY');
                return;
              }
              state.verified = true;
              established();
            },
            () => {
              fail('E_LAN_IDENTITY');
            },
          );
          return;
        }
        // Sent right after the peer's proof, before we finished checking it: held until the outcome, never before.
        if (state.verifying && early.length < MAX_EARLY_FRAMES) {
          early.push(frame);
          return;
        }
        fail('E_LAN_HANDSHAKE');
      });
      ws.once('close', () => {
        clearTimeout(timer);
        for (const resolveAck of session.acks.values()) resolveAck('');
        if (!state.proven) reject(new Error('E_LAN_CLOSED'));
      });
      function hello(): void {
        ws.send(JSON.stringify({ t: 'hello', id: me, nonce: myNonce }));
      }
      // Only the dialer speaks first, and only to knock; the responder stays silent until the knock is right.
      if (expected !== undefined && secret !== undefined) {
        const sendKnock = () => {
          ws.send(JSON.stringify({ t: 'knock', nonce: knockNonce, mac: knockMac(secret, knockNonce) }));
        };
        if (ws.readyState === WebSocket.OPEN) sendKnock();
        else ws.once('open', sendKnock);
      }
    });
  }
}

function sameMac(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
