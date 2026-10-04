import { describe, expect, it } from 'vitest';
import { Rng } from '../sim';
import { rollingStep, stepAcrossGap } from './step';

describe('stepAcrossGap', () => {
  it('takes the mean after the gap less the mean before it', () => {
    // A cup placed: 0 g, two samples settling, then 250 g.
    const values = [0, 0, 0, 0, 120, 260, 250, 250, 250, 250];
    expect(stepAcrossGap(values, { gapStart: 4, gapEnd: 6, window: 4 })).toBe(250);
    expect(stepAcrossGap(values, { gapStart: 4, gapEnd: 4, window: 2 })).toBe(190 - 0);
    expect(stepAcrossGap([5, 7], { gapStart: 1, gapEnd: 1, window: 1 })).toBe(2);
  });

  it('gives exactly 0 across a level', () => {
    const level = Array.from({ length: 20 }, () => 18.3);
    expect(stepAcrossGap(level, { gapStart: 7, gapEnd: 10, window: 7 })).toBe(0);
  });

  it('needs both windows within the values, and a gap that does not run backwards', () => {
    const values = [1, 2, 3, 4, 5, 6];
    expect(() => stepAcrossGap(values, { gapStart: 2, gapEnd: 3, window: 3 })).toThrow(RangeError);
    expect(() => stepAcrossGap(values, { gapStart: 3, gapEnd: 4, window: 3 })).toThrow(RangeError);
    expect(() => stepAcrossGap(values, { gapStart: 3, gapEnd: 2, window: 1 })).toThrow(RangeError);
    expect(() => stepAcrossGap(values, { gapStart: 3, gapEnd: 3, window: 0 })).toThrow(RangeError);
    expect(() => stepAcrossGap(values, { gapStart: 2.5, gapEnd: 3, window: 1 })).toThrow(
      RangeError,
    );
  });
});

describe('rollingStep', () => {
  it('gives the step across every gap that fits, as stepAcrossGap does', () => {
    const rng = new Rng(2);
    const values = Array.from({ length: 300 }, (_, i) => (i > 150 ? 40 : 0) + rng.gaussian());
    for (const [window, gap] of [
      [1, 0],
      [5, 0],
      [5, 3],
      [20, 7],
    ]) {
      const steps = rollingStep(values, { window, gap });
      expect(steps).toHaveLength(values.length - 2 * window - gap + 1);
      steps.forEach((step, k) => {
        const gapStart = k + window;
        const expected = stepAcrossGap(values, { gapStart, gapEnd: gapStart + gap, window });
        expect(step).toBeCloseTo(expected, 10);
      });
    }
  });

  it('rises to the full step while the edge sits in the gap', () => {
    const values = Array.from({ length: 40 }, (_, i) => (i < 20 ? 1 : 3));
    const steps = rollingStep(values, { window: 4, gap: 2 });
    // The k-th compares k … k + 3 with k + 6 … k + 9: the full 2 for k = 14 … 16, when the
    // edge at 20 falls in the gap or opens the window after; a ramp of 0.5 a sample either side.
    const expected = steps.map((_, k) => Math.max(0, Math.min(2, 0.5 * (k - 10), 0.5 * (20 - k))));
    steps.forEach((step, k) => expect(step).toBeCloseTo(expected[k], 12));
    expect(expected.slice(9, 22)).toEqual([0, 0, 0.5, 1, 1.5, 2, 2, 2, 1.5, 1, 0.5, 0, 0]);
  });

  it('gives nothing for a series too short for both windows and the gap', () => {
    expect(rollingStep([1, 2, 3, 4], { window: 2, gap: 1 })).toEqual([]);
    expect(rollingStep([1, 2, 3, 4], { window: 2 })).toEqual([2]);
  });

  it('needs a whole window and a gap of at least 0', () => {
    expect(() => rollingStep([1, 2, 3], { window: 0 })).toThrow(RangeError);
    expect(() => rollingStep([1, 2, 3], { window: 1, gap: -1 })).toThrow(RangeError);
  });
});
