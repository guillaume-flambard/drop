import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { z } from 'zod';
import {
  AdmissionSchema,
  EnvelopeSchema,
  envelopeSize,
  MAX_ENVELOPE_BYTES,
  verifyAdmission,
  verifyDetached,
  type Envelope,
} from '@drop/protocol';
import {
  CLOSE_REPLACED,
  CLOSE_SPOOFED_FROM,
  CLOSE_UNAUTHORIZED,
  ClientFrameSchema,
  parseFrame,
  type ServerFrame,
} from './wire.ts';

export const RelayConfigSchema = z.object({
  port: z.number().int().min(0).max(65535),
  host: z.string().default('127.0.0.1'),
  allowedNodeIds: z.array(z.string()),
  maxQueuePerNode: z.number().int().positive().default(100),
  rateLimitPerMinute: z.number().int().positive().default(60),
  /** Where nodes admitted by invitation are kept across restarts (T2.1). Without it, admissions last until restart. */
  admittedPath: z.string().optional(),
  maxAdmissionsPerSponsorPerDay: z.number().int().nonnegative().default(20),
});
export type RelayConfig = z.input<typeof RelayConfigSchema>;

/** One relay log line: metadata only, never `body` (AGENTS.md). */
export interface RelayLogEntry {
  event: 'auth' | 'admission' | 'envelope' | 'disconnect';
  outcome: string;
  nodeId?: string;
  id?: string;
  from?: string;
  to?: string;
  size?: number;
  sponsor?: string;
}
export type RelayLogger = (entry: RelayLogEntry) => void;

export interface RelayOptions {
  logger?: RelayLogger;
  now?: () => number;
  pingIntervalMs?: number;
  authTimeoutMs?: number;
}

export interface RelayHandle {
  port: number;
  url: string;
  close(): Promise<void>;
}

