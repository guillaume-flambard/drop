/**
 * The daemon's log (T4.37): kept across restarts, turned over by size and age, each file and each start opened by a
 * system header, and every line redacted in the writing itself. The secret scanner of the runner decides what looks
 * like a secret; a line it still recognizes after redaction is never written as is.
 */
import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { arch, platform, release } from 'node:os';
import { join } from 'node:path';
import { scanSecrets } from '@drop/runner';

export const LOGS_DIR = 'logs';
export const DAEMON_LOG = 'daemon.log';
export const APP_LOG = 'app.log';

const DAY = 24 * 60 * 60 * 1000;

export interface LogLimits {
  /** A file turns over before it grows past this size. */
  maxBytes: number;
  /** Previous files kept: daemon.log.1 to daemon.log.<keep>. */
  keep: number;
  /** A file whose header is older than this turns over. */
  rotateAfterMs: number;
  /** A previous file not written for this long is deleted. */
  deleteAfterMs: number;
  /** A longer line is cut. */
  maxLineBytes: number;
}

export const LOG_LIMITS: Readonly<LogLimits> = {
  maxBytes: 2 * 1024 * 1024,
  keep: 3,
  rotateAfterMs: 7 * DAY,
  deleteAfterMs: 14 * DAY,
  maxLineBytes: 8 * 1024,
};

/** Logs only: the folder the owner may open or send, never DROP_HOME with its keys. */
export function logsDir(root: string): string {
  return join(root, LOGS_DIR);
}

const REDACTED = '[expurgé]';
/** Names whose value is a secret: JSON keys and URL query parameters. */
const SECRET_NAME =
  /token|secret|passw(?:or)?d|passphrase|api[-_]?key|private[-_]?key|authori[sz]ation|cookie|credential|bearer|invite|session|seed|key$/i;
