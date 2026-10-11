import { StoredFactSchema, type StoredFact } from './facts.ts';
import { decodeLanKey, newLanKey } from './lan-tags.ts';
import { InternetSettingsSchema, type InternetSettings } from './iroh.ts';
import { randomBytes } from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
  closeSync,
  fsyncSync,
  openSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { FundingConfigSchema } from './funding.ts';
import type { DropClaim } from './engine.ts';
import {
  PrivateNetworkSchema,
  IrohAddrSchema,
  type IrohAddr,
  assertPrivateDestination,
  TeamMemberSchema,
  TeamSchema,
  IdentitySchema,
  NodeIdSchema,
  OwnerKindSchema,
  ReceiptSchema,
  type Identity,
  type Receipt,
  MAX_CLOCK_SKEW_MS,
  REPLAY_WINDOW_MS,
  sha256Hex,
  uuidv7Timestamp,
} from '@drop/protocol';

export const MAX_RECEIVED_DROPS = 16_384;

export const NodeConfigSchema = z
  .object({
    relayUrl: z.string(),
    profile: z.enum(['legacy', 'private']).default('legacy'),
    network: PrivateNetworkSchema.optional(),
    ownerKind: OwnerKindSchema,
    apiPort: z.number().int().min(0).max(65535).default(7781),
    /** Local network mode (T4.2, D59 to D62): mDNS discovery and direct sessions with paired peers. */
    lan: z.boolean().default(true),
    /** Gateways this node trusts to carry its assistants' calls (T2.13); the app warns about any other one. */
    gateways: z.array(NodeIdSchema).default([]),
    /** As executor: who pays the model of the capabilities run here (D27: the requester, by default). */
    payer: z.enum(['requester', 'owner']).default('requester'),
    /** As requester: how this node pays for its drops (D27). Absent: it sends no key, the owner's config applies. */
    funding: FundingConfigSchema.optional(),
  })
  .superRefine((config, ctx) => {
    if (config.profile !== 'private') return;
    try {
      if (!config.network || config.funding || config.gateways.length) throw new Error('policy');
      assertPrivateDestination(config.relayUrl, config.network);
      if (!['ws:', 'wss:'].includes(new URL(config.relayUrl).protocol)) throw new Error('relay');
    } catch {
      ctx.addIssue({ code: 'custom', message: 'E_DENIED invalid private profile' });
    }
  });
export type NodeConfig = z.infer<typeof NodeConfigSchema>;

export const PeerSchema = z.object({
  nodeId: NodeIdSchema,
  displayName: z.string(),
  ownerKind: OwnerKindSchema,
  pairedAt: z.string(),
  /** Set when the peer was introduced by a team member rather than paired by invite (T2.9). */
  via: NodeIdSchema.optional(),
});
export type Peer = z.infer<typeof PeerSchema>;

/** A capability this node executes: the implementation id, who may approve, and the owner's private config. */
export const PublishedSchema = z.object({
  capabilityId: z.string(),
  approverNodeIds: z.array(NodeIdSchema).min(1),
  config: z.unknown(),
  publishedAt: z.string(),
});
export type Published = z.infer<typeof PublishedSchema>;

/** An assistant (Claude, ChatGPT…) the user linked through a gateway: it may ask the team in their name (T2.13). */
export const AgentLinkSchema = z.object({
  gateway: NodeIdSchema,
  clientName: z.string().min(1).max(80),
  /** The assistant's OAuth client at the gateway (D71). Links saved before it speak for any client of the gateway. */
  clientId: z.string().optional(),
  /** The domain the user saw the assistant's answers return to, e.g. claude.ai. */
  redirectHost: z.string().optional(),
  linkedAt: z.string(),
});
export type AgentLink = z.infer<typeof AgentLinkSchema>;

/** What the panel shows and the user approves when an assistant asks to be linked (T2.13, D71). */
export const LinkRequestSchema = z.object({
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  clientId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  clientName: z.string().min(1).max(80),
  redirectHost: z.string().min(1).max(253),
});
export type LinkRequest = z.infer<typeof LinkRequestSchema>;

/** This node's team and the members it knows (T2.9). */
export const TeamStateSchema = z.object({ team: TeamSchema, members: z.array(TeamMemberSchema) });
export type TeamState = z.infer<typeof TeamStateSchema>;

export function defaultHome(): string {
  return process.env.DROP_HOME ?? join(homedir(), '.drop');
}

