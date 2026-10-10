/**
 * The Internet path (T4.2b, D68): drives the drop-iroh program, one iroh endpoint whose id is this node's id. The
 * program gets the key seed on its stdin, never in its arguments or environment, and runs with an empty environment.
 * Delivered means acknowledged: the receiving node signs `drop-iroh-ack-v1|id|receiver|sender`, this node checks it.
 * Never throws toward the transport: a failure is 'unreachable', and the next path is tried.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { z } from 'zod';
import {
  DropError,
  IrohAddrSchema,
  assertPrivateDestination,
  fromBase64Url,
  signDetached,
  verifyDetached,
  type Envelope,
  type Identity,
  type IrohAddr,
  type PrivateNetwork,
} from '@drop/protocol';
import { privateAddresses } from './lan.ts';

const ACK_DOMAIN = 'drop-iroh-ack-v1';
/** A path that failed is not tried again for this long, unless the peer's address changes. */
const RETRY_AFTER_MS = 60_000;
const SEND_TIMEOUT_MS = 40_000;
const RESTART_DELAYS_MS = [5_000, 30_000, 120_000];
/** Envelopes from nodes that are not peers yet (pairing during a live invite): a few per minute, all of them together. */
const STRANGER_ENVELOPES_PER_MINUTE = 10;

export const IROH_NO_PATH_MESSAGE =
  "Ton collègue n'est pas joignable directement : il faut un relais iroh (le tien, celui de l'équipe, ou celui de test de n0).";

const MESSAGES: Record<string, string> = {
  E_IROH_NO_PATH: IROH_NO_PATH_MESSAGE,
  E_IROH_REFUSED: "Ton collègue n'a pas accepté la connexion : vérifie que vous êtes bien appairés.",
  E_IROH_ACK: "La réponse reçue n'était pas signée par ton collègue : envoi refusé.",
  E_IROH_TIMEOUT: 'La connexion a été trop lente : nouvel essai plus tard.',
  E_IROH_RELAY: "L'adresse du relais iroh n'est pas valide.",
  E_IROH_EXIT: "Le programme de connexion par Internet s'est arrêté : nouvel essai bientôt.",
};

/** A relay a node may use or accept from a peer: https, or plain http on this machine only (a test relay). */
export function irohRelayAllowed(text: string): boolean {
  try {
    const url = new URL(text);
    if (url.username || url.password) return false;
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

/** The owner's choice in the panel: off by default; n0's relays are a third party, for tests only. */
export const InternetSettingsSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('off') }),
  z.object({ mode: z.literal('direct') }),
  z.object({ mode: z.literal('relay'), relay: z.string().max(300).refine(irohRelayAllowed) }),
  z.object({ mode: z.literal('n0') }),
]);
export type InternetSettings = z.infer<typeof InternetSettingsSchema>;

/** The relay drop-iroh is started with: none, n0's, or the owner's. */
export function relayChoice(settings: InternetSettings): string | undefined {
  if (settings.mode === 'relay') return settings.relay;
  return settings.mode === 'n0' ? 'n0' : undefined;
}

/**
 * The private profile never reaches a third party (D34): no n0 relay, and an own relay among the allowed origins.
 * Checked when the owner saves a choice and again at start, for a file edited by hand.
 */
export function assertInternetAllowed(
  settings: InternetSettings,
  config: { profile: string; network?: PrivateNetwork | undefined },
): void {
  if (config.profile !== 'private') return;
  if (settings.mode === 'n0') throw new DropError('E_DENIED', 'E_DENIED n0 relays are a third party');
  if (settings.mode === 'relay') {
    if (!config.network) throw new DropError('E_DENIED', 'E_DENIED invalid private profile');
    assertPrivateDestination(settings.relay, config.network);
  }
}

/** In the private profile, direct addresses stay in private ranges: this node neither announces nor dials others. */
export function privateSocket(socket: string): boolean {
  const host = socket.startsWith('[')
    ? socket.slice(1, socket.lastIndexOf(']'))
    : socket.slice(0, socket.lastIndexOf(':'));
  return privateAddresses([host]).length === 1;
}

/**
 * The program shipped next to the bundled Node. DROP_IROH_BIN names another one on a development machine only: the
 * app's shell (DROP_SHELL_INSTANCE) never lets a variable choose who receives the key seed.
 */
