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
  /** How long a send waits for the relay's acknowledgement or error before the connection is given up (T3.1f). */
  ackTimeoutMs?: number;
  /** The client pings this often; a connection that carried no frame for a whole interval is given up (T3.1f). */
  pingIntervalMs?: number;
  /** How long a connection attempt may take to reach `ready`: TCP, TLS, HTTP upgrade and challenge (T3.1f). */
  connectTimeoutMs?: number;
  /** Stable codes only, never a frame or an envelope. */
  log?: (entry: RelayClientLogEntry) => void;
  minBackoffMs?: number;
  maxBackoffMs?: number;
}

export type SendOutcome = 'delivered' | 'queued' | 'E_SCHEMA' | 'E_TOO_LARGE' | 'E_RATE' | 'E_QUEUE_FULL' | 'offline';

/** Why the client gave up a connection: no acknowledgement, no frame for a heartbeat interval, or no `ready`. */
export interface RelayClientLogEntry {
  event: 'relay_timeout';
  code: 'E_RELAY_TIMEOUT';
  reason: 'ack' | 'heartbeat' | 'connect';
}

/** Same order as the local network's ping (15 s): a dead or half-open connection is found within 30 s. */
const PING_INTERVAL_MS = 15_000;
/** Between the local network's 5 s (one hop at home) and iroh's 40 s (end to end through a peer). */
const ACK_TIMEOUT_MS = 15_000;
/** The relay itself drops an unauthenticated socket after 10 s; this leaves the network some margin. */
const CONNECT_TIMEOUT_MS = 15_000;

/** Outbound-only connection to the relay: the node never listens on a port (AGENTS.md). Reconnects with backoff. */
export class RelayClient {
  private options: RelayClientOptions;
  private socket: WebSocket | undefined;
  private ready = false;
  private closed = false;
  private backoffMs: number;
  private readonly pending = new Map<string, { resolve: (outcome: SendOutcome) => void; timer?: NodeJS.Timeout }>();
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
   * Resolves with the relay's answer, or `offline` when the connection goes away first: closed, or given up because
   * the answer did not come within `ackTimeoutMs`. The sender queues an `offline` envelope again.
   */
  send(envelope: Envelope): Promise<SendOutcome> {
    const socket = this.socket;
    if (!this.ready || !socket) return Promise.resolve('offline');
    return new Promise((resolve) => {
      // The same envelope sent again while the first copy waits: the first one is released, never left pending.
      this.settle(envelope.id, 'offline');
      const entry: { resolve: (outcome: SendOutcome) => void; timer?: NodeJS.Timeout } = { resolve };
      this.pending.set(envelope.id, entry);
      // The delay counts from the moment the frame has left this process, so a slow uplink is not mistaken for a dead
      // relay. A frame that never leaves (full buffers on a dead link) is the heartbeat's to catch.
      socket.send(JSON.stringify({ type: 'envelope', envelope }), (error) => {
        if (error || this.pending.get(envelope.id) !== entry) return;
        entry.timer = setTimeout(() => {
          // No answer in time: this connection cannot be trusted with anything else (as on the local network).
          if (this.pending.get(envelope.id) === entry && this.socket === socket) this.abandon(socket, 'ack');
          else if (this.pending.get(envelope.id) === entry) this.settle(envelope.id, 'offline');
        }, this.options.ackTimeoutMs ?? ACK_TIMEOUT_MS);
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
   */
  switchUrl(url: string): void {
    if (url === this.options.url) return;
    this.options = { ...this.options, url };
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
    this.connectDeadline = setTimeout(() => {
      if (this.socket === socket && !this.ready) this.abandon(socket, 'connect');
    }, this.options.connectTimeoutMs ?? CONNECT_TIMEOUT_MS);
    socket.on('open', () => {
      if (this.socket !== socket) return;
      this.alive = true;
      this.heartbeat = setInterval(() => {
        this.beat(socket);
      }, this.options.pingIntervalMs ?? PING_INTERVAL_MS);
    });
    // Any frame proves the connection still carries something: a pong, the relay's own ping, a message.
    const live = () => {
      if (this.socket === socket) this.alive = true;
    };
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

  /** One heartbeat tick: give the socket up if nothing came in since the previous tick, otherwise ping it. */
  private beat(socket: WebSocket): void {
    if (this.socket !== socket) return;
    if (!this.alive) {
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

  private releasePending(): void {
    for (const { resolve, timer } of this.pending.values()) {
      clearTimeout(timer);
      resolve('offline');
    }
    this.pending.clear();
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
        if (this.pending.has(frame.id)) this.proven();
        this.settle(frame.id, frame.status);
        return;
      case 'error':
        if (frame.id && this.pending.has(frame.id)) this.proven();
        if (frame.id) this.settle(frame.id, frame.error);
        this.options.onError?.(frame);
        return;
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
