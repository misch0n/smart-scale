/**
 * The history list's rows (board History): one per shot, newest first, with the day and time,
 * the drink, the taste, channelling and a small graph, under "Last 7 days" and "Earlier".
 */

import type { HistoryEntry } from '../../app/history';
import type { Direction, Id } from '../../core/model';
import { timeOfDay } from '../brew/format';
import { sparkline, type Sparkline } from './plot';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The drink a shot without a recipe was: the brew flow's default recipe. */
export const DEFAULT_DRINK = 'Espresso';

/** The day, in local time: `"Sun 4 Oct"`. */
export function dayLabel(epochMs: number): string {
  const date = new Date(epochMs);
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** The day of the week, in local time: `"Sun"`. */
export function weekdayLabel(epochMs: number): string {
  return WEEKDAYS[new Date(epochMs).getDay()];
}

/** Where "Last 7 days" starts: today and the six days before, from midnight, local time. */
export function lastSevenDaysStart(nowEpochMs: number): number {
  const today = new Date(nowEpochMs);
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6).getTime();
}

/** The drink, as History shows it (spec v2 "Recipes"). */
export function drinkOf(entry: HistoryEntry): string {
  return entry.shot.recipeName ?? DEFAULT_DRINK;
}

/** The target, g: the dose times the recipe's coffee ratio; null without either. */
export function targetOf(entry: HistoryEntry): number | null {
  const { doseG, targetRatio } = entry.shot;
  return doseG === null || targetRatio === null ? null : doseG * targetRatio;
}

export interface HistoryRow {
  readonly id: Id;
  readonly day: string;
  readonly time: string;
  readonly drink: string;
  readonly taste: Direction | null;
  readonly channelled: boolean;
  /** No segment: the analysis found no shot where it was recorded (D-007). */
  readonly unmatched: boolean;
  /** Null for a shot without a curve. */
  readonly spark: Sparkline | null;
}

export interface HistorySection {
  readonly title: string;
  readonly rows: readonly HistoryRow[];
}

export function historyRow(entry: HistoryEntry): HistoryRow {
  const { shot, segment } = entry;
  return {
    id: shot.id,
    day: dayLabel(entry.atEpochMs),
    time: timeOfDay(entry.atEpochMs),
    drink: drinkOf(entry),
    taste: shot.direction,
    channelled: shot.channelled === true,
    unmatched: segment === null,
    spark: segment === null ? null : sparkline(segment, targetOf(entry)),
  };
}

/**
 * The rows under "Last 7 days" (today and the six days before, local time) and "Earlier", in
 * the entries' order; a section without rows is left out.
 */
export function historySections(
  entries: readonly HistoryEntry[],
  nowEpochMs: number,
): HistorySection[] {
  const weekStart = lastSevenDaysStart(nowEpochMs);
  const recent = entries.filter((entry) => entry.atEpochMs >= weekStart);
  const earlier = entries.filter((entry) => entry.atEpochMs < weekStart);
  return [
    { title: 'Last 7 days', rows: recent.map(historyRow) },
    { title: 'Earlier', rows: earlier.map(historyRow) },
  ].filter((section) => section.rows.length > 0);
}

/** `"7 shots"`, `"1 shot"`. */
export function shotCount(count: number): string {
  return `${count} ${count === 1 ? 'shot' : 'shots'}`;
}

/**
 * Compare mode's picks after tapping a shot (board History, `compareMode`): a picked shot is
 * dropped (the other becomes A); else it is added, replacing B when two are picked.
 */
export function pickShot(picks: readonly Id[], id: Id): Id[] {
  if (picks.includes(id)) return picks.filter((pick) => pick !== id);
  return picks.length < 2 ? [...picks, id] : [picks[0], id];
}
