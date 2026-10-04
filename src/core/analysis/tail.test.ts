import { describe, expect, it } from 'vitest';
import { Rng } from '../sim';
import type { WindowLiquid } from './liquid';
import { DEFAULT_LIQUID_PARAMS } from './params';
import { fitTail } from './tail';

/**
 * Liquid at 10 Hz from 0 to `endT`: rising at `flowGps` until `pumpOffT`, then draining with
 * `tauS` towards w(pump_off) + flow·τ, with Gaussian noise of `sigmaG`.
 */
function drained(options: {
  pumpOffT: number;
  endT: number;
  flowGps: number;
  tauS: number;
  sigmaG?: number;
  seed?: number;
}): { liquid: WindowLiquid; finalG: number } {
  const { pumpOffT, flowGps, tauS, sigmaG = 0 } = options;
  const rng = new Rng(options.seed ?? 1);
  const atOff = flowGps * pumpOffT;
  const curve = (t: number) =>
    t <= pumpOffT ? flowGps * t : atOff + flowGps * tauS * (1 - Math.exp(-(t - pumpOffT) / tauS));
  const t = Array.from({ length: Math.round(options.endT / 0.1) + 1 }, (_, k) => k * 0.1);
  const g = t.map((x) => curve(x) + sigmaG * rng.gaussian());
  return {
    liquid: { t, g, grid: { start: 0, step: 0.1, values: g }, otherSteps: [] },
    finalG: atOff + flowGps * tauS,
  };
}

const OPTIONS = { params: DEFAULT_LIQUID_PARAMS, sigmaG: 0.015 };

describe('fitTail', () => {
  it('recovers τ, the flow at pump_off and w_final from a clean exponential tail', () => {
    const { liquid, finalG } = drained({ pumpOffT: 20, endT: 50, flowGps: 1.8, tauS: 1.5 });
    const fit = fitTail(liquid, 20, OPTIONS);
    if (typeof fit === 'string') throw new Error(fit);
    // A quadratic Savitzky–Golay derivative of an exponential is a constant fraction off, which
    // moves the flow but not τ.
    expect(fit.tauS).toBeCloseTo(1.5, 6);
    expect(fit.flowAtPumpOffGps).toBeCloseTo(1.8, 1);
    expect(fit.finalWeightG).toBeCloseTo(finalG, 6);
    expect(fit.rSquared).toBeCloseTo(1, 9);
    // Windows start 0.2 s after pump_off, and the fit runs while the flow is above 3σ of its
    // noise, 0.14 g/s: until about τ·ln(1.8 / 0.14) = 3.8 s after pump_off.
    expect(fit.startT).toBeCloseTo(20.4, 9);
    expect(fit.endT).toBeGreaterThan(23.5);
    expect(fit.endT).toBeLessThan(24.2);
    expect(fit.points).toBe(Math.round((fit.endT - fit.startT) / 0.1) + 1);
  });

  it('keeps τ within a few percent through the noise of a quiet scale', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { liquid, finalG } = drained({
        pumpOffT: 20,
        endT: 50,
        flowGps: 1.8,
        tauS: 1.5,
        sigmaG: 0.015,
        seed,
      });
      const fit = fitTail(liquid, 20, OPTIONS);
      if (typeof fit === 'string') throw new Error(fit);
      expect(Math.abs(fit.tauS / 1.5 - 1)).toBeLessThan(0.08);
      expect(Math.abs(fit.finalWeightG - finalG)).toBeLessThan(0.02);
    }
  });

  it('extrapolates w_final from a tail cut short', () => {
    // The window ends 2 s after pump_off, with about 0.7 g still to come. The derivative's
    // constant fraction (0.2%) carries into that rest.
    const { liquid, finalG } = drained({ pumpOffT: 20, endT: 22, flowGps: 1.8, tauS: 1.5 });
    const fit = fitTail(liquid, 20, OPTIONS);
    if (typeof fit === 'string') throw new Error(fit);
    expect(fit.tauS).toBeCloseTo(1.5, 6);
    expect(Math.abs(fit.finalWeightG - finalG)).toBeLessThan(0.005);
  });

  it('says why there is no fit', () => {
    const short = drained({ pumpOffT: 20, endT: 21, flowGps: 1.8, tauS: 1.5 });
    expect(fitTail(short.liquid, 20, OPTIONS)).toBe('tail-too-short');
    const running = drained({ pumpOffT: 30, endT: 25, flowGps: 1.8, tauS: 1.5 });
    expect(fitTail(running.liquid, 30, OPTIONS)).toBe('pump-off-after-window');
    // The flow after the pump_off given only rises.
    const t = Array.from({ length: 301 }, (_, k) => k * 0.1);
    const g = t.map((x) => 0.05 * x * x);
    const rising = { t, g, grid: { start: 0, step: 0.1, values: g }, otherSteps: [] };
    expect(fitTail(rising, 10, OPTIONS)).toBe('tail-not-draining');
  });

  it('skips a transition marked NaN on the grid', () => {
    const { liquid, finalG } = drained({ pumpOffT: 20, endT: 50, flowGps: 1.8, tauS: 1.5 });
    const values = liquid.grid.values.slice();
    values[240] = Number.NaN; // 24.0 s, in the middle of the fitted tail
    const fit = fitTail({ ...liquid, grid: { ...liquid.grid, values } }, 20, OPTIONS);
    if (typeof fit === 'string') throw new Error(fit);
    expect(fit.tauS).toBeCloseTo(1.5, 6);
    expect(fit.finalWeightG).toBeCloseTo(finalG, 6);
  });
});
