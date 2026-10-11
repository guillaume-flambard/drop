import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import { DropError } from '@drop/protocol';
import type { CapabilityImpl, RunContext } from '@drop/runner';
import { z } from 'zod';
import { UPPER_SNAKE_CASE } from './names.ts';

/**
 * production.error_summary: deterministic, no LLM. It reads the configured log source of one service and returns
 * only counts, owner-defined error names and timestamps. No fragment of a log line ever reaches the output.
 */

export const WINDOWS = ['15m', '1h', '6h', '24h'] as const;
export type SummaryWindow = (typeof WINDOWS)[number];

const MINUTE_MS = 60_000;
const WINDOW_MS: Record<SummaryWindow, number> = {
  '15m': 15 * MINUTE_MS,
  '1h': 60 * MINUTE_MS,
  '6h': 6 * 60 * MINUTE_MS,
  '24h': 24 * 60 * MINUTE_MS,
};
/** systemd.time(7) relative form for `journalctl --since`. */
const JOURNALCTL_SINCE: Record<SummaryWindow, string> = { '15m': '-15min', '1h': '-1h', '6h': '-6h', '24h': '-24h' };

export const OTHER_ERROR = 'OTHER';
export const DEFAULT_DEGRADED_THRESHOLD = 50;
const MAX_TOP_ERRORS = 5;
const MAX_LOG_BYTES = 64 * 1024 * 1024;
// A unit or container never starts with '-', so it can never be read as an option by journalctl or docker.
const UNIT_NAME = /^[A-Za-z0-9@_][A-Za-z0-9@._:\\-]*$/;
const CONTAINER_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

function compiles(source: string): boolean {
  try {
    return new RegExp(source) instanceof RegExp;
  } catch {
    return false;
  }
}

const RegexSourceSchema = z.string().min(1).refine(compiles, 'invalid regular expression');

export const LogSourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('journald'), unit: z.string().max(256).regex(UNIT_NAME) }),
  z.strictObject({ kind: z.literal('file'), path: z.string().min(1).refine(isAbsolute, 'absolute path required') }),
  z.strictObject({ kind: z.literal('docker'), container: z.string().max(256).regex(CONTAINER_NAME) }),
]);
export type LogSource = z.infer<typeof LogSourceSchema>;

export const ErrorSummaryConfigSchema = z.strictObject({
  services: z.record(z.string().min(1), z.strictObject({ source: LogSourceSchema })),
  errorPatterns: z
    .array(
      z.strictObject({
        name: z
          .string()
          .max(64)
          .regex(UPPER_SNAKE_CASE, 'UPPER_SNAKE_CASE')
          .refine((name) => name !== OTHER_ERROR, 'OTHER is reserved'),
        regex: RegexSourceSchema,
      }),
    )
    .refine((patterns) => new Set(patterns.map((p) => p.name)).size === patterns.length, 'duplicate pattern name'),
  errorLineRegex: RegexSourceSchema,
  /** D17: `degraded` once errorLines is strictly above this value. */
  degradedThreshold: z.number().nonnegative().default(DEFAULT_DEGRADED_THRESHOLD),
});
export type ErrorSummaryConfig = z.infer<typeof ErrorSummaryConfigSchema>;

export const ErrorSummaryInputSchema = z.strictObject({
  service: z.string().min(1).max(128),
  window: z.enum(WINDOWS),
});
export type ErrorSummaryInput = z.infer<typeof ErrorSummaryInputSchema>;

export const ErrorSummaryOutputSchema = z.object({
  service: z.string(),
  window: z.enum(WINDOWS),
  status: z.enum(['ok', 'degraded', 'down']),
  errorLines: z.number().int().nonnegative(),
  topErrors: z
    .array(
      z.strictObject({
        name: z.string().regex(UPPER_SNAKE_CASE),
        count: z.number().int().positive(),
        share: z.number().min(0).max(1),
        firstSeen: z.iso.datetime(),
        lastSeen: z.iso.datetime(),
      }),
    )
    .max(MAX_TOP_ERRORS),
});
export type ErrorSummaryOutput = z.infer<typeof ErrorSummaryOutputSchema>;

/** Returns the raw lines of a source for a window. Injectable for tests; the default runs no shell. */
export type LogReader = (source: LogSource, window: SummaryWindow, signal: AbortSignal) => Promise<string[]>;

export interface LogCommand {
  file: 'journalctl' | 'docker';
  args: string[];
}

/** Fixed argument vectors; the unit or container always comes from the owner config, never from the input. */
export function buildLogCommand(source: Exclude<LogSource, { kind: 'file' }>, window: SummaryWindow): LogCommand {
  if (source.kind === 'journald') {
    return {
      file: 'journalctl',
      args: ['-u', source.unit, '--since', JOURNALCTL_SINCE[window], '--no-pager', '-o', 'short-iso'],
    };
  }
  return { file: 'docker', args: ['logs', '--since', window, '--timestamps', source.container] };
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => line.trim() !== '');
}

/** journalctl markers such as "-- No entries --" or "-- Boot … --" are not log lines. */
const JOURNAL_MARKER = /^-- .* --$/;
const execFileAsync = promisify(execFile);

export const readLogLines: LogReader = async (source, window, signal) => {
  if (source.kind === 'file') return splitLines(await readFile(source.path, { encoding: 'utf8', signal }));
  const command = buildLogCommand(source, window);
  const { stdout, stderr } = await execFileAsync(command.file, command.args, {
    encoding: 'utf8',
    shell: false,
    signal,
    maxBuffer: MAX_LOG_BYTES,
    windowsHide: true,
  });
  if (source.kind === 'journald') return splitLines(stdout).filter((line) => !JOURNAL_MARKER.test(line));
  // docker logs writes the container's stderr on its own stderr: both streams are the service's log.
  return [...splitLines(stdout), ...splitLines(stderr)];
};

