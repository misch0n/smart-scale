import { describe, expect, it } from 'vitest';
import { median, quantile } from '../signal';
import { Rng } from '../sim';
import { fitKnee, fitParabolaSse, KNEE_TAU_MAX_S, KNEE_TAU_MIN_S, kneeWeightAt } from './knee';

/**
 * Weights at 10 Hz from `fromT` to `toT`: a + b·u + p·u² before the knee at `kneeT`, then
 * a + b·τ·(1 − e^(−u/τ)), with Gaussian noise of `beforeSigmaG` and `afterSigmaG`.
 */
function shot(options: {
  kneeT: number;
  tauS: number;
  fromT?: number;
  toT?: number;
  a?: number;
  b?: number;
  p?: number;
  beforeSigmaG?: number;
  afterSigmaG?: number;
  seed?: number;
}) {
  const { kneeT, tauS, fromT = 16, toT = 28, a = 30, b = 2, p = 0.01 } = options;
  const rng = new Rng(options.seed ?? 1);
  const t: number[] = [];
  const y: number[] = [];
  for (let k = 0; fromT + k * 0.1 <= toT + 1e-9; k++) {
    const time = fromT + k * 0.1;
    const u = time - kneeT;
    const mean = u < 0 ? a + b * u + p * u * u : a + b * tauS * (1 - Math.exp(-u / tauS));
    const sigma = u < 0 ? (options.beforeSigmaG ?? 0) : (options.afterSigmaG ?? 0);
    t.push(time);
    y.push(mean + sigma * rng.gaussian());
  }
  return { t, y };
}

/** Knee candidates every `step` s within `half` of `centre`. */
function knees(centre: number, half: number, step: number): number[] {
  const count = Math.round((2 * half) / step);
  return Array.from({ length: count + 1 }, (_, j) => centre - half + j * step);
}

