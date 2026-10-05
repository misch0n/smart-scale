import { describe, expect, it } from 'vitest';
import { xOf, yOfWeight, type ChartPoint } from '../brew/chart';
import {
  linePath,
  overlayPlot,
  placeMarks,
  shotPlot,
  sparkline,
  timeTicks,
  weightTicks,
  type OverlayPlot,
} from './plot';
import { simulatedEntry } from './test-entries';

/** The weight at `tS` on a chart's points, by the nearest point. */
function weightAt(points: readonly ChartPoint[], tS: number): number {
  let best = points[0];
  for (const point of points) if (Math.abs(point.tS - tS) < Math.abs(best.tS - tS)) best = point;
  expect(Math.abs(best.tS - tS)).toBeLessThan(0.15);
  return best.g;
}

// Two shots with the tap at the pump, pre-infusions of 7.4 and 5.2 s (board History-Compare),
// and one without the tap: no pump_on.
const a = simulatedEntry({ seed: 1, shot: { preInfusionMs: 7400, extractionMs: 24_600 } });
const b = simulatedEntry({ seed: 2, shot: { preInfusionMs: 5200, extractionMs: 21_800 } });
const untapped = simulatedEntry({ seed: 3, manualStartMs: null });

describe('shotPlot', () => {
  it('counts a tapped shot from pump_on, from 0 to past the pump stopping', () => {
    const plot = shotPlot(a.entry.segment!, 36)!;
    expect(plot.zero).toBe('pumpOn');
    expect(plot.scale).toEqual({ fromS: 0, timeS: 40, weightG: 40 });
    expect(plot.markers.pumpOnS).toBe(0);
    expect(Math.abs(plot.markers.firstDripS! - 7.4)).toBeLessThan(0.3);
    expect(Math.abs(plot.markers.pumpOffS! - 32)).toBeLessThan(0.3);
    // From the point before pump_on, which the plot holds at its edge, to past its end.
    expect(plot.points[0].tS).toBeLessThan(0);
    expect(plot.points[1].tS).toBeGreaterThanOrEqual(0);
    expect(plot.points.at(-1)!.tS).toBeGreaterThanOrEqual(40);
    // Dry until the first drip, then the shot's yield.
    expect(weightAt(plot.points, 6.5)).toBeLessThan(0.15);
    expect(Math.abs(weightAt(plot.points, 37) - a.truth.yieldG)).toBeLessThan(0.5);
  });

  it('counts an untapped shot from its first drip, starting 3 s before it', () => {
    const plot = shotPlot(untapped.entry.segment!, 36)!;
    expect(plot.zero).toBe('firstDrip');
    expect(plot.scale.fromS).toBe(-3);
    expect(plot.markers).toMatchObject({ pumpOnS: null, firstDripS: 0 });
    expect(plot.points[0].tS).toBeLessThan(-3);
    expect(weightAt(plot.points, -1)).toBeLessThan(0.15);
    expect(weightAt(plot.points, 3)).toBeGreaterThan(0.5);
  });

  it('grows the weight axis for the target and the cup', () => {
    expect(shotPlot(a.entry.segment!, 54)!.scale.weightG).toBe(60);
    expect(shotPlot(a.entry.segment!, null)!.scale.weightG).toBe(40);
  });
});

describe('overlayPlot', () => {
  const at = (plot: OverlayPlot, series: 0 | 1, tS: number) => weightAt(plot.series[series], tS);

  it('aligns both shots at the first drip, from as long before as the longer pre-infusion', () => {
    const plot = overlayPlot(a.entry.segment, b.entry.segment, 'firstDrip');
    expect(plot.zero).toBe('firstDrip');
    expect(plot.available).toEqual(['pumpOn', 'firstDrip']);
    // −8…32 s, as the board draws it: 0 at a fifth of the width.
    expect(plot.scale).toEqual({ fromS: -8, timeS: 40, weightG: 40 });
    expect(xOf(plot.scale, 0)).toBe(200);
    for (const series of [0, 1] as const) {
      expect(at(plot, series, -0.6)).toBeLessThan(0.15);
      expect(at(plot, series, 2)).toBeGreaterThan(0.5);
    }
  });

  it('aligns both shots at pump_on, from 1 s before it', () => {
    const plot = overlayPlot(a.entry.segment, b.entry.segment, 'pumpOn');
    expect(plot.zero).toBe('pumpOn');
    expect(plot.scale).toEqual({ fromS: -1, timeS: 40, weightG: 40 });
    // B drips from 5.2 s, A not before 7.4 s.
    expect(at(plot, 1, 4.6)).toBeLessThan(0.15);
    expect(at(plot, 1, 6.5)).toBeGreaterThan(0.3);
    expect(at(plot, 0, 6.5)).toBeLessThan(0.15);
    expect(at(plot, 0, 9)).toBeGreaterThan(0.3);
  });

  it('falls back to the first drip when a shot has no pump_on', () => {
    const plot = overlayPlot(a.entry.segment, untapped.entry.segment, 'pumpOn');
    expect(plot.available).toEqual(['firstDrip']);
    expect(plot.zero).toBe('firstDrip');
    expect(at(plot, 1, -0.6)).toBeLessThan(0.15);
    expect(at(plot, 1, 2)).toBeGreaterThan(0.5);
  });

  it('draws what it can of a shot without a segment', () => {
    const plot = overlayPlot(a.entry.segment, null, 'firstDrip');
    expect(plot.available).toEqual([]);
    expect(plot.zero).toBe('firstDrip');
    expect(plot.series[0].length).toBeGreaterThan(100);
    expect(plot.series[1]).toEqual([]);
  });
});

