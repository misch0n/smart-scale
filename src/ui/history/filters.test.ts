import { describe, expect, it } from 'vitest';
import { createShot, type Direction, type ShotMetadata } from '../../core/model';
import {
  applyFilter,
  filterOptions,
  filterSummary,
  isFiltered,
  NO_FILTER,
  NO_PACK,
  shotDaysOffRoast,
  type FilterEntry,
  type HistoryFilter,
} from './filters';

/** UTC: the tests' dates don't move with the machine's time zone. */
const GUJI = '019a0000-0000-7000-8000-0000000fac01';
const KENYA = '019a0000-0000-7000-8000-0000000fac02';
const ORO = '019a0000-0000-7000-8000-00000000a001';
const C40 = '019a0000-0000-7000-8000-00000000a002';
const utc = () => 0;
const AT = Date.UTC(2026, 9, 5, 7);
const DAY = 86_400_000;

function entry(
  metadata: Partial<ShotMetadata> & { direction?: Direction | null },
  daysAgo = 0,
): FilterEntry {
  const atEpochMs = AT - daysAgo * DAY;
  return {
    shot: createShot(
      {
        recordingId: '019a0000-0000-7000-8000-0000000000aa',
        anchorTMs: 1000,
        source: 'live',
        ...metadata,
      },
      atEpochMs,
    ),
    atEpochMs,
  };
}

const guji = {
  packId: GUJI,
  packName: 'Local roaster · Ethiopia Guji',
  packRoastDate: '2026-09-25',
};
const kenya = { packId: KENYA, packName: 'Kenya Nyeri', packRoastDate: '2026-08-20' };
const oro = { grinderId: ORO, grinderName: 'Eureka ORO Mignon Single Dose Pro' };
const c40 = { grinderId: C40, grinderName: 'Comandante C40 MK4 Red Clix' };

const ENTRIES = [
  entry({ ...guji, ...oro, lastGrinderCareDate: '2026-10-01', tags: ['WDT'], direction: 'sour' }),
  entry({ ...guji, ...oro, lastGrinderCareDate: '2026-10-01', tags: ['wdt', 'RDT'] }, 1),
  entry({ ...guji, ...oro, lastGrinderCareDate: '2026-09-01', direction: 'balanced' }, 6),
  entry({ ...kenya, ...c40, tags: ['Warm-up < 15 min'], direction: 'bitter' }, 10),
  entry({ ...oro, direction: 'balanced' }, 12),
];

const CARE = new Map([
  [ORO, '2026-10-01'],
  [C40, null],
]);

const filtered = (changes: Partial<HistoryFilter>) =>
  applyFilter(ENTRIES, { ...NO_FILTER, ...changes }, CARE, utc).map((e) => ENTRIES.indexOf(e));

describe('applyFilter', () => {
  it('keeps everything without a filter', () => {
    expect(isFiltered(NO_FILTER)).toBe(false);
    expect(filtered({})).toEqual([0, 1, 2, 3, 4]);
  });

  it('filters by the pack, or the shots without one', () => {
    expect(filtered({ pack: GUJI })).toEqual([0, 1, 2]);
    expect(filtered({ pack: NO_PACK })).toEqual([4]);
  });

  it('filters by days off roast when the shot was pulled', () => {
    // Guji roasted 25 Sep: 10 days on 5 Oct, 9 on the 4th, 4 on 1 Oct. Kenya 46 days.
    expect(shotDaysOffRoast(ENTRIES[0], utc)).toBe(10);
    expect(filtered({ roast: 'week1' })).toEqual([2]);
    expect(filtered({ roast: 'week2' })).toEqual([0, 1]);
    expect(filtered({ roast: 'later' })).toEqual([3]);
  });

  it('filters by the grinder, and since its last care', () => {
    expect(filtered({ grinder: ORO })).toEqual([0, 1, 2, 4]);
    expect(filtered({ grinder: ORO, sinceCare: true })).toEqual([0, 1]);
    // Never cared for: nothing is since its care.
    expect(filtered({ grinder: C40, sinceCare: true })).toEqual([]);
  });

  it('keeps the shots with every tag picked, in any case', () => {
    expect(filtered({ tags: ['WDT'] })).toEqual([0, 1]);
    expect(filtered({ tags: ['wdt', 'rdt'] })).toEqual([1]);
  });

  it('filters by the taste, or the shots not graded', () => {
    expect(filtered({ taste: 'balanced' })).toEqual([2, 4]);
    expect(filtered({ taste: 'ungraded' })).toEqual([1]);
  });

  it('combines the filters', () => {
    expect(filtered({ pack: GUJI, taste: 'sour', tags: ['wdt'] })).toEqual([0]);
  });
});

describe('filterOptions', () => {
  const options = filterOptions(ENTRIES, utc);

  it('offers only what some shot has, with its count', () => {
    expect(options.packs).toEqual([
      { id: GUJI, label: 'Local roaster · Ethiopia Guji', count: 3 },
      { id: KENYA, label: 'Kenya Nyeri', count: 1 },
      { id: NO_PACK, label: 'No pack', count: 1 },
    ]);
    expect(options.roast.map(({ id, count }) => `${id} ${count}`)).toEqual([
      'week1 1',
      'week2 2',
      'later 1',
    ]);
    expect(options.grinders).toEqual([
      { id: ORO, label: 'Eureka ORO Mignon Single Dose Pro', count: 4 },
      { id: C40, label: 'Comandante C40 MK4 Red Clix', count: 1 },
    ]);
    expect(options.tastes.map(({ label, count }) => `${label} ${count}`)).toEqual([
      'Sour 1',
      'Balanced 2',
      'Bitter 1',
      'Not graded 1',
    ]);
  });

  it('counts a tag in any case once, as the newest shot wrote it, most used first', () => {
    expect(options.tags).toEqual([
      { id: 'wdt', label: 'WDT', count: 2 },
      { id: 'rdt', label: 'RDT', count: 1 },
      { id: 'warm-up < 15 min', label: 'Warm-up < 15 min', count: 1 },
    ]);
  });

  it('sums the filter up in a line', () => {
    expect(filterSummary(NO_FILTER, options)).toBeNull();
    expect(
      filterSummary(
        {
          ...NO_FILTER,
          pack: GUJI,
          grinder: ORO,
          sinceCare: true,
          tags: ['wdt'],
          taste: 'sour',
        },
        options,
      ),
    ).toBe(
      'Local roaster · Ethiopia Guji · Eureka ORO Mignon Single Dose Pro since care · WDT · Sour',
    );
  });
});
