/**
 * Home's figures (board Main; spec v2 "App structure and look"): the last shot, and the last
 * seven days' count, averages, tastes and channelling, from the history's entries (T1.19), so
 * they come from the analysis's cache as the history's do (D-047, D-070).
 *
 * - **The last shot** is the newest listed shot. It is named by its weekday and time, as the
 *   board writes it, and by its date as well once it is older than the last seven days, where
 *   a weekday alone would be ambiguous.
 * - **The last seven days** are today and the six days before, from midnight, local time: the
 *   history's "Last 7 days" section. The count is every listed shot in them. Each average is
 *   over the shots that have its figure: an unmatched shot (D-007) counts, but has none.
 */

import type { HistoryEntry } from '../../app/history';
import { DIRECTIONS, type Direction, type Id } from '../../core/model';
import { shotRatio, tenths, timeOfDay } from '../brew/format';
import { sparkline, type Sparkline } from '../history/plot';
import { dayLabel, drinkOf, lastSevenDaysStart, targetOf, weekdayLabel } from '../history/rows';

export interface LastShot {
  readonly id: Id;
  /** `"Sun"`, or `"Sun 27 Sep"` before the last seven days. */
  readonly day: string;
  readonly time: string;
  readonly drink: string;
  readonly taste: Direction | null;
  /** Null for a shot without a curve. */
  readonly spark: Sparkline | null;
  /** The figures as shown, or null when the analysis has none. */
  readonly yieldG: string | null;
  readonly ratio: string | null;
  readonly firstDripS: string | null;
}

export interface Week {
  readonly shots: number;
  /** The averages as shown, or null when no shot has the figure. */
  readonly ratio: string | null;
  readonly firstDripS: string | null;
  readonly extractionS: string | null;
  /** How many shots were graded with each taste. */
  readonly tastes: Readonly<Record<Direction, number>>;
  /** How many shots were graded with a taste at all. */
  readonly graded: number;
  readonly channelled: number;
}

export interface HomeSummary {
  /** Null without any listed shot. */
  readonly last: LastShot | null;
  readonly week: Week;
}

export function homeSummary(entries: readonly HistoryEntry[], nowEpochMs: number): HomeSummary {
  const weekStart = lastSevenDaysStart(nowEpochMs);
  const newest = entries.reduce<HistoryEntry | null>(
    (latest, entry) => (latest === null || entry.atEpochMs > latest.atEpochMs ? entry : latest),
    null,
  );
  return {
    last: newest === null ? null : lastShot(newest, weekStart),
    week: week(entries.filter((entry) => entry.atEpochMs >= weekStart)),
  };
}

function lastShot(entry: HistoryEntry, weekStart: number): LastShot {
  const { shot, segment } = entry;
  const metrics = segment?.metrics ?? null;
  return {
    id: shot.id,
    day: entry.atEpochMs >= weekStart ? weekdayLabel(entry.atEpochMs) : dayLabel(entry.atEpochMs),
    time: timeOfDay(entry.atEpochMs),
    drink: drinkOf(entry),
    taste: shot.direction,
    spark: segment === null ? null : sparkline(segment, targetOf(entry)),
    yieldG: metrics?.yieldG == null ? null : tenths(metrics.yieldG),
    ratio: entry.match.ratio === null ? null : shotRatio(entry.match.ratio),
    firstDripS: metrics?.firstDripS == null ? null : metrics.firstDripS.toFixed(1),
  };
}

function week(entries: readonly HistoryEntry[]): Week {
  const tastes = { sour: 0, balanced: 0, bitter: 0 };
  for (const { shot } of entries) {
    if (shot.direction !== null) tastes[shot.direction]++;
  }
  const ratio = average(entries.map((entry) => entry.match.ratio));
  const firstDripS = average(entries.map((entry) => entry.segment?.metrics.firstDripS));
  const extractionS = average(entries.map((entry) => entry.segment?.metrics.extractionS));
  return {
    shots: entries.length,
    ratio: ratio === null ? null : shotRatio(ratio),
    firstDripS: firstDripS === null ? null : firstDripS.toFixed(1),
    extractionS: extractionS === null ? null : extractionS.toFixed(1),
    tastes,
    graded: DIRECTIONS.reduce((sum, direction) => sum + tastes[direction], 0),
    channelled: entries.filter((entry) => entry.shot.channelled === true).length,
  };
}

/** The mean of the values that are there; null when none is. */
function average(values: readonly (number | null | undefined)[]): number | null {
  const present = values.filter((value): value is number => value != null);
  return present.length === 0
    ? null
    : present.reduce((sum, value) => sum + value, 0) / present.length;
}
