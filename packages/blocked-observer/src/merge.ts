import { z } from 'zod';
import { activeDaysOf, reportFromDays, type Report } from './analysis.ts';
import { EventSchema, type Activity, type ObservedEvent } from './store.ts';

/**
 * What `export` writes: the reviewed events plus the developer's active days, as dates only (no session id), so
 * several developers' exports can be added up for the go/no-go threshold (D24).
 */
export const ExportSchema = z.object({
  format: z.literal('blocked-observer-export'),
  version: z.literal(1),
  activeDays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  events: z.array(EventSchema),
});
export type ExportPayload = z.infer<typeof ExportSchema>;

export function exportPayload(reviewed: ObservedEvent[], activity: Activity): ExportPayload {
  return { format: 'blocked-observer-export', version: 1, activeDays: activeDaysOf(activity), events: reviewed };
}

export function parseExport(raw: unknown): ExportPayload {
  if (Array.isArray(raw)) throw new Error('old export format without active days: re-export with this version');
  return ExportSchema.parse(raw);
}

/** D24, written in docs/DECISIONS.md before the measurement started. */
export const THRESHOLD = {
  minDevelopers: 3,
  minActiveDaysEach: 10,
  goYesPerDevDay: 0.5,
  goMedianMinutes: 10,
  noGoYesPerDevDay: 0.2,
  noGoMedianMinutes: 5,
} as const;

export type Verdict = 'GO' | 'NO_GO' | 'EXTEND' | 'INSUFFICIENT_SAMPLE';

export interface DeveloperLine {
  name: string;
  activeDays: number;
  events: number;
  yesBlocks: number;
}

export interface MergedReport {
  developers: DeveloperLine[];
  total: Report;
  sample: { developers: number; minActiveDays: number; sufficient: boolean };
  verdict: Verdict;
  reason: string;
}

/** Applies D24 to a report whose activeDays are developer-days. */
export function verdictFor(total: Report, sufficient: boolean): { verdict: Verdict; reason: string } {
  if (!sufficient) {
    return {
      verdict: 'INSUFFICIENT_SAMPLE',
      reason: `il faut au moins ${String(THRESHOLD.minDevelopers)} développeurs avec ${String(THRESHOLD.minActiveDaysEach)} jours actifs chacun`,
    };
  }
  const median = total.medianPainMinutesYes ?? 0;
  if (total.yesPerActiveDay < THRESHOLD.noGoYesPerDevDay || median < THRESHOLD.noGoMedianMinutes) {
    return {
      verdict: 'NO_GO',
      reason: `${String(total.yesPerActiveDay)} blocage YES par dev-jour, médiane ${String(median)} min`,
    };
  }
  if (total.yesPerActiveDay >= THRESHOLD.goYesPerDevDay && median >= THRESHOLD.goMedianMinutes) {
    return {
      verdict: 'GO',
      reason: `${String(total.yesPerActiveDay)} blocage YES par dev-jour, médiane ${String(median)} min`,
    };
  }
  return { verdict: 'EXTEND', reason: 'entre les seuils : prolonger la mesure de 2 semaines' };
}

/** One export per developer; dev-days add up across developers, events are pooled. */
export function mergeExports(exports: { name: string; payload: ExportPayload }[]): MergedReport {
  const developers = exports.map(({ name, payload }) => ({
    name,
    activeDays: payload.activeDays.length,
    events: payload.events.length,
    yesBlocks: payload.events.filter((event) => event.classification?.startsWith('YES_')).length,
  }));
  const devDays = developers.reduce((sum, developer) => sum + developer.activeDays, 0);
  const total = reportFromDays(
    exports.flatMap(({ payload }) => payload.events),
    devDays,
  );
  const minActiveDays = developers.length === 0 ? 0 : Math.min(...developers.map((developer) => developer.activeDays));
  const sufficient = developers.length >= THRESHOLD.minDevelopers && minActiveDays >= THRESHOLD.minActiveDaysEach;
  return {
    developers,
    total,
    sample: { developers: developers.length, minActiveDays, sufficient },
    ...verdictFor(total, sufficient),
  };
}
