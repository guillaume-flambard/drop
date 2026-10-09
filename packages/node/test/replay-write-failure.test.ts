import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { uuidv7 } from '@drop/protocol';

vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return {
    ...fs,
    fsyncSync: () => {
      throw Object.assign(new Error('injected fsync failure'), { code: 'EIO' });
    },
  };
});

import { DropHome } from '../src/home.ts';

describe('replay clock write failures', () => {
  it('does not accumulate temporary files when durable writes repeatedly fail', () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-fsync-'));
    try {
      const home = new DropHome(root);
      const now = 1_791_460_000_000;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        expect(() => home.claimDrop(uuidv7(now + attempt), now + attempt)).toThrow('injected fsync failure');
      }
      expect(
        readdirSync(root).filter((name) => name.startsWith('received-drops-clock.') && name.endsWith('.tmp')),
      ).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
