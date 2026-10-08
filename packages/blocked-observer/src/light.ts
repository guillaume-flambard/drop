import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

  touch(day: string, agent: 'claude' | 'codex', session: string): void {
    const path = join(this.root, 'activity.json');
    let activity: Record<string, { claude: string[]; codex: string[] }> = {};
    if (existsSync(path)) {
      try {
        activity = JSON.parse(readFileSync(path, 'utf8')) as typeof activity;
      } catch {
        activity = {};
      }
    }
    const entry = activity[day] ?? { claude: [], codex: [] };
    if (entry[agent].includes(session)) return;
    entry[agent].push(session);
    activity[day] = entry;
    this.ensure();
    writeFileSync(path, `${JSON.stringify(activity)}\n`, { mode: 0o600 });
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
