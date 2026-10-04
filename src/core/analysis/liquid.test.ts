import { describe, expect, it } from 'vitest';
import { resampleLinear } from '../signal';
import { addedByOtherSteps, quadraticSG, sgWindowSamples, windowLiquid } from './liquid';
import type { Segmentation } from './segment';
import type { ShotWindow } from './shot-windows';
import type { Step } from './steps';

const step = (kind: Step['kind'], startT: number, endT: number, sizeG: number): Step => ({
  kind,
  tareSource: null,
  startT,
  endT,
  sizeG,
  levelBeforeG: 0,
  levelAfterG: 0,
});

describe('addedByOtherSteps', () => {
  it('adds the steps finished by then, and is NaN in the middle of one', () => {
    const steps = [step('other', 1, 1.3, 5), step('other', 2, 2.1, -2)];
    expect(addedByOtherSteps(steps, 0.5)).toBe(0);
    expect(addedByOtherSteps(steps, 1)).toBe(0); // the last sample before the change
    expect(addedByOtherSteps(steps, 1.2)).toBeNaN();
    expect(addedByOtherSteps(steps, 1.3)).toBe(5); // the first after it
    expect(addedByOtherSteps(steps, 3)).toBe(3);
  });
});

describe('windowLiquid', () => {
  it('takes the baseline and other steps out, and leaves their transitions out', () => {
    // 100 g of cup from 0 to 6 s, liquid rising at 1 g/s from 2 s, a 5 g spoon set down from
    // 3.0 s (last sample before) to 3.2 s (first after), and a tare at 5 s, already tracked.
    const t = Array.from({ length: 61 }, (_, k) => Math.round(k * 100) / 1000);
    const weightG = t.map((x) => 100 + Math.max(0, x - 2) + (x > 3.1 ? 5 : x > 3 ? 2.5 : 0));
    const series = resampleLinear(t, weightG, 0.1);
    const spoon = step('other', 3, 3.2, 5);
    const segmentation = {
      samples: { seq: t.map((_, i) => i), t, weightG },
      series,
      steps: [step('cup-placed', -1, -0.5, 100), spoon, step('tare', 5, 5.1, -105)],
    } as unknown as Segmentation;
    const window = {
      startT: 0.5,
      endT: 5.5,
      startIndex: 5,
      endIndex: 56,
      baseline: { startT: 0.5, endT: 1.9, levelG: 100, sigmaG: 0.01, sampleCount: 15 },
    } as ShotWindow;
    const liquid = windowLiquid(segmentation, window);
    expect(liquid.otherSteps).toEqual([spoon]);
    // Samples from 0.5 s to 5.5 s, but for 3.1 s inside the spoon's transition.
    expect(liquid.t).toHaveLength(50);
    expect(liquid.t).not.toContain(3.1);
    liquid.t.forEach((x, i) => expect(liquid.g[i]).toBeCloseTo(Math.max(0, x - 2), 9));
    // The grid from 0.5 s, NaN inside the transition only.
    expect(liquid.grid.start).toBeCloseTo(0.5, 9);
    expect(liquid.grid.values).toHaveLength(51);
    liquid.grid.values.forEach((value, k) => {
      const x = 0.5 + k * 0.1;
      if (Math.abs(x - 3.1) < 1e-6) expect(value).toBeNaN();
      else expect(value).toBeCloseTo(Math.max(0, x - 2), 9);
    });
  });
});

describe('sgWindowSamples', () => {
  it('takes the nearest odd count, at least 5', () => {
    expect(sgWindowSamples(0.5, 0.1)).toBe(5);
    expect(sgWindowSamples(0.5, 0.05)).toBe(11); // 10 samples: 11 is as near as 9
    expect(sgWindowSamples(0.5, 0.07)).toBe(7);
    expect(sgWindowSamples(0.5, 0.2)).toBe(5);
  });
});

describe('quadraticSG', () => {
  it('gives NaN wherever a window takes in a NaN, and for a series too short to fit', () => {
    const values = Array.from({ length: 15 }, (_, k) => (k === 7 ? Number.NaN : k));
    const smooth = quadraticSG(values, 5, 0.1);
    // Windows 5 … 9 take in sample 7; the ends fit samples 0 … 4 and 10 … 14.
    smooth.forEach((value, k) => {
      if (k >= 5 && k <= 9) expect(value).toBeNaN();
      else expect(value).toBeCloseTo(k, 9);
    });
    expect(quadraticSG(values, 5, 0.1, 1)[12]).toBeCloseTo(10, 9); // 1 per 0.1 s
    expect(quadraticSG([1, 2], 5, 0.1)).toEqual([Number.NaN, Number.NaN]);
  });
});