function writePrivate(path: string, content: string): void {
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
}

/**
 * Makes a rename or an unlink in `path` durable on macOS and Linux. Windows cannot flush a directory: it refuses
 * FlushFileBuffers on a directory handle (EPERM) and journals the entry change in NTFS itself, so only this call is
 * skipped there. Every file is still flushed before its rename, and the replay store stays fail-closed: a marker set
 * that disagrees with its durable digest, clock or version is refused at the next admission (E_REPLAY_STATE).
 */
export function syncDirectory(path: string, platform: NodeJS.Platform = process.platform): void {
  if (platform === 'win32') return;
  const fd = openSync(path, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function writeDurablePrivate(path: string, content: string): void {
  const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    const fd = openSync(temporary, 'wx', 0o600);
    try {
      writeFileSync(fd, content);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, path);
    syncDirectory(join(path, '..'));
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch (cleanupError) {
      if (errorCode(cleanupError) !== 'ENOENT') {
        throw new AggregateError([error, cleanupError], 'E_REPLAY_STATE temp cleanup failed', {
          cause: cleanupError,
        });
      }
    }
    throw error;
  }
}

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEGACY_MARKER =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|0{8}-0{4}-0{4}-0{4}-0{12}|f{8}-f{4}-f{4}-f{4}-f{12})$/i;
/** Names this process in its replay lock; a lock carrying it is our own leftover, since claims are synchronous. */
export const REPLAY_LOCK_OWNER = `${String(process.pid)} ${randomBytes(8).toString('hex')}\n`;

function errorCode(error: unknown): unknown {
  return error instanceof Error && 'code' in error ? error.code : undefined;
}

function lockOwner(lock: string): string | undefined {
  try {
    return readFileSync(join(lock, 'owner'), 'utf8');
  } catch {
    return undefined;
  }
}

function createLock(path: string): boolean {
  try {
    mkdirSync(path, { mode: 0o700 });
    return true;
  } catch (error) {
    if (errorCode(error) === 'EEXIST') return false;
    throw new Error('E_REPLAY_STATE storage unavailable', { cause: error });
  }
}

function claimLock(lock: string): void {
  try {
    writeFileSync(join(lock, 'owner'), REPLAY_LOCK_OWNER, { mode: 0o600 });
  } catch (error) {
    rmSync(lock, { recursive: true, force: true });
    throw new Error('E_REPLAY_STATE storage unavailable', { cause: error });
  }
}

/** A foreign lock is never taken over by age: a slow filesystem may leave a live claim holding it. */
function acquireReplayLock(lock: string): void {
  if (createLock(lock)) {
    claimLock(lock);
    return;
  }
  // Claims are synchronous in this process, so its own nonce can only identify a leftover lock.
  if (lockOwner(lock) !== REPLAY_LOCK_OWNER) throw new Error('E_REPLAY_STATE claim locked');
  rmSync(lock, { recursive: true, force: true });
  if (!createLock(lock)) throw new Error('E_REPLAY_STATE claim locked');
  claimLock(lock);
}

/**
 * A claim failed after creating its marker (T3.1b review): the request is refused, so the marker must not outlive the
 * digest it is missing from, or every later admission would fail on `marker integrity` until a manual repair. While
 * the durable digest still names the previous set, the marker is removed; once the new digest is in place (only its
 * folder sync failed), marker and digest agree and both stay. If neither holds, the store fails closed as before.
 */
function rollBackMarker(
  marker: string,
  dir: string,
  integrityPath: string,
  previousDigest: string,
  cause: unknown,
): void {
  try {
    if (readFileSync(integrityPath, 'utf8') !== previousDigest) return;
    unlinkSync(marker);
    syncDirectory(dir);
  } catch (rollbackError) {
    throw new AggregateError([cause, rollbackError], 'E_REPLAY_STATE claim rollback failed', { cause: rollbackError });
  }
}

/** Never removes a lock another process has since taken over. */
function releaseReplayLock(lock: string): void {
  if (lockOwner(lock) === REPLAY_LOCK_OWNER) rmSync(lock, { recursive: true, force: true });
}

/** Everything a node keeps on disk under DROP_HOME. Private keys and the local token are mode 0600. */
export class DropHome {
  readonly root: string;

  constructor(root: string = defaultHome()) {
    this.root = root;
  }

