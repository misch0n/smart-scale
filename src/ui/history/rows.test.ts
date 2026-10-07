import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from '../../app/history';
import { dayLabel, historyRow, historySections, shotCount } from './rows';
import { simulatedEntry, SUNDAY_7AM } from './test-entries';

const { entry } = simulatedEntry({ seed: 1 });

/** `entry` as if pulled at `atEpochMs`, with `shot` changes. */
function at(atEpochMs: number, shot: Partial<HistoryEntry['shot']> = {}): HistoryEntry {
  return { ...entry, atEpochMs, shot: { ...entry.shot, ...shot } };
}

describe('dayLabel', () => {
  it('names the day as the board does, in local time', () => {
    expect(dayLabel(new Date(2026, 9, 4, 7, 12).getTime())).toBe('Sun 4 Oct');
    expect(dayLabel(new Date(2026, 8, 28, 23, 59).getTime())).toBe('Mon 28 Sep');
    expect(dayLabel(new Date(2027, 0, 1, 0, 0).getTime())).toBe('Fri 1 Jan');
  });
});

describe('historyRow', () => {
  it('shows the day and time, the drink, the taste, channelling and a small graph', () => {
    const row = historyRow(
      at(new Date(2026, 9, 4, 7, 12).getTime(), {
        recipeName: 'Cappuccino',
        direction: 'balanced',
        channelled: true,
      }),
    );
    expect(row).toMatchObject({
      id: entry.shot.id,
      day: 'Sun 4 Oct',
      time: '07:12',
      drink: 'Cappuccino',
      taste: 'balanced',
      channelled: true,
      unmatched: false,
    });
    expect(row.spark?.weight).toMatch(/^M0 500/);
    expect(row.spark?.targetY).toBe(50); // 36 g of 40
  });

  it('calls a shot without a recipe Espresso, and flags one without a segment', () => {
    const row = historyRow({
      ...at(SUNDAY_7AM, { recipeName: null, direction: null, channelled: null }),
      segment: null,
    });
    expect(row).toMatchObject({ drink: 'Espresso', taste: null, channelled: false });
    expect(row.unmatched).toBe(true);
    expect(row.spark).toBeNull();
  });
});

describe('historySections', () => {
  const now = new Date(2026, 9, 4, 18).getTime(); // Sunday evening
  const weekStart = new Date(2026, 8, 28).getTime(); // the Monday before, 00:00

  it('puts today and the six days before under "Last 7 days", the rest under "Earlier"', () => {
    const entries = [at(now - 3_600_000), at(weekStart), at(weekStart - 1), at(weekStart - 9e8)];
    const sections = historySections(entries, now);
    expect(sections.map((section) => [section.title, section.rows.length])).toEqual([
      ['Last 7 days', 2],
      ['Earlier', 2],
    ]);
    expect(sections[1].rows.map((row) => row.day)).toEqual(['Sun 27 Sep', 'Thu 17 Sep']);
  });

  it('leaves out a section without shots', () => {
    expect(historySections([at(now)], now).map((section) => section.title)).toEqual([
      'Last 7 days',
    ]);
    expect(historySections([], now)).toEqual([]);
  });

  it('counts shots', () => {
    expect([shotCount(1), shotCount(7), shotCount(0)]).toEqual(['1 shot', '7 shots', '0 shots']);
  });
});
