import type { Socket } from 'node:net';
import WebSocket from 'ws';
import { signDetached, type Envelope, type Identity } from '@drop/protocol';
import { CLOSE_UNAUTHORIZED, parseFrame, ServerFrameSchema, type ServerFrame } from './wire.ts';

export interface RelayClientOptions {
  identity: Identity;
  url: string;
  onEnvelope: (envelope: Envelope) => void;
  onStatus?: (status: 'connected' | 'disconnected' | 'unauthorized') => void;
  onError?: (frame: Extract<ServerFrame, { type: 'error' }>) => void;
  /** An admission ticket to present with auth (T2.1), read at each connection; the relay ignores it once admitted. */
  admission?: () => unknown;
  /** The fingerprint of the organization policy this node runs under, presented with auth (T4.10, D81). */
  policy?: () => string | undefined;
  /** Extra trusted certificate authority for a relay with its own certificate (T4.10). */
  ca?: Buffer;
  /**
   * How long a send waits for the relay's acknowledgement or error before the connection is given up (T3.1f), on top of
   * the time its bytes in flight take at `floorBytesPerSecond` (T4.39).
   */
  ackTimeoutMs?: number;
  /** The slowest uplink a send is expected to cross: 4 000 bytes per second, i.e. 32 kbit/s (T4.39). */
  floorBytesPerSecond?: number;
  /** The client pings this often; a connection that carried no frame for a whole interval is given up (T3.1f). */
  pingIntervalMs?: number;
  /** How long a connection attempt may take to reach `ready`: TCP, TLS, HTTP upgrade and challenge (T3.1f). */
  connectTimeoutMs?: number;
  /** Stable codes only, never a frame or an envelope. */
  log?: (entry: RelayClientLogEntry) => void;
  minBackoffMs?: number;
  maxBackoffMs?: number;
}

/** Same host name, whatever the port or path; an unreadable URL is never the same host. */
function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).hostname === new URL(b).hostname;
  } catch {
    return false;
  }
}

/**
 * - `offline`: the frame never left this node (no ready connection, or its write failed);
 * - `unconfirmed`: the frame was handed to a connection that went away before the relay answered, so the relay may have
 *   received and routed it (T4.39). Sending the same envelope again is safe: the recipient's anti-replay drops a copy;
 * - `E_RELAY_TIMEOUT`: this envelope already caused three acknowledgement give-ups; it is not sent again (T4.39).
 */
export type SendOutcome =
  | 'delivered'
  | 'queued'
  | 'E_SCHEMA'
  | 'E_TOO_LARGE'
  | 'E_RATE'
  | 'E_QUEUE_FULL'
  | 'offline'
  | 'unconfirmed'
  | 'E_RELAY_TIMEOUT';

/**
 * Why the client gave up a connection: no acknowledgement, nothing received for a heartbeat interval, or no `ready`; or
 * why it refused to send an envelope again (`ack_retries`).
 */
export interface RelayClientLogEntry {
  event: 'relay_timeout';
  code: 'E_RELAY_TIMEOUT';
  reason: 'ack' | 'heartbeat' | 'connect' | 'ack_retries';
}

/** Same order as the local network's ping (15 s): a dead or half-open connection is found within 30 s. */
const PING_INTERVAL_MS = 15_000;
/** Between the local network's 5 s (one hop at home) and iroh's 40 s (end to end through a peer). */
const ACK_TIMEOUT_MS = 15_000;
/** The relay itself drops an unauthenticated socket after 10 s; this leaves the network some margin. */
const CONNECT_TIMEOUT_MS = 15_000;
/** 32 kbit/s, a degraded mobile link: a 256 KiB envelope gets 66 s on top of the base delay (T4.39). */
const FLOOR_BYTES_PER_SECOND = 4_000;
/** The delay doubles for each give-up the same envelope already caused, up to four times the base (T4.39). */
const MAX_ACK_DOUBLINGS = 2;
/** After this many give-ups caused by the same envelope, it is not sent again (T4.39). */
const MAX_ACK_GIVE_UPS = 3;
/** Envelopes whose give-ups are remembered; the oldest is forgotten first. */
const MAX_REMEMBERED_GIVE_UPS = 256;

interface PendingSend {
  resolve: (outcome: SendOutcome) => void;
  timer?: NodeJS.Timeout;
  /** The write failed: the frame never left whole, so the relay cannot have it. */
  failed?: boolean;
}

/** One frame sent on a connection and not answered yet, in the order sent (T4.39). */
interface InFlight {
  id: string;
  bytes: number;
}