  get exists(): boolean {
    return existsSync(join(this.root, 'identity.json'));
  }

  init(identity: Identity, config: NodeConfig): void {
    if (this.exists) throw new Error(`DROP_HOME already initialized: ${this.root}`);
    mkdirSync(join(this.root, 'capabilities'), { recursive: true, mode: 0o700 });
    mkdirSync(join(this.root, 'receipts'), { recursive: true, mode: 0o700 });
    chmodSync(this.root, 0o700);
    writePrivate(join(this.root, 'identity.json'), `${JSON.stringify(identity, null, 2)}\n`);
    writeFileSync(join(this.root, 'config.json'), `${JSON.stringify(config, null, 2)}\n`);
    writeFileSync(join(this.root, 'peers.json'), '[]\n');
    writePrivate(join(this.root, 'local-token'), randomBytes(32).toString('base64url'));
  }

  /** Bounded, durable tombstones: a past consent cannot be regained after restart or clock rollback. */
  claimDrop(dropId: string, now: number = Date.now()): DropClaim {
    const timestamp = uuidv7Timestamp(dropId);
    if (timestamp === undefined || !Number.isSafeInteger(now) || now < 0) return 'expired';
    const canonicalDropId = dropId.toLowerCase();
    const lock = join(this.root, 'received-drops.lock');
    acquireReplayLock(lock);
    try {
      return this.claimDropLocked(canonicalDropId, now, timestamp);
    } finally {
      releaseReplayLock(lock);
    }
  }

  private claimDropLocked(dropId: string, now: number, timestamp: number): DropClaim {
    const dir = join(this.root, 'received-drops');
    const clockPath = join(this.root, 'received-drops-clock');
    const versionPath = join(this.root, 'received-drops-version');
    const integrityPath = join(this.root, 'received-drops-integrity');
    const clockExists = existsSync(clockPath);
    const versionExists = existsSync(versionPath);
    const integrityExists = existsSync(integrityPath);
    if (!versionExists && (clockExists || integrityExists)) throw new Error('E_REPLAY_STATE missing version');
    // The clock/version prove that this home has admitted requests. Recreating a lost marker directory would
    // silently reopen consent for a recent request whose tombstone was in that directory.
    if (!existsSync(dir) && (clockExists || versionExists)) throw new Error('E_REPLAY_STATE missing markers');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const version = versionExists ? readFileSync(versionPath, 'utf8') : undefined;
    if (versionExists) {
      if (version !== '1\n' && version !== '2\n') throw new Error('E_REPLAY_STATE corrupt version');
      if (!clockExists) throw new Error('E_REPLAY_STATE missing clock');
    }
    if (version === '2\n' && !integrityExists) throw new Error('E_REPLAY_STATE missing integrity');
    let highWater = 0;
    if (clockExists) {
      const raw = readFileSync(clockPath, 'utf8').trim();
      if (!/^(0|[1-9][0-9]*)$/.test(raw)) throw new Error('E_REPLAY_STATE corrupt clock');
      highWater = Number(raw);
      if (!Number.isSafeInteger(highWater)) throw new Error('E_REPLAY_STATE corrupt clock');
    }
    if (now > highWater || !clockExists) {
      highWater = Math.max(now, highWater);
      writeDurablePrivate(clockPath, `${String(highWater)}\n`);
    }
    const floor = highWater - REPLAY_WINDOW_MS;
    let count = 0;
    let removed = false;
    const entries = readdirSync(dir, { withFileTypes: true });
    const markerNames = entries
      .filter((entry) => UUID_SHAPE.test(entry.name))
      .map((entry) => entry.name)
      .sort();
    if (integrityExists && readFileSync(integrityPath, 'utf8') !== `${sha256Hex(markerNames)}\n`) {
      throw new Error('E_REPLAY_STATE marker integrity');
    }
    const names = new Set(entries.map((entry) => entry.name));
    const retained = new Set<string>();
    for (const entry of entries) {
      // Finder, backup and sync tools may drop their own files here; only UUID-shaped names are markers.
      if (!UUID_SHAPE.test(entry.name)) continue;
      if (!entry.isFile()) throw new Error('E_REPLAY_STATE unexpected marker');
      const markerTime = uuidv7Timestamp(entry.name);
      if (markerTime === undefined) {
        // Pre-T3.1b claims (anything z.uuid() accepted, nil and max included) cannot be admitted by the new protocol.
        if (!LEGACY_MARKER.test(entry.name)) throw new Error('E_REPLAY_STATE unexpected marker');
        unlinkSync(join(dir, entry.name));
        removed = true;
      } else if (markerTime < floor) {
        unlinkSync(join(dir, entry.name));
        removed = true;
      } else {
        const canonicalName = entry.name.toLowerCase();
        if (retained.has(canonicalName) || (entry.name !== canonicalName && names.has(canonicalName))) {
          unlinkSync(join(dir, entry.name));
          removed = true;
          continue;
        }
        retained.add(canonicalName);
        if (entry.name !== canonicalName) {
          renameSync(join(dir, entry.name), join(dir, canonicalName));
          removed = true;
        }
        count += 1;
      }
    }
    if (removed) syncDirectory(dir);
    if (removed || !integrityExists) writeDurablePrivate(integrityPath, `${sha256Hex([...retained].sort())}\n`);
    // Version 1 is upgraded only after the marker-set digest is durable. A crash between the two writes is safe:
    // the next admission verifies the digest even while the version still says 1.
    if (version !== '2\n') writeDurablePrivate(versionPath, '2\n');
    if (timestamp < floor || timestamp > highWater + MAX_CLOCK_SKEW_MS) return 'expired';
    if (existsSync(join(dir, dropId))) return 'duplicate';
    if (count >= MAX_RECEIVED_DROPS) return 'capacity';
    const marker = join(dir, dropId);
    let fd: number;
    try {
      fd = openSync(marker, 'wx', 0o600);
    } catch (error) {
      if (errorCode(error) === 'EEXIST') return 'duplicate';
      throw error;
    }
    const previousDigest = `${sha256Hex([...retained].sort())}\n`;
    try {
      try {
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      syncDirectory(dir);
      writeDurablePrivate(integrityPath, `${sha256Hex([...retained, dropId].sort())}\n`);
      return 'claimed';
    } catch (error) {
      rollBackMarker(marker, dir, integrityPath, previousDigest, error);
      throw error;
    }
  }

  identity(): Identity {
    return IdentitySchema.parse(JSON.parse(readFileSync(join(this.root, 'identity.json'), 'utf8')));
  }

  config(): NodeConfig {
    return NodeConfigSchema.parse(JSON.parse(readFileSync(join(this.root, 'config.json'), 'utf8')));
  }

  /** The admission ticket of an accepted invite, kept until the relay admits this node (T2.1). */
  pendingAdmission(): unknown {
    const path = join(this.root, 'admission.json');
    return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as unknown) : undefined;
  }