export function irohBinary(): string | undefined {
  const development = process.env.DROP_SHELL_INSTANCE === undefined ? process.env.DROP_IROH_BIN : undefined;
  const candidates = [development, join(dirname(process.execPath), 'drop-iroh')];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Not there: the Internet mode is unavailable.
    }
  }
  return undefined;
}

export type IrohState = 'off' | 'unavailable' | 'starting' | 'on' | 'failed';

export interface IrohOptions {
  identity: Identity;
  /** Path to drop-iroh; absent or not executable: the Internet mode is unavailable. */
  binary: string | undefined;
  /** No relay (undefined), n0's test relays ('n0'), or the owner's relay URL. */
  relay?: string;
  enabled?: boolean;
  /** Who may connect: paired peers and pairings in progress, and anyone while an invite is live (D60). */
  access: () => { peers: string[]; open: boolean };
  addressOf: (nodeId: string) => IrohAddr | undefined;
  onEnvelope: (envelope: unknown) => void;
  /** Called with this node's addresses when the program is ready and whenever they change. */
  onAddress?: (address: IrohAddr) => void;
  /** How long the program tries a path; tests shorten it. */
  connectMs?: number;
  /** Which direct addresses may be announced or dialed: all by default, private ranges in the private profile. */
  allowSocket?: (socket: string) => boolean;
  log?: (entry: Record<string, unknown>) => void;
}

const OutputSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('ready'), id: z.string(), addr: z.unknown() }),
  z.object({ t: z.literal('addr'), addr: z.unknown() }),
  z.object({ t: z.literal('env'), rid: z.number().int(), from: z.string(), envelope: z.string() }),
  z.object({
    t: z.literal('sent'),
    req: z.number().int(),
    ok: z.boolean(),
    ack: z.string().optional(),
    code: z.string().optional(),
  }),
  z.object({ t: z.literal('error'), code: z.string(), message: z.string() }),
]);

const AckSchema = z.object({ id: z.uuid(), sig: z.string().min(1).max(200) });
const EnvelopeHeadSchema = z.object({ id: z.uuid(), from: z.string() });

type Sent = { ok: boolean; ack?: string | undefined; code?: string | undefined };

export class IrohService {
  private child: ChildProcessWithoutNullStreams | undefined;
  private current: IrohState = 'off';
  private selfId: string | undefined;
  private addr: IrohAddr | undefined;
  private error: string | undefined;
  private stopped = false;
  private nextReq = 1;
  private readonly waiting = new Map<number, (sent: Sent) => void>();
  private readonly retryAfter = new Map<string, { until: number; address: string }>();
  private lastAccess = '';
  private refresher: ReturnType<typeof setInterval> | undefined;
  private restart: ReturnType<typeof setTimeout> | undefined;
  private restarts = 0;
  private strangers = { started: 0, count: 0 };

  private readonly options: IrohOptions;

  constructor(options: IrohOptions) {
    this.options = options;
  }

  state(): IrohState {
    return this.current;
  }

  id(): string | undefined {
    return this.selfId;
  }

  address(): IrohAddr | undefined {
    return this.addr;
  }

  lastError(): string | undefined {
    return this.error;
  }

  /** For the panel: the state, and the last failure explained in plain words. */
  status(): { state: IrohState; error?: string; message?: string } {
    const message = this.error ? MESSAGES[this.error] : undefined;
    return {
      state: this.current,
      ...(this.error ? { error: this.error } : {}),
      ...(message ? { message } : {}),
    };
  }

  /** Starts the program and waits until it is ready or has failed. Never throws. */
  async start(): Promise<void> {
    if (this.options.enabled === false) {
      this.current = 'off';
      return;
    }
    const binary = this.options.binary;
    if (!binary || !executable(binary)) {
      this.current = 'unavailable';
      return;
    }
    this.stopped = false;
    this.current = 'starting';
    await new Promise<void>((resolve) => {
      this.launch(binary, resolve);
    });
    this.refresher ??= setInterval(() => {
      this.refresh();
    }, 2000);
  }

