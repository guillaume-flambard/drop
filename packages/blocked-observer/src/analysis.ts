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
  /** Median minutes lost per YES block that has pain_minutes; the go/no-go threshold (D24) reads it. */
  medianPainMinutesYes: number | null;
}

const round = (value: number): number => Math.round(value * 100) / 100;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? null)
    : round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

/** "Jour actif" = a day with at least one Claude Code hook call or one Codex session (spec 02). */
export function activeDaysOf(activity: Activity, sinceMs = 0): string[] {
  return Object.entries(activity)
    .filter(
      ([day, entry]) =>
        Date.parse(`${day}T23:59:59Z`) >= sinceMs && (entry.claude.length > 0 || entry.codex.length > 0),
    )
    .map(([day]) => day)
    .sort();
}

export function buildReport(events: ObservedEvent[], activity: Activity, sinceMs = 0): Report {
  const inRange = events.filter((event) => Date.parse(event.ts) >= sinceMs);
  return reportFromDays(inRange, activeDaysOf(activity, sinceMs).length);
}

/** Report over already-selected events and a number of (developer-)active days. */
export function reportFromDays(inRange: ObservedEvent[], activeDays: number): Report {
  const bySource: Record<string, number> = {};
  const byClassification: Report['byClassification'] = {};
  let painMinutes = 0;
  let yesBlocks = 0;
  const yesPain: number[] = [];
  for (const event of inRange) {
    bySource[event.source] = (bySource[event.source] ?? 0) + 1;
    const key = event.classification ?? 'UNCLASSIFIED';
    byClassification[key] = (byClassification[key] ?? 0) + 1;
    painMinutes += event.pain_minutes ?? 0;
    if (event.classification?.startsWith('YES_')) {
      yesBlocks += 1;
      if (event.pain_minutes !== undefined) yesPain.push(event.pain_minutes);
    }
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
    medianPainMinutesYes: median(yesPain),
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