  savePendingAdmission(ticket: unknown): void {
    writePrivate(join(this.root, 'admission.json'), `${JSON.stringify(ticket)}\n`);
  }

  clearPendingAdmission(): void {
    rmSync(join(this.root, 'admission.json'), { force: true });
  }

  localToken(): string {
    let token: string;
    try {
      token = readFileSync(join(this.root, 'local-token'), 'utf8').trim();
    } catch {
      throw new Error('E_TOKEN local token unavailable');
    }
    if (!token) throw new Error('E_TOKEN local token empty');
    return token;
  }

  peers(): Peer[] {
    return z.array(PeerSchema).parse(JSON.parse(readFileSync(join(this.root, 'peers.json'), 'utf8')));
  }

  savePeer(peer: Peer): void {
    const peers = this.peers().filter((existing) => existing.nodeId !== peer.nodeId);
    peers.push(peer);
    writeFileSync(join(this.root, 'peers.json'), `${JSON.stringify(peers, null, 2)}\n`);
  }

  links(): AgentLink[] {
    const path = join(this.root, 'links.json');
    return existsSync(path) ? z.array(AgentLinkSchema).parse(JSON.parse(readFileSync(path, 'utf8'))) : [];
  }

  saveLinks(links: AgentLink[]): void {
    writePrivate(join(this.root, 'links.json'), `${JSON.stringify(links, null, 2)}\n`);
  }

  /** This node's local-network discovery key (T4.2c): created once, owner-only. */
  lanKey(): string {
    const path = join(this.root, 'lan-key');
    if (existsSync(path)) {
      const key = readFileSync(path, 'utf8').trim();
      if (decodeLanKey(key)) return key;
      // Never replaced silently: the daemon logs it and turns the local mode off.
      throw new Error('E_LAN_KEY unreadable lan-key');
    }
    const key = newLanKey();
    writeDurablePrivate(path, `${key}\n`);
    return key;
  }

