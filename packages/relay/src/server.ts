import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createServer } from 'node:http';
import { createServer as createTlsServer } from 'node:https';
import { WebSocketServer, type WebSocket } from 'ws';
import { z } from 'zod';
import {
  AdmissionSchema,
  EnvelopeSchema,
  envelopeSize,
  MAX_CLOCK_SKEW_MS,
  MAX_ENVELOPE_BYTES,
  MAX_TTL_MS,
  policyExpired,
  policyFingerprint,
  SignedPolicySchema,
  verifyAdmission,
  verifyPolicy,
  verifyDetached,
  type Envelope,
} from '@drop/protocol';
import { writePrivate } from './private-file.ts';
import {
  CLOSE_RATE,
  CLOSE_REPLACED,
  CLOSE_SPOOFED_FROM,
  CLOSE_UNAUTHORIZED,
  ClientFrameSchema,
  parseFrame,
  type ClientFrame,
  type ServerFrame,
} from './wire.ts';

export const RelayConfigSchema = z
  .object({
    port: z.number().int().min(0).max(65535),
    host: z.string().default('127.0.0.1'),
    allowedNodeIds: z.array(z.string()),
    revokedNodeIds: z.array(z.string()).default([]),
    maxQueuePerNode: z.number().int().positive().default(100),
    /** All deferred envelopes together, in bytes: bounds the relay's memory whatever the number of offline nodes. */
    maxQueueBytes: z
      .number()
      .int()
      .positive()
      .default(64 * 1024 * 1024),
    rateLimitPerMinute: z.number().int().positive().default(60),
    /** Where nodes admitted by invitation are kept across restarts (T2.1). Without it, admissions last until restart. */
    admittedPath: z.string().optional(),
    maxAdmissionsPerSponsorPerDay: z.number().int().nonnegative().default(20),
    /** All sponsors together (T2.19): bounds how fast admissions can spread from node to node. */
    maxAdmissionsPerDay: z.number().int().nonnegative().default(100),
    /** Revocations written by `drop-relay revoke`, reloaded while the relay runs (T2.19). */
    revokedPath: z.string().optional(),
    /** The organization policy this relay requires of every node (T4.10, D81), and the key it must be signed with. */
    policyPath: z.string().min(1).optional(),
    policyIssuer: z.string().min(1).optional(),
    /** Serves wss and https itself, for a relay without a TLS front (T4.10). */
    tls: z.object({ certPath: z.string(), keyPath: z.string() }).optional(),
  })
  // Half a policy configuration would start an open relay: both or neither.
  .refine((config) => (config.policyPath === undefined) === (config.policyIssuer === undefined), {
    message: 'E_POLICY policyPath and policyIssuer go together',
  });

/** The revocation file: a revoked node is refused even if allowlisted or admitted; `withInvited` spreads to its invitees. */
export const RevokedStateSchema = z.object({
  revoked: z.array(z.object({ nodeId: z.string(), withInvited: z.boolean(), at: z.string() })),
});
export type RelayConfig = z.input<typeof RelayConfigSchema>;

/** One relay log line: metadata only, never `body` (AGENTS.md). */
export interface RelayLogEntry {
  event: 'auth' | 'admission' | 'envelope' | 'disconnect' | 'revocation';
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
  /** How often the revocation file is checked for changes; 2 s by default. */
  revocationPollMs?: number;
}

export interface RelayHandle {
  port: number;
  url: string;
  close(): Promise<void>;
}

export function readRelayConfig(path: string): RelayConfig {
  const config = RelayConfigSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  // Every file the config names is relative to the config itself, so the relay and `drop-relay revoke` agree from any
  // working directory.
  const nearConfig = (file: string): string => resolve(dirname(path), file);
  if (config.admittedPath) config.admittedPath = nearConfig(config.admittedPath);
  if (config.revokedPath) config.revokedPath = nearConfig(config.revokedPath);
  if (config.policyPath) config.policyPath = nearConfig(config.policyPath);
  if (config.tls) config.tls = { certPath: nearConfig(config.tls.certPath), keyPath: nearConfig(config.tls.keyPath) };
  return config;
}

const RATE_WINDOW_MS = 60_000;
const DAY_MS = 86_400_000;
/** The longest a valid envelope can live, plus the clock skew the protocol tolerates between sender and relay. */
const MAX_HOLD_MS = MAX_TTL_MS + MAX_CLOCK_SKEW_MS;
/** A client frame serializes the envelope id within this prefix; E_RATE reads no further. */
const RATE_ID_PREFIX_BYTES = 256;

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
}

