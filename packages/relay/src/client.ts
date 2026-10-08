import WebSocket from 'ws';
import { signDetached, type Envelope, type Identity } from '@drop/protocol';
import { parseFrame, ServerFrameSchema, type ServerFrame } from './wire.ts';

export interface RelayClientOptions {
  identity: Identity;
  url: string;
  onEnvelope: (envelope: Envelope) => void;
  onStatus?: (status: 'connected' | 'disconnected' | 'unauthorized') => void;
  onError?: (frame: Extract<ServerFrame, { type: 'error' }>) => void;
  minBackoffMs?: number;
  maxBackoffMs?: number;
}

export type SendOutcome = 'delivered' | 'queued' | 'E_SCHEMA' | 'E_TOO_LARGE' | 'E_RATE' | 'E_QUEUE_FULL' | 'offline';

/** Outbound-only connection to the relay: the node never listens on a port (AGENTS.md). Reconnects with backoff. */
export class RelayClient {
  private readonly options: RelayClientOptions;
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

  close(): void {
    this.closed = true;
    clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = undefined;
    this.ready = false;
  }

  private open(): void {
    const socket = new WebSocket(this.options.url);
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
      this.options.onStatus?.(code === 4401 ? 'unauthorized' : 'disconnected');
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
            socket.send(JSON.stringify({ type: 'auth', nodeId: this.options.identity.nodeId, sig }));
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
