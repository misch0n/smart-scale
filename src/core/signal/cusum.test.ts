import { describe, expect, it } from 'vitest';
import { Rng } from '../sim';
import { cusum, type CusumOptions } from './cusum';

/** `before` before `at`, `after` from it on. */
function stepAt(length: number, at: number, before: number, after: number): number[] {
  return Array.from({ length }, (_, i) => (i < at ? before : after));
}

/**
 * The definition, the slow way: the first sample where the clamped sum passes the threshold,
 * and one past the latest argmin of the unclamped cumulative sum before it.
 */
function naiveCusum(values: number[], options: CusumOptions) {
  const { reference, slack, threshold, direction = 'up' } = options;
  const from = options.from ?? 0;
  const to = options.to ?? values.length;
  const sign = direction === 'up' ? 1 : -1;
  const cumulative = [0]; // before the first sample
  for (let i = from; i < to; i++) {
    cumulative.push(cumulative[cumulative.length - 1] + sign * (values[i] - reference) - slack);
    const sinceMin = cumulative[cumulative.length - 1] - Math.min(...cumulative);
    if (sinceMin > threshold) {
      const before = cumulative.slice(0, -1);
      const least = Math.min(...before);
      return { alarmIndex: i, changeIndex: from + before.lastIndexOf(least) };
    }
  }
  return null;
}

describe('cusum', () => {
  it('raises the alarm once the sum passes the threshold, and dates the change back', () => {
    // From 50 on each sample adds 1 − 0.25: 0.75, 1.5, 2.25 > 2 at 52.
    const values = stepAt(100, 50, 0, 1);
    expect(cusum(values, { reference: 0, slack: 0.25, threshold: 2 })).toEqual({
      alarmIndex: 52,
      changeIndex: 50,
    });
  });

  it('dates a shift of 2σ in noise to within a sample or two', () => {
    // Slack at half the shift, the classical choice, which leaves the estimate unbiased. With
    // the smaller slack the spec gives for first_drip (0.5σ), noise before the change keeps the
    // sum from emptying and the estimate runs early: a tenth are 4 or more samples off, mostly
    // early (500 seeds, 40 samples before the change).
    const errors: number[] = [];
    for (let seed = 1; seed <= 200; seed++) {
      const rng = new Rng(seed);
      const values = Array.from({ length: 200 }, (_, i) => (i < 100 ? 0 : 2) + rng.gaussian());
      const alarm = cusum(values, { reference: 0, slack: 1, threshold: 5 });
      expect(alarm).not.toBeNull();
      expect(alarm!.alarmIndex).toBeGreaterThanOrEqual(100);
      expect(alarm!.alarmIndex).toBeLessThan(120);
      errors.push(Math.abs(alarm!.changeIndex - 100));
    }
    errors.sort((a, b) => a - b);
    expect(errors[100]).toBe(0); // the median
    expect(errors[180]).toBeLessThanOrEqual(2); // 90%
    expect(errors[199]).toBeLessThanOrEqual(10);
  });

  it('stays quiet without a change', () => {
    const rng = new Rng(9);
    const values = Array.from({ length: 2000 }, () => rng.gaussian());
    expect(cusum(values, { reference: 0, slack: 0.5, threshold: 10 })).toBeNull();
    expect(cusum(values, { reference: 0, slack: 0.5, threshold: 10, direction: 'down' })).toBe(
      null,
    );
  });

  it('watches for a fall with direction down', () => {
    const values = stepAt(100, 30, 5, 4);
    const options = { reference: 5, slack: 0.25, threshold: 2 } as const;
    expect(cusum(values, options)).toBeNull();
    expect(cusum(values, { ...options, direction: 'down' })).toEqual({
      alarmIndex: 32,
      changeIndex: 30,
    });
  });

  it('places a change at the first sample scanned', () => {
    expect(cusum([3, 3, 3], { reference: 0, slack: 1, threshold: 3 })).toEqual({
      alarmIndex: 1,
      changeIndex: 0,
    });
    expect(cusum([9, 3, 3, 3], { reference: 0, slack: 1, threshold: 3, from: 1 })).toEqual({
      alarmIndex: 2,
      changeIndex: 1,
    });
  });

  it('scans only from … to − 1, and answers with indexes into the whole series', () => {
    const values = [...stepAt(50, 20, 0, 1), ...stepAt(50, 0, 0, 0)];
    const options = { reference: 0, slack: 0.25, threshold: 2 };
    expect(cusum(values, { ...options, from: 10, to: 22 })).toBeNull();
    expect(cusum(values, { ...options, from: 10, to: 23 })).toEqual({
      alarmIndex: 22,
      changeIndex: 20,
    });
    expect(cusum(values, { ...options, from: 60 })).toBeNull();
    expect(cusum(values, { ...options, from: 5, to: 5 })).toBeNull();
  });

  it('starts the run after the latest moment the sum was empty', () => {
    // A false start at 10 that dies away, then the real change at 40.
    const values = stepAt(80, 40, 0, 1);
    values[10] = 1.2;
    values[11] = 1.2;
    expect(cusum(values, { reference: 0, slack: 0.25, threshold: 2.5 })).toEqual({
      alarmIndex: 43,
      changeIndex: 40,
    });
  });

  it('matches the definition on random series', () => {
    const rng = new Rng(21);
    for (let trial = 0; trial < 200; trial++) {
      const length = 20 + rng.int(200);
      const at = rng.int(length);
      const shift = rng.uniform(-3, 3);
      const values = Array.from({ length }, (_, i) => (i >= at ? shift : 0) + rng.gaussian());
      const from = rng.int(length);
      const options: CusumOptions = {
        reference: rng.uniform(-0.5, 0.5),
        slack: rng.uniform(0, 1),
        threshold: rng.uniform(0.5, 6),
        direction: rng.next() < 0.5 ? 'up' : 'down',
        from,
        to: from + rng.int(length - from + 1),
      };
      expect(cusum(values, options)).toEqual(naiveCusum(values, options));
    }
  });

  it('refuses parameters that make no sense', () => {
    const values = [1, 2, 3];
    const base = { reference: 0, slack: 0.5, threshold: 2 };
    expect(() => cusum(values, { ...base, slack: -0.1 })).toThrow(RangeError);
    expect(() => cusum(values, { ...base, threshold: 0 })).toThrow(RangeError);
    expect(() => cusum(values, { ...base, reference: Number.NaN })).toThrow(RangeError);
    expect(() => cusum(values, { ...base, from: 2, to: 1 })).toThrow(RangeError);
    expect(() => cusum(values, { ...base, to: 4 })).toThrow(RangeError);
  });
});
