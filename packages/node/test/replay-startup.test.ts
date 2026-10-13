import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateIdentity, uuidv7 } from '@drop/protocol';
import { startDaemon } from '../src/daemon.ts';
import { DEFAULT_RELAY_URL, DropHome } from '../src/home.ts';
import { privateConfig } from '../src/private-config.ts';

const roots: string[] = [];
const daemons: Array<{ stop(): Promise<void> }> = [];
afterEach(async () => {
  for (const daemon of daemons.splice(0).reverse()) await daemon.stop();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function fresh(): Promise<DropHome> {
  const root = mkdtempSync(join(tmpdir(), 'drop-replay-inspect-'));
  roots.push(root);
  const home = new DropHome(join(root, '.drop'));
  home.init(await generateIdentity('Owner'), privateConfig(DEFAULT_RELAY_URL, 'human', 0));
  return home;
}

const snapshot = (home: DropHome): Record<string, string | null> => {
  const result: Record<string, string | null> = {};
  for (const name of [
    'received-drops-clock',
    'received-drops-version',
    'received-drops-integrity',
    'received-drops-migrating',
  ])
    result[name] = existsSync(join(home.root, name)) ? readFileSync(join(home.root, name), 'utf8') : null;
  result['received-drops'] = existsSync(join(home.root, 'received-drops'))
    ? readdirSync(join(home.root, 'received-drops')).sort().join('\n')
    : null;
  return result;
};

describe('read-only replay integrity probe at startup (T3.1d)', () => {
  it('does not create any replay files for a never-used home', async () => {
    const home = await fresh();
    const before = snapshot(home);
    expect(home.inspectReplayStore()).toBe('uninitialized');
    expect(snapshot(home)).toEqual(before);
    expect(existsSync(join(home.root, 'received-drops.lock'))).toBe(false);
  });

  it('accepts a healthy durable v2 store, ignores foreign files and never writes or creates a lock', async () => {
    const home = await fresh();
    const now = Date.now();
    expect(home.claimDrop(uuidv7(now), now)).toBe('claimed');
    writeFileSync(join(home.root, 'received-drops', '.DS_Store'), 'ignored');
    const before = snapshot(home);
    expect(home.inspectReplayStore()).toBe('healthy');
    expect(home.inspectReplayStore()).toBe('healthy');
    expect(snapshot(home)).toEqual(before);
    expect(existsSync(join(home.root, 'received-drops.lock'))).toBe(false);
  });

  it('detects missing or malformed clock, version, integrity and marker set without repairing any of them', async () => {
    const cases: Array<(home: DropHome) => void> = [
      (home) => {
        writeFileSync(join(home.root, 'received-drops-clock'), 'broken');
      },
      (home) => {
        rmSync(join(home.root, 'received-drops-clock'));
      },
      (home) => {
        writeFileSync(join(home.root, 'received-drops-version'), 'unexpected\n');
      },
      (home) => {
        rmSync(join(home.root, 'received-drops-version'));
      },
      (home) => {
        rmSync(join(home.root, 'received-drops-integrity'));
      },
      (home) => {
        writeFileSync(join(home.root, 'received-drops-integrity'), 'incorrect digest\n');
      },
      (home) => {
        rmSync(join(home.root, 'received-drops'), { recursive: true });
      },
      (home) => mkdirSync(join(home.root, 'received-drops', uuidv7(Date.now())), { recursive: true }),
    ];
    for (const mutate of cases) {
      const home = await fresh();
      const now = Date.now();
      expect(home.claimDrop(uuidv7(now), now)).toBe('claimed');
      mutate(home);
      const before = snapshot(home);
      expect(home.inspectReplayStore()).toBe('corrupt');
      expect(snapshot(home)).toEqual(before);
      expect(existsSync(join(home.root, 'received-drops.lock'))).toBe(false);
    }
  });

  it('does not confuse an old v1 store or resumable migration with proven corruption', async () => {
    const legacy = await fresh();
    const now = Date.now();
    expect(legacy.claimDrop(uuidv7(now), now)).toBe('claimed');
    writeFileSync(join(legacy.root, 'received-drops-version'), '1\n');
    rmSync(join(legacy.root, 'received-drops-integrity'));
    const before = snapshot(legacy);
    expect(legacy.inspectReplayStore()).toBe('healthy');
    expect(snapshot(legacy)).toEqual(before);

    const migration = await fresh();
    writeFileSync(join(migration.root, 'received-drops-migrating'), '');
    writeFileSync(join(migration.root, 'received-drops-clock'), String(now));
    const incomplete = snapshot(migration);
    expect(migration.inspectReplayStore()).toBe('deferred');
    expect(snapshot(migration)).toEqual(incomplete);
  });

  it('defers if a foreign process holds the admission lock without touching that lock', async () => {
    const home = await fresh();
    const now = Date.now();
    expect(home.claimDrop(uuidv7(now), now)).toBe('claimed');
    const lock = join(home.root, 'received-drops.lock');
    mkdirSync(lock);
    writeFileSync(join(lock, 'owner'), 'different process and nonce\n');
    const before = snapshot(home);
    expect(home.inspectReplayStore()).toBe('deferred');
    expect(readFileSync(join(lock, 'owner'), 'utf8')).toBe('different process and nonce\n');
    expect(snapshot(home)).toEqual(before);
  });

  it('reports existing corruption on authenticated owner status before any new request', async () => {
    const home = await fresh();
    const now = Date.now();
    expect(home.claimDrop(uuidv7(now), now)).toBe('claimed');
    writeFileSync(join(home.root, 'received-drops-clock'), 'bad clock');
    const before = snapshot(home);
    const logs: string[] = [];
    const daemon = await startDaemon(home, { apiPort: 0, notifications: false, log: (line) => logs.push(line) });
    daemons.push(daemon);
    expect(daemon.engine.replayStorageAlert()).toBe(true);
    const url = `http://127.0.0.1:${String(daemon.api.port)}/ui/admin/status`;
    expect((await fetch(url)).status).toBe(401);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${home.localToken()}` } });
    expect(response.status).toBe(200);
    const result = (await response.json()) as { security?: { replayStorageBlocked: boolean } };
    expect(result.security).toEqual({ replayStorageBlocked: true });
    expect(logs.some((line) => line.includes('replay_startup_corrupt') && line.includes('E_REPLAY_STATE'))).toBe(true);
    expect(snapshot(home)).toEqual(before);
  });
});
