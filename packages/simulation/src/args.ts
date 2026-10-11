/** Flags of `simulation run` (T4.1), checked before any process starts. */
import type { PlanOptions } from './plan.ts';
import type { Report } from './report.ts';

export interface RunFlags {
  nodes: string;
  owners: string;
  requests: string;
  duration: string;
  seed: string;
  allow: string;
  deny: string;
  'not-now': string;
}

function argError(flag: string, value: string, expected: string): Error {
  return new Error(`E_SIM_ARGS --${flag} ${JSON.stringify(value)}: ${expected}`);
}

/** A whole number at least `min`; Number('') is 0 and Number('x') is NaN, so both are checked here. */
function integer(flag: string, value: string, min: number): number {
  const number = value.trim() === '' ? Number.NaN : Number(value);
  if (!Number.isSafeInteger(number) || number < min) throw argError(flag, value, `whole number from ${String(min)}`);
  return number;
}

function share(flag: string, value: string): number {
  const number = value.trim() === '' ? Number.NaN : Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) throw argError(flag, value, 'share between 0 and 1');
  return number;
}

/** Every numeric flag, checked: NaN fails no `<` comparison, so it would pass the campaign's own guards. */
export function parseRunOptions(flags: RunFlags): PlanOptions {
  const duration = flags.duration.trim() === '' ? Number.NaN : Number(flags.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw argError('duration', flags.duration, 'seconds above 0');
  return {
    nodes: integer('nodes', flags.nodes, 2),
    owners: integer('owners', flags.owners, 1),
    requestsPerRequester: integer('requests', flags.requests, 1),
    durationMs: duration * 1000,
    seed: integer('seed', flags.seed, 0),
    policy: {
      allow: share('allow', flags.allow),
      deny: share('deny', flags.deny),
      notNow: share('not-now', flags['not-now']),
    },
  };
}

/**
 * 1 on a leak, and when no request settled other than as a bench error (E_SIM_*): such a campaign measured nothing.
 * 0 otherwise.
 */
export function campaignExitCode(report: Report): 0 | 1 {
  if (report.leaks > 0) return 1;
  const settled = Object.values(report.totals).reduce((sum, count) => sum + count, 0);
  if (settled === 0 || report.totals.error === settled) return 1;
  return 0;
}
