import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCodexSessions } from '../src/codex.ts';
import { commandsIn, isReadOnlyCommand } from '../src/noise.ts';

/**
 * T4.26: CodeQL `js/polynomial-redos` alerts 2 and 3. Each input is the shape CodeQL named; the former regular
 * expressions took seconds on it. The bound is loose so a slow CI machine never fails it, and a quadratic scan does.
 */
const LONG = 100_000;
const BOUND_MS = 1_500;

function fast<T>(work: () => T): T {
  const started = performance.now();
  const result = work();
  expect(performance.now() - started).toBeLessThan(BOUND_MS);
  return result;
}

describe('noise filter in linear time (T4.26)', () => {
  it('drops heredoc bodies as before, and stays linear on unterminated heredocs', () => {
    // The body is data for cat, not a command: without it the command only writes and reads a local file.
    expect(isReadOnlyCommand("cat > notes.md <<'EOF'\ncurl https://api.example.com\nEOF\ncat notes.md")).toBe(true);
    expect(isReadOnlyCommand('cat <<-"END"\n\tcurl x\n\tEND\ngit status')).toBe(true);
    expect(isReadOnlyCommand('cat << EOF\nrm -rf x\n\nEOF')).toBe(true);
    // Unterminated, or closed on the line right after the header: nothing is dropped, the body counts as commands.
    expect(isReadOnlyCommand('cat <<EOF\ncurl https://api.example.com')).toBe(false);
    expect(isReadOnlyCommand('cat <<EOF\nEOF\ncurl x')).toBe(false);
    // The terminator is a whole word: EOFX does not close EOF.
    expect(isReadOnlyCommand('cat <<EOF\nx\nEOFX\ncurl x')).toBe(false);
    fast(() => isReadOnlyCommand(`<<0${'00'.repeat(LONG)}`));
    fast(() => isReadOnlyCommand('<<0\n'.repeat(LONG)));
    fast(() => isReadOnlyCommand(`<<0\n\n${'\n'.repeat(LONG)}`));
  });

  it('finds shell commands in JSON arguments as before, and stays linear on repeated command arrays', () => {
    expect(commandsIn('{"command":["bash","-lc","ls -la \\"x\\""]}')).toEqual(['ls -la "x"']);
    expect(commandsIn('{"command": ["zsh", "-c", "cat a"], "other": {"command":["sh","x"]}}')).toEqual(['cat a']);
    expect(commandsIn('{"cmd":"cat x"} {"command":["bash","-lc","git log"]}')).toEqual(['cat x', 'git log']);
    // The flag must sit inside the brackets; the command string itself may run past them.
    expect(commandsIn('{"command":["bash"], "-lc", "x"}')).toEqual([]);
    expect(commandsIn('{"command":["bash","-c","a]b"]}')).toEqual(['a]b']);
    // An unterminated command string yields nothing.
    expect(commandsIn('{"command":["bash","-lc","open')).toEqual([]);
    fast(() => commandsIn('"command":['.repeat(LONG)));
    fast(() => commandsIn(`"command":[${'"-lc","\\"'.repeat(LONG)}`));
  });
});

describe('Codex sessions read through one descriptor (T4.26)', () => {
  it('reads a log modified since the cut-off and skips an older one, as before', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-sessions-'));
    const line = (record: unknown) => `${JSON.stringify(record)}\n`;
    const content =
      line({ type: 'session_meta', timestamp: '2026-10-12T10:00:00Z', payload: { id: 's1' } }) +
      line({ type: 'response_item', payload: { type: 'function_call', call_id: 'c1', name: 'shell' } });
    writeFileSync(join(dir, 'new.jsonl'), content);
    writeFileSync(join(dir, 'old.jsonl'), content);
    const old = new Date('2026-01-01T00:00:00Z');
    utimesSync(join(dir, 'old.jsonl'), old, old);
    const cutoff = new Date('2026-06-01T00:00:00Z').getTime();
    const parsed = parseCodexSessions(dir, cutoff);
    expect(parsed.files).toBe(1);
    expect(parsed.sessions).toEqual([{ day: '2026-10-12', session: 's1' }]);
  });
});