/** Outbound-only connection to the relay: the node never listens on a port (AGENTS.md). Reconnects with backoff. */
export class RelayClient {
  private options: RelayClientOptions;
  private socket: WebSocket | undefined;
  private ready = false;
  private closed = false;
  private backoffMs: number;
  private readonly pending = new Map<string, PendingSend>();
  /**
   * Frames of the current connection still waiting for their answer, in the order sent. The relay answers each one once,
   * in that order (spec relay, « Réponses du relais dans l'ordre »): an error without id belongs to the first one, as
   * long as every earlier answer came in that order (`ordered`).
   */
  private inFlight: InFlight[] = [];
  private ordered = true;
  /** Acknowledgement give-ups each envelope id caused, bounded; forgotten once it gets an answer (T4.39). */
  private readonly giveUps = new Map<string, number>();
  private readyWaiters: (() => void)[] = [];
  private reconnectTimer: NodeJS.Timeout | undefined;
  /** Liveness of the current socket: its heartbeat, its connection deadline, and whether a frame came in. */
  private heartbeat: NodeJS.Timeout | undefined;
  private connectDeadline: NodeJS.Timeout | undefined;
  private alive = false;
  /**
   * The last connection was given up for silence or a missing acknowledgement. Until a new one proves itself, `ready`
   * no longer resets the backoff: a relay that accepts frames but never answers is not redialed every second.
   */
  private gaveUp = false;

  constructor(options: RelayClientOptions) {
    this.options = options;
    this.backoffMs = options.minBackoffMs ?? 1_000;
  }

  get connected(): boolean {
    return this.ready;
  }

  start(): void {
    this.closed = false;
    this.open();
  }

  /** Resolves once authenticated, or immediately if already connected. */
  waitReady(): Promise<void> {
    if (this.ready) return Promise.resolve();
    return new Promise((resolve) => this.readyWaiters.push(resolve));
  }

  /**
   * Resolves with the relay's answer; `offline` when no connection is ready; `unconfirmed` when the connection goes away
   * before the answer: closed, or given up because the answer did not come in time. The sender queues an `offline` or
   * `unconfirmed` envelope again (T4.39).
   */
  send(envelope: Envelope): Promise<SendOutcome> {
    const socket = this.socket;
    if (!this.ready || !socket) return Promise.resolve('offline');
    const id = envelope.id;
    const gaveUp = this.giveUps.get(id) ?? 0;
    if (gaveUp >= MAX_ACK_GIVE_UPS) {
      // This envelope already cost three connections: it does not cross this link (T4.39).
      this.options.log?.({ event: 'relay_timeout', code: 'E_RELAY_TIMEOUT', reason: 'ack_retries' });
      return Promise.resolve('E_RELAY_TIMEOUT');
    }
    const frame = JSON.stringify({ type: 'envelope', envelope });
    return new Promise((resolve) => {
      // The same envelope sent again while the first copy waits: the first one is released, never left pending.
      this.settle(id, 'unconfirmed');
      const entry: PendingSend = { resolve };
      this.pending.set(id, entry);
      this.inFlight.push({ id, bytes: Buffer.byteLength(frame) });
      // Counted from the call, over every byte still unanswered on this connection, this frame included: the relay
      // reads frames in order, so this one waits for all of them. The write callback is no proof the bytes are on the
      // wire (the system's buffer takes them at once), so it does not start the delay (T4.39).
      const bytes = this.inFlight.reduce((sum, sent) => sum + sent.bytes, 0);
      const floor = this.options.floorBytesPerSecond ?? FLOOR_BYTES_PER_SECOND;
      const base = (this.options.ackTimeoutMs ?? ACK_TIMEOUT_MS) + Math.ceil((bytes * 1_000) / floor);
      entry.timer = setTimeout(
        () => {
          if (this.pending.get(id) !== entry) return;
          if (this.socket !== socket) {
            this.settle(id, 'unconfirmed');
            return;
          }
          // No answer in time: this connection cannot be trusted with anything else (as on the local network).
          this.rememberGiveUp(id);
          this.abandon(socket, 'ack');
        },
        base * 2 ** Math.min(gaveUp, MAX_ACK_DOUBLINGS),
      );
      socket.send(frame, (error) => {
        // Not written whole: the relay cannot have it. Its connection is closing and releases it as offline.
        if (error && this.pending.get(id) === entry) entry.failed = true;
      });
    });
  }

