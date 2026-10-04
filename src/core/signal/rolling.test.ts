import { describe, expect, it } from 'vitest';
import { Rng } from '../sim';
import { rollingMean, rollingRange, rollingVariance } from './rolling';

/** Each window's statistic, computed the slow way. */
function naive(values: number[], window: number, statistic: (w: number[]) => number): number[] {
  return Array.from({ length: Math.max(0, values.length - window + 1) }, (_, k) =>
    statistic(values.slice(k, k + window)),
  );
}

const naiveMean = (w: number[]) => w.reduce((sum, v) => sum + v, 0) / w.length;
const naiveVariance = (w: number[]) => {
  const m = naiveMean(w);
  return w.reduce((sum, v) => sum + (v - m) ** 2, 0) / (w.length - 1);
};
const naiveRange = (w: number[]) => Math.max(...w) - Math.min(...w);

/**
 * Like a weight trace: around `level`, with noise, steps (a cup placed, a tare) and stretches
 * where the readings sit on a 0.1 g grid.
 */
function trace(rng: Rng, length: number, level: number): number[] {
  let base = level;
  return Array.from({ length }, (_, i) => {
    if (rng.next() < 0.01) base += rng.uniform(-300, 300);
    const value = base + 0.05 * rng.gaussian();
    return i % 400 < 150 ? Math.round(value * 10) / 10 : value;
  });
}

describe('rolling statistics', () => {
  const rng = new Rng(5);
  const series: readonly [string, number[]][] = [
    ['near zero', trace(rng.fork('zero'), 2000, 0)],
    ['far from zero', trace(rng.fork('far'), 2000, 10_000)],
    ['short', [3, 1, 4, 1, 5]],
  ];

  it.each(series)('match the slow way on values %s', (_, values) => {
    // Rounding is relative to the values' size: a part in 10¹² of it, plus a part in 10⁹ of
    // a variance as big as a 300 g step makes it.
    const scale = Math.max(1, ...values.map(Math.abs));
    for (const window of [1, 2, 3, 5, 7, 50, values.length, values.length + 1]) {
      expect(rollingRange(values, window)).toEqual(naive(values, window, naiveRange));
      const means = naive(values, window, naiveMean);
      const actualMeans = rollingMean(values, window);
      expect(actualMeans).toHaveLength(means.length);
      actualMeans.forEach((v, k) => expect(Math.abs(v - means[k])).toBeLessThan(1e-12 * scale));
      if (window < 2) continue;
      const variances = naive(values, window, naiveVariance);
      const actualVariances = rollingVariance(values, window);
      expect(actualVariances).toHaveLength(variances.length);
      actualVariances.forEach((v, k) =>
        expect(Math.abs(v - variances[k])).toBeLessThan(1e-12 * scale + 1e-9 * variances[k]),
      );
    }
  });

  it('keep the variance of a quiet stretch after a step accurate', () => {
    // Noise of 0.01 g after a 400 g step: the update has to lose a variance of 10⁴.
    const values = [
      ...Array.from({ length: 10 }, () => 0),
      ...Array.from({ length: 500 }, (_, i) => 400 + 0.01 * Math.sin(i * 1.7)),
    ];
    const expected = naive(values, 5, naiveVariance);
    rollingVariance(values, 5).forEach((v, k) =>
      expect(Math.abs(v - expected[k])).toBeLessThan(1e-12 + 1e-9 * expected[k]),
    );
  });

  it('give exactly 0 spread for equal values', () => {
    const values = Array.from({ length: 100 }, () => 123.4);
    expect(rollingVariance(values, 7).every((v) => v === 0)).toBe(true);
    expect(rollingRange(values, 7).every((v) => v === 0)).toBe(true);
    expect(rollingMean(values, 7).every((v) => v === 123.4)).toBe(true);
  });

  it('give nothing for a series shorter than the window', () => {
    expect(rollingMean([1, 2], 3)).toEqual([]);
    expect(rollingVariance([], 2)).toEqual([]);
    expect(rollingRange([1], 2)).toEqual([]);
  });

  it('take Float64Array too', () => {
    expect(rollingRange(new Float64Array([1, 5, 2, 8, 3]), 2)).toEqual([4, 3, 6, 5]);
  });

  it('need a whole window, and two values for a variance', () => {
    expect(() => rollingMean([1, 2], 0)).toThrow(RangeError);
    expect(() => rollingRange([1, 2], 1.5)).toThrow(RangeError);
    expect(() => rollingVariance([1, 2], 1)).toThrow(RangeError);
  });
});
