import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classifiedOnly,
  exportPayload,
  mergeExports,
  parseExport,
  type ExportPayload,
  type ObservedEvent,
} from '../src/index.ts';

const CLI = resolve(import.meta.dirname, '..', 'src', 'cli.ts');

function days(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `2026-10-${String(index + 1).padStart(2, '0')}`);
}

function yes(id: string, minutes: number): ObservedEvent {
  return {
    id,
    ts: '2026-10-02T10:00:00Z',
    source: 'report',
    agent: 'claude_code',
    classification: 'YES_LOCAL_CONTEXT',
    pain_minutes: minutes,
  };
}

function noBlock(id: string): ObservedEvent {
  return { id, ts: '2026-10-02T10:00:00Z', source: 'hook_claude', agent: 'claude_code', classification: 'NOT_A_BLOCK' };
}

function payload(activeDays: number, events: ObservedEvent[]): ExportPayload {
  return { format: 'blocked-observer-export', version: 1, activeDays: days(activeDays), events };
}

describe('report --merge (T0.6)', () => {
  it('adds developer-days and pools events across developers', () => {
    const merged = mergeExports([
      { name: 'guillaume', payload: payload(10, [yes('g1', 20), yes('g2', 10), noBlock('g3')]) },
      { name: 'ana', payload: payload(12, [yes('a1', 15), noBlock('a2')]) },
      { name: 'yan', payload: payload(10, [yes('y1', 30), yes('y2', 12), yes('y3', 8)]) },
    ]);
    expect(merged.developers).toEqual([
      { name: 'guillaume', activeDays: 10, events: 3, yesBlocks: 2 },
      { name: 'ana', activeDays: 12, events: 2, yesBlocks: 1 },
      { name: 'yan', activeDays: 10, events: 3, yesBlocks: 3 },
    ]);
    expect(merged.total.activeDays).toBe(32);
    expect(merged.total.yesBlocks).toBe(6);
    expect(merged.total.yesPerActiveDay).toBe(0.19);
    expect(merged.total.medianPainMinutesYes).toBe(13.5);
    expect(merged.sample).toEqual({ developers: 3, minActiveDays: 10, sufficient: true });
    expect(merged.verdict).toBe('NO_GO');
  });

  it('says GO above both thresholds, EXTEND between them', () => {
    const many = (prefix: string, count: number, minutes: number) =>
      Array.from({ length: count }, (_, i) => yes(`${prefix}${String(i)}`, minutes));
    const go = mergeExports(['a', 'b', 'c'].map((name) => ({ name, payload: payload(10, many(name, 6, 12)) })));
    expect(go.total.yesPerActiveDay).toBe(0.6);
    expect(go.verdict).toBe('GO');
    const extend = mergeExports(['a', 'b', 'c'].map((name) => ({ name, payload: payload(10, many(name, 3, 12)) })));
    expect(extend.total.yesPerActiveDay).toBe(0.3);
    expect(extend.verdict).toBe('EXTEND');
    const shortMedian = mergeExports(['a', 'b', 'c'].map((name) => ({ name, payload: payload(10, many(name, 6, 4)) })));
    expect(shortMedian.verdict).toBe('NO_GO');
  });

  it('refuses to conclude on too small a sample', () => {
    const tooFew = mergeExports([{ name: 'guillaume', payload: payload(30, [yes('g1', 30)]) }]);
    expect(tooFew.verdict).toBe('INSUFFICIENT_SAMPLE');
    const tooShort = mergeExports(
      ['a', 'b', 'c'].map((name) => ({ name, payload: payload(name === 'c' ? 9 : 10, [yes(name, 30)]) })),
    );
    expect(tooShort.sample).toMatchObject({ minActiveDays: 9, sufficient: false });
    expect(tooShort.verdict).toBe('INSUFFICIENT_SAMPLE');
  });

  it('exports active days as dates only, never session ids', () => {
    const out = exportPayload([yes('g1', 5)], {
      '2026-10-01': { claude: ['secret-session-1'], codex: [] },
      '2026-10-02': { claude: [], codex: ['cs-9'] },
    });
    expect(out.activeDays).toEqual(['2026-10-01', '2026-10-02']);
    expect(JSON.stringify(out)).not.toContain('secret-session-1');
    expect(parseExport(JSON.parse(JSON.stringify(out)))).toEqual(out);
  });

  it('classified-only export drops unclassified events without moving the verdict', () => {
    const unclassified: ObservedEvent = {
      id: 'u1',
      ts: '2026-10-02T10:00:00Z',
      source: 'hook_claude',
      agent: 'claude_code',
    };
    const events = [yes('g1', 20), unclassified, noBlock('g2')];
    expect(classifiedOnly(events).map((event) => event.id)).toEqual(['g1', 'g2']);
    const full = mergeExports(['a', 'b', 'c'].map((name) => ({ name, payload: payload(10, events) })));
    const kept = mergeExports(['a', 'b', 'c'].map((name) => ({ name, payload: payload(10, classifiedOnly(events)) })));
    expect(kept.total.yesPerActiveDay).toBe(full.total.yesPerActiveDay);
    expect(kept.total.medianPainMinutesYes).toBe(full.total.medianPainMinutesYes);
    expect(kept.verdict).toBe(full.verdict);
  });

  it('rejects the old export format, a bare array without active days', () => {
    expect(() => parseExport([yes('g1', 5)])).toThrow(/re-export/);
  });

  it('the CLI merges export files and prints the verdict', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bo-merge-'));
    const files = ['a', 'b', 'c'].map((name) => {
      const file = join(dir, `${name}.json`);
      writeFileSync(
        file,
        JSON.stringify(
          payload(
            10,
            Array.from({ length: 6 }, (_, i) => yes(`${name}${String(i)}`, 12)),
          ),
        ),
      );
      return file;
    });
    const run = spawnSync(process.execPath, [CLI, 'report', '--merge', ...files], {
      encoding: 'utf8',
      env: { ...process.env, BLOCKED_OBSERVER_HOME: dir },
    });
    expect(run.status, run.stderr).toBe(0);
    const merged = JSON.parse(run.stdout) as { verdict: string; developers: { name: string }[] };
    expect(merged.verdict).toBe('GO');
    expect(merged.developers.map((developer) => developer.name)).toEqual(['a', 'b', 'c']);
  });
});
