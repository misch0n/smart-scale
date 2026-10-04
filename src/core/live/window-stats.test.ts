import { describe, expect, it } from 'vitest';
import { Rng } from '../sim';
import { RecentValues, summarise, TimeWindow } from './window-stats';

/** The textbook formulas, one pass each, for comparison. */
function naive(values: readonly number[]) {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  return {
    count: n,
    mean,
    sd: Math.sqrt(variance),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

describe('summarise', () => {
  it('is null for no values', () => {
    expect(summarise([])).toBeNull();
  });

  it('gives σ 0 for a single value', () => {
    expect(summarise([3.5])).toEqual({ count: 1, mean: 3.5, sd: 0, min: 3.5, max: 3.5 });
  });

  it('uses the sample standard deviation', () => {
    const summary = summarise([2, 4, 4, 4, 5, 5, 7, 9])!;
    expect(summary.mean).toBe(5);
    expect(summary.sd).toBeCloseTo(Math.sqrt(32 / 7), 12);
    expect([summary.min, summary.max]).toEqual([2, 9]);
  });

  it('matches the textbook formulas on random data', () => {
    const rng = new Rng(3);
    const values = Array.from({ length: 500 }, () => 100 + rng.gaussian() * 0.02);
    const expected = naive(values);
    const summary = summarise(values)!;
    expect(summary.count).toBe(expected.count);
    expect(summary.mean).toBeCloseTo(expected.mean, 10);
    expect(summary.sd).toBeCloseTo(expected.sd, 10);
    expect([summary.min, summary.max]).toEqual([expected.min, expected.max]);
  });

  it('stays accurate where one pass of sums would cancel: a tiny spread on a large mean', () => {
    const summary = summarise([1e9 + 0.01, 1e9 + 0.02, 1e9 + 0.03])!;
    expect(summary.sd).toBeCloseTo(0.01, 6);
  });
});

describe('TimeWindow', () => {
  it('holds the samples after newest − window: 5 samples over 0.5 s at 10 Hz', () => {
    const window = new TimeWindow(500);
    for (let i = 0; i <= 20; i++) window.add(i * 100, i);
    expect(window.values()).toEqual([16, 17, 18, 19, 20]);
  });

  it('follows the newest sample, so it keeps its contents when samples stop', () => {
    const window = new TimeWindow(1000);
    window.add(0, 1);
    window.add(400, 2);
    expect(window.values()).toEqual([1, 2]);
    window.add(1300, 3);
    expect(window.values()).toEqual([2, 3]);
    window.add(1400, 4); // 400 is exactly 1000 ms back: out
    expect(window.values()).toEqual([3, 4]);
  });

  it('keeps a sample whose time went back, and still ends the window at the newest time', () => {
    const window = new TimeWindow(1000);
    window.add(2000, 1);
    window.add(1500, 2);
    window.add(2400, 3);
    expect(window.values()).toEqual([1, 2, 3]);
    window.add(3200, 4);
    // 2000 and 1500 are now more than 1000 ms before 3200; the scan stops at the first kept one.
    expect(window.values()).toEqual([3, 4]);
    const late = new TimeWindow(1000);
    late.add(2000, 1);
    late.add(3000, 2);
    late.add(1900, 3); // the window still ends at 3000, so 2000 is out
    expect(late.values()).toEqual([2, 3]);
  });

  it('summarises its contents, and matches a naive filter over many samples', () => {
    const rng = new Rng(9);
    const window = new TimeWindow(2000);
    const all: { t: number; v: number }[] = [];
    let t = 0;
    for (let i = 0; i < 2000; i++) {
      t += 50 + rng.uniform(0, 100);
      const v = rng.gaussian();
      all.push({ t, v });
      window.add(t, v);
      if (i % 97 === 0) {
        const expected = all.filter((s) => s.t > t - 2000).map((s) => s.v);
        expect(window.values()).toEqual(expected);
      }
    }
    const expected = naive(all.filter((s) => s.t > t - 2000).map((s) => s.v));
    expect(window.summary()!.sd).toBeCloseTo(expected.sd, 10);
  });

  it('clears', () => {
    const window = new TimeWindow(500);
    window.add(1000, 1);
    window.clear();
    expect(window.summary()).toBeNull();
    window.add(0, 2);
    expect(window.values()).toEqual([2]);
  });

  it.each([0, -1, NaN, Infinity])('rejects a window of %s ms', (ms) => {
    expect(() => new TimeWindow(ms)).toThrow(RangeError);
  });
});

describe('RecentValues', () => {
  it('keeps the last values, oldest first', () => {
    const recent = new RecentValues(3);
    recent.add(1);
    recent.add(2);
    expect(recent.values()).toEqual([1, 2]);
    for (const value of [3, 4, 5]) recent.add(value);
    expect(recent.values()).toEqual([3, 4, 5]);
    expect(recent.count).toBe(3);
    recent.add(6);
    expect(recent.values()).toEqual([4, 5, 6]);
  });

  it('clears', () => {
    const recent = new RecentValues(2);
    recent.add(1);
    recent.add(2);
    recent.add(3);
    recent.clear();
    expect(recent.values()).toEqual([]);
    recent.add(4);
    expect(recent.values()).toEqual([4]);
  });

  it.each([0, 1.5, -2])('rejects a capacity of %s', (capacity) => {
    expect(() => new RecentValues(capacity)).toThrow(RangeError);
  });
});