/**
 * A deferred envelope, with its serialized size counted once against `maxQueueBytes`, and the relay time it leaves at:
 * its `exp`, but never later than MAX_HOLD_MS after it arrived, whatever `ts` its sender wrote.
 */
interface Queued {
  envelope: Envelope;
  size: number;
  until: number;
}

type AuthFrame = Extract<ClientFrame, { type: 'auth' }>;

/** What a frame ws rejected before 'message' counts as, for a sender still within its quota. */
function wsErrorOutcome(code: string): 'E_TOO_LARGE' | 'E_SCHEMA' {
  return code === 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH' ? 'E_TOO_LARGE' : 'E_SCHEMA';
}

/** Reads and verifies the relay's policy; a relay never starts on one that does not verify or has expired (T4.10). */
async function loadRelayPolicy(path: string | undefined, issuer: string | undefined, now: number) {
  if (!path) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error('E_POLICY unreadable relay policy');
  }
  if (!issuer || !(await verifyPolicy(raw, issuer))) throw new Error('E_POLICY relay policy does not verify');
  const signed = SignedPolicySchema.parse(raw);
  if (policyExpired(signed.policy, now)) throw new Error('E_POLICY relay policy expired or not yet valid');
  return { signed, fingerprint: policyFingerprint(signed) };
}