export function readRelayConfig(path: string): RelayConfig {
  return RelayConfigSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

const defaultLogger: RelayLogger = (entry) => {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
};

/** Nodes admitted by invitation, and the ticket nonces already spent (so a ticket works once, even across restarts). */
const AdmittedStateSchema = z.object({
  admitted: z.array(z.object({ nodeId: z.string(), sponsor: z.string(), at: z.number() })),
  spentNonces: z.array(z.object({ nonce: z.string(), expiresAt: z.number() })),
});
type AdmittedState = z.infer<typeof AdmittedStateSchema>;

function loadAdmitted(path: string | undefined): AdmittedState {
  if (!path || !existsSync(path)) return { admitted: [], spentNonces: [] };
  return AdmittedStateSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

interface Connection {
  socket: WebSocket;
  nodeId: string;
  missedPings: number;
  sentInWindow: number[];
}

export function startRelay(config: RelayConfig, options: RelayOptions = {}): Promise<RelayHandle> {
  const settings = RelayConfigSchema.parse(config);
  const log = options.logger ?? defaultLogger;
  const now = options.now ?? Date.now;
  const admittedState = loadAdmitted(settings.admittedPath);
  const allowed = new Set([...settings.allowedNodeIds, ...admittedState.admitted.map((entry) => entry.nodeId)]);

  /**
   * Admits `nodeId` if `raw` is a valid ticket from an admitted sponsor, unspent and within the sponsor's daily quota.
   * Runs after the awaited signature check, so the spent-nonce test and the write below happen in one synchronous step.
   */
  const admit = async (nodeId: string, raw: unknown): Promise<string> => {
    const check = await verifyAdmission(raw, now());
    if (check !== 'ok') return check;
    const ticket = AdmissionSchema.parse(raw);
    if (!allowed.has(ticket.sponsor)) return 'sponsor_not_admitted';
    admittedState.spentNonces = admittedState.spentNonces.filter((spent) => spent.expiresAt > now());
    if (admittedState.spentNonces.some((spent) => spent.nonce === ticket.nonce)) return 'ticket_spent';
    const dayAgo = now() - 86_400_000;
    const sponsored = admittedState.admitted.filter((entry) => entry.sponsor === ticket.sponsor && entry.at > dayAgo);
    if (sponsored.length >= settings.maxAdmissionsPerSponsorPerDay) return 'sponsor_quota';
    admittedState.spentNonces.push({ nonce: ticket.nonce, expiresAt: ticket.expiresAt });
    admittedState.admitted.push({ nodeId, sponsor: ticket.sponsor, at: now() });
    allowed.add(nodeId);
    if (settings.admittedPath) {
      writeFileSync(settings.admittedPath, `${JSON.stringify(admittedState, null, 2)}\n`, { mode: 0o600 });
    }
    log({ event: 'admission', outcome: 'admitted', nodeId, sponsor: ticket.sponsor });
    return 'ok';
  };
  const connections = new Map<string, Connection>();
  const queues = new Map<string, Envelope[]>();
  // Plain HTTP answers only GET /health (for the deploy probe and uptime monitoring); /v1 upgrades to WebSocket.
  const http = createServer((req, res) => {
    const healthy = req.method === 'GET' && req.url === '/health';
    res.writeHead(healthy ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(healthy ? JSON.stringify({ ok: true, nodes: connections.size }) : '{"error":"not_found"}');
  });
  const server = new WebSocketServer({ server: http, path: '/v1', maxPayload: MAX_ENVELOPE_BYTES * 2 });

  const send = (socket: WebSocket, frame: ServerFrame): void => {
    socket.send(JSON.stringify(frame));
  };

  const purge = (nodeId: string): Envelope[] => {
    const live = (queues.get(nodeId) ?? []).filter((envelope) => envelope.exp > now());
    queues.set(nodeId, live);
    return live;
  };

  const route = (sender: Connection, raw: unknown): void => {
    const parsed = EnvelopeSchema.safeParse(raw);
    if (!parsed.success) {
      send(sender.socket, { type: 'error', error: 'E_SCHEMA' });
      log({ event: 'envelope', outcome: 'E_SCHEMA', nodeId: sender.nodeId });
      return;
    }
    const envelope = parsed.data;
    const size = envelopeSize(envelope);
    const meta = { id: envelope.id, from: envelope.from, to: envelope.to, size };
    if (envelope.from !== sender.nodeId) {
      log({ event: 'envelope', outcome: 'spoofed_from', ...meta });
      sender.socket.close(CLOSE_SPOOFED_FROM, 'from does not match authenticated node');
      return;
    }
    if (size > MAX_ENVELOPE_BYTES) {
      send(sender.socket, { type: 'error', id: envelope.id, error: 'E_TOO_LARGE' });
      log({ event: 'envelope', outcome: 'E_TOO_LARGE', ...meta });
      return;
    }
    const minuteAgo = now() - 60_000;
    sender.sentInWindow = sender.sentInWindow.filter((at) => at > minuteAgo);
    if (sender.sentInWindow.length >= settings.rateLimitPerMinute) {
      send(sender.socket, { type: 'error', id: envelope.id, error: 'E_RATE' });
      log({ event: 'envelope', outcome: 'E_RATE', ...meta });
      return;
    }
    sender.sentInWindow.push(now());

    const target = connections.get(envelope.to);
    if (target) {
      send(target.socket, { type: 'envelope', envelope });
      send(sender.socket, { type: 'ack', id: envelope.id, status: 'delivered' });
      log({ event: 'envelope', outcome: 'delivered', ...meta });
      return;
    }
    const queue = purge(envelope.to);
    if (queue.length >= settings.maxQueuePerNode) {
      send(sender.socket, { type: 'error', id: envelope.id, error: 'E_QUEUE_FULL' });
      log({ event: 'envelope', outcome: 'E_QUEUE_FULL', ...meta });
      return;
    }
    queue.push(envelope);
    send(sender.socket, { type: 'ack', id: envelope.id, status: 'queued' });
    log({ event: 'envelope', outcome: 'queued', ...meta });
  };

  server.on('connection', (socket) => {
    const challenge = randomBytes(32).toString('base64url');
    let connection: Connection | undefined;
    const authTimer = setTimeout(() => {
      if (!connection) socket.close(CLOSE_UNAUTHORIZED, 'auth timeout');
    }, options.authTimeoutMs ?? 10_000);
    send(socket, { type: 'challenge', challenge });

    socket.on('pong', () => {
      if (connection) connection.missedPings = 0;
    });

    socket.on('message', (data) => {
      const frame = parseFrame(ClientFrameSchema, data);
      if (!connection) {
        if (frame?.type !== 'auth') {
          socket.close(CLOSE_UNAUTHORIZED, 'auth expected');
          return;
        }
        const { nodeId, sig, admission } = frame;
        void verifyDetached(nodeId, challenge, sig)
          .then(async (valid) => {
            if (valid && !allowed.has(nodeId) && admission !== undefined) {
              const outcome = await admit(nodeId, admission);
              if (outcome !== 'ok') log({ event: 'admission', outcome, nodeId });
            }
            if (!valid || !allowed.has(nodeId)) {
              log({ event: 'auth', outcome: valid ? 'not_allowed' : 'bad_signature', nodeId });
              socket.close(CLOSE_UNAUTHORIZED, 'unauthorized');
              return;
            }
            clearTimeout(authTimer);
            connections.get(nodeId)?.socket.close(CLOSE_REPLACED, 'replaced by a newer connection');
            connection = { socket, nodeId, missedPings: 0, sentInWindow: [] };
            connections.set(nodeId, connection);
            send(socket, { type: 'ready', nodeId });
            log({ event: 'auth', outcome: 'ok', nodeId });
            for (const envelope of purge(nodeId)) {
              send(socket, { type: 'envelope', envelope });
              log({
                event: 'envelope',
                outcome: 'delivered_from_queue',
                id: envelope.id,
                from: envelope.from,
                to: envelope.to,
                size: envelopeSize(envelope),
              });
            }
            queues.delete(nodeId);
          })
          .catch(() => {
            log({ event: 'auth', outcome: 'error', nodeId });
            socket.close(CLOSE_UNAUTHORIZED, 'unauthorized');
          });
        return;
      }
      if (frame?.type !== 'envelope') {
        send(socket, { type: 'error', error: 'E_SCHEMA' });
        return;
      }
      route(connection, frame.envelope);
    });

    socket.on('close', () => {
      clearTimeout(authTimer);
      if (connection && connections.get(connection.nodeId) === connection) {
        connections.delete(connection.nodeId);
        log({ event: 'disconnect', outcome: 'closed', nodeId: connection.nodeId });
      }
    });
  });

  const pinger = setInterval(() => {
    for (const connection of connections.values()) {
      if (connection.missedPings >= 2) {
        connection.socket.terminate();
        continue;
      }
      connection.missedPings += 1;
      connection.socket.ping();
    }
  }, options.pingIntervalMs ?? 25_000);

  return new Promise((resolve, reject) => {
    http.once('error', reject);
    http.listen(settings.port, settings.host, () => {
      const address = http.address();
      const port = typeof address === 'object' && address !== null ? address.port : settings.port;
      resolve({
        port,
        url: `ws://${settings.host}:${String(port)}/v1`,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(pinger);
            for (const client of server.clients) client.terminate();
            server.close(() => {
              http.close(() => {
                done();
              });
            });
          }),
      });
    });
  });
}