const LEADING_TIMESTAMP =
  /^\s*(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?(?:[.,](\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?(?!\d)/i;

/** Epoch ms of a leading ISO 8601 timestamp (journalctl short-iso, docker --timestamps, files), else undefined. */
export function parseLeadingTimestamp(line: string): number | undefined {
  const match = LEADING_TIMESTAMP.exec(line);
  if (match === null) return undefined;
  const [, date, hoursMinutes, seconds, fraction, zone] = match;
  const millis = (fraction ?? '').slice(0, 3).padEnd(3, '0');
  let offset = 'Z';
  if (zone !== undefined && zone.toUpperCase() !== 'Z') {
    const digits = zone.slice(1).replace(':', '').padEnd(4, '0');
    offset = `${zone.slice(0, 1)}${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
  }
  const ms = Date.parse(`${date ?? ''}T${hoursMinutes ?? ''}${seconds ?? ':00'}.${millis}${offset}`);
  return Number.isNaN(ms) ? undefined : ms;
}

interface Bucket {
  count: number;
  first: number;
  last: number;
}

function summarize(
  lines: readonly string[],
  input: ErrorSummaryInput,
  config: ErrorSummaryConfig,
  nowMs: number,
): ErrorSummaryOutput {
  const since = nowMs - WINDOW_MS[input.window];
  const errorLine = new RegExp(config.errorLineRegex);
  const patterns = config.errorPatterns.map((pattern) => ({ name: pattern.name, regex: new RegExp(pattern.regex) }));
  const buckets = new Map<string, Bucket>();
  let logLines = 0;
  let errorLines = 0;
  let lastSeenInWindow: number | undefined;

  for (const line of lines) {
    if (line.trim() === '') continue;
    const timestamp = parseLeadingTimestamp(line);
    if (timestamp !== undefined && timestamp < since) continue;
    if (timestamp !== undefined) lastSeenInWindow = timestamp;
    // A line without timestamp counts as inside the window; it is dated by the last in-window line, else by now.
    const seenAt = timestamp ?? lastSeenInWindow ?? nowMs;
    logLines += 1;
    if (!errorLine.test(line)) continue;
    errorLines += 1;
    const name = patterns.find((pattern) => pattern.regex.test(line))?.name ?? OTHER_ERROR;
    const bucket = buckets.get(name);
    if (bucket === undefined) {
      buckets.set(name, { count: 1, first: seenAt, last: seenAt });
    } else {
      bucket.count += 1;
      bucket.first = Math.min(bucket.first, seenAt);
      bucket.last = Math.max(bucket.last, seenAt);
    }
  }

  const topErrors = [...buckets]
    .sort(([nameA, a], [nameB, b]) => b.count - a.count || (nameA < nameB ? -1 : nameA > nameB ? 1 : 0))
    .slice(0, MAX_TOP_ERRORS)
    .map(([name, bucket]) => ({
      name,
      count: bucket.count,
      share: Math.round((bucket.count / errorLines) * 1000) / 1000,
      firstSeen: new Date(bucket.first).toISOString(),
      lastSeen: new Date(bucket.last).toISOString(),
    }));

  let status: ErrorSummaryOutput['status'] = 'ok';
  if (logLines === 0) status = 'down';
  else if (errorLines > config.degradedThreshold) status = 'degraded';

  return { service: input.service, window: input.window, status, errorLines, topErrors };
}

const TOOL_NAME: Record<LogSource['kind'], string> = { journald: 'journalctl', docker: 'docker', file: 'file' };

export interface ErrorSummaryDeps {
  readLines?: LogReader;
  now?: () => number;
}

export function createErrorSummary(deps: ErrorSummaryDeps = {}): CapabilityImpl<ErrorSummaryInput, ErrorSummaryOutput> {
  const readLines = deps.readLines ?? readLogLines;
  const now = deps.now ?? Date.now;
  return {
    card: {
      id: 'production.error_summary',
      version: '1.0.0',
      title: 'Résumer les erreurs de production',
      sensitivity: 'low',
      receives: [
        "l'état du service",
        "le nombre d'erreurs",
        "les 5 types d'erreurs les plus fréquents (noms définis par le propriétaire)",
      ],
      neverReceives: ['les lignes de log', 'les identifiants clients', 'les accès au serveur'],
      approval: 'always',
      maxOutputChars: 4000,
      budget: { maxSeconds: 20 },
    },
    input: ErrorSummaryInputSchema,
    output: ErrorSummaryOutputSchema,
    configSchema: ErrorSummaryConfigSchema,
    preview: (input) => `Service « ${input.service} », fenêtre ${input.window}`,
    execute: async (input: ErrorSummaryInput, ctx: RunContext): Promise<ErrorSummaryOutput> => {
      const config = ErrorSummaryConfigSchema.parse(ctx.config);
      // The service must be declared by the owner: checked before any journal, container or file is read.
      const service = Object.hasOwn(config.services, input.service) ? config.services[input.service] : undefined;
      if (service === undefined) throw new DropError('E_SCHEMA', 'unknown service');
      ctx.recordToolCall(TOOL_NAME[service.source.kind]);
      const lines = await readLines(service.source, input.window, ctx.signal);
      return summarize(lines, input, config, now());
    },
  };
}

export const errorSummary = createErrorSummary();
