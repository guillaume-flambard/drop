import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REPLAY_WINDOW_MS, uuidv7 } from '@drop/protocol';

/** fsync fails always, or only on the listed calls (1-based), so a test can break one step of a claim. */
const fsyncFault = vi.hoisted(() => ({ always: false, failOn: new Set<number>(), calls: 0 }));

vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return {
    ...fs,
    fsyncSync: (fd: number) => {
      fsyncFault.calls += 1;
      if (fsyncFault.always || fsyncFault.failOn.has(fsyncFault.calls))
        throw Object.assign(new Error('injected fsync failure'), { code: 'EIO' });
      fs.fsyncSync(fd);
    },
  };
});

import { DropHome } from '../src/home.ts';

const NOW = 1_791_460_000_000;
const WINDOWS = process.platform === 'win32';
/** Windows skips folder syncs (syncDirectory), so the digest's file sync comes third there. */
const DIGEST_FILE_SYNC = WINDOWS ? 3 : 5;
/**
 * Syncs made by one claim that prunes expired markers: clock, digest, pruned folder, marker, digest, each file sync
 * followed by its folder sync except on Windows, which keeps only the four file syncs.
 */
const PRUNING_CLAIM_SYNCS = WINDOWS ? 4 : 9;
/** Syncs made by the first claim on a fresh home: journal, clock, digest, version, journal removal, marker, digest. */
const FIRST_CLAIM_SYNCS = WINDOWS ? 6 : 13;
/**
 * Every test here makes real durable writes, and Windows flushes each file to disk (FlushFileBuffers). On a loaded
 * Windows runner the loops below took up to 8.2 s against a 5 s default (T4.34). The tests are synchronous, so vitest
 * cannot stop them early: the timeout only judges the duration once they end, and a hang is not caught either way.
 */
const DURABLE_WRITE_TIMEOUT_MS = 20_000;

afterEach(() => {
  fsyncFault.always = false;
  fsyncFault.failOn.clear();
  fsyncFault.calls = 0;
});

describe('replay clock write failures', { timeout: DURABLE_WRITE_TIMEOUT_MS }, () => {
  it('does not accumulate temporary files when durable writes repeatedly fail', () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-fsync-'));
    fsyncFault.always = true;
    try {
      const home = new DropHome(root);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        expect(() => home.claimDrop(uuidv7(NOW + attempt), NOW + attempt)).toThrow('injected fsync failure');
      }
      expect(
        readdirSync(root).filter((name) => name.startsWith('received-drops-clock.') && name.endsWith('.tmp')),
      ).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rolls back a new marker whose durable digest could not be written, so admission keeps working', () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-rollback-'));
    try {
      const home = new DropHome(root);
      expect(home.claimDrop(uuidv7(NOW), NOW)).toBe('claimed');
      // A claim on a migrated home: clock (file, folder), marker (file, folder), digest (file, folder). Break the
      // digest's file sync, after the marker exists.
      fsyncFault.calls = 0;
      fsyncFault.failOn.add(DIGEST_FILE_SYNC);
      const refused = uuidv7(NOW + 1);
      expect(() => home.claimDrop(refused, NOW + 1)).toThrow('injected fsync failure');
      expect(existsSync(join(root, 'received-drops', refused))).toBe(false);
      fsyncFault.failOn.clear();
      // A transient I/O error never bricks the store: the next request is admitted, the refused one was never consented.
      expect(home.claimDrop(uuidv7(NOW + 2), NOW + 2)).toBe('claimed');
      expect(home.claimDrop(refused, NOW + 3)).toBe('claimed');
      expect(home.claimDrop(refused, NOW + 4)).toBe('duplicate');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === 'win32')(
    'keeps a new marker whose digest was already renamed into place when the folder sync fails',
    () => {
      const root = mkdtempSync(join(tmpdir(), 'drop-replay-keep-'));
      try {
        const home = new DropHome(root);
        expect(home.claimDrop(uuidv7(NOW), NOW)).toBe('claimed');
        fsyncFault.calls = 0;
        fsyncFault.failOn.add(6);
        const dropId = uuidv7(NOW + 1);
        expect(() => home.claimDrop(dropId, NOW + 1)).toThrow('injected fsync failure');
        fsyncFault.failOn.clear();
        expect(home.claimDrop(dropId, NOW + 2)).toBe('duplicate');
        expect(home.claimDrop(uuidv7(NOW + 3), NOW + 3)).toBe('claimed');
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  /** After a refused claim, the same id is admitted at most once and another id is admitted. */
  function expectAdmissionRecovered(home: DropHome, refused: string, at: number): void {
    expect(['claimed', 'duplicate']).toContain(home.claimDrop(refused, at));
    expect(home.claimDrop(refused, at + 1)).toBe('duplicate');
    expect(home.claimDrop(uuidv7(at + 2), at + 2)).toBe('claimed');
  }

  function withHome(prefix: string, run: (home: DropHome) => void): void {
    const root = mkdtempSync(join(tmpdir(), prefix));
    try {
      run(new DropHome(root));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  /**
   * Breaks each sync of one claim in turn, on a home brought by `prepare` to the state under test (it returns the time
   * of the claim). The steps are counted on a fault-free claim from the same state, so every sync this platform makes
   * fails once, each refusal is the injected one, and no iteration runs without a fault.
   */
  function expectRecoveryAtEverySyncStep(prefix: string, prepare: (home: DropHome) => number, syncs: number): void {
    withHome(prefix, (home) => {
      const at = prepare(home);
      fsyncFault.calls = 0;
      expect(home.claimDrop(uuidv7(at), at)).toBe('claimed');
      expect(fsyncFault.calls).toBe(syncs);
    });
    for (let step = 1; step <= syncs; step += 1) {
      withHome(prefix, (home) => {
        const at = prepare(home);
        const dropId = uuidv7(at);
        fsyncFault.calls = 0;
        fsyncFault.failOn.add(step);
        expect(() => home.claimDrop(dropId, at), `sync ${String(step)}`).toThrow('injected fsync failure');
        fsyncFault.failOn.clear();
        expectAdmissionRecovered(home, dropId, at + 10);
      });
    }
  }

  it('keeps admitting after a transient sync failure at any step of a claim that prunes expired markers', () => {
    // Each step of the claim in turn: clock, digest, pruned folder, marker. None may leave the store refusing for good.
    expectRecoveryAtEverySyncStep(
      'drop-replay-prune-fault-',
      (home) => {
        expect(home.claimDrop(uuidv7(NOW), NOW)).toBe('claimed');
        expect(home.claimDrop(uuidv7(NOW + 1), NOW + 1)).toBe('claimed');
        return NOW + REPLAY_WINDOW_MS + 60_000;
      },
      PRUNING_CLAIM_SYNCS,
    );
  });

  it('keeps admitting after a transient sync failure at any step of the first claim on a fresh home', () => {
    expectRecoveryAtEverySyncStep('drop-replay-fresh-fault-', () => NOW, FIRST_CLAIM_SYNCS);
  });
});
