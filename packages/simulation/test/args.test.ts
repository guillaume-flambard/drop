import { describe, expect, it } from 'vitest';
import { campaignExitCode, parseRunOptions, type RunFlags } from '../src/args.ts';
import { summarize } from '../src/report.ts';

const DEFAULTS: RunFlags = {
  nodes: '50',
  owners: '10',
  requests: '4',
  duration: '180',
  seed: '1',
  allow: '0.8',
  deny: '0.1',
  'not-now': '0.1',
};

describe('simulation flags (B10)', () => {
  it('turns the default flags into campaign options', () => {
    expect(parseRunOptions(DEFAULTS)).toEqual({
      nodes: 50,
      owners: 10,
      requestsPerRequester: 4,
      durationMs: 180_000,
      seed: 1,
      policy: { allow: 0.8, deny: 0.1, notNow: 0.1 },
    });
  });

  it('refuses a flag that is not a number instead of letting NaN through the guards', () => {
    for (const [flag, value] of [
      ['nodes', 'abc'],
      ['nodes', ''],
      ['nodes', '2.5'],
      ['owners', 'NaN'],
      ['requests', '-1'],
      ['duration', 'Infinity'],
      ['duration', '0'],
      ['seed', '1e400'],
      ['allow', 'x'],
      ['deny', '-0.1'],
      ['not-now', '1.5'],
    ] as const) {
      expect(() => parseRunOptions({ ...DEFAULTS, [flag]: value }), `${flag}=${value}`).toThrow(/E_SIM_ARGS/);
    }
  });
});

describe('simulation exit code (B10)', () => {
  const base = { campaign: 'c', seed: 1, nodes: 3, owners: 1, durationMs: 1000, memory: [], leaks: 0 };

  it('is 0 when requests settled without leak, 1 on a leak', () => {
    const settled = summarize({
      ...base,
      outcomes: [
        { outcome: 'delivered', ms: 5 },
        { outcome: 'error', ms: 0 },
      ],
    });
    expect(campaignExitCode(settled)).toBe(0);
    expect(campaignExitCode({ ...settled, leaks: 1 })).toBe(1);
  });

  it('is 1 when every request errored, or when none settled', () => {
    const allErrors = summarize({
      ...base,
      outcomes: [
        { outcome: 'error', ms: 0, code: 'E_SIM_HTTP' },
        { outcome: 'error', ms: 0, code: 'E_SIM_TIMEOUT' },
      ],
    });
    expect(campaignExitCode(allErrors)).toBe(1);
    expect(campaignExitCode(summarize({ ...base, outcomes: [] }))).toBe(1);
  });
});