export async function startRelay(config: RelayConfig, options: RelayOptions = {}): Promise<RelayHandle> {
  const settings = RelayConfigSchema.parse(config);
  const log = options.logger ?? defaultLogger;
  const now = options.now ?? Date.now;
  const policy = await loadRelayPolicy(settings.policyPath, settings.policyIssuer, now());
  const admittedState = loadAdmitted(settings.admittedPath);
  // Revoked in the config (T3.1): permanent, never admitted again. The revocation file (T2.19) adds to it, live.
  const configRevoked = new Set<string>(settings.revokedNodeIds);
  const allowed = new Set(
    [...settings.allowedNodeIds, ...admittedState.admitted.map((entry) => entry.nodeId)].filter(
      (id) => !configRevoked.has(id),
    ),
  );
  let revoked = new Set<string>(configRevoked);
  const isAllowed = (nodeId: string): boolean => allowed.has(nodeId) && !revoked.has(nodeId);

  /**
   * Admits `nodeId` if `raw` is a valid ticket from an admitted sponsor, unspent and within the sponsor's daily quota.
   * Runs after the awaited signature check, so the spent-nonce test and the write below happen in one synchronous step.
   */
  const admit = async (nodeId: string, raw: unknown): Promise<string> => {
    if (revoked.has(nodeId)) return 'revoked';
    const check = await verifyAdmission(raw, now());
    if (check !== 'ok') return check;
    const ticket = AdmissionSchema.parse(raw);
    if (!isAllowed(ticket.sponsor)) return 'sponsor_not_admitted';
    admittedState.spentNonces = admittedState.spentNonces.filter((spent) => spent.expiresAt > now());
    if (admittedState.spentNonces.some((spent) => spent.nonce === ticket.nonce)) return 'ticket_spent';
    const dayAgo = now() - DAY_MS;
    const sponsored = admittedState.admitted.filter((entry) => entry.sponsor === ticket.sponsor && entry.at > dayAgo);
    if (sponsored.length >= settings.maxAdmissionsPerSponsorPerDay) return 'sponsor_quota';
    if (admittedState.admitted.filter((entry) => entry.at > dayAgo).length >= settings.maxAdmissionsPerDay)
      return 'global_quota';
    admittedState.spentNonces.push({ nonce: ticket.nonce, expiresAt: ticket.expiresAt });
    admittedState.admitted.push({ nodeId, sponsor: ticket.sponsor, at: now() });
    allowed.add(nodeId);
    if (settings.admittedPath) writePrivate(settings.admittedPath, `${JSON.stringify(admittedState, null, 2)}\n`);
    log({ event: 'admission', outcome: 'admitted', nodeId, sponsor: ticket.sponsor });
    return 'ok';
  };
  const connections = new Map<string, Connection>();
  const sentByNode = new Map<string, number[]>();
  const queues = new Map<string, Queued[]>();
  let queuedBytes = 0;

  /** Forgets a node's whole queue, delivered or dropped. */
  const dropQueue = (nodeId: string): void => {
    for (const entry of queues.get(nodeId) ?? []) queuedBytes -= entry.size;
    queues.delete(nodeId);
  };

  /** Drops the expired envelopes of a node's queue, and the queue itself once empty; returns what is still live. */
  const purge = (nodeId: string): Queued[] => {
    const queue = queues.get(nodeId) ?? [];
    const live = queue.filter((entry) => entry.until > now());
    if (live.length === queue.length) return queue;
    for (const entry of queue) if (entry.until <= now()) queuedBytes -= entry.size;
    if (live.length) queues.set(nodeId, live);
    else queues.delete(nodeId);
    return live;
  };

  /**
   * Reads the revocation file (T2.19): the listed nodes, plus, for an entry `withInvited`, every node it admitted and
   * theirs. A node newly revoked is disconnected and its queue dropped. A file that does not parse changes nothing.
   */
  const applyRevocations = (): void => {
    let state: z.infer<typeof RevokedStateSchema>;
    try {
      state =
        settings.revokedPath && existsSync(settings.revokedPath)
          ? RevokedStateSchema.parse(JSON.parse(readFileSync(settings.revokedPath, 'utf8')))
          : { revoked: [] };
    } catch {
      log({ event: 'revocation', outcome: 'E_SCHEMA' });
      return;
    }
    const next = new Set([...configRevoked, ...state.revoked.map((entry) => entry.nodeId)]);
    const spreading = state.revoked.filter((entry) => entry.withInvited).map((entry) => entry.nodeId);
    while (spreading.length > 0) {
      const sponsor = spreading.pop();
      for (const entry of admittedState.admitted)
        if (entry.sponsor === sponsor && !next.has(entry.nodeId)) {
          next.add(entry.nodeId);
          spreading.push(entry.nodeId);
        }
    }
    for (const nodeId of next) {
      if (revoked.has(nodeId)) continue;
      connections.get(nodeId)?.socket.close(CLOSE_UNAUTHORIZED, 'revoked');
      dropQueue(nodeId);
      log({ event: 'revocation', outcome: 'revoked', nodeId });
    }
    revoked = next;
  };
  // Polled here rather than with fs.watchFile: watchFile never reports a file whose first check, run on the libuv
  // thread pool, completes after the file was written, so a revocation written while the relay starts on a busy
  // machine was missed until the file changed again. The signature is read before the file, so a write in between
  // shows at the next check.
  const revocationSignature = (): string => {
    try {
      const stats = settings.revokedPath ? statSync(settings.revokedPath, { throwIfNoEntry: false }) : undefined;
      return stats
        ? `${String(stats.ino)}:${String(stats.size)}:${String(stats.mtimeMs)}:${String(stats.ctimeMs)}`
        : 'absent';
    } catch {
      // Unreadable for now (permissions, a vanished directory): read again, which logs E_SCHEMA, once it changes.
      return 'unreadable';
    }
  };
  let revocationSeen = revocationSignature();
  applyRevocations();
  const revocationPoller = settings.revokedPath
    ? setInterval(() => {
        const signature = revocationSignature();
        if (signature === revocationSeen) return;
        revocationSeen = signature;
        applyRevocations();
      }, options.revocationPollMs ?? 2000)
    : undefined;
  // HTTP answers only GET /health (for the deploy probe and uptime monitoring); /v1 upgrades to WebSocket. With tls,
  // the relay serves https and wss itself.
  // The probe also names the commit the relay was built from, so "is the deployed relay the one we meant to serve?" is
  // answerable without server access (D91, T4.6a). A build that carries nothing answers "unknown": the probe must
  // never claim a version it cannot prove.
  const build = process.env.DROP_BUILD?.trim() || 'unknown';
  const answer = (
    req: { method?: string | undefined; url?: string | undefined },
    res: import('node:http').ServerResponse,
  ) => {
    const healthy = req.method === 'GET' && req.url === '/health';
    res.writeHead(healthy ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(healthy ? JSON.stringify({ ok: true, nodes: connections.size, build }) : '{"error":"not_found"}');
  };
  const http = settings.tls
    ? createTlsServer({ cert: readFileSync(settings.tls.certPath), key: readFileSync(settings.tls.keyPath) }, answer)
    : createServer(answer);
  const server = new WebSocketServer({ server: http, path: '/v1', maxPayload: MAX_ENVELOPE_BYTES * 2 });

  const send = (socket: WebSocket, frame: ServerFrame): void => {
    socket.send(JSON.stringify(frame));
  };

  const recentSends = (nodeId: string): number[] => {
    const windowStart = now() - RATE_WINDOW_MS;
    const current = (sentByNode.get(nodeId) ?? []).filter((at) => at > windowStart);
    if (current.length) sentByNode.set(nodeId, current);
    else sentByNode.delete(nodeId);
    return current;
  };

  // Only the sender's window is pruned per frame; idle nodes are swept by the pinger below.
  const charge = (nodeId: string): boolean => {
    const sent = recentSends(nodeId);
    if (sent.length >= settings.rateLimitPerMinute) return false;
    sent.push(now());
    sentByNode.set(nodeId, sent);
    return true;
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
    // Only a node this relay admits can ever collect a deferred envelope; any other `to` would hold memory for nobody.
    if (!isAllowed(envelope.to)) {
      send(sender.socket, { type: 'error', id: envelope.id, error: 'E_SCHEMA' });
      log({ event: 'envelope', outcome: 'unknown_recipient', ...meta });
      return;
    }
    // The protocol's own bound (openEnvelope). A far-future `ts` passes it, but the queue holds nothing past MAX_HOLD_MS.
    if (envelope.exp > envelope.ts + MAX_TTL_MS) {
      send(sender.socket, { type: 'error', id: envelope.id, error: 'E_SCHEMA' });
      log({ event: 'envelope', outcome: 'ttl_too_long', ...meta });
      return;
    }
    const target = connections.get(envelope.to);
    if (target) {
      send(target.socket, { type: 'envelope', envelope });
      send(sender.socket, { type: 'ack', id: envelope.id, status: 'delivered' });
      log({ event: 'envelope', outcome: 'delivered', ...meta });
      return;
    }
    const queue = purge(envelope.to);
    if (queue.length >= settings.maxQueuePerNode || queuedBytes + size > settings.maxQueueBytes) {
      send(sender.socket, { type: 'error', id: envelope.id, error: 'E_QUEUE_FULL' });
      log({ event: 'envelope', outcome: 'E_QUEUE_FULL', ...meta });
      return;
    }
    queue.push({ envelope, size, until: Math.min(envelope.exp, now() + MAX_HOLD_MS) });
    queues.set(envelope.to, queue);
    queuedBytes += size;
    send(sender.socket, { type: 'ack', id: envelope.id, status: 'queued' });
    log({ event: 'envelope', outcome: 'queued', ...meta });
  };

  /**
   * Checks an `auth` frame: the signature over this socket's challenge, the relay's policy, then the allowlist or an
   * admission ticket. Returns the node's connection, or closes the socket with 4401 and returns undefined.
   */
  const authenticate = async (
    socket: WebSocket,
    challenge: string,
    frame: AuthFrame,
  ): Promise<Connection | undefined> => {
    const { nodeId, sig, admission } = frame;
    const valid = await verifyDetached(nodeId, challenge, sig);
    // Under a policy, only nodes that run it, while it is valid (T4.10, D81). Checked before any admission.
    if (valid && policy && (frame.policy !== policy.fingerprint || policyExpired(policy.signed.policy, now()))) {
      log({
        event: 'auth',
        outcome: frame.policy === policy.fingerprint ? 'policy_expired' : 'policy_mismatch',
        nodeId,
      });
      socket.close(CLOSE_UNAUTHORIZED, 'policy');
      return undefined;
    }
    if (valid && !isAllowed(nodeId) && admission !== undefined) {
      const outcome = await admit(nodeId, admission);
      if (outcome !== 'ok') log({ event: 'admission', outcome, nodeId });
    }
    if (!valid || !isAllowed(nodeId)) {
      log({ event: 'auth', outcome: valid ? 'not_allowed' : 'bad_signature', nodeId });
      socket.close(CLOSE_UNAUTHORIZED, 'unauthorized');
      return undefined;
    }
    return { socket, nodeId, missedPings: 0 };
  };

  server.on('connection', (socket, request) => {
    const challenge = randomBytes(32).toString('base64url');
    let connection: Connection | undefined;
    let authStarted = false;
    const authTimer = setTimeout(() => {
      if (!connection) socket.close(CLOSE_UNAUTHORIZED, 'auth timeout');
    }, options.authTimeoutMs ?? 10_000);
    send(socket, { type: 'challenge', challenge });

    socket.on('pong', () => {
      if (connection) connection.missedPings = 0;
    });
    // Any byte from the node answers the ping too: its pong may wait behind a big frame on a slow uplink (T4.39).
    // Attached after ws's own listener (ws emits 'connection' once the socket is set), so it never changes how ws reads.
    request.socket.on('data', () => {
      if (connection) connection.missedPings = 0;
    });

    socket.on('error', (error: Error) => {
      // ws rejects oversized or invalid frames before 'message'; account for authenticated attempts.
      const code = 'code' in error ? error.code : undefined;
      if (connection && typeof code === 'string' && code.startsWith('WS_ERR_')) {
        const outcome = charge(connection.nodeId) ? wsErrorOutcome(code) : 'E_RATE';
        log({ event: 'envelope', outcome, nodeId: connection.nodeId });
        return;
      }
      log({ event: 'disconnect', outcome: 'socket_error', ...(connection ? { nodeId: connection.nodeId } : {}) });
    });

    socket.on('message', (data) => {
      if (!connection) {
        // One auth check per socket: a burst of auth frames would start as many signature checks, and a second success
        // would close this very socket as replaced. Frames that arrive while it runs are ignored.
        if (authStarted) return;
        const frame = parseFrame(ClientFrameSchema, data);
        if (frame?.type !== 'auth') {
          socket.close(CLOSE_UNAUTHORIZED, 'auth expected');
          return;
        }
        authStarted = true;
        authenticate(socket, challenge, frame)
          .then((authed) => {
            // A socket that closed while its signature was checked must not be registered: nothing would remove it.
            if (!authed || socket.readyState !== socket.OPEN) return;
            const { nodeId } = authed;
            clearTimeout(authTimer);
            const previous = connections.get(nodeId);
            if (previous && previous.socket !== socket)
              previous.socket.close(CLOSE_REPLACED, 'replaced by a newer connection');
            connection = authed;
            connections.set(nodeId, authed);
            send(socket, { type: 'ready', nodeId });
            log({ event: 'auth', outcome: 'ok', nodeId });
            for (const { envelope, size } of purge(nodeId)) {
              send(socket, { type: 'envelope', envelope });
              log({
                event: 'envelope',
                outcome: 'delivered_from_queue',
                id: envelope.id,
                from: envelope.from,
                to: envelope.to,
                size,
              });
            }
            dropQueue(nodeId);
          })
          .catch(() => {
            log({ event: 'auth', outcome: 'error', nodeId: frame.nodeId });
            socket.close(CLOSE_UNAUTHORIZED, 'unauthorized');
          });
        return;
      }
      if (!charge(connection.nodeId)) {
        // Read only a bounded prefix to associate valid client sends with E_RATE without parsing an exhausted frame.
        const prefix = Buffer.isBuffer(data) ? data.subarray(0, RATE_ID_PREFIX_BYTES).toString('utf8') : '';
        const rawId = /"id"\s*:\s*"([0-9a-f-]{36})"/i.exec(prefix)?.[1];
        const id = rawId && z.uuid().safeParse(rawId).success ? rawId : undefined;
        send(socket, { type: 'error', ...(id ? { id } : {}), error: 'E_RATE' });
        log({ event: 'envelope', outcome: 'E_RATE', nodeId: connection.nodeId, ...(id ? { id } : {}) });
        // A bounded prefix can contain a misleading id. Closing settles every unmatched send as offline.
        socket.close(CLOSE_RATE, 'rate limit');
        return;
      }
      const frame = parseFrame(ClientFrameSchema, data);
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
    // A policy that expires while nodes are connected cuts them off: none of them runs a valid policy any more.
    if (policy && policyExpired(policy.signed.policy, now()))
      for (const connection of connections.values()) {
        log({ event: 'auth', outcome: 'policy_expired', nodeId: connection.nodeId });
        connection.socket.close(CLOSE_UNAUTHORIZED, 'policy');
      }
    for (const connection of connections.values()) {
      if (connection.missedPings >= 2) {
        connection.socket.terminate();
        continue;
      }
      connection.missedPings += 1;
      connection.socket.ping();
    }
    for (const nodeId of [...sentByNode.keys()]) recentSends(nodeId);
    // Expired envelopes leave even when their recipient never comes back.
    for (const nodeId of [...queues.keys()]) purge(nodeId);
  }, options.pingIntervalMs ?? 25_000);

  return new Promise((resolve, reject) => {
    http.once('error', reject);
    http.listen(settings.port, settings.host, () => {
      const address = http.address();
      const port = typeof address === 'object' && address !== null ? address.port : settings.port;
      resolve({
        port,
        url: `${settings.tls ? 'wss' : 'ws'}://${settings.host}:${String(port)}/v1`,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(pinger);
            clearInterval(revocationPoller);
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
