import { describe, expect, it } from 'vitest';
import { leastIntercept, median, quantile, robustSlope, type Point } from './fit';

/** Points on y = 20 + 0.9997 x, every 100 ms of x, each `delay(i)` above the line. */
function line(count: number, delay: (i: number) => number): Point[] {
  return Array.from({ length: count }, (_, i) => ({
    x: 1_000_000 + 100 * i,
    y: 20 + 0.9997 * (1_000_000 + 100 * i) + delay(i),
  }));
}

describe('robustSlope', () => {
  it('finds the slope of points on a line, whatever their size', () => {
    expect(robustSlope([line(50, () => 0)])).toBeCloseTo(0.9997, 10);
    expect(
      robustSlope([
        [
          { x: 0, y: 1 },
          { x: 2, y: 5 },
        ],
      ]),
    ).toBe(2);
  });

  it('averages delays that repeat, as connection events make them', () => {
    // Three phases 10 ms apart, as a 100 ms sample period on a 30 ms connection interval gives.
    expect(robustSlope([line(600, (i) => [3, 13, 23][i % 3])])).toBeCloseTo(0.9997, 5);
  });

  it('sets stalled points aside', () => {
    // 1 in 50 frames waits 300 ms longer, in bursts of four.
    const stalled = line(1000, (i) => [2, 9, 5][i % 3] + (i % 50 < 4 ? 300 - 75 * (i % 50) : 0));
    expect(robustSlope([stalled])).toBeCloseTo(0.9997, 6);
  });

  it('shares one slope between groups, each with its own intercept', () => {
    // A restarted timer: the same clock, a new offset. Fitted together, not as one line.
    const first = line(200, (i) => [2, 9, 5][i % 3]);
    const second = line(200, (i) => 4000 + [7, 1, 3][i % 3]).map((p) => ({
      x: p.x - 900_000,
      y: p.y,
    }));
    expect(robustSlope([first, second])).toBeCloseTo(0.9997, 5);
    expect(robustSlope([first, [], second.slice(0, 1)])).toBeCloseTo(robustSlope([first]), 12);
  });

  it('needs a group with two points of different x', () => {
    expect(() => robustSlope([[{ x: 1, y: 1 }], []])).toThrow(RangeError);
    expect(() =>
      robustSlope([
        [
          { x: 1, y: 1 },
          { x: 1, y: 2 },
        ],
      ]),
    ).toThrow(RangeError);
  });
});

describe('leastIntercept', () => {
  it('puts the line under every point, touching the lowest', () => {
    const points = line(30, (i) => (i === 17 ? 0 : 5 + (i % 4)));
    const intercept = leastIntercept(points, 0.9997);
    expect(intercept).toBeCloseTo(20, 6);
    for (const p of points) expect(p.y - (intercept + 0.9997 * p.x)).toBeGreaterThanOrEqual(-1e-6);
  });
});

describe('median and quantile', () => {
  it('interpolate between neighbours', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(quantile([0, 10, 20, 30, 40], 0.95)).toBe(38);
    expect(() => quantile([], 0.5)).toThrow(RangeError);
  });
});
