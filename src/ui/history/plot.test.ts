import { describe, expect, it } from 'vitest';
import { yOfWeight, type ChartPoint } from '../brew/chart';
import {
  linePath,
  stageAt,
  stageNotes,
  stageRuns,
  stageSpans,
  referenceCurve,
  shotPlot,
  sparkline,
  timeTicks,
  weightTicks,
} from './plot';
import { simulatedEntry } from './test-entries';

/** The weight at `tS` on a chart's points, by the nearest point. */
function weightAt(points: readonly ChartPoint[], tS: number): number {
  let best = points[0];
  for (const point of points) if (Math.abs(point.tS - tS) < Math.abs(best.tS - tS)) best = point;
  expect(Math.abs(best.tS - tS)).toBeLessThan(0.15);
  return best.g;
}

// A shot with the tap at the pump, a pre-infusion of 7.4 s, and one without the tap: no pump_on.
const a = simulatedEntry({ seed: 1, shot: { preInfusionMs: 7400, extractionMs: 24_600 } });
const untapped = simulatedEntry({ seed: 3, manualStartMs: null });

describe('referenceCurve (T3.7)', () => {
  it('counts a tapped shot from its pump_on to 6 s after the pump stopped', () => {
    const points = referenceCurve(a.entry.segment!)!;
    expect(points[0].tS).toBeLessThanOrEqual(0);
    expect(points[1].tS).toBeGreaterThan(0);
    // The pump stops near 32 s.
    expect(Math.abs(points.at(-1)!.tS - 38)).toBeLessThan(0.5);
    expect(weightAt(points, 5)).toBeLessThan(0.5);
    expect(weightAt(points, 32)).toBeGreaterThan(30);
  });

  it('has none for a shot without pump_on, which can not be lined up', () => {
    expect(referenceCurve(untapped.entry.segment!)).toBeNull();
  });
});

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

describe('the stages (T3.16)', () => {
  const markers = { pumpOnS: 0, firstDripS: 7.4, pumpOffS: 32 };
  const points = [0, 5, 7.4, 10, 20, 32, 34, 38].map((tS) => ({
    tS,
    g: tS < 7.4 ? 0 : Math.min(36, (tS - 7.4) * 1.4),
    flowGps: 1,
  }));

  it('tells the stage at a moment: preinfusion, extraction, tail', () => {
    expect(stageAt(markers, 3)).toBe('preinfusion');
    expect(stageAt(markers, 7.4)).toBe('extraction');
    expect(stageAt(markers, 31.9)).toBe('extraction');
    expect(stageAt(markers, 32)).toBe('tail');
    // Without pump_off it is all extraction past the first drip; without a first drip too.
    expect(stageAt({ ...markers, pumpOffS: null }, 50)).toBe('extraction');
    expect(stageAt({ pumpOnS: null, firstDripS: null, pumpOffS: null }, 1)).toBe('extraction');
  });

  it('splits the curve by stage, each run joined to the next', () => {
    const runs = stageRuns(markers, points);
    expect(runs.preinfusion.map((p) => p.tS)).toEqual([0, 5, 7.4]);
    expect(runs.extraction.map((p) => p.tS)).toEqual([7.4, 10, 20, 32]);
    expect(runs.tail.map((p) => p.tS)).toEqual([32, 34, 38]);
  });

  it('spans the stages across the chart, without one it never reaches', () => {
    const scale = { fromS: 0, timeS: 40, weightG: 40 };
    expect(stageSpans(markers, scale)).toEqual([
      { stage: 'preinfusion', fromS: 0, toS: 7.4 },
      { stage: 'extraction', fromS: 7.4, toS: 32 },
      { stage: 'tail', fromS: 32, toS: 40 },
    ]);
    expect(stageSpans({ ...markers, pumpOffS: null }, scale).map((s) => s.stage)).toEqual([
      'preinfusion',
      'extraction',
    ]);
  });

  it('notes the stages ended by the moment, with how long they lasted, and the tail', () => {
    expect(stageNotes(markers, points, 5)).toEqual([]);
    expect(stageNotes(markers, points, 20)).toEqual([
      { stage: 'preinfusion', text: 'preinfusion 7.4 s' },
    ]);
    expect(stageNotes(markers, points, 38)).toEqual([
      { stage: 'preinfusion', text: 'preinfusion 7.4 s' },
      { stage: 'extraction', text: 'extraction 24.6 s' },
      { stage: 'tail', text: 'tail +1.6 g' },
    ]);
    // No pump_on: the preinfusion's length is unknown.
    expect(stageNotes({ ...markers, pumpOnS: null }, points, 20)).toEqual([]);
  });
});

describe('sparkline', () => {
  it('draws the weight from pump_on, and the target', () => {
    const spark = sparkline(a.entry.segment!, 36)!;
    expect(spark.weight).toMatch(/^M0 500L/);
    expect(spark.weight.match(/M/g)).toHaveLength(1);
    // The flow too, on 0–5 g/s (T3.13).
    expect(spark.flow).toMatch(/^M/);
    expect(spark.flow).not.toBe(spark.weight);
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
