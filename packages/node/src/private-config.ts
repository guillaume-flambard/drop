import { closeSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { join } from 'node:path';
import { z } from 'zod';
import { PrivateNetworkSchema, type OwnerKind, type PrivateNetwork } from '@drop/protocol';
import { DropHome, NodeConfigSchema, type NodeConfig } from './home.ts';

export function privateConfig(
  relayUrl: string,
  ownerKind: OwnerKind,
  apiPort: number,
  network?: PrivateNetwork,
): NodeConfig {
  return NodeConfigSchema.parse({
    profile: 'private',
    relayUrl,
    ownerKind,
    apiPort,
    payer: 'owner',
    network: network ?? PrivateNetworkSchema.parse({ origins: [...literalOrigin(relayUrl), LOCAL_MODEL_ORIGIN] }),
  });
}

/** Ollama on this machine, the default model destination of the private profile (D37). */
const LOCAL_MODEL_ORIGIN = 'http://127.0.0.1:11434';

/**
 * A relay at a literal private address is also an internal host the runner may reach (T3.1); a relay named by DNS
 * (D95) is only the relay: it never joins the destinations a model or an MCP server may be called at.
 */
function literalOrigin(relayUrl: string): string[] {
  const url = new URL(relayUrl);
  return isIP(url.hostname.replace(/^\[|\]$/g, '')) === 0 ? [] : [url.origin];
}

/**
 * Moves this node to the relay of the invite it is accepting (T4.23, D95), while the daemon runs: only config.json
 * changes, through a temporary file renamed over it, and only if nobody changed it meanwhile (E_CONFLICT). The old
 * relay's origin leaves the private destinations when this config had added it; the new one joins if literal.
 * Returns the new configuration; the schema refuses a relay the profile does not allow.
 */
export function switchRelay(home: DropHome, relayUrl: string): NodeConfig {
  return locked(home, () => {
    const before = readFileSync(join(home.root, 'config.json'), 'utf8');
    const config = NodeConfigSchema.parse(JSON.parse(before));
    const network = config.network
      ? PrivateNetworkSchema.parse({
          origins: [
            ...new Set([
              ...config.network.origins.filter((origin) => !literalOrigin(config.relayUrl).includes(origin)),
              ...literalOrigin(relayUrl),
            ]),
          ],
        })
      : undefined;
    const next = NodeConfigSchema.parse({ ...config, relayUrl, ...(network ? { network } : {}) });
    replace(home, before, `${JSON.stringify(next, null, 2)}\n`);
    return next;
  });
}

const MigrationSchema = z.strictObject({ before: z.string(), after: z.string() });
const recordName = 'private-migration.json';

function locked<T>(home: DropHome, action: () => T): T {
  const lock = join(home.root, '.private-migration.lock');
  let fd: number;
  try {
    fd = openSync(lock, 'wx', 0o600);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST')
      throw new Error(
        'E_LOCKED private migration: check the recorded PID; after confirming it stopped, remove .private-migration.lock and retry rollback-private',
        { cause: error },
      );
    throw error;
  }
  writeFileSync(fd, `${JSON.stringify({ pid: process.pid })}\n`);
  try {
    return action();
  } finally {
    closeSync(fd);
    rmSync(lock);
  }
}

function replace(home: DropHome, expected: string, content: string): void {
  const config = join(home.root, 'config.json');
  const temp = join(home.root, `.config-${randomUUID()}.tmp`);
  try {
    writeFileSync(temp, content, { flag: 'wx', mode: 0o600 });
    if (readFileSync(config, 'utf8') !== expected) throw new Error('E_CONFLICT configuration changed');
    renameSync(temp, config);
  } finally {
    rmSync(temp, { force: true });
  }
}

/** Offline operation: stop the daemon first. Only config.json is replaced; all other home data stays intact. */
export function migratePrivate(home: DropHome, relayUrl: string, network?: PrivateNetwork): void {
  locked(home, () => {
    const before = readFileSync(join(home.root, 'config.json'), 'utf8');
    const raw: unknown = JSON.parse(before);
    // A file written before profiles existed is a legacy one: read it so, since the schema now defaults to private.
    const config = NodeConfigSchema.parse(
      typeof raw === 'object' && raw !== null && !('profile' in raw) ? { ...raw, profile: 'legacy' } : raw,
    );
    if (config.profile === 'private') throw new Error('E_CONFLICT already private');
    const after = `${JSON.stringify(privateConfig(relayUrl, config.ownerKind, config.apiPort, network), null, 2)}\n`;
    writeFileSync(join(home.root, recordName), `${JSON.stringify({ before, after })}\n`, { mode: 0o600, flag: 'wx' });
    replace(home, before, after);
  });
}

export function rollbackPrivate(home: DropHome): void {
  locked(home, () => {
    const record = MigrationSchema.parse(JSON.parse(readFileSync(join(home.root, recordName), 'utf8')));
    const current = readFileSync(join(home.root, 'config.json'), 'utf8');
    if (current !== record.before) replace(home, record.after, record.before);
    rmSync(join(home.root, recordName));
  });
}