describe('the axes’ labels', () => {
  it('run from 0 to the end on the detail', () => {
    expect(timeTicks({ fromS: 0, timeS: 40, weightG: 40 }, 'pumpOn')).toEqual([
      { left: '0%', label: '0', anchor: 'start' },
      { left: '25%', label: '10', anchor: 'middle' },
      { left: '50%', label: '20', anchor: 'middle' },
      { left: '75%', label: '30', anchor: 'middle' },
      { left: '100%', label: '40 s', anchor: 'end' },
    ]);
  });

  it('are signed from the first drip, not from pump_on (board History-Compare)', () => {
    const labels = (fromS: number, timeS: number, zero: 'pumpOn' | 'firstDrip') =>
      timeTicks({ fromS, timeS, weightG: 40 }, zero).map((t) => [t.left, t.label]);
    expect(labels(-8, 40, 'firstDrip')).toEqual([
      ['20%', '0'],
      ['45%', '+10'],
      ['70%', '+20'],
      ['95%', '+30 s'],
    ]);
    expect(labels(-1, 40, 'pumpOn')).toEqual([
      ['2.5%', '0'],
      ['27.5%', '10'],
      ['52.5%', '20'],
      ['77.5%', '30 s'],
    ]);
    expect(labels(-3, 60, 'firstDrip').map(([, label]) => label)).toEqual([
      '0',
      '+15',
      '+30',
      '+45 s',
    ]);
  });

  it('mark the weight at its quarters, top down', () => {
    expect(weightTicks({ timeS: 40, weightG: 40 })).toEqual([
      { top: '25%', label: '30 g' },
      { top: '50%', label: '20' },
      { top: '75%', label: '10' },
    ]);
  });
});

describe('placeMarks', () => {
  const scale = { fromS: 0, timeS: 40, weightG: 40 };
  const marks = (firstDripS: number, pumpOffS: number) => [
    { tS: 0, label: 'pump on' },
    { tS: firstDripS, label: 'first drip' },
    { tS: pumpOffS, label: 'pump off' },
  ];

  it('keeps the labels on one line when they fit (board History-Detail)', () => {
    expect(placeMarks(scale, marks(7.4, 32)).map((m) => [m.x, m.right, m.row])).toEqual([
      [0, false, 0],
      [185, false, 0],
      [800, true, 0],
    ]);
  });

  it('puts a label that would overlap on the next line: a short pre-infusion', () => {
    // Session 2's shots: the first drip 3.3 s after the tap.
    expect(placeMarks(scale, marks(3.3, 11.5)).map((m) => m.row)).toEqual([0, 1, 0]);
    expect(placeMarks(scale, marks(3.3, 5)).map((m) => m.row)).toEqual([0, 1, 2]);
  });
});

describe('sparkline', () => {
  it('draws the weight from pump_on, and the target', () => {
    const spark = sparkline(a.entry.segment!, 36)!;
    expect(spark.weight).toMatch(/^M0 500L/);
    expect(spark.weight.match(/M/g)).toHaveLength(1);
    expect(spark.targetY).toBe(yOfWeight({ timeS: 40, weightG: 40 }, 36));
    expect(sparkline(a.entry.segment!, null)!.targetY).toBeNull();
  });
});

describe('linePath', () => {
  it('breaks the line where points are missing', () => {
    const points: ChartPoint[] = [0, 0.2, 0.4, 2.4, 2.6].map((tS) => ({ tS, g: tS, flowGps: 1 }));
    const path = linePath({ timeS: 40, weightG: 40 }, points, 'g');
    expect(path.match(/M/g)).toHaveLength(2);
  });
});
