import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from '../../app/history';
import { simulatedEntry } from '../history/test-entries';
import { homeSummary } from './summary';

const a = simulatedEntry({ seed: 1 }).entry;
const b = simulatedEntry({ seed: 2, shot: { yieldG: 40, preInfusionMs: 9000 } }).entry;

/** `entry` as if pulled at `atEpochMs`, with `shot` changes. */
function at(
  entry: HistoryEntry,
  atEpochMs: number,
  shot: Partial<HistoryEntry['shot']> = {},
): HistoryEntry {
  return { ...entry, atEpochMs, shot: { ...entry.shot, ...shot } };
}

const now = new Date(2026, 9, 4, 18).getTime(); // Sunday evening
const sunday = (hour: number, minute = 0) => new Date(2026, 9, 4, hour, minute).getTime();
const weekStart = new Date(2026, 8, 28).getTime(); // the Monday before, 00:00

describe('homeSummary', () => {
  it('has no last shot and an empty week without shots', () => {
    expect(homeSummary([], now)).toEqual({
      last: null,
      week: {
        shots: 0,
        ratio: null,
        firstDripS: null,
        extractionS: null,
        tastes: { sour: 0, balanced: 0, bitter: 0 },
        graded: 0,
        channelled: 0,
      },
    });
  });

  it('shows one shot as the last, with its figures, and the week as that shot', () => {
    const entry = at(a, sunday(7, 12), { recipeName: 'Cappuccino', direction: 'balanced' });
    const metrics = a.segment!.metrics;
    const { last, week } = homeSummary([entry], now);
    expect(last).toMatchObject({
      id: a.shot.id,
      day: 'Sun',
      time: '07:12',
      drink: 'Cappuccino',
      taste: 'balanced',
      yieldG: metrics.yieldG!.toFixed(1),
      ratio: `1:${a.match.ratio!.toFixed(2)}`,
      firstDripS: metrics.firstDripS!.toFixed(1),
    });
    expect(last?.spark?.weight).toMatch(/^M0 500/);
    expect(last?.spark?.targetY).toBe(50); // 36 g of 40
    expect(week).toEqual({
      shots: 1,
      ratio: last?.ratio,
      firstDripS: last?.firstDripS,
      extractionS: metrics.extractionS!.toFixed(1),
      tastes: { sour: 0, balanced: 1, bitter: 0 },
      graded: 1,
      channelled: 0,
    });
  });

  it('takes the newest shot as the last, and averages the week over the shots with each figure', () => {
    const unmatched: HistoryEntry = {
      ...at(a, sunday(9), { direction: 'sour', channelled: true }),
      segment: null,
      match: { ...a.match, segment: null, ratio: null },
    };
    const entries = [
      at(a, sunday(7), { direction: 'sour' }),
      unmatched,
      at(b, sunday(8), { direction: 'bitter', channelled: false }),
      at(a, weekStart, { direction: null }),
      at(b, weekStart - 1, { direction: 'balanced', channelled: true }),
    ];
    const { last, week } = homeSummary(entries, now);
    expect(last).toMatchObject({ day: 'Sun', time: '09:00', taste: 'sour', spark: null });
    expect(last).toMatchObject({ yieldG: null, ratio: null, firstDripS: null });

    const mean = (x: number, y: number, z: number) => (x + y + z) / 3;
    const [ma, mb] = [a.segment!.metrics, b.segment!.metrics];
    // Two shots that differ, so the averages tell the shots apart.
    expect(Math.abs(a.match.ratio! - b.match.ratio!)).toBeGreaterThan(0.1);
    expect(Math.abs(ma.firstDripS! - mb.firstDripS!)).toBeGreaterThan(1);
    expect(week).toEqual({
      shots: 4,
      ratio: `1:${mean(a.match.ratio!, b.match.ratio!, a.match.ratio!).toFixed(2)}`,
      firstDripS: mean(ma.firstDripS!, mb.firstDripS!, ma.firstDripS!).toFixed(1),
      extractionS: mean(ma.extractionS!, mb.extractionS!, ma.extractionS!).toFixed(1),
      tastes: { sour: 2, balanced: 0, bitter: 1 },
      graded: 3,
      channelled: 1,
    });
  });

  it('dates a last shot older than the last seven days', () => {
    const { last, week } = homeSummary([at(a, new Date(2026, 8, 27, 7, 5).getTime())], now);
    expect(last).toMatchObject({ day: 'Sun 27 Sep', time: '07:05' });
    expect(week.shots).toBe(0);
    expect(week.ratio).toBeNull();
  });
});
