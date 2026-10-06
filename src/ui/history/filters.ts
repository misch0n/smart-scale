/**
 * The history's filters (T3.3, D-085; no board draws them, Q29): which shots the list and the
 * trend take, by what each shot recorded at brew time (its snapshot, D-068): the coffee pack,
 * its days off roast then, the grinder and whether since its last care (the stand-in for a
 * burr epoch, D-053), the tags, the taste. Pure.
 */

import { packAgeAt, type Direction, type Id, type Shot } from '../../core/model';

/** Days off roast, in the ranges the filter offers. */
export const ROAST_RANGES = [
  { id: 'week1', label: '0–7 days', min: 0, max: 7 },
  { id: 'week2', label: '8–14 days', min: 8, max: 14 },
  { id: 'weeks3-4', label: '15–28 days', min: 15, max: 28 },
  { id: 'later', label: '29+ days', min: 29, max: Infinity },
] as const;
export type RoastRange = (typeof ROAST_RANGES)[number]['id'];

/** "No pack": the shots that recorded none. */
export const NO_PACK = 'none';

/** A pack's id, or `NO_PACK` (an id is a UUID, so they never meet). */
export type PackKey = string;

export interface HistoryFilter {
  /** The coffee pack's id, or `NO_PACK`; null for any. */
  readonly pack: PackKey | null;
  readonly roast: RoastRange | null;
  readonly grinder: Id | null;
  /** With a grinder: only the shots since its last care. */
  readonly sinceCare: boolean;
  /** Every one of these tags, in any case. */
  readonly tags: readonly string[];
  readonly taste: Direction | 'ungraded' | null;
}

export const NO_FILTER: HistoryFilter = {
  pack: null,
  roast: null,
  grinder: null,
  sinceCare: false,
  tags: [],
  taste: null,
};

/** What the filter reads of an entry. */
export interface FilterEntry {
  readonly shot: Shot;
  /** When it was pulled, epoch ms. */
  readonly atEpochMs: number;
}

/** The time zone at a moment, minutes behind UTC, as `Date.getTimezoneOffset` gives it. */
export type OffsetOf = (epochMs: number) => number;

export const localOffset: OffsetOf = (epochMs) => new Date(epochMs).getTimezoneOffset();

export function isFiltered(filter: HistoryFilter): boolean {
  return (
    filter.pack !== null ||
    filter.roast !== null ||
    filter.grinder !== null ||
    filter.tags.length > 0 ||
    filter.taste !== null
  );
}

/** Days off roast when the shot was pulled; null without a roast date. */
export function shotDaysOffRoast(
  entry: FilterEntry,
  offsetOf: OffsetOf = localOffset,
): number | null {
  return packAgeAt(entry.shot, entry.atEpochMs, offsetOf(entry.atEpochMs)).daysOffRoast;
}

function roastRangeOf(days: number | null): RoastRange | null {
  if (days === null) return null;
  return ROAST_RANGES.find((range) => days >= range.min && days <= range.max)?.id ?? null;
}

const sameTag = (a: string, b: string): boolean => a.toLocaleLowerCase() === b.toLocaleLowerCase();

/**
 * The entries `filter` keeps, in their order. `careDates` gives each grinder's last care now
 * (`Grinder.care.lastDoneDate`): since it, a shot recorded that same date.
 */
export function applyFilter<T extends FilterEntry>(
  entries: readonly T[],
  filter: HistoryFilter,
  careDates: ReadonlyMap<Id, string | null>,
  offsetOf: OffsetOf = localOffset,
): T[] {
  const careDate = filter.grinder === null ? null : (careDates.get(filter.grinder) ?? null);
  return entries.filter(({ shot, atEpochMs }) => {
    if (filter.pack !== null && (shot.packId ?? NO_PACK) !== filter.pack) return false;
    if (
      filter.roast !== null &&
      roastRangeOf(shotDaysOffRoast({ shot, atEpochMs }, offsetOf)) !== filter.roast
    ) {
      return false;
    }
    if (filter.grinder !== null) {
      if (shot.grinderId !== filter.grinder) return false;
      if (filter.sinceCare && (careDate === null || shot.lastGrinderCareDate !== careDate)) {
        return false;
      }
    }
    if (!filter.tags.every((tag) => (shot.tags ?? []).some((name) => sameTag(name, tag)))) {
      return false;
    }
    if (filter.taste !== null && (shot.direction ?? 'ungraded') !== filter.taste) return false;
    return true;
  });
}

