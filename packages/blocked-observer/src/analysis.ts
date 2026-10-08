import type { Activity, Classification, ObservedEvent } from './store.ts';

export const LINK_WINDOW_MS = 5 * 60_000;

/** Links a semantic report (A) to an objective event (B) of the same session less than 5 minutes apart. */
export function linkEvents(events: ObservedEvent[]): ObservedEvent[] {
  const linked = events.map((event) => ({ ...event }));
  const objective = linked.filter((event) => event.source !== 'report');
  for (const report of linked.filter((event) => event.source === 'report' && event.session && !event.linked_id)) {
    const at = Date.parse(report.ts);
    const match = objective
      .filter((event) => event.session === report.session && !event.linked_id)
      .map((event) => ({ event, gap: Math.abs(Date.parse(event.ts) - at) }))
      .filter(({ gap }) => gap < LINK_WINDOW_MS)
      .sort((a, b) => a.gap - b.gap)[0]?.event;
    if (match) {
      report.linked_id = match.id;
      match.linked_id = report.id;
    }
  }
  return linked;
}

export interface Report {
  activeDays: number;
  events: number;
  eventsPerActiveDay: number;
  bySource: Record<string, number>;
  byClassification: Partial<Record<Classification | 'UNCLASSIFIED', number>>;
  painMinutes: number;
  yesBlocks: number;
  yesPerActiveDay: number;
}

const round = (value: number): number => Math.round(value * 100) / 100;

/** "Jour actif" = a day with at least one Claude Code hook call or one Codex session (spec 02). */
export function buildReport(events: ObservedEvent[], activity: Activity, sinceMs = 0): Report {
  const inRange = events.filter((event) => Date.parse(event.ts) >= sinceMs);
  const days = new Set(
    Object.entries(activity)
      .filter(
        ([day, entry]) =>
          Date.parse(`${day}T23:59:59Z`) >= sinceMs && (entry.claude.length > 0 || entry.codex.length > 0),
      )
      .map(([day]) => day),
  );
  const activeDays = days.size;
  const bySource: Record<string, number> = {};
  const byClassification: Report['byClassification'] = {};
  let painMinutes = 0;
  let yesBlocks = 0;
  for (const event of inRange) {
    bySource[event.source] = (bySource[event.source] ?? 0) + 1;
    const key = event.classification ?? 'UNCLASSIFIED';
    byClassification[key] = (byClassification[key] ?? 0) + 1;
    painMinutes += event.pain_minutes ?? 0;
    if (event.classification?.startsWith('YES_')) yesBlocks += 1;
  }
  return {
    activeDays,
    events: inRange.length,
    eventsPerActiveDay: activeDays === 0 ? 0 : round(inRange.length / activeDays),
    bySource,
    byClassification,
    painMinutes,
    yesBlocks,
    yesPerActiveDay: activeDays === 0 ? 0 : round(yesBlocks / activeDays),
  };
}

export const TEXT_FIELDS = ['resource', 'owner_hint', 'attempted_action', 'note'] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

/** What the user decided for one event during the export review. */
export type ReviewDecision = { keep: false } | { keep: true; remove?: TextField[]; hash?: TextField[] };

/** Applies the review: dropped events and removed fields never reach the export; hashed fields become their hash. */
export function applyReview(
  events: ObservedEvent[],
  decisions: Map<string, ReviewDecision>,
  hash: (value: string) => string,
): ObservedEvent[] {
  return events.flatMap((event) => {
    const decision = decisions.get(event.id) ?? { keep: true };
    if (!decision.keep) return [];
    const removed = new Set<string>(decision.remove ?? []);
    const hashed = new Set<string>(decision.hash ?? []);
    const entries = Object.entries(event)
      .filter(([key]) => !removed.has(key))
      .map(([key, value]) =>
        hashed.has(key) && typeof value === 'string' ? [key, `sha256:${hash(value)}`] : [key, value],
      );
    return [Object.fromEntries(entries) as ObservedEvent];
  });
}