/** Query parameters that carry a one-time secret without saying so (OAuth). */
const SECRET_PARAM = /^(?:code|state|sig|signature|key)$/i;
/** Environment variables whose value is a secret. */
const SECRET_ENV = /KEY|TOKEN|SECRET|PASSWORD|PASSWD|PASSPHRASE|CREDENTIAL/i;
const QUERY = /([?&;])([A-Za-z0-9_.-]{1,64})=([^&#\s"'<>]*)/g;
const AUTH_SCHEME = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{1,4096}/gi;
/** `NAME=value`, `name: value`, `"name": "value"`: a name that says secret, then its value. */
const ASSIGNMENT =
  /\b([A-Za-z0-9_.-]{0,40}(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|PASSPHRASE)[A-Za-z0-9_.-]{0,40})(["']?)\s*[=:]\s*("[^"]{0,4096}"|'[^']{0,4096}'|[^\s,;]{1,4096})/gi;
/** The credentials of a URL, `user:password` between `scheme://` and `@`: the user goes too, it often names a person. */
const USERINFO = /\b([a-z][a-z0-9+.-]{0,20}:\/\/)[^\s/:@]{0,256}:[^\s/@]{1,1024}@/gi;
/** A word made only of key characters (base64, base64url, hex): a key cut by `/` is still one key. */
const OPAQUE = /^[A-Za-z0-9+/=_.-]+$/;
/** A long run of hexadecimal digits: a key or a seed; the scanner's entropy rule cannot see it (4 bits a character). */
const HEX_RUN = /[0-9a-fA-F]{32,}/;
/** What the scanner calls a word: a run without whitespace. Inside one, these split the pieces we look at again. */
const SPACES = /(\s+)/;
const PIECES = /(["'`,;()<>[\]{}|=:@?&#/\\])/;
const PATH_PARTS = /([/\\])/;
/** Where a real path starts: `/`, `~/`, `./`, a drive letter, or `file://`. */
const PATH_START = /^(?:file:\/\/\/?|~[/\\]|\.{1,2}[/\\]|\/|[A-Za-z]:[/\\])/;
/** How a real path ends: a file name with its extension, maybe a line and a column (`drop.mjs:12:3`). */
const PATH_END = /^[\w@+~-]*\.[A-Za-z0-9]{1,10}(?::\d+){0,2}$/;

export interface RedactOptions {
  /** Exact values to remove wherever they appear: the local token, secret environment values. */
  known?: readonly string[];
  /** The user's home folder, written ~. */
  home?: string | undefined;
  now?: () => number;
}

function marker(word: string): string {
  return `[expurgé #${createHash('sha256').update(word, 'utf8').digest('hex').slice(0, 8)}]`;
}

function hasHexRun(value: unknown, depth = 0): boolean {
  if (typeof value === 'string') return HEX_RUN.test(value);
  if (typeof value !== 'object' || value === null || depth > 8) return false;
  return Object.entries(value).some(([key, item]) => HEX_RUN.test(key) || hasHexRun(item, depth + 1));
}

/** The scanner of the runner, plus long hexadecimal runs: what no log line may hold (T4.37, review of PR #82). */
export function logKinds(value: unknown): string[] {
  const kinds = scanSecrets(value);
  return hasHexRun(value) ? [...kinds, 'hex_run'] : kinds;
}

const flagged = (value: unknown): boolean => logKinds(value).length > 0;

/** A real path, whose end may be kept: it starts like a path and ends with a file name. */
function realPath(word: string): boolean {
  const body = word.replace(/^[(["'`<{]+/, '').replace(/[)\]"'`>},;.]+$/, '');
  const last = body.split(PATH_PARTS).pop() ?? '';
  return PATH_START.test(body) && PATH_END.test(last);
}

/**
 * A real path the scanner takes for a secret, only because it is long and varied: the longest end the scanner accepts
 * is kept (`…/Resources/drop.mjs:12:3`). Any other word is replaced whole: an ending of a key is still part of the key.
 */
function keepPathEnd(word: string): string {
  // An opening bracket or quote stays in front: `(…/drop.mjs:12:3)`.
  const lead = /^[(["'`<{]*/.exec(word)?.[0] ?? '';
  const parts = word.slice(lead.length).split(PATH_PARTS);
  let kept: string | undefined;
  for (let start = parts.length - 1; start >= 0; start -= 1) {
    const part = parts[start] ?? '';
    if (part === '/' || part === '\\') continue;
    const candidate = lead + '…/' + parts.slice(start).join('');
    if (flagged(candidate)) break;
    kept = candidate;
  }
  return kept ?? marker(word);
}

/** One word as the scanner sees it: kept if clean, else its secret pieces replaced, else a real path's end, else whole. */
function redactWord(word: string): string {
  if (word.length < 5 || !flagged(word)) return word;
  const core = word.replace(/^[(["'`<{]+/, '').replace(/[)\]"'`>},;:]+$/, '');
  if (OPAQUE.test(core) && !realPath(word)) return marker(word);
  const refined = word
    .split(PIECES)
    .map((piece, index) => (index % 2 === 1 || piece.length < 5 || !flagged(piece) ? piece : marker(piece)))
    .join('');
  if (!flagged(refined)) return refined;
  return realPath(word) && refined === word ? keepPathEnd(word) : marker(word);
}

function cut(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text;
  let end = Math.min(text.length, maxBytes);
  while (end > 0 && Buffer.byteLength(text.slice(0, end), 'utf8') > maxBytes) end -= 1;
  return text.slice(0, end) + ' …[tronqué]';
}

function replaceAll(text: string, value: string, by: string): string {
  return text.split(value).join(by);
}

/** Text redaction, in order: known values, home folder, query parameters, auth schemes, assignments, scanned words. */
export function redactText(text: string, options: RedactOptions = {}): string {
  let out = text;
  const known = [...(options.known ?? [])].filter((value) => value.length >= 8).sort((a, b) => b.length - a.length);
  for (const value of known) out = replaceAll(out, value, REDACTED);
  const home = options.home;
  if (home && home.length > 1 && home !== '/' && home !== '\\') out = replaceAll(out, home, '~');
  out = out.replace(USERINFO, (_whole, scheme: string) => `${scheme}${REDACTED}@`);
  out = out.replace(QUERY, (whole, separator: string, name: string) =>
    SECRET_NAME.test(name) || SECRET_PARAM.test(name) ? `${separator}${name}${REDACTED}` : whole,
  );
  out = out.replace(AUTH_SCHEME, (_whole, scheme: string) => `${scheme} ${REDACTED}`);
  out = out.replace(ASSIGNMENT, (_whole, name: string, quote: string) => `${name}${quote} ${REDACTED}`);
  return out
    .split(SPACES)
    .map((word, index) => (index % 2 === 1 ? word : redactWord(word)))
    .join('');
}

function redactValue(value: unknown, options: RedactOptions, depth: number): unknown {
  if (typeof value === 'string') return redactText(value, options);
  if (typeof value !== 'object' || value === null) return value;
  if (depth > 8) return REDACTED;
  if (Array.isArray(value)) return value.map((item) => redactValue(item, options, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[redactText(key, options)] =
      SECRET_NAME.test(key) && item !== null && item !== undefined ? REDACTED : redactValue(item, options, depth + 1);
  }
  return out;
}

/** The JSON object a log line holds, or undefined for a text line. */
export function jsonObject(line: string): Record<string, unknown> | undefined {
  if (!line.startsWith('{')) return undefined;
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * What the scanner finds in a log line, applied as on a capability output: a JSON line field by field (its compact
 * form has no space, so the whole line would read as one long word), any other line as text.
 */
export function scanLogLine(line: string): string[] {
  return logKinds(jsonObject(line) ?? line);
}

const LABEL = /^[A-Za-z0-9_.:-]{1,64}$/;

/** A field of a replaced line kept only if it is a short label the scanner accepts: its event or code. */
function label(value: unknown): string | undefined {
  return typeof value === 'string' && LABEL.test(value) && !flagged(value) ? value : undefined;
}

export interface RedactedLine {
  line: string;
  /** True when the line still looked like a secret after redaction and was replaced whole. */
  replaced: boolean;
}

function replacedLine(
  source: Record<string, unknown> | undefined,
  kinds: string[],
  options: RedactOptions,
): RedactedLine {
  const event = label(source?.event);
  const code = label(source?.code);
  return {
    line: JSON.stringify({
      at: label(source?.at) ?? new Date(options.now?.() ?? Date.now()).toISOString(),
      event: 'log_line_redacted',
      code: 'E_SECRET_DETECTED',
      kinds,
      ...(event ? { redactedEvent: event } : {}),
      ...(code ? { redactedCode: code } : {}),
    }),
    replaced: true,
  };
}

/** Redacts one log line: a JSON object field by field (secret names lose their value), any other line as text. */
export function redactLogLineDetailed(line: string, options: RedactOptions = {}): RedactedLine {
  const max = LOG_LIMITS.maxLineBytes;
  const parsed = line.length <= 8 * max ? jsonObject(line) : undefined;
  if (parsed) {
    const redacted = redactValue(parsed, options, 0) as Record<string, unknown>;
    const kinds = logKinds(redacted);
    if (kinds.length > 0) return replacedLine(parsed, kinds, options);
    const out = JSON.stringify(redacted);
    if (Buffer.byteLength(out, 'utf8') <= max) return { line: out, replaced: false };
    // Too long to keep whole: its labels stay, still JSON.
    const at = label(redacted.at);
    const event = label(redacted.event);
    const code = label(redacted.code);
    return {
      line: JSON.stringify({
        ...(at ? { at } : {}),
        ...(event ? { event } : {}),
        ...(code ? { code } : {}),
        truncated: true,
      }),
      replaced: false,
    };
  }
  const out = cut(redactText(cut(line, max), options), max);
  const kinds = logKinds(out);
  return kinds.length > 0 ? replacedLine(undefined, kinds, options) : { line: out, replaced: false };
}

export function redactLogLine(line: string, options: RedactOptions = {}): string {
  return redactLogLineDetailed(line, options).line;
}

/** Values to remove exactly: environment variables named like a secret, plus the given ones, 8 characters or more. */
export function secretValues(
  env: Readonly<Record<string, string | undefined>>,
  extra: readonly (string | undefined)[] = [],
): string[] {
  const values = [
    ...Object.entries(env).flatMap(([name, value]) => (SECRET_ENV.test(name) && value ? [value] : [])),
    ...extra.flatMap((value) => (value ? [value] : [])),
  ];
  return [...new Set(values.filter((value) => value.length >= 8))];
}

export interface HeaderFields {
  /** The desktop app's version (DROP_APP_VERSION); absent for a `drop serve` in a terminal. */
  app?: string | undefined;
  engine: string;
  profile?: string | undefined;
}

/** The system header: versions, system and runtime. No host name, no user name. */
export function systemHeader(fields: HeaderFields, reason: 'start' | 'rotate', now: number): Record<string, unknown> {
  return {
    at: new Date(now).toISOString(),
    event: 'log_header',
    reason,
    app: fields.app ?? null,
    engine: fields.engine,
    os: platform(),
    osRelease: release(),
    arch: arch(),
    node: process.versions.node,
    pid: process.pid,
    profile: fields.profile ?? null,
  };
}

export interface DaemonLogOptions {
  /** DROP_HOME: the log lives in its `logs` folder. */
  root: string;
  header: HeaderFields;
  known?: readonly string[];
  home?: string | undefined;
  limits?: Partial<LogLimits>;
  now?: () => number;
  /** Where a line goes when the file cannot take it, already redacted. */
  fallback?: (line: string) => void;
}

/** Previous files the retention may delete: rotated logs of the daemon and the app, and logs from before T4.37. */
const PREVIOUS = /^(?:daemon|app)\.log\.(?:\d+|legacy)$/;

/** When a log file started: the date of its header, or its last change for a file without one. */
function startedAt(path: string): number {
  let first: string;
  try {
    first = firstLine(path);
  } catch {
    return Date.now();
  }
  const header = jsonObject(first);
  const at = header?.event === 'log_header' && typeof header.at === 'string' ? Date.parse(header.at) : NaN;
  return Number.isFinite(at) ? at : statSync(path).mtimeMs;
}

function firstLine(path: string): string {
  const fd = openSync(path, 'r');
  try {
    const buffer = Buffer.alloc(4096);
    return (
      buffer
        .subarray(0, readSync(fd, buffer, 0, buffer.length, 0))
        .toString('utf8')
        .split('\n')[0] ?? ''
    );
  } finally {
    closeSync(fd);
  }
}

/** The lines in the last `bytes` of a file; a partial first line is dropped. */
export function lastLines(path: string, bytes: number): string[] {
  // A log that is a link could point at any file of the user: never read through it.
  if (lstatSync(path).isSymbolicLink()) throw new Error('E_LOG log is a symbolic link');
  const fd = openSync(path, fsConstants.O_RDONLY | NOFOLLOW);
  let buffer: Buffer;
  let start: number;
  try {
    const size = fstatSync(fd).size;
    start = Math.max(0, size - bytes);
    buffer = Buffer.alloc(size - start);
    readSync(fd, buffer, 0, buffer.length, start);
  } finally {
    closeSync(fd);
  }
  const lines = buffer.toString('utf8').split('\n');
  if (start > 0) lines.shift();
  return lines.map((line) => line.replace(/\r$/, '')).filter((line) => line.trim() !== '');
}

/** O_NOFOLLOW where the system has it (not on Windows): a link planted in place of a log is refused, not followed. */
const NOFOLLOW = (fsConstants as Partial<typeof fsConstants>).O_NOFOLLOW ?? 0;

/** True when a path exists and is a symbolic link. */
function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Opens a log to append, never through a link. */
function openAppend(path: string): number {
  if (isLink(path)) throw new Error('E_LOG log is a symbolic link');
  return openSync(path, fsConstants.O_WRONLY | fsConstants.O_APPEND | fsConstants.O_CREAT | NOFOLLOW, 0o600);
}

/** Writes all of `text`, or throws: a short write never passes for a complete one. */
function writeAll(fd: number, text: string): void {
  const buffer = Buffer.from(text, 'utf8');
  let offset = 0;
  while (offset < buffer.length) {
    const written = writeSync(fd, buffer, offset, buffer.length - offset);
    if (written <= 0) throw new Error('E_LOG short write');
    offset += written;
  }
}

function tighten(path: string, mode: number): void {
  try {
    chmodSync(path, mode);
  } catch {
    // Windows only knows read-only; the folder still lives in the user's own profile.
  }
}

/** The daemon's log file, appended to, never emptied, turned over by size and age. */
export class DaemonLog {
  readonly dir: string;
  readonly path: string;
  private readonly limits: LogLimits;
  private readonly now: () => number;
  private fd: number | undefined;
  private size = 0;
  private started = 0;
  /** After a failed rename (a file held elsewhere), the next attempt waits this long. */
  private retryAt = 0;
  private readonly options: DaemonLogOptions;

  constructor(options: DaemonLogOptions) {
    this.options = options;
    this.dir = logsDir(options.root);
    this.path = join(this.dir, DAEMON_LOG);
    this.limits = { ...LOG_LIMITS, ...options.limits };
    this.now = options.now ?? Date.now;
  }

  /** Opens the file for this run: moves a pre-T4.37 log in, deletes stale files, turns over if due, writes the header. */
  start(): void {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    if (isLink(this.dir)) throw new Error('E_LOG logs folder is a symbolic link');
    tighten(this.dir, 0o700);
    this.moveLegacy();
    this.purge();
    if (existsSync(this.path) && !isLink(this.path)) {
      const size = statSync(this.path).size;
      if (size > 0 && (size >= this.limits.maxBytes || this.now() - startedAt(this.path) > this.limits.rotateAfterMs))
        this.shift();
    }
    if (!this.tryOpen())
      this.raw(JSON.stringify({ at: new Date(this.now()).toISOString(), event: 'log_unwritable', code: 'E_LOG' }));
    this.append(systemHeader(this.options.header, 'start', this.now()));
  }

  /** Writes one line, redacted first, turning the file over before it grows too big or too old. */
  write(line: string): void {
    const redacted = redactLogLine(line, this.redaction());
    const now = this.now();
    // After a failed open, try again once a minute rather than giving up for the whole run.
    if (this.fd === undefined && now >= this.retryAt) this.tryOpen();
    if (this.fd === undefined) {
      this.options.fallback?.(redacted);
      return;
    }
    const bytes = Buffer.byteLength(redacted, 'utf8') + 1;
    if (
      now >= this.retryAt &&
      this.size > 0 &&
      (this.size + bytes > this.limits.maxBytes || now - this.started > this.limits.rotateAfterMs)
    )
      this.rotate();
    this.raw(redacted);
  }

  /** Closes the file; a failure to close never reaches the daemon's write. */
  close(): void {
    if (this.fd === undefined) return;
    const fd = this.fd;
    this.fd = undefined;
    try {
      closeSync(fd);
    } catch {
      // Already closed or lost: nothing left to flush, the next open starts afresh.
    }
  }

  private redaction(): RedactOptions {
    return { known: this.options.known ?? [], home: this.options.home, now: this.now };
  }

  private append(entry: Record<string, unknown>): void {
    this.raw(redactLogLine(JSON.stringify(entry), this.redaction()));
  }

  private raw(line: string): void {
    if (this.fd === undefined) {
      this.options.fallback?.(line);
      return;
    }
    try {
      writeAll(this.fd, line + '\n');
      this.size += Buffer.byteLength(line, 'utf8') + 1;
    } catch {
      this.options.fallback?.(line);
    }
  }

  private open(): void {
    this.fd = openAppend(this.path);
    tighten(this.path, 0o600);
    this.size = fstatSync(this.fd).size;
    this.started = this.size > 0 ? startedAt(this.path) : this.now();
  }

  /** Opens the file, or leaves the log on its fallback until the next attempt, a minute later. */
  private tryOpen(): boolean {
    try {
      this.open();
      return true;
    } catch {
      this.close();
      this.retryAt = this.now() + 60_000;
      return false;
    }
  }

  /** daemon.log → .1 → … → .<keep>, the oldest deleted; false when the system refused a rename. */
  private shift(): boolean {
    try {
      const numbered = (index: number): string => `${this.path}.${String(index)}`;
      if (existsSync(numbered(this.limits.keep))) unlinkSync(numbered(this.limits.keep));
      for (let index = this.limits.keep - 1; index >= 1; index -= 1)
        if (existsSync(numbered(index))) renameSync(numbered(index), numbered(index + 1));
      renameSync(this.path, numbered(1));
      return true;
    } catch {
      return false;
    }
  }

  private rotate(): void {
    this.close();
    const shifted = this.shift();
    // The file cannot be reopened (disk, rights, a link): lines go to the fallback, and the open is retried later.
    if (!this.tryOpen()) return;
    if (shifted) {
      this.append(systemHeader(this.options.header, 'rotate', this.now()));
      return;
    }
    // A file held elsewhere: keep writing to it and try again in a minute, never lose the line.
    this.retryAt = this.now() + 60_000;
  }

  /**
   * Logs from before T4.37 (DROP_HOME/daemon.log, DROP_HOME/app.log) were written without this redaction: their last
   * 256 KiB move into the logs folder as `<name>.legacy`, redacted line by line, through a new file renamed into place,
   * so that everything in the folder the owner may open or send has been redacted. The original is removed only once
   * its copy is complete; a link is never read nor written through.
   */
  private moveLegacy(): void {
    for (const name of [DAEMON_LOG, APP_LOG]) {
      const legacy = join(this.options.root, name);
      try {
        const info = lstatSync(legacy);
        if (!info.isFile()) continue;
      } catch {
        continue;
      }
      const target = join(this.dir, `${name}.legacy`);
      const temporary = `${target}.${String(process.pid)}.tmp`;
      try {
        const lines = lastLines(legacy, 256 * 1024).map((line) => redactLogLine(line, this.redaction()));
        const fd = openSync(
          temporary,
          fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | NOFOLLOW,
          0o600,
        );
        try {
          writeAll(fd, lines.map((line) => line + '\n').join(''));
        } finally {
          closeSync(fd);
        }
        renameSync(temporary, target);
        unlinkSync(legacy);
      } catch {
        // Left where it was: the next start tries again.
        try {
          unlinkSync(temporary);
        } catch {
          // Never created.
        }
      }
    }
  }

  private purge(): void {
    const now = this.now();
    for (const name of readdirSync(this.dir)) {
      if (!PREVIOUS.test(name)) continue;
      const path = join(this.dir, name);
      try {
        if (now - statSync(path).mtimeMs > this.limits.deleteAfterMs) unlinkSync(path);
      } catch {
        // Another process removed or holds it: the next start tries again.
      }
    }
  }
}

/** What installDaemonLog needs of the process: its stderr, its crash events and exit. */
export interface LogProcess {
  stderr: { write: (chunk: string | Uint8Array, ...rest: unknown[]) => boolean };
  on(event: 'uncaughtException' | 'unhandledRejection', listener: (reason: unknown) => void): unknown;
  exit(code: number): void;
}

export interface InstallOptions {
  root: string;
  env: Readonly<Record<string, string | undefined>>;
  header: HeaderFields;
  known: readonly string[];
  home?: string | undefined;
  proc?: LogProcess;
  now?: () => number;
}

export interface InstalledLog {
  /** The log file, when DROP_LOG=file put the log there. */
  path: string | undefined;
  close(): void;
}

/**
 * Routes everything the daemon writes on stderr through the redaction, line by line: into DROP_HOME/logs/daemon.log
 * with DROP_LOG=file (the desktop app), back to the real stderr otherwise (a terminal). An uncaught error or rejection is
 * logged under E_CRASH the same way, then the process exits with code 1, as Node would have.
 */
export function installDaemonLog(options: InstallOptions): InstalledLog {
  const proc = options.proc ?? (process as unknown as LogProcess);
  const stderr = proc.stderr;
  const original = stderr.write.bind(stderr);
  const now = options.now ?? Date.now;
  const redaction: RedactOptions = { known: options.known, home: options.home, now };
  const toStderr = (line: string): void => {
    original(line + '\n');
  };
  let log: DaemonLog | undefined;
  if (options.env.DROP_LOG === 'file') {
    const candidate = new DaemonLog({
      root: options.root,
      header: options.header,
      known: options.known,
      home: options.home,
      now,
      fallback: toStderr,
    });
    try {
      candidate.start();
      log = candidate;
    } catch (error) {
      candidate.close();
      toStderr(
        JSON.stringify({
          at: new Date(now()).toISOString(),
          event: 'log_unwritable',
          code: 'E_LOG',
          reason: error instanceof Error ? error.name : typeof error,
        }),
      );
    }
  }
  const emit = (line: string): void => {
    if (log) log.write(line);
    else toStderr(redactLogLine(line, redaction));
  };
  let pending = '';
  const flush = (): void => {
    if (pending) emit(pending);
    pending = '';
  };
  const write = (chunk: string | Uint8Array, ...rest: unknown[]): boolean => {
    pending += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    let end = pending.indexOf('\n');
    while (end >= 0) {
      emit(pending.slice(0, end).replace(/\r$/, ''));
      pending = pending.slice(end + 1);
      end = pending.indexOf('\n');
    }
    // A writer that never ends its line still reaches the log, in pieces.
    if (pending.length > LOG_LIMITS.maxLineBytes) flush();
    const callback = rest.find((arg): arg is () => void => typeof arg === 'function');
    if (callback) queueMicrotask(callback);
    return true;
  };
  stderr.write = write;
  const crash =
    (origin: 'uncaughtException' | 'unhandledRejection') =>
    (reason: unknown): void => {
      flush();
      const error = reason instanceof Error ? reason : undefined;
      emit(
        JSON.stringify({
          at: new Date(now()).toISOString(),
          event: 'daemon_crash',
          code: 'E_CRASH',
          origin,
          name: error?.name ?? typeof reason,
          message: error ? error.message : String(reason),
          ...(error?.stack
            ? {
                stack: error.stack
                  .split('\n')
                  .slice(1, 16)
                  .map((frame) => frame.trim()),
              }
            : {}),
        }),
      );
      log?.close();
      proc.exit(1);
    };
  proc.on('uncaughtException', crash('uncaughtException'));
  proc.on('unhandledRejection', crash('unhandledRejection'));
  return {
    path: log?.path,
    close: () => {
      flush();
      stderr.write = original;
      log?.close();
    },
  };
}