  /** Connects again at once when not connected, e.g. right after an admission ticket arrived. */
  retryNow(): void {
    if (this.ready || this.closed) return;
    clearTimeout(this.reconnectTimer);
    this.backoffMs = this.options.minBackoffMs ?? 1_000;
    const previous = this.socket;
    this.socket = undefined;
    previous?.terminate();
    this.open();
  }

  /** The relay this client connects to. */
  get url(): string {
    return this.options.url;
  }

  /**
   * Moves to another relay (T4.23): a node that joins its first team adopts the team's relay without a restart.
   * Messages awaiting an acknowledgement from the old relay are reported offline, so the sender queues them again.
   * An extra certificate authority replaces the default ones (Node.js `tls`, option `ca`): it was given for the old
   * relay's host and never vouches for another host, which gets the default authorities back (T4.33).
   */
  switchUrl(url: string): void {
    if (url === this.options.url) return;
    const { ca, ...rest } = this.options;
    this.options = sameHost(this.options.url, url) && ca ? { ...rest, url, ca } : { ...rest, url };
    clearTimeout(this.reconnectTimer);
    const previous = this.socket;
    this.socket = undefined;
    const wasReady = this.ready;
    this.ready = false;
    this.stopLiveness();
    this.releasePending();
    previous?.terminate();
    if (wasReady) this.options.onStatus?.('disconnected');
    this.backoffMs = this.options.minBackoffMs ?? 1_000;
    if (!this.closed) this.open();
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.reconnectTimer);
    this.stopLiveness();
    this.socket?.close();
    this.socket = undefined;
    this.ready = false;
    this.releasePending();
  }

  private open(): void {
    this.stopLiveness();
    const socket = new WebSocket(this.options.url, this.options.ca ? { ca: this.options.ca } : {});
    this.socket = socket;
    this.inFlight = [];
    this.ordered = true;
    // The network socket under the WebSocket (Node.js `message.socket`): any byte read on it proves the link lives,
    // even in the middle of a frame that takes longer than a heartbeat interval to arrive (T4.39).
    let network: Socket | undefined;
    socket.on('upgrade', (response) => {
      network = response.socket;
    });
    this.connectDeadline = setTimeout(() => {
      if (this.socket === socket && !this.ready) this.abandon(socket, 'connect');
    }, this.options.connectTimeoutMs ?? CONNECT_TIMEOUT_MS);
    // Any frame proves the connection still carries something: a pong, the relay's own ping, a message.
    const live = () => {
      if (this.socket === socket) this.alive = true;
    };
    socket.on('open', () => {
      if (this.socket !== socket) return;
      this.alive = true;
      // Attached after ws's own listeners (setSocket emits 'open' last), so it never changes how ws reads. A socket ws
      // paused emits no 'data': one nobody reads any more is still found (the CLOSE_WAIT of T4.6a).
      network?.on('data', live);
      this.heartbeat = setInterval(() => {
        this.beat(socket);
      }, this.options.pingIntervalMs ?? PING_INTERVAL_MS);
    });
    socket.on('pong', live);
    socket.on('ping', live);
    socket.on('message', (data) => {
      live();
      const frame = parseFrame(ServerFrameSchema, data);
      if (frame) this.handle(socket, frame);
    });
    socket.on('close', (code) => {
      if (this.socket !== socket) return;
      this.lost(code === CLOSE_UNAUTHORIZED ? 'unauthorized' : 'disconnected');
    });
    socket.on('error', () => {
      // A failed connection also emits 'close', which schedules the reconnect.
    });
  }

  /**
   * One heartbeat tick: give the socket up if nothing came in since the previous tick, otherwise ping it. A send still
   * within its delay keeps a silent connection: on a saturated uplink the ping waits behind that send's frame, and the
   * send's own delay, which counts its bytes, bounds the wait (T4.39).
   */
  private beat(socket: WebSocket): void {
    if (this.socket !== socket) return;
    if (!this.alive && this.pending.size === 0) {
      this.abandon(socket, 'heartbeat');
      return;
    }
    this.alive = false;
    // A connection that kept answering for a whole interval with nothing left unanswered has proven itself.
    if (this.ready && this.pending.size === 0) this.proven();
    try {
      socket.ping();
    } catch {
      // Not open any more: its 'close' or the next tick ends it.
    }
  }

  /**
   * Gives a connection up without waiting for its 'close': ws emits it only once its receiver has drained, which a
   * socket nobody reads any more never does (the CLOSE_WAIT of T4.6a). Detach first, so that a later 'close' is
   * ignored, then destroy the socket.
   */
  private abandon(socket: WebSocket, reason: RelayClientLogEntry['reason']): void {
    if (this.socket !== socket) return;
    this.socket = undefined;
    this.gaveUp = true;
    this.options.log?.({ event: 'relay_timeout', code: 'E_RELAY_TIMEOUT', reason });
    this.lost('disconnected');
    socket.terminate();
  }

  /** The current connection is gone: release what waited on it and dial again unless closed. */
  private lost(status: 'disconnected' | 'unauthorized'): void {
    this.stopLiveness();
    this.ready = false;
    this.releasePending();
    // Scheduled before the status goes out: a callback that dials at once (switchUrl, retryNow) clears this timer
    // instead of leaving it to open a second socket later.
    if (!this.closed) this.scheduleReconnect();
    this.options.onStatus?.(status);
  }

  /** The current connection works: the next failure starts again from the shortest delay. */
  private proven(): void {
    this.gaveUp = false;
    this.backoffMs = this.options.minBackoffMs ?? 1_000;
  }

  private stopLiveness(): void {
    clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    clearTimeout(this.connectDeadline);
    this.connectDeadline = undefined;
    this.alive = false;
  }

  /** Every send left waiting: its frame went to a connection that is gone, so the relay may have it (T4.39). */
  private releasePending(): void {
    for (const { resolve, timer, failed } of this.pending.values()) {
      clearTimeout(timer);
      resolve(failed ? 'offline' : 'unconfirmed');
    }
    this.pending.clear();
    this.inFlight = [];
  }

  private rememberGiveUp(id: string): void {
    const count = (this.giveUps.get(id) ?? 0) + 1;
    this.giveUps.delete(id);
    this.giveUps.set(id, count);
    if (this.giveUps.size > MAX_REMEMBERED_GIVE_UPS) {
      const oldest = this.giveUps.keys().next().value;
      if (oldest !== undefined) this.giveUps.delete(oldest);
    }
  }

  /**
   * The relay answered one frame. With an id, it must be the oldest one in flight; otherwise the order is lost for this
   * connection. Without an id (an error only), it is attributed to the oldest one, and only while the order holds.
   * Returns the id the answer settles, if any.
   */
  private answered(id: string | undefined): string | undefined {
    if (id === undefined) {
      if (!this.ordered) return undefined;
      return this.inFlight.shift()?.id;
    }
    const index = this.inFlight.findIndex((sent) => sent.id === id);
    if (index !== 0) this.ordered = false;
    if (index >= 0) this.inFlight.splice(index, 1);
    return id;
  }

  private scheduleReconnect(): void {
    clearTimeout(this.reconnectTimer);
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, this.options.maxBackoffMs ?? 30_000);
    this.reconnectTimer = setTimeout(() => {
      this.open();
    }, delay);
  }

  private handle(socket: WebSocket, frame: ServerFrame): void {
    // ws may still hand over bytes a given-up socket had buffered. Its envelopes are kept (the relay counts them as
    // delivered), anything else would act on a connection that is gone.
    if (this.socket !== socket && frame.type !== 'envelope') return;
    switch (frame.type) {
      case 'challenge':
        signDetached(this.options.identity, frame.challenge).then(
          (sig) => {
            const admission = this.options.admission?.();
            const policy = this.options.policy?.();
            socket.send(
              JSON.stringify({
                type: 'auth',
                nodeId: this.options.identity.nodeId,
                sig,
                ...(admission === undefined ? {} : { admission }),
                ...(policy === undefined ? {} : { policy }),
              }),
            );
          },
          () => {
            socket.close();
          },
        );
        return;
      case 'ready':
        clearTimeout(this.connectDeadline);
        this.connectDeadline = undefined;
        this.ready = true;
        if (!this.gaveUp) this.proven();
        this.options.onStatus?.('connected');
        for (const resolve of this.readyWaiters) resolve();
        this.readyWaiters = [];
        return;
      case 'envelope':
        this.options.onEnvelope(frame.envelope);
        return;
      case 'ack':
        this.answered(frame.id);
        if (this.pending.has(frame.id)) this.proven();
        this.giveUps.delete(frame.id);
        this.settle(frame.id, frame.status);
        return;
      case 'error': {
        const id = this.answered(frame.id);
        if (id !== undefined && this.pending.has(id)) this.proven();
        if (id !== undefined) {
          this.giveUps.delete(id);
          this.settle(id, frame.error);
        }
        this.options.onError?.(frame);
        return;
      }
    }
  }

  private settle(id: string, outcome: SendOutcome): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    clearTimeout(entry.timer);
    entry.resolve(outcome);
  }
}
