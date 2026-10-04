import { describe, expect, it } from 'vitest';
import { Rng } from '../sim';
import { resampleLinear } from './resample';

describe('resampleLinear', () => {
  it('puts points of a straight line on the grid exactly, however uneven their times', () => {
    const rng = new Rng(3);
    const times: number[] = [];
    for (let t = 0.013; times.length < 200; t += rng.uniform(0.02, 0.3)) times.push(t);
    const line = (t: number) => 4.5 - 2.25 * t;
    const series = resampleLinear(times, times.map(line), 0.1, { start: 0.1 });
    expect(series.start).toBe(0.1);
    expect(series.step).toBe(0.1);
    expect(series.values.length).toBe(Math.floor((times[199] - 0.1) / 0.1) + 1);
    series.values.forEach((value, k) => expect(value).toBeCloseTo(line(0.1 + k * 0.1), 10));
  });

  it('interpolates between the samples on either side, and hits samples on the grid exactly', () => {
    const series = resampleLinear([0, 1, 3], [10, 20, 0], 0.5);
    expect(series).toEqual({ start: 0, step: 0.5, values: [10, 15, 20, 15, 10, 5, 0] });
  });

  it('counts samples that share a time once, with their mean', () => {
    // A burst of three frames at t = 1, whose spacing was lost.
    const series = resampleLinear([0, 1, 1, 1, 2], [0, 1, 2, 3, 4], 0.5);
    expect(series.values).toEqual([0, 1, 2, 3, 4]);
    expect(resampleLinear([5, 5], [0.1, 0.1], 1).values).toEqual([0.1]);
  });

  it('holds the first and last values outside the samples', () => {
    const series = resampleLinear([1, 2], [3, 5], 0.5, { start: 0, end: 3 });
    expect(series.values).toEqual([3, 3, 3, 4, 5, 5, 5]);
  });

  it('keeps the last grid point that rounding would push past the end', () => {
    // 0.3 / 0.1 is 2.9999999999999996, and 3 × 0.1 is 0.30000000000000004.
    expect(resampleLinear([0, 0.3], [0, 3], 0.1).values).toHaveLength(4);
    expect(resampleLinear([0, 1], [0, 1], 0.1).values).toHaveLength(11);
    expect(resampleLinear([0, 1.05], [0, 1], 0.1).values).toHaveLength(11);
  });

  it('gives one point for one sample', () => {
    expect(resampleLinear([2], [7], 0.1)).toEqual({ start: 2, step: 0.1, values: [7] });
  });

  it('refuses inputs it cannot place on a grid', () => {
    expect(() => resampleLinear([0, 1], [1], 0.1)).toThrow(RangeError);
    expect(() => resampleLinear([], [], 0.1)).toThrow(RangeError);
    expect(() => resampleLinear([0, 2, 1], [1, 2, 3], 0.1)).toThrow(RangeError);
    expect(() => resampleLinear([0, Number.NaN], [1, 2], 0.1)).toThrow(RangeError);
    expect(() => resampleLinear([0, 1], [1, 2], 0)).toThrow(RangeError);
    expect(() => resampleLinear([0, 1], [1, 2], Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => resampleLinear([0, 1], [1, 2], 0.1, { start: 1, end: 0 })).toThrow(RangeError);
  });
});
