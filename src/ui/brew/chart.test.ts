import { describe, expect, it } from 'vitest';
import {
  curvePath,
  quarterTicks,
  share,
  timeAxisS,
  weightAxisG,
  xOf,
  yOfFlow,
  FLOW_TICKS,
  flowTop,
  weightTicks,
  yOfWeight,
  type ChartPoint,
} from './chart';

describe('the axes', () => {
  it('run 0–40 g up to a 36 g target, as the waiting screen draws them, then grow', () => {
    expect(weightAxisG(33.8)).toBe(40);
    expect(weightAxisG(36)).toBe(40);
    expect(weightAxisG(36.1)).toBe(60);
    expect(weightAxisG(54)).toBe(60);
    expect(weightAxisG(90)).toBe(100);
    expect(weightAxisG(5000)).toBe(500);
  });

  it('let the cup fill to the top before they grow', () => {
    expect(weightAxisG(36, 38.1)).toBe(40);
    expect(weightAxisG(36, 40)).toBe(40);
    expect(weightAxisG(36, 40.1)).toBe(60);
    expect(weightAxisG(0, 0)).toBe(40);
  });

  it('run 0–40 s, then longer as the shot needs', () => {
    expect(timeAxisS(0)).toBe(40);
    expect(timeAxisS(40)).toBe(40);
    expect(timeAxisS(40.1)).toBe(60);
    expect(timeAxisS(100)).toBe(120);
  });

  it('are labelled at their quarters', () => {
    expect(quarterTicks(40)).toEqual([10, 20, 30, 40]);
    expect(quarterTicks(60)).toEqual([15, 30, 45, 60]);
  });
});

describe('the plot', () => {
  const scale = { timeS: 40, weightG: 40 };

  it('puts time across and weight and flow up, y down, inside the plot', () => {
    expect(xOf(scale, 7.4)).toBe(185);
    expect(xOf(scale, -1)).toBe(0);
    expect(xOf(scale, 50)).toBe(1000);
    expect(yOfWeight(scale, 33.8)).toBe(77.5);
    expect(yOfWeight(scale, -0.2)).toBe(500);
    // 0–5 g/s (T3.9).
    expect(yOfFlow(2.5)).toBe(250);
    expect(yOfFlow(6)).toBe(0);
  });

  it('starts at `fromS` when the chart shows time before its zero', () => {
    const from = { ...scale, fromS: -8 };
    expect(xOf(from, -8)).toBe(0);
    expect(xOf(from, 0)).toBe(200);
    expect(xOf(from, 32)).toBe(1000);
    expect(xOf(from, -9)).toBe(0);
  });

  it('draws a curve through the points, skipping close ones but not the last', () => {
    const points: ChartPoint[] = [
      { tS: 0, g: 0, flowGps: null },
      { tS: 0.1, g: 0, flowGps: null },
      { tS: 0.2, g: 0.2, flowGps: 0.5 },
      { tS: 0.3, g: 0.4, flowGps: 1.5 },
      { tS: 0.4, g: 0.6, flowGps: 3 },
    ];
    expect(curvePath(scale, points, 'g')).toBe('M0 500L5 497.5L10 492.5');
    // The flow starts where it is known.
    expect(curvePath(scale, points, 'flowGps')).toBe('M5 450L10 200');
    expect(curvePath(scale, [], 'g')).toBe('');
  });

  it('places labels as shares of the plot', () => {
    expect(share(185, 1000)).toBe('18.5%');
    expect(share(77.5, 500)).toBe('15.5%');
  });
});

describe('the axes labels (T3.9)', () => {
  it('labels the flow 1–4 g/s from the top, and the weight at its quarters clear of the target', () => {
    expect(FLOW_TICKS.map(flowTop)).toEqual(['80%', '60%', '40%', '20%']);
    expect(weightTicks(40, null)).toEqual([10, 20, 30]);
    // A target of 34 g on 0–40 g sits 10 % from 30: kept; of 31 g, 2.5 %: dropped.
    expect(weightTicks(40, 34)).toEqual([10, 20, 30]);
    expect(weightTicks(40, 31)).toEqual([10, 20]);
  });
});
