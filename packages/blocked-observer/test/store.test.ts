import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LightStore } from '../src/light.ts';
import { handleHookInput, ObserverStore, reportFromDays, type ObservedEvent } from '../src/index.ts';

const CLI = resolve(import.meta.dirname, '..', 'src', 'cli.ts');

function freshStore(): ObserverStore {
  return new ObserverStore(mkdtempSync(join(tmpdir(), 'blocked-observer-')));
}

function event(id: string, extra: Partial<ObservedEvent> = {}): ObservedEvent {
  return { id, ts: '2026-10-08T10:00:00Z', source: 'report', agent: 'codex', resource: 'repo', ...extra };
}

function cli(store: ObserverStore, args: string[], input = '') {
  return spawnSync(process.execPath, [CLI, ...args], {
    input,
    env: { ...process.env, BLOCKED_OBSERVER_HOME: store.root, BLOCKED_OBSERVER_NO_CODEX: '1' },
    encoding: 'utf8',
  });
}

describe('a damaged events.jsonl (B3)', () => {
  it('skips a torn line, counts it and logs W_EVENTS_INVALID instead of crashing', () => {
    const store = freshStore();
    store.append(event('evt1aaaa'));
    appendFileSync(store.eventsPath, '{"id":"torn","ts":"2026-10-0\n');
    store.append(event('evt2bbbb'));
    expect(store.events().map((stored) => stored.id)).toEqual(['evt1aaaa', 'evt2bbbb']);
    expect(store.skippedLines).toBe(1);
    expect(readFileSync(join(store.root, 'errors.log'), 'utf8')).toContain('W_EVENTS_INVALID');
  });

  it('list, report and classify still run and warn on stderr with the stable code', () => {
    const store = freshStore();
    store.append(event('evt1aaaa'));
    appendFileSync(store.eventsPath, 'not json at all\n');
    const list = cli(store, ['list']);
    expect(list.status, list.stderr).toBe(0);
    expect(list.stdout).toContain('evt1aaaa');
    expect(list.stderr).toContain('W_EVENTS_INVALID');
    const report = cli(store, ['report']);
    expect(report.status, report.stderr).toBe(0);
    expect(report.stderr).toContain('W_EVENTS_INVALID');
    const classify = cli(store, ['classify', 'evt1'], 'n\n\n');
    expect(classify.status, classify.stderr).toBe(0);
    expect(classify.stdout).toContain('NOT_A_BLOCK, saved');
  });
});

describe('rewrites that cannot lose data (B4)', () => {
  it('replaces events.jsonl by an atomic rename and leaves no temporary file', () => {
    const store = freshStore();
    store.append(event('evt1aaaa'));
    const before = statSync(store.eventsPath).ino;
    store.replaceEvents([event('evt1aaaa', { classification: 'NOT_A_BLOCK' })]);
    // A new inode: the old file was never truncated in place, a reader sees either version whole.
    expect(statSync(store.eventsPath).ino).not.toBe(before);
    expect(store.events()[0]?.classification).toBe('NOT_A_BLOCK');
    expect(readdirSync(store.root).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('refuses to overwrite an unreadable activity.json, with E_ACTIVITY_CORRUPT, and the hook still records', () => {
    const store = freshStore();
    const path = join(store.root, 'activity.json');
    writeFileSync(path, '{"2026-10-08":{"claude":["s1"]');
    const light = new LightStore(store.root);
    light.touch('2026-10-09', 'claude', 's2');
    expect(readFileSync(path, 'utf8')).toBe('{"2026-10-08":{"claude":["s1"]');
    expect(readFileSync(join(store.root, 'errors.log'), 'utf8')).toContain('E_ACTIVITY_CORRUPT');
    expect(() => store.activity()).toThrow(/E_ACTIVITY_CORRUPT/);
    expect(() => {
      store.touch('2026-10-09', 'codex', 's3');
    }).toThrow(/E_ACTIVITY_CORRUPT/);
    expect(readFileSync(path, 'utf8')).toBe('{"2026-10-08":{"claude":["s1"]');
    const outcome = handleHookInput(
      JSON.stringify({
        hook_event_name: 'PostToolUseFailure',
        session_id: 's2',
        tool_name: 'Bash',
        tool_input: { command: 'curl https://api.example' },
        error: 'HTTP/1.1 401 Unauthorized',
      }),
      light,
    );
    expect(outcome.recorded).toBe(true);
  });

  it('writes activity.json by rename too, keeping what was there', () => {
    const store = freshStore();
    const light = new LightStore(store.root);
    light.touch('2026-10-08', 'claude', 's1');
    store.touch('2026-10-08', 'codex', 'c1');
    light.touch('2026-10-08', 'claude', 's2');
    expect(store.activity()).toEqual({ '2026-10-08': { claude: ['s1', 's2'], codex: ['c1'] } });
    expect(readdirSync(store.root).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});

describe('minutes lost during classify (B5)', () => {
  const yesPath = 'o\no\nn\nn\n3\n';

  it('an empty answer stores no pain_minutes instead of 0', () => {
    const store = freshStore();
    store.append(event('evt12345'));
    const run = cli(store, ['classify', 'evt1'], `${yesPath}\nune note\n`);
    expect(run.stdout).toContain('YES_LOCAL_CONTEXT, saved');
    const [stored] = store.events();
    expect(stored?.classification).toBe('YES_LOCAL_CONTEXT');
    expect(stored?.pain_minutes).toBeUndefined();
    expect(stored?.note).toBe('une note');
  });

  it('asks again after an answer that is not a number of minutes', () => {
    const store = freshStore();
    store.append(event('evt12345'));
    const run = cli(store, ['classify', 'evt1'], `${yesPath}douze\n-3\n12\n\n`);
    expect(run.stdout).toContain('YES_LOCAL_CONTEXT, saved');
    expect(store.events()[0]?.pain_minutes).toBe(12);
  });

  it('the median of D24 leaves out the YES blocks whose minutes are unknown', () => {
    const yes = (id: string, minutes?: number): ObservedEvent =>
      event(id, { classification: 'YES_LOCAL_CONTEXT', ...(minutes === undefined ? {} : { pain_minutes: minutes }) });
    const report = reportFromDays([yes('a', 10), yes('b', 20), yes('c'), yes('d')], 10);
    expect(report.yesBlocks).toBe(4);
    expect(report.medianPainMinutesYes).toBe(15);
  });
});