/** A choice of the filter, and how many shots have it. */
export interface FilterOption<K> {
  readonly id: K;
  readonly label: string;
  readonly count: number;
}

/** What the filter can pick among the entries: only what some shot has. */
export interface FilterOptions {
  /** The packs, by the name the newest shot recorded; then "No pack". */
  readonly packs: readonly FilterOption<PackKey>[];
  readonly roast: readonly FilterOption<RoastRange>[];
  /** The grinders, by the name the newest shot recorded. */
  readonly grinders: readonly FilterOption<Id>[];
  /** The tags, as the newest shot wrote each, most used first. */
  readonly tags: readonly FilterOption<string>[];
  readonly tastes: readonly FilterOption<Direction | 'ungraded'>[];
}

const TASTE_ORDER = ['sour', 'balanced', 'bitter', 'ungraded'] as const;
const TASTE_LABEL: Readonly<Record<Direction | 'ungraded', string>> = {
  sour: 'Sour',
  balanced: 'Balanced',
  bitter: 'Bitter',
  ungraded: 'Not graded',
};

/** The options among `entries` (newest first), each with its count. */
export function filterOptions(
  entries: readonly FilterEntry[],
  offsetOf: OffsetOf = localOffset,
): FilterOptions {
  const count = <K>(map: Map<K, { label: string; count: number }>, id: K, label: string) => {
    const seen = map.get(id);
    if (seen === undefined) map.set(id, { label, count: 1 });
    else seen.count += 1;
  };
  const packs = new Map<PackKey, { label: string; count: number }>();
  const roast = new Map<RoastRange, { label: string; count: number }>();
  const grinders = new Map<Id, { label: string; count: number }>();
  const tags = new Map<string, { label: string; count: number }>();
  const tastes = new Map<Direction | 'ungraded', { label: string; count: number }>();
  for (const entry of entries) {
    const { shot } = entry;
    count(
      packs,
      shot.packId ?? NO_PACK,
      shot.packId === null ? 'No pack' : (shot.packName ?? 'Pack'),
    );
    const range = roastRangeOf(shotDaysOffRoast(entry, offsetOf));
    if (range !== null) {
      count(roast, range, ROAST_RANGES.find((r) => r.id === range)?.label ?? range);
    }
    if (shot.grinderId !== null) count(grinders, shot.grinderId, shot.grinderName ?? 'Grinder');
    for (const tag of new Set((shot.tags ?? []).map((name) => name.toLocaleLowerCase()))) {
      const name = (shot.tags ?? []).find((t) => t.toLocaleLowerCase() === tag) ?? tag;
      count(tags, tag, name);
    }
    const taste = shot.direction ?? 'ungraded';
    count(tastes, taste, TASTE_LABEL[taste]);
  }
  const list = <K>(map: Map<K, { label: string; count: number }>): FilterOption<K>[] =>
    [...map].map(([id, { label, count }]) => ({ id, label, count }));
  const packList = list(packs);
  return {
    // The packs as first met (newest shot first); no pack last.
    packs: [
      ...packList.filter((p) => p.id !== NO_PACK),
      ...packList.filter((p) => p.id === NO_PACK),
    ],
    roast: ROAST_RANGES.flatMap((range) => {
      const seen = roast.get(range.id);
      return seen === undefined ? [] : [{ id: range.id, label: range.label, count: seen.count }];
    }),
    grinders: list(grinders),
    tags: list(tags).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    tastes: TASTE_ORDER.flatMap((id) => {
      const seen = tastes.get(id);
      return seen === undefined ? [] : [{ id, label: seen.label, count: seen.count }];
    }),
  };
}

/** The filter as a line: `Ethiopia Guji · ORO since care · WDT`; null without one. */
export function filterSummary(filter: HistoryFilter, options: FilterOptions): string | null {
  if (!isFiltered(filter)) return null;
  const label = <K>(list: readonly FilterOption<K>[], id: K | null) =>
    id === null ? null : (list.find((option) => option.id === id)?.label ?? null);
  const grinder = label(options.grinders, filter.grinder);
  return [
    label(options.packs, filter.pack),
    label(options.roast, filter.roast),
    grinder === null ? null : filter.sinceCare ? `${grinder} since care` : grinder,
    ...filter.tags.map((tag) => label(options.tags, tag.toLocaleLowerCase()) ?? tag),
    label(options.tastes, filter.taste),
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}
