import { closeSync, mkdtempSync, readFileSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendOwnerOnly, openOwnerOnly, writeOwnerOnly } from '../src/owner-files.ts';

const mode = (path: string) => statSync(path).mode & 0o777;

describe('campaign files readable by their owner only (T4.26)', () => {
  it.skipIf(process.platform === 'win32')(
    'creates campaign files 0600 and narrows a file left wider by an earlier run',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'drop-sim-owner-'));
      writeOwnerOnly(join(dir, 'plan.json'), '{}\n');
      expect(mode(join(dir, 'plan.json'))).toBe(0o600);
      // A --work-dir reused from an earlier run: its report was world-readable.
      const report = join(dir, 'report.json');
      writeFileSync(report, 'old', { mode: 0o644 });
      writeOwnerOnly(report, 'new');
      expect(mode(report)).toBe(0o600);
      expect(readFileSync(report, 'utf8')).toBe('new');
      const events = join(dir, 'events.jsonl');
      writeFileSync(events, 'a\n', { mode: 0o666 });
      appendOwnerOnly(events, 'b\n');
      expect(mode(events)).toBe(0o600);
      expect(readFileSync(events, 'utf8')).toBe('a\nb\n');
      const fd = openOwnerOnly(join(dir, 'relay.log'), 'a');
      writeSync(fd, 'log\n');
      closeSync(fd);
      expect(mode(join(dir, 'relay.log'))).toBe(0o600);
    },
  );

  it('leaves no file write in the campaign that bypasses the owner-only helpers', () => {
    const source = readFileSync(join(import.meta.dirname, '..', 'src', 'campaign.ts'), 'utf8');
    expect(source).not.toMatch(/\b(?:writeFileSync|appendFileSync|openSync|createWriteStream)\b/);
  });
});