describe('fitKnee', () => {
  it('recovers the knee, τ, the weight and the flow from the model', () => {
    const { t, y } = shot({ kneeT: 22.037, tauS: 1.5 });
    const fit = fitKnee(t, y, {
      knees: knees(22, 0.1, 0.001),
      beforeVarG2: 1,
      afterVarG2: 1,
    })!;
    // τ's golden section stops at about 0.02%, which the other coefficients follow.
    expect(fit.t).toBeCloseTo(22.037, 3);
    expect(fit.tauS).toBeCloseTo(1.5, 3);
    expect(fit.weightG).toBeCloseTo(30, 3);
    expect(fit.flowGps).toBeCloseTo(2, 3);
    expect(fit.curvatureGps2).toBeCloseTo(0.01, 3);
    expect(fit.before.count).toBe(61); // 16.0 … 22.0
    expect(fit.after.count).toBe(60); // 22.1 … 28.0
    expect(fit.before.meanSquareG2).toBeLessThan(1e-7);
    expect(fit.after.meanSquareG2).toBeLessThan(1e-7);
  });

  it('times the knee to a few hundredths of a second through a quiet scale’s noise', () => {
    const errors: number[] = [];
    for (let seed = 1; seed <= 40; seed++) {
      const kneeT = 22 + (seed % 10) / 100;
      const { t, y } = shot({ kneeT, tauS: 1.5, beforeSigmaG: 0.02, afterSigmaG: 0.02, seed });
      const fit = fitKnee(t, y, {
        knees: knees(22, 0.5, 0.005),
        beforeVarG2: 0.02 ** 2,
        afterVarG2: 0.02 ** 2,
      })!;
      errors.push(fit.t - kneeT);
      expect(Math.abs(fit.tauS / 1.5 - 1)).toBeLessThan(0.1);
    }
    expect(Math.abs(median(errors))).toBeLessThan(0.01);
    expect(
      quantile(
        errors.map(Math.abs).sort((a, b) => a - b),
        1,
      ),
    ).toBeLessThan(0.06);
  });

  it('pins the knee much closer when told about a variance step there', () => {
    // The pump's vibration before the knee, a quiet scale after it.
    const plain: number[] = [];
    const stepped: number[] = [];
    for (let seed = 1; seed <= 40; seed++) {
      const kneeT = 22 + (seed % 10) / 100;
      const { t, y } = shot({ kneeT, tauS: 1.5, beforeSigmaG: 0.1, afterSigmaG: 0.02, seed });
      const options = { knees: knees(22, 0.5, 0.005), refineTau: true };
      const equal = fitKnee(t, y, { ...options, beforeVarG2: 1, afterVarG2: 1 })!;
      const unequal = fitKnee(t, y, { ...options, beforeVarG2: 0.1 ** 2, afterVarG2: 0.02 ** 2 })!;
      plain.push(Math.abs(equal.t - kneeT));
      stepped.push(Math.abs(unequal.t - kneeT));
      expect(unequal.before.meanSquareG2).toBeGreaterThan(5 * unequal.after.meanSquareG2);
    }
    const p90 = (values: number[]) =>
      quantile(
        [...values].sort((a, b) => a - b),
        0.9,
      );
    expect(p90(stepped)).toBeLessThan(0.08);
    expect(p90(stepped)).toBeLessThan(p90(plain));
  });

  it('gives the fitted curve, and an interval that narrows as the noise falls', () => {
    const { t, y } = shot({ kneeT: 22.037, tauS: 1.5 });
    const fit = fitKnee(t, y, { knees: knees(22, 0.1, 0.001), beforeVarG2: 1, afterVarG2: 1 })!;
    for (const time of [16, 21.5, 22.037, 22.5, 28]) {
      const u = time - 22.037;
      const expected = u < 0 ? 30 + 2 * u + 0.01 * u * u : 30 + 3 * (1 - Math.exp(-u / 1.5));
      // τ is good to about 10⁻⁴, which moves the drain's far end by a few 10⁻⁴ g.
      expect(kneeWeightAt(fit, time)).toBeCloseTo(expected, 3);
    }
    // With the variances the noise's own, the interval spans the knees about as likely.
    const spread = (sigmaG: number) => {
      const noisy = shot({ kneeT: 22, tauS: 1.5, beforeSigmaG: sigmaG, afterSigmaG: sigmaG });
      const variance = sigmaG ** 2;
      const result = fitKnee(noisy.t, noisy.y, {
        knees: knees(22, 0.3, 0.005),
        beforeVarG2: variance,
        afterVarG2: variance,
      })!;
      expect(result.interval.from).toBeLessThanOrEqual(result.t);
      expect(result.interval.to).toBeGreaterThanOrEqual(result.t);
      return result.interval.to - result.interval.from;
    };
    expect(spread(0.005)).toBeLessThan(spread(0.05));
    expect(spread(0.05)).toBeLessThan(0.3);
  });

  it('keeps τ within its search range', () => {
    const fast = shot({ kneeT: 22, tauS: 0.05 });
    const slow = shot({ kneeT: 22, tauS: 40 });
    const options = { knees: knees(22, 0.2, 0.01), beforeVarG2: 1, afterVarG2: 1 };
    expect(fitKnee(fast.t, fast.y, options)!.tauS).toBeGreaterThanOrEqual(KNEE_TAU_MIN_S);
    expect(fitKnee(slow.t, slow.y, options)!.tauS).toBeLessThanOrEqual(KNEE_TAU_MAX_S + 1e-9);
  });

  it('needs three samples either side of a knee', () => {
    const { t, y } = shot({ kneeT: 22, tauS: 1.5 });
    const options = { beforeVarG2: 1, afterVarG2: 1 };
    expect(fitKnee(t, y, { ...options, knees: [16.15, 27.85] })).toBeNull();
    expect(fitKnee(t, y, { ...options, knees: [] })).toBeNull();
    expect(fitKnee(t.slice(0, 5), y.slice(0, 5), { ...options, knees: [16.2] })).toBeNull();
    expect(fitKnee(t, y, { ...options, knees: [16.25] })!.before.count).toBe(3);
  });

  it('refuses mismatched samples and variances that aren’t positive', () => {
    const options = { knees: [1], beforeVarG2: 1, afterVarG2: 1 };
    expect(() => fitKnee([1, 2], [1], options)).toThrow(RangeError);
    expect(() => fitKnee([1, 2], [1, 2], { ...options, beforeVarG2: 0 })).toThrow(RangeError);
    expect(() => fitKnee([1, 2], [1, 2], { ...options, afterVarG2: Infinity })).toThrow(RangeError);
  });

  it('is pure', () => {
    const { t, y } = shot({ kneeT: 22.02, tauS: 2, beforeSigmaG: 0.05, afterSigmaG: 0.02 });
    const options = { knees: knees(22, 0.3, 0.01), beforeVarG2: 0.0025, afterVarG2: 0.0004 };
    expect(fitKnee(t, y, options)).toEqual(fitKnee([...t], [...y], options));
  });
});

describe('fitParabolaSse', () => {
  it('fits a parabola exactly and leaves the noise', () => {
    const t = Array.from({ length: 30 }, (_, k) => 100 + k * 0.1);
    expect(
      fitParabolaSse(
        t,
        t.map((x) => 3 + 2 * (x - 101) - 0.5 * (x - 101) ** 2),
      ),
    ).toBeCloseTo(0, 9);
    const rng = new Rng(4);
    const noisy = t.map((x) => 3 + 2 * x + 0.1 * rng.gaussian());
    // About (n − 3) σ².
    expect(fitParabolaSse(t, noisy) / (27 * 0.01)).toBeGreaterThan(0.5);
    expect(fitParabolaSse(t, noisy) / (27 * 0.01)).toBeLessThan(1.5);
  });

  it('is infinite with too few samples, and refuses mismatched arrays', () => {
    expect(fitParabolaSse([1, 2], [1, 2])).toBe(Infinity);
    expect(fitParabolaSse([1, 1, 1], [1, 2, 3])).toBe(Infinity);
    expect(() => fitParabolaSse([1, 2, 3], [1, 2])).toThrow(RangeError);
  });
});
