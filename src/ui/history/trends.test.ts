import { describe, expect, it } from 'vitest';
import { createShot, type Direction, type GrindSetting } from '../../core/model';
import {
  singleGrinder,
  slopeText,
  trend,
  trendChart,
  TREND_BOX,
  xText,
  yText,
  type TrendEntry,
} from './trends';

const ORO = '019a0000-0000-7000-8000-00000000a001';
const C40 = '019a0000-0000-7000-8000-00000000a002';
const utc = () => 0;
const AT = Date.UTC(2026, 9, 5, 7);
const DAY = 86_400_000;

function entry({
  setting,
  firstDripS,
  ratio = 2,
  direction = null,
  grinderId = ORO,
  daysAgo = 0,
}: {
  setting: number | null;
  firstDripS: number | null;
  ratio?: number | null;
  direction?: Direction | null;
  grinderId?: string;
  daysAgo?: number;
}): TrendEntry {
  const atEpochMs = AT - daysAgo * DAY;
  const grindSetting: GrindSetting | null =
    setting === null ? null : { kind: 'stepless', value: setting };
  return {
    shot: createShot(
      {
        recordingId: '019a0000-0000-7000-8000-0000000000aa',
        anchorTMs: 1000,
        source: 'live',
        grinderId,
        grindSetting,
        packRoastDate: '2026-09-25',
        direction,
      },
      atEpochMs,
    ),
    atEpochMs,
    segment: { metrics: { firstDripS, totalS: 30, yieldG: 36 } },
    match: { ratio },
  };
}

// Finer (lower) settings run slower: 2 s more to the first drip per step down.
const ENTRIES = [
  entry({ setting: 6.0, firstDripS: 8, direction: 'balanced' }),
  entry({ setting: 6.2, firstDripS: 6, direction: 'sour', daysAgo: 1 }),
  entry({ setting: 5.8, firstDripS: 10, direction: 'bitter', daysAgo: 2 }),
  entry({ setting: null, firstDripS: 7, daysAgo: 3 }),
  entry({ setting: 6.1, firstDripS: null, daysAgo: 4 }),
];

describe('trend', () => {
  it('takes every shot with both figures, and fits a line through them', () => {
    const t = trend(ENTRIES, 'grind', 'firstDrip', utc);
    expect(t.points.map(({ x, y, taste }) => [x, y, taste])).toEqual([
      [6.0, 8, 'balanced'],
      [6.2, 6, 'sour'],
      [5.8, 10, 'bitter'],
    ]);
    expect(t.fit?.slope).toBeCloseTo(-10, 6);
    expect(t.fit?.intercept).toBeCloseTo(68, 6);
  });

  it('draws against days off roast, or the day', () => {
    expect(trend(ENTRIES, 'roast', 'ratio', utc).points.map((p) => p.x)).toEqual([10, 9, 8, 7, 6]);
    const days = trend(ENTRIES, 'date', 'firstDrip', utc).points.map((p) => p.x);
    expect(days[0] - days[1]).toBe(1);
  });

  it('fits nothing under three points, or with every point at one x', () => {
    expect(trend(ENTRIES.slice(0, 2), 'grind', 'firstDrip', utc).fit).toBeNull();
    const same = [6, 7, 8].map((firstDripS) => entry({ setting: 6, firstDripS }));
    expect(trend(same, 'grind', 'firstDrip', utc).fit).toBeNull();
  });
});

describe('singleGrinder', () => {
  it('is the grinder all the settings share, else none', () => {
    expect(singleGrinder(ENTRIES)).toBe(ORO);
    expect(
      singleGrinder([...ENTRIES, entry({ setting: 20, firstDripS: 7, grinderId: C40 })]),
    ).toBeNull();
    expect(singleGrinder([entry({ setting: null, firstDripS: 7 })])).toBeNull();
  });
});

describe('trendChart', () => {
  const chart = trendChart(trend(ENTRIES, 'grind', 'firstDrip', utc), String, String)!;
  const { width, height, left, right, top, bottom } = TREND_BOX;

  it('places the dots inside the plot, finer to the left and slower up', () => {
    for (const dot of chart.dots) {
      expect(dot.cx).toBeGreaterThan(left);
      expect(dot.cx).toBeLessThan(width - right);
      expect(dot.cy).toBeGreaterThan(top);
      expect(dot.cy).toBeLessThan(height - bottom);
    }
    const [at6, at62, at58] = chart.dots;
    expect(at58.cx).toBeLessThan(at6.cx);
    expect(at6.cx).toBeLessThan(at62.cx);
    expect(at58.cy).toBeLessThan(at62.cy);
  });

  it('runs the fitted line from the lowest x to the highest, through the dots here', () => {
    expect(chart.line).toEqual({
      x1: chart.dots[2].cx,
      y1: chart.dots[2].cy,
      x2: chart.dots[1].cx,
      y2: chart.dots[1].cy,
    });
  });

  it('ticks both ends of each axis', () => {
    expect(chart.xTicks.map((t) => t.label)).toEqual(['5.8', '6.2']);
    expect(chart.yTicks.map((t) => t.label)).toEqual(['10', '6']);
  });

  it('draws a lone shot in the middle, with one tick per axis', () => {
    const lone = trendChart(trend([ENTRIES[0]], 'grind', 'firstDrip', utc), String, String)!;
    expect(lone.dots[0].cx).toBeCloseTo((left + width - right) / 2, 0);
    expect(lone.line).toBeNull();
    expect(lone.xTicks).toHaveLength(1);
    expect(trendChart(trend([], 'grind', 'firstDrip', utc), String, String)).toBeNull();
  });
});

describe('the trend in words', () => {
  it('says what the line does per step across', () => {
    const t = trend(ENTRIES, 'grind', 'firstDrip', utc);
    expect(slopeText(t, 'stepless')).toBe(
      'First drip −1.0 s per 0.1 of grind, fitted over 3 shots',
    );
    expect(slopeText(t, 'clicks')).toBe('First drip −10.0 s per click, fitted over 3 shots');
    expect(slopeText(trend(ENTRIES.slice(0, 2), 'grind', 'firstDrip', utc), 'stepless')).toBeNull();
  });

  it('writes a slope that rounds to nothing as ±0', () => {
    const flat = trend(ENTRIES, 'roast', 'ratio', utc);
    expect(slopeText(flat, 'stepless')).toBe('Ratio ±0.00 per day off roast, fitted over 5 shots');
  });

  it('labels the axes', () => {
    expect(xText('grind', 6.2, 'stepless')).toBe('6.2');
    expect(xText('grind', 22, 'clicks')).toBe('22');
    expect(xText('roast', 12, 'stepless')).toBe('12 d');
    expect(yText('firstDrip', 8)).toBe('8.0 s');
    expect(yText('ratio', 2.08)).toBe('1:2.1');
    expect(yText('yield', 36)).toBe('36.0 g');
  });
});