  /** The discovery keys peers sent (T4.2c), kept apart from peers.json, owner-only. */
  lanKeys(): Record<string, string> {
    const path = join(this.root, 'lan-keys.json');
    if (!existsSync(path)) return {};
    // Throws when unreadable: the engine logs it, and saveLanKey never overwrites the other peers' keys.
    return z.record(z.string(), z.string().regex(/^[A-Za-z0-9_-]{43}$/)).parse(JSON.parse(readFileSync(path, 'utf8')));
  }

  saveLanKey(nodeId: string, key: string): void {
    writeDurablePrivate(
      join(this.root, 'lan-keys.json'),
      `${JSON.stringify({ ...this.lanKeys(), [nodeId]: key }, null, 2)}\n`,
    );
  }

  /** The iroh addresses peers sent (T4.2b), kept apart from peers.json, owner-only. */
  irohAddrs(): Record<string, IrohAddr> {
    const path = join(this.root, 'iroh-addrs.json');
    if (!existsSync(path)) return {};
    return z.record(z.string(), IrohAddrSchema).parse(JSON.parse(readFileSync(path, 'utf8')));
  }

  saveIrohAddr(nodeId: string, address: IrohAddr): void {
    writeDurablePrivate(
      join(this.root, 'iroh-addrs.json'),
      `${JSON.stringify({ ...this.irohAddrs(), [nodeId]: address }, null, 2)}\n`,
    );
  }

  /** The owner's Internet choice from the panel (T4.2b): off until they pick one. */
  internet(): InternetSettings {
    const path = join(this.root, 'internet.json');
    if (!existsSync(path)) return { mode: 'off' };
    return InternetSettingsSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  }

  saveInternet(settings: InternetSettings): void {
    writeDurablePrivate(
      join(this.root, 'internet.json'),
      `${JSON.stringify(InternetSettingsSchema.parse(settings))}\n`,
    );
  }

  /** Published facts (T4.4): private to this node, written whole through a temporary file. */
  facts(): StoredFact[] {
    const path = join(this.root, 'facts.json');
    return existsSync(path) ? z.array(StoredFactSchema).parse(JSON.parse(readFileSync(path, 'utf8'))) : [];
  }

  saveFacts(facts: StoredFact[]): void {
    writeDurablePrivate(join(this.root, 'facts.json'), `${JSON.stringify(facts, null, 2)}\n`);
  }

  team(): TeamState | undefined {
    const path = join(this.root, 'team.json');
    return existsSync(path) ? TeamStateSchema.parse(JSON.parse(readFileSync(path, 'utf8'))) : undefined;
  }

  saveTeam(state: TeamState): void {
    writeFileSync(join(this.root, 'team.json'), `${JSON.stringify(TeamStateSchema.parse(state), null, 2)}\n`);
  }

  published(): Published[] {
    const dir = join(this.root, 'capabilities');
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => PublishedSchema.parse(JSON.parse(readFileSync(join(dir, file), 'utf8'))));
  }

  /** Stops publishing a capability; returns false when it was not published. */
  unpublish(capabilityId: string): boolean {
    const path = join(this.root, 'capabilities', `${capabilityId}.json`);
    if (!/^[a-z][a-z0-9_.]*$/.test(capabilityId) || !existsSync(path)) return false;
    rmSync(path);
    return true;
  }

  publish(entry: Published): void {
    writePrivate(join(this.root, 'capabilities', `${entry.capabilityId}.json`), `${JSON.stringify(entry, null, 2)}\n`);
  }

  appendReceipt(receipt: Receipt): void {
    const day = new Date().toISOString().slice(0, 10);
    appendFileSync(join(this.root, 'receipts', `${day}.jsonl`), `${JSON.stringify(receipt)}\n`, { mode: 0o600 });
  }

  receipts(sinceMs = 0): Receipt[] {
    const dir = join(this.root, 'receipts');
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((file) => file.endsWith('.jsonl'))
      .sort()
      .flatMap((file) =>
        readFileSync(join(dir, file), 'utf8')
          .split('\n')
          .filter((line) => line.trim() !== '')
          .map((line) => ReceiptSchema.parse(JSON.parse(line))),
      )
      .filter((receipt) => (receipt.timestamps.requested ?? receipt.timestamps.decided ?? 0) >= sinceMs);
  }
}
