import { describe, expect, it } from 'vitest';
import { Rng } from '../sim';
import { MAD_TO_SIGMA, mad, mean, median, quantile } from './stats';

describe('mean', () => {
  it('averages all values, or a range of them', () => {
    expect(mean([1, 2, 3, 6])).toBe(3);
    expect(mean([1, 2, 3, 6], 1, 3)).toBe(2.5);
    expect(mean(new Float64Array([4, 8]))).toBe(6);
  });

  it('gives equal values back exactly', () => {
    // Summed directly, 0.1 three times over is 0.30000000000000004, a third of it not 0.1.
    expect(mean([0.1, 0.1, 0.1])).toBe(0.1);
    expect(mean([123.4, 123.4, 123.4, 123.4, 123.4, 123.4, 123.4])).toBe(123.4);
  });

  it('needs a non-empty range within the values', () => {
    expect(() => mean([])).toThrow(RangeError);
    expect(() => mean([1, 2], 1, 1)).toThrow(RangeError);
    expect(() => mean([1, 2], 0, 3)).toThrow(RangeError);
    expect(() => mean([1, 2], -1, 1)).toThrow(RangeError);
    expect(() => mean([1, 2], 0.5, 2)).toThrow(RangeError);
  });
});

describe('median and quantile', () => {
  it('interpolate between neighbours', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median(new Float64Array([5]))).toBe(5);
    expect(quantile([0, 10, 20, 30, 40], 0.95)).toBe(38);
    expect(quantile([0, 10, 20, 30, 40], 0)).toBe(0);
    expect(quantile([0, 10, 20, 30, 40], 1)).toBe(40);
  });

  it('leave the input alone', () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });

  it('need values, and a q within 0 … 1', () => {
    expect(() => median([])).toThrow(RangeError);
    expect(() => quantile([], 0.5)).toThrow(RangeError);
    expect(() => quantile([1, 2], 1.5)).toThrow(RangeError);
    expect(() => quantile([1, 2], Number.NaN)).toThrow(RangeError);
  });
});

describe('mad', () => {
  it('is the median distance from the median', () => {
    // Deviations from the median 2: 1, 1, 0, 0, 2, 4, 7.
    expect(mad([1, 1, 2, 2, 4, 6, 9])).toBe(1);
    expect(mad([5, 5, 5])).toBe(0);
    expect(() => mad([])).toThrow(RangeError);
  });

  it('estimates σ of normal noise, whatever a few wild values do', () => {
    const rng = new Rng(7);
    const noise = Array.from({ length: 20_000 }, () => 3 + 0.2 * rng.gaussian());
    expect(MAD_TO_SIGMA * mad(noise)).toBeCloseTo(0.2, 2);
    // One value in 50 is a bump of 5 to 50 g, which makes the standard deviation about 4 g.
    const bumped = noise.map((value, i) => (i % 50 === 0 ? value + rng.uniform(5, 50) : value));
    expect(MAD_TO_SIGMA * mad(bumped)).toBeGreaterThan(0.19);
    expect(MAD_TO_SIGMA * mad(bumped)).toBeLessThan(0.215);
    expect(MAD_TO_SIGMA).toBeCloseTo(1.4826, 4);
  });
});
