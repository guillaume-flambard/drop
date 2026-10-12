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

export type SendOutcome = 'delivered' | 'queued' | 'E_SCHEMA' | 'E_TOO_LARGE' | 'E_RATE' | 'E_QUEUE_FULL' | 'offline';

/** Outbound-only connection to the relay: the node never listens on a port (AGENTS.md). Reconnects with backoff. */
export class RelayClient {
  private options: RelayClientOptions;
  private socket: WebSocket | undefined;
  private ready = false;
  private closed = false;
  private backoffMs: number;
  private readonly pending = new Map<string, (outcome: SendOutcome) => void>();
  private readyWaiters: (() => void)[] = [];
  private reconnectTimer: NodeJS.Timeout | undefined;

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

  send(envelope: Envelope): Promise<SendOutcome> {
    const socket = this.socket;
    if (!this.ready || !socket) return Promise.resolve('offline');
    return new Promise((resolve) => {
      this.pending.set(envelope.id, resolve);
      socket.send(JSON.stringify({ type: 'envelope', envelope }));
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
    for (const resolve of this.pending.values()) resolve('offline');
    this.pending.clear();
    previous?.terminate();
    if (wasReady) this.options.onStatus?.('disconnected');
    this.backoffMs = this.options.minBackoffMs ?? 1_000;
    if (!this.closed) this.open();
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = undefined;
    this.ready = false;
  }

  private open(): void {
    const socket = new WebSocket(this.options.url, this.options.ca ? { ca: this.options.ca } : {});
    this.socket = socket;
    socket.on('message', (data) => {
      const frame = parseFrame(ServerFrameSchema, data);
      if (frame) this.handle(socket, frame);
    });
    socket.on('close', (code) => {
      if (this.socket !== socket) return;
      this.ready = false;
      for (const resolve of this.pending.values()) resolve('offline');
      this.pending.clear();
      this.options.onStatus?.(code === CLOSE_UNAUTHORIZED ? 'unauthorized' : 'disconnected');
      if (!this.closed) this.scheduleReconnect();
    });
    socket.on('error', () => {
      // A failed connection also emits 'close', which schedules the reconnect.
    });
  }

  private scheduleReconnect(): void {
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, this.options.maxBackoffMs ?? 30_000);
    this.reconnectTimer = setTimeout(() => {
      this.open();
    }, delay);
  }

  private handle(socket: WebSocket, frame: ServerFrame): void {
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
        this.ready = true;
        this.backoffMs = this.options.minBackoffMs ?? 1_000;
        this.options.onStatus?.('connected');
        for (const resolve of this.readyWaiters) resolve();
        this.readyWaiters = [];
        return;
      case 'envelope':
        this.options.onEnvelope(frame.envelope);
        return;
      case 'ack':
        this.settle(frame.id, frame.status);
        return;
      case 'error':
        if (frame.id) this.settle(frame.id, frame.error);
        this.options.onError?.(frame);
        return;
    }
  }

  private settle(id: string, outcome: SendOutcome): void {
    this.pending.get(id)?.(outcome);
    this.pending.delete(id);
  }
}
