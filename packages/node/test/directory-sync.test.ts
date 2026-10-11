import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { syncDirectory } from '../src/home.ts';

describe('directory flush of the private stores (T3.1e)', () => {
  it('flushes a directory on macOS and Linux, and skips only that call on Windows, which cannot flush one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drop-sync-'));
    const missing = join(dir, 'missing');
    // POSIX opens the directory to flush it, so a missing one fails instead of passing silently.
    expect(() => {
      syncDirectory(missing, 'darwin');
    }).toThrow(/ENOENT/);
    expect(() => {
      syncDirectory(missing, 'linux');
    }).toThrow(/ENOENT/);
    // Windows refuses FlushFileBuffers on a directory handle (EPERM): the call is skipped, never retried or faked.
    expect(() => {
      syncDirectory(missing, 'win32');
    }).not.toThrow();
    try {
      expect(() => {
        syncDirectory(dir);
      }).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
