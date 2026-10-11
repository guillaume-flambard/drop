import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

export const CLASSIFICATIONS = [
  'NO_ACCESS_IS_FINE',
  'NO_SHARE_IS_FINE',
  'NO_HUMAN_REQUIRED',
  'YES_LOCAL_CONTEXT',
  'YES_SENSITIVE_DATA',
  'YES_PRIVILEGED_ACTION',
  'YES_TEMPORARY',
  'NOT_A_BLOCK',
] as const;
export const ClassificationSchema = z.enum(CLASSIFICATIONS);
export type Classification = z.infer<typeof ClassificationSchema>;

export const MISSING = ['access', 'data', 'tool', 'context', 'permission', 'other'] as const;
export const WORKAROUNDS = ['asked_human', 'skipped', 'guessed', 'stopped', 'other'] as const;

export const EventSchema = z.object({
  id: z.string(),
  ts: z.string(),
  source: z.enum(['report', 'hook_claude', 'codex_log']),
  agent: z.enum(['claude_code', 'codex', 'other']),
  session: z.string().optional(),
  tool: z.string().optional(),
  pattern: z.string().optional(),
  missing: z.enum(MISSING).optional(),
  resource: z.string().max(120).optional(),
  resource_hash: z.string().optional(),
  owner_hint: z.string().max(60).optional(),
  attempted_action: z.string().max(200).optional(),
  workaround: z.enum(WORKAROUNDS).optional(),
  classification: ClassificationSchema.optional(),
  pain_minutes: z.number().nonnegative().optional(),
  note: z.string().optional(),
  linked_id: z.string().optional(),
});
export type ObservedEvent = z.infer<typeof EventSchema>;

/** Days with agent activity, used as the denominator of the report ("jour actif"). Metadata only. */
export const ActivitySchema = z.record(
  z.string(),
  z.object({ claude: z.array(z.string()), codex: z.array(z.string()) }),
);
export type Activity = z.infer<typeof ActivitySchema>;

import { observerHome, readIfPresent, writeFileAtomic } from './light.ts';

export { newId, observerHome, shortHash } from './light.ts';

/** Called with a stable code when the store skips something it could not read (W_EVENTS_INVALID). */
export type StoreWarning = (code: string, detail: string) => void;

/** Local files only: events.jsonl, activity.json, errors.log. Nothing here ever touches the network. */
export class ObserverStore {
  readonly root: string;
  private readonly warn: StoreWarning | undefined;
  private skipped = 0;

  constructor(root: string = observerHome(), options: { warn?: StoreWarning } = {}) {
    this.root = root;
    this.warn = options.warn;
  }

  private ensure(): void {
    if (!existsSync(this.root)) mkdirSync(this.root, { recursive: true, mode: 0o700 });
  }

  get eventsPath(): string {
    return join(this.root, 'events.jsonl');
  }

  /** Lines of events.jsonl the last events() call could not read (torn write, hand edit, older schema). */
  get skippedLines(): number {
    return this.skipped;
  }

  append(event: ObservedEvent): void {
    this.ensure();
    appendFileSync(this.eventsPath, `${JSON.stringify(EventSchema.parse(event))}\n`, { mode: 0o600 });
  }

  /** Every readable event. An invalid line is skipped and counted, never fatal: one torn line must not stop the tools. */
  events(): ObservedEvent[] {
    const text = readIfPresent(this.eventsPath);
    this.skipped = 0;
    if (text === undefined) return [];
    const events = text
      .split('\n')
      .filter((line) => line.trim() !== '')
      .flatMap((line) => {
        let raw: unknown;
        try {
          raw = JSON.parse(line);
        } catch {
          this.skipped += 1;
          return [];
        }
        const parsed = EventSchema.safeParse(raw);
        if (!parsed.success) this.skipped += 1;
        return parsed.success ? [parsed.data] : [];
      });
    if (this.skipped > 0) {
      const detail = `${String(this.skipped)} invalid lines skipped in ${this.eventsPath}`;
      this.logError('W_EVENTS_INVALID', detail);
      this.warn?.('W_EVENTS_INVALID', detail);
    }
    return events;
  }

  /** Rewrites the whole file by an atomic rename: used by classify and linking, never by the hook. */
  replaceEvents(events: ObservedEvent[]): void {
    this.ensure();
    writeFileAtomic(this.eventsPath, events.map((event) => `${JSON.stringify(event)}\n`).join(''));
  }

  /**
   * Active days. An activity.json that does not parse is an error (E_ACTIVITY_CORRUPT), never an empty map: the report
   * would show no active day, and the next touch() would overwrite every day measured so far.
   */
  activity(): Activity {
    const path = join(this.root, 'activity.json');
    const text = readIfPresent(path);
    if (text === undefined) return {};
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      throw new Error(`E_ACTIVITY_CORRUPT: ${path} is not valid JSON; fix or move it`, { cause: error });
    }
    const parsed = ActivitySchema.safeParse(raw);
    if (!parsed.success)
      throw new Error(`E_ACTIVITY_CORRUPT: ${path} is not a map of days to sessions; fix or move it`);
    return parsed.data;
  }

  /** Marks a session as active on a day; cheap enough for the hook (one small file). */
  touch(day: string, agent: 'claude' | 'codex', session: string): void {
    const activity = this.activity();
    const entry = activity[day] ?? { claude: [], codex: [] };
    if (entry[agent].includes(session)) return;
    entry[agent].push(session);
    activity[day] = entry;
    this.ensure();
    writeFileAtomic(join(this.root, 'activity.json'), `${JSON.stringify(activity)}\n`);
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
