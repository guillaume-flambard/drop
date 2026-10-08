import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

import { observerHome } from './light.ts';

export { newId, observerHome, shortHash } from './light.ts';

/** Local files only: events.jsonl, activity.json, errors.log. Nothing here ever touches the network. */
export class ObserverStore {
  readonly root: string;

  constructor(root: string = observerHome()) {
    this.root = root;
  }

  private ensure(): void {
    if (!existsSync(this.root)) mkdirSync(this.root, { recursive: true, mode: 0o700 });
  }

  get eventsPath(): string {
    return join(this.root, 'events.jsonl');
  }

  append(event: ObservedEvent): void {
    this.ensure();
    appendFileSync(this.eventsPath, `${JSON.stringify(EventSchema.parse(event))}\n`, { mode: 0o600 });
  }

  events(): ObservedEvent[] {
    if (!existsSync(this.eventsPath)) return [];
    return readFileSync(this.eventsPath, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .flatMap((line) => {
        const parsed = EventSchema.safeParse(JSON.parse(line));
        return parsed.success ? [parsed.data] : [];
      });
  }

  /** Rewrites the whole file: used by classify and linking, never by the hook. */
  replaceEvents(events: ObservedEvent[]): void {
    this.ensure();
    writeFileSync(this.eventsPath, events.map((event) => `${JSON.stringify(event)}\n`).join(''), { mode: 0o600 });
  }

  activity(): Activity {
    const path = join(this.root, 'activity.json');
    if (!existsSync(path)) return {};
    const parsed = ActivitySchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
    return parsed.success ? parsed.data : {};
  }

  /** Marks a session as active on a day; cheap enough for the hook (one small file). */
  touch(day: string, agent: 'claude' | 'codex', session: string): void {
    const activity = this.activity();
    const entry = activity[day] ?? { claude: [], codex: [] };
    if (entry[agent].includes(session)) return;
    entry[agent].push(session);
    activity[day] = entry;
    this.ensure();
    writeFileSync(join(this.root, 'activity.json'), `${JSON.stringify(activity)}\n`, { mode: 0o600 });
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