  private launch(binary: string, ready: () => void): void {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      ready();
    };
    // Exit, spawn error or broken setup: one end, logged once, then a later start unless stopped.
    let ended = false;
    const end = (code: string, status: number) => {
      if (ended) return;
      ended = true;
      if (this.child === child) this.child = undefined;
      for (const resolve of this.waiting.values()) resolve({ ok: false, code: 'E_IROH_EXIT' });
      this.waiting.clear();
      settle();
      if (this.stopped) return;
      this.current = 'failed';
      this.error = code;
      this.options.log?.({ event: 'iroh_exit', code, status });
      const delay = RESTART_DELAYS_MS[Math.min(this.restarts, RESTART_DELAYS_MS.length - 1)] ?? 120_000;
      this.restarts += 1;
      clearTimeout(this.restart);
      this.restart = setTimeout(() => {
        if (!this.stopped) this.launch(binary, () => undefined);
      }, delay);
    };
    let child: ChildProcessWithoutNullStreams | undefined;
    try {
      // An empty environment: no variable may point the program at other relays or servers.
      child = spawn(binary, [], { stdio: ['pipe', 'pipe', 'pipe'], env: {} });
      const started = child;
      this.child = started;
      started.on('error', () => {
        end('E_IROH_SPAWN', -1);
      });
      started.on('exit', (status) => {
        end('E_IROH_EXIT', status ?? -1);
      });
      started.stderr.resume();
      started.stdin.on('error', () => {
        end('E_IROH_EXIT', -1);
      });
      createInterface({ input: started.stdout }).on('line', (line) => {
        this.onLine(line, settle);
      });
    } catch {
      child?.kill();
      end('E_IROH_SPAWN', -1);
      return;
    }
    const access = this.options.access();
    this.lastAccess = JSON.stringify(access);
    const seed = Buffer.from(fromBase64Url(this.options.identity.secretKey).subarray(0, 32)).toString('base64url');
    child.stdin.write(
      `${JSON.stringify({
        t: 'init',
        seed,
        relay: this.options.relay ?? null,
        peers: access.peers,
        open: access.open,
        ...(this.options.connectMs ? { connect_ms: this.options.connectMs } : {}),
      })}\n`,
    );
  }

  private onLine(line: string, settle: () => void): void {
    let output: z.infer<typeof OutputSchema>;
    try {
      output = OutputSchema.parse(JSON.parse(line));
    } catch {
      this.options.log?.({ event: 'iroh_output', code: 'E_SCHEMA' });
      return;
    }
    switch (output.t) {
      case 'ready':
        if (output.id !== this.options.identity.nodeId) {
          // Never expected: the program would speak for another key. Stop it rather than use it.
          this.options.log?.({ event: 'iroh_identity', code: 'E_IROH_IDENTITY' });
          this.error = 'E_IROH_IDENTITY';
          this.stopped = true;
          this.child?.kill();
          this.current = 'failed';
          settle();
          return;
        }
        this.selfId = output.id;
        this.current = 'on';
        this.restarts = 0;
        if (this.error === 'E_IROH_EXIT') this.error = undefined;
        this.setAddress(output.addr);
        settle();
        return;
      case 'addr':
        this.setAddress(output.addr);
        return;
      case 'env':
        this.receive(output.rid, output.from, output.envelope).catch(() => {
          this.options.log?.({ event: 'iroh_envelope_refused', code: 'E_IROH_ACK' });
        });
        return;
      case 'sent':
        this.waiting.get(output.req)?.({ ok: output.ok, ack: output.ack, code: output.code });
        this.waiting.delete(output.req);
        return;
      case 'error':
        this.error = output.code.startsWith('E_') ? output.code : 'E_IROH_EXIT';
        this.options.log?.({ event: 'iroh_error', code: this.error });
        settle();
        return;
    }
  }

  private setAddress(raw: unknown): void {
    const parsed = IrohAddrSchema.safeParse(raw);
    if (!parsed.success) return;
    const allow = this.options.allowSocket;
    const address = allow ? { ...parsed.data, direct: parsed.data.direct.filter(allow) } : parsed.data;
    this.addr = address;
    this.options.onAddress?.(address);
  }

  /** An envelope from an authenticated node: handed to the engine only if that node is its sender, then acknowledged. */
  private async receive(rid: number, from: string, text: string): Promise<void> {
    let ack: string | null = null;
    try {
      const envelope: unknown = JSON.parse(text);
      const head = EnvelopeHeadSchema.safeParse(envelope);
      if (head.success && head.data.from === from && this.admitSender(from)) {
        this.options.onEnvelope(envelope);
        const me = this.options.identity.nodeId;
        const sig = await signDetached(this.options.identity, `${ACK_DOMAIN}|${head.data.id}|${me}|${from}`);
        ack = JSON.stringify({ id: head.data.id, sig });
      } else {
        this.options.log?.({ event: 'iroh_envelope_refused', code: 'E_IROH_SENDER', peer: from });
      }
    } catch {
      this.options.log?.({ event: 'iroh_envelope_refused', code: 'E_SCHEMA', peer: from });
    }
    this.write({ t: 'reply', rid, ack });
  }

  /** Peers always; nodes pairing during an invite only within a small shared budget, so they cannot flood the engine. */
  private admitSender(from: string): boolean {
    if (this.options.access().peers.includes(from)) return true;
    const now = Date.now();
    if (now - this.strangers.started >= 60_000) this.strangers = { started: now, count: 0 };
    if (++this.strangers.count <= STRANGER_ENVELOPES_PER_MINUTE) return true;
    this.options.log?.({ event: 'iroh_envelope_refused', code: 'E_RATE', peer: from });
    return false;
  }

  /** Pushes who may connect when it changes: peers paired or removed, invites created or expired. */
  refresh(): void {
    if (!this.child) return;
    const access = this.options.access();
    const key = JSON.stringify(access);
    if (key === this.lastAccess) return;
    this.lastAccess = key;
    this.write({ t: 'peers', list: access.peers, open: access.open });
  }

  async send(envelope: Envelope): Promise<'delivered' | 'unreachable'> {
    if (this.current !== 'on' || !this.child) return 'unreachable';
    const to = envelope.to;
    // Without a known address, an open connection from that peer may still carry the envelope (it dialed this node).
    const known = this.options.addressOf(to) ?? { direct: [] };
    const allow = this.options.allowSocket;
    const address = allow ? { ...known, direct: known.direct.filter(allow) } : known;
    const addressKey = JSON.stringify(address);
    const blocked = this.retryAfter.get(to);
    if (blocked && blocked.address === addressKey && blocked.until > Date.now()) return 'unreachable';
    this.refresh();
    const req = this.nextReq++;
    const sent = await new Promise<Sent>((resolve) => {
      const timer = setTimeout(() => {
        this.waiting.delete(req);
        resolve({ ok: false, code: 'E_IROH_TIMEOUT' });
      }, SEND_TIMEOUT_MS);
      this.waiting.set(req, (outcome) => {
        clearTimeout(timer);
        resolve(outcome);
      });
      this.write({ t: 'send', req, to, addr: address, envelope: JSON.stringify(envelope) });
    });
    const code = sent.ok ? await this.checkAck(envelope, sent.ack) : (sent.code ?? 'E_IROH_NO_PATH');
    if (code) {
      this.error = code;
      this.retryAfter.set(to, { until: Date.now() + RETRY_AFTER_MS, address: addressKey });
      this.options.log?.({ event: 'iroh_send_failed', code, peer: to });
      return 'unreachable';
    }
    this.retryAfter.delete(to);
    this.error = undefined;
    return 'delivered';
  }

  /** undefined when the acknowledgement is the receiver's signature over this envelope; an error code otherwise. */
  private async checkAck(envelope: Envelope, raw: string | undefined): Promise<string | undefined> {
    try {
      const ack = AckSchema.parse(JSON.parse(raw ?? ''));
      const me = this.options.identity.nodeId;
      const message = `${ACK_DOMAIN}|${envelope.id}|${envelope.to}|${me}`;
      if (ack.id === envelope.id && (await verifyDetached(envelope.to, message, ack.sig))) return undefined;
    } catch {
      // Malformed: refused below.
    }
    return 'E_IROH_ACK';
  }

  private write(line: unknown): void {
    const child = this.child;
    if (!child?.stdin.writable) return;
    child.stdin.write(`${JSON.stringify(line)}\n`);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearInterval(this.refresher);
    this.refresher = undefined;
    clearTimeout(this.restart);
    const child = this.child;
    this.child = undefined;
    for (const resolve of this.waiting.values()) resolve({ ok: false, code: 'E_IROH_EXIT' });
    this.waiting.clear();
    if (this.current !== 'unavailable') this.current = 'off';
    if (!child || child.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 3000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      // Closing stdin is the program's signal to stop.
      child.stdin.end();
    });
  }
}

function executable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Direct paths first (local network, then Internet), then the relay; otherwise the outbox keeps the envelope. */
export async function sendInOrder(
  envelope: Envelope,
  direct: readonly ({ send(envelope: Envelope): Promise<string> } | undefined)[],
  fallback: { send(envelope: Envelope): Promise<string> } | undefined,
): Promise<string> {
  for (const path of direct) if (path && (await path.send(envelope)) === 'delivered') return 'delivered';
  return fallback ? fallback.send(envelope) : 'offline';
}
