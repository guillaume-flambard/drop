import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * The hook's write path, with node built-ins only: loading zod alone costs more than half of the hook's 100 ms budget
 * (measured 2026-10-08). ObserverStore (store.ts) reads and validates what this writes.
 */
export function observerHome(): string {
  return process.env.BLOCKED_OBSERVER_HOME ?? join(homedir(), '.blocked-observer');
}

export function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export function newId(): string {
  return randomUUID();
}

/**
 * Replaces `path` whole: writes a temporary file next to it, then renames it over the original. A reader sees the old
 * content or the new one, never a truncated file, and a crash mid-write leaves the original intact.
 */
export function writeFileAtomic(path: string, data: string): void {
  const temporary = `${path}.${String(process.pid)}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, data, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, path);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // The temporary file was never created or is already gone; the original error below is the one that matters.
    }
    throw error;
  }
}

export type ActivityMap = Record<string, { claude: string[]; codex: string[] }>;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/** The shape store.ts checks with zod, without loading zod on the hook path. */
export function isActivityMap(value: unknown): value is ActivityMap {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const { claude, codex } = entry as { claude?: unknown; codex?: unknown };
    return isStringArray(claude) && isStringArray(codex);
  });
}

/** The file's text, or undefined when it does not exist; any other read error is thrown. */
export function readIfPresent(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

export interface HookEvent {
  id: string;
  ts: string;
  source: 'hook_claude';
  agent: 'claude_code';
  session: string;
  tool: string;
  pattern: string;
  resource_hash?: string;
}

export class LightStore {
  readonly root: string;

  constructor(root: string = observerHome()) {
    this.root = root;
  }

  private ensure(): void {
    if (!existsSync(this.root)) mkdirSync(this.root, { recursive: true, mode: 0o700 });
  }

  append(event: HookEvent): void {
    this.ensure();
    appendFileSync(join(this.root, 'events.jsonl'), `${JSON.stringify(event)}\n`, { mode: 0o600 });
  }

  /**
   * Marks a session as active on a day. An activity.json it cannot read is left as it is and logged as
   * E_ACTIVITY_CORRUPT: overwriting it would erase every active day measured so far.
   */
  touch(day: string, agent: 'claude' | 'codex', session: string): void {
    const path = join(this.root, 'activity.json');
    let activity: ActivityMap = {};
    try {
      const text = readIfPresent(path);
      if (text !== undefined) {
        const parsed: unknown = JSON.parse(text);
        if (!isActivityMap(parsed)) throw new Error('not a map of days to sessions');
        activity = parsed;
      }
    } catch (error) {
      this.logError('E_ACTIVITY_CORRUPT', `${path}: ${error instanceof Error ? error.message : 'unreadable'}`);
      return;
    }
    const entry = activity[day] ?? { claude: [], codex: [] };
    if (entry[agent].includes(session)) return;
    entry[agent].push(session);
    activity[day] = entry;
    this.ensure();
    writeFileAtomic(path, `${JSON.stringify(activity)}\n`);
  }

  logError(code: string, detail: string): void {
    try {
      this.ensure();
      appendFileSync(join(this.root, 'errors.log'), `${new Date().toISOString()} ${code} ${detail.slice(0, 200)}\n`, {
        mode: 0o600,
      });
    } catch {
      // Last resort: the hook must never fail Claude Code, even if the error log cannot be written.
    }
  }
}
