import { describe, expect, it } from 'vitest';
import { Rng } from '../sim';
import { fitLine } from './line-fit';

describe('fitLine', () => {
  it('fits a small example worked by hand', () => {
    // x̄ 1.5, ȳ 2.75, Sxx 5, Sxy 5.5, Syy 8.75.
    const fit = fitLine([0, 1, 2, 3], [1, 3, 2, 5]);
    expect(fit.slope).toBeCloseTo(1.1, 14);
    expect(fit.intercept).toBeCloseTo(1.1, 14);
    expect(fit.residuals).toHaveLength(4);
    [-0.1, 0.8, -1.3, 0.6].forEach((r, i) => expect(fit.residuals[i]).toBeCloseTo(r, 14));
    expect(fit.sse).toBeCloseTo(2.7, 13);
    expect(fit.rSquared).toBeCloseTo(1 - 2.7 / 8.75, 14);
    expect(fit.count).toBe(4);
  });

  it('recovers a line exactly, however far from zero', () => {
    const x = Array.from({ length: 30 }, (_, i) => 3600 + 0.1 * i);
    const fit = fitLine(
      x,
      x.map((t) => -0.37 * (t - 3600) + 2.5),
    );
    expect(fit.slope).toBeCloseTo(-0.37, 10);
    expect(fit.intercept).toBeCloseTo(2.5 + 0.37 * 3600, 7);
    expect(fit.rSquared).toBeCloseTo(1, 12);
    fit.residuals.forEach((r) => expect(Math.abs(r)).toBeLessThan(1e-10));
  });

  it('gives a flat line for values that do not vary, exactly', () => {
    const fit = fitLine([1, 2, 3], [0.1, 0.1, 0.1]);
    expect(fit).toEqual({
      slope: 0,
      intercept: 0.1,
      residuals: [0, 0, 0],
      sse: 0,
      rSquared: 1,
      count: 3,
    });
  });

  it('counts a weight of 2 like the point twice', () => {
    const rng = new Rng(4);
    const x = Array.from({ length: 12 }, () => rng.uniform(0, 10));
    const y = x.map((t) => 2 - 0.5 * t + rng.gaussian());
    const weights = x.map((_, i) => 1 + (i % 3));
    const weighted = fitLine(x, y, weights);
    const repeated = fitLine(
      x.flatMap((t, i) => Array<number>(weights[i]).fill(t)),
      y.flatMap((v, i) => Array<number>(weights[i]).fill(v)),
    );
    expect(weighted.slope).toBeCloseTo(repeated.slope, 12);
    expect(weighted.intercept).toBeCloseTo(repeated.intercept, 12);
    expect(weighted.sse).toBeCloseTo(repeated.sse, 11);
    expect(weighted.rSquared).toBeCloseTo(repeated.rSquared, 12);
    expect(weighted.count).toBe(12);
  });

  it('leaves out points of zero weight, but gives their residuals', () => {
    const fit = fitLine([0, 1, 2, 3, 4], [99, 1, 2, 3, Number.NaN], [0, 1, 1, 1, 0]);
    expect(fit.slope).toBeCloseTo(1, 14);
    expect(fit.intercept).toBeCloseTo(0, 14);
    expect(fit.count).toBe(3);
    expect(fit.sse).toBeCloseTo(0, 14);
    expect(fit.residuals[0]).toBeCloseTo(99, 12);
    expect(fit.residuals[4]).toBeNaN();
  });

  it('weights an exponential tail by flow², as ln(flow) asks', () => {
    // 10 s of flow decaying with τ = 2.5 s, with noise of one size throughout: ln(flow) gets
    // noisier as the flow dies away. Over 50 seeds, τ unweighted was up to 0.54 s off,
    // weighted by flow² 0.12 s.
    const rng = new Rng(8);
    const t = Array.from({ length: 100 }, (_, i) => 0.1 * i);
    const flow = t.map((s) => 3 * Math.exp(-s / 2.5) + 0.05 * rng.gaussian());
    const logs = flow.map((f) => Math.log(Math.max(f, 1e-3)));
    const weighted =
      -1 /
      fitLine(
        t,
        logs,
        flow.map((f) => Math.max(f, 0) ** 2),
      ).slope;
    const unweighted = -1 / fitLine(t, logs).slope;
    expect(Math.abs(weighted - 2.5)).toBeLessThan(0.15);
    expect(Math.abs(unweighted - 2.5)).toBeGreaterThan(2 * Math.abs(weighted - 2.5));
  });

  it('needs two points of positive weight with different x', () => {
    expect(() => fitLine([1, 2], [1])).toThrow(RangeError);
    expect(() => fitLine([1, 2], [1, 2], [1])).toThrow(RangeError);
    expect(() => fitLine([1], [1])).toThrow(RangeError);
    expect(() => fitLine([1, 2, 3], [1, 2, 3], [1, 0, 0])).toThrow(RangeError);
    expect(() => fitLine([2, 2, 2], [1, 2, 3])).toThrow(RangeError);
    expect(() => fitLine([1, 2], [1, 2], [1, -1])).toThrow(RangeError);
    expect(() => fitLine([1, 2], [1, 2], [1, Number.NaN])).toThrow(RangeError);
    expect(() => fitLine([1, 2], [1, Number.POSITIVE_INFINITY])).toThrow(RangeError);
  });
});
