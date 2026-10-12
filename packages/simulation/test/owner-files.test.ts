import {
  chmodSync,
  closeSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendOwnerOnly, openOwnerOnly, ownerOnlyDir, writeOwnerOnly } from '../src/owner-files.ts';

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
    expect(source).not.toMatch(/\b(?:writeFileSync|appendFileSync|openSync|createWriteStream|mkdirSync)\b/);
  });
});

/** Plants a symbolic link, or says the system will not let this user create one (Windows without Developer Mode). */
function plantLink(target: string, path: string, type?: 'dir'): boolean {
  try {
    symlinkSync(target, path, type);
    return true;
  } catch (error) {
    if (process.platform === 'win32' && (error as NodeJS.ErrnoException).code === 'EPERM') return false;
    throw error;
  }
}

describe('campaign writes never follow a planted link (T4.42)', () => {
  it('refuses to write through a link or a second hard link planted in place of a campaign file, and leaves its target untouched', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drop-sim-link-'));
    const elsewhere = mkdtempSync(join(tmpdir(), 'drop-sim-victim-'));
    const victim = join(elsewhere, 'victim.txt');
    writeFileSync(victim, 'keep me', { mode: 0o644 });
    const before = statSync(victim).mode;
    if (plantLink(victim, join(dir, 'report.json'))) {
      expect(() => {
        writeOwnerOnly(join(dir, 'report.json'), 'overwritten');
      }).toThrow('E_SIM_FILE');
      expect(() => {
        appendOwnerOnly(join(dir, 'report.json'), 'appended');
      }).toThrow('E_SIM_FILE');
      expect(() => openOwnerOnly(join(dir, 'report.json'), 'a')).toThrow('E_SIM_FILE');
    }
    // A hard link is the same file under a second name: following it would truncate the victim just as well.
    linkSync(victim, join(dir, 'events.jsonl'));
    expect(() => {
      writeOwnerOnly(join(dir, 'events.jsonl'), 'overwritten');
    }).toThrow('E_SIM_FILE');
    expect(() => {
      appendOwnerOnly(join(dir, 'events.jsonl'), 'appended');
    }).toThrow('E_SIM_FILE');
    expect(readFileSync(victim, 'utf8')).toBe('keep me');
    expect(statSync(victim).mode).toBe(before);
    // A directory in place of a file is refused too, and a plain file is still written.
    mkdirSync(join(dir, 'plan.json'));
    expect(() => {
      writeOwnerOnly(join(dir, 'plan.json'), '{}');
    }).toThrow('E_SIM_FILE');
    writeOwnerOnly(join(dir, 'report.md'), 'ok');
    expect(readFileSync(join(dir, 'report.md'), 'utf8')).toBe('ok');
  });

  it('keeps every bench directory a real directory of its owner, closed to others, and refuses a planted link', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'drop-sim-dir-')), 'work');
    ownerOnlyDir(dir);
    expect(statSync(dir).isDirectory()).toBe(true);
    const elsewhere = mkdtempSync(join(tmpdir(), 'drop-sim-victim-dir-'));
    if (plantLink(elsewhere, join(dir, 'node-0'), 'dir')) {
      expect(() => {
        ownerOnlyDir(join(dir, 'node-0'));
      }).toThrow('E_SIM_WORK_DIR');
      expect(readdirSync(elsewhere)).toEqual([]);
    }
    if (process.platform !== 'win32') {
      expect(mode(dir)).toBe(0o700);
      // A shared directory reused as --work-dir: others could plant entries in it until it is narrowed.
      const shared = join(dir, 'shared');
      mkdirSync(shared);
      chmodSync(shared, 0o777);
      ownerOnlyDir(shared);
      expect(mode(shared)).toBe(0o700);
      // A directory that belongs to someone else (root here) is never adopted.
      if (process.getuid?.() !== 0)
        expect(() => {
          ownerOnlyDir('/');
        }).toThrow('E_SIM_WORK_DIR');
    }
  });
});
