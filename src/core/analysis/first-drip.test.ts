import { describe, expect, it } from 'vitest';
import { Rng } from '../sim';
import { findFirstDrip, fitOnset } from './first-drip';
import type { WindowLiquid } from './liquid';
import { DEFAULT_LIQUID_PARAMS } from './params';
import type { ShotWindow } from './shot-windows';
import { VIBRATING_LIQUID } from './test-runs';

const every100ms = (from: number, to: number) =>
  Array.from({ length: Math.round((to - from) / 0.1) + 1 }, (_, k) => from + k * 0.1);

/** Nothing until `t0`, then `offset + amplitude × (t − t0)^power`. */
const onset = (t0: number, amplitude: number, power: number, offset: number) => (t: number) =>
  t > t0 ? offset + amplitude * (t - t0) ** power : 0;

describe('fitOnset', () => {
  it('finds the start of a parabola or a line to the resolution', () => {
    const times = every100ms(0, 4);
    for (const [power, t0] of [
      [2, 1.234],
      [1, 2.071],
    ]) {
      const values = times.map(onset(t0, 0.4, power, 0.025));
      const fit = fitOnset(times, values, {
        power,
        offset: 0.025,
        from: 0,
        to: 4,
        resolution: 0.001,
      });
      expect(fit.t0).toBeCloseTo(t0, 3);
      expect(fit.amplitude).toBeCloseTo(0.4, 2);
      expect(fit.sse).toBeLessThan(1e-4);
    }
  });

  it('never fits a negative amplitude, and puts a flat series at the first start tried', () => {
    const times = every100ms(0, 2);
    const fit = fitOnset(
      times,
      times.map(() => 0),
      { power: 2, offset: 0, from: 0.5, to: 1.5, resolution: 0.01 },
    );
    expect(fit).toEqual({ t0: 0.5, amplitude: 0, sse: 0 });
    const falling = fitOnset(
      times,
      times.map((t) => -t),
      { power: 1, offset: 0, from: 0, to: 2, resolution: 0.01 },
    );
    expect(falling.amplitude).toBe(0);
  });

  it('refuses mismatched arrays and a range of starts that is none', () => {
    expect(() =>
      fitOnset([0, 1], [0], { power: 2, offset: 0, from: 0, to: 1, resolution: 0.1 }),
    ).toThrow(RangeError);
    expect(() =>
      fitOnset([0], [0], { power: 2, offset: 0, from: 1, to: 0, resolution: 0.1 }),
    ).toThrow(RangeError);
    expect(() =>
      fitOnset([0], [0], { power: 2, offset: 0, from: 0, to: 1, resolution: 0 }),
    ).toThrow(RangeError);
  });
});

/**
 * A window whose liquid follows `curve` from 0 to `endT` at 10 Hz (samples on the grid), with
 * Gaussian noise of `sigmaG`, and a baseline that ends at `baselineEndT`.
 */
function synthetic(
  curve: (t: number) => number,
  options: { endT: number; baselineEndT: number; sigmaG: number; seed?: number },
): { liquid: WindowLiquid; window: ShotWindow } {
  const rng = new Rng(options.seed ?? 1);
  const t = every100ms(0, options.endT);
  const g = t.map((x) => curve(x) + options.sigmaG * rng.gaussian());
  const window = {
    baseline: { startT: 0, endT: options.baselineEndT, levelG: 0, sigmaG: 0.015, sampleCount: 20 },
  } as ShotWindow;
  return {
    liquid: { t, g, grid: { start: 0, step: 0.1, values: g }, otherSteps: [], pourSteps: [] },
    window,
  };
}

/**
 * The analysis as it was for the simulator's world before hardware session 2 (D-035): drops of
 * 0.05 g (the onsets below start with half of one, 0.025 g) and the rise fitted to 1.5 g.
 */
const OPTIONS = {
  params: { ...DEFAULT_LIQUID_PARAMS, ...VIBRATING_LIQUID },
  sigmaFloorG: 0.01 / Math.sqrt(12),
};

describe('findFirstDrip', () => {
  it('times a gradual start and an abrupt one, without noise, to the millisecond', () => {
    // Flow ramping up from nothing (0.4 g/s²) from 6.123 s, in 0.05 g drops on average.
    const gradual = synthetic(onset(6.123, 0.4, 2, 0.025), {
      endT: 12,
      baselineEndT: 3,
      sigmaG: 0,
    });
    const ramp = findFirstDrip(gradual.liquid, gradual.window, OPTIONS)!;
    expect(ramp.onset).toBe('gradual');
    expect(ramp.t).toBeCloseTo(6.123, 3);
    expect(ramp.changeT).toBeLessThanOrEqual(ramp.alarmT);
    expect(ramp.fitPoints).toBeGreaterThan(20);
    // Flow there at once (1.5 g/s) from 6.077 s.
    const sudden = synthetic(onset(6.077, 1.5, 1, 0.025), { endT: 12, baselineEndT: 3, sigmaG: 0 });
    const step = findFirstDrip(sudden.liquid, sudden.window, OPTIONS)!;
    expect(step.onset).toBe('abrupt');
    expect(step.t).toBeCloseTo(6.077, 3);
  });

  it('takes σ from the pre-infusion, and finds the start through noise', () => {
    const errors: number[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const { liquid, window } = synthetic(onset(6, 0.4, 2, 0.025), {
        endT: 12,
        baselineEndT: 2,
        sigmaG: 0.1,
        seed,
      });
      const drip = findFirstDrip(liquid, window, OPTIONS)!;
      expect(drip.sigmaG).toBeGreaterThan(0.07);
      // Capped, the knock leaves σ (0.1 g) well short of the 0.28 g it gives uncapped.
      expect(drip.sigmaG).toBeLessThan(0.18);
      expect(drip.alarmT).toBeGreaterThan(6);
      errors.push(Math.abs(drip.t - 6));
    }
    errors.sort((a, b) => a - b);
    expect(errors[10]).toBeLessThan(0.1); // the median
    expect(errors[19]).toBeLessThan(0.5);
  });

  it('finds a start that the baseline ran past, as it can without the pump’s vibration', () => {
    const { liquid, window } = synthetic(onset(5, 0.4, 2, 0.025), {
      endT: 10,
      baselineEndT: 5.3,
      sigmaG: 0.015,
    });
    expect(findFirstDrip(liquid, window, OPTIONS)!.t).toBeCloseTo(5, 1);
  });

  it('passes over a knock before the rise, which neither starts it nor inflates σ (T1.13)', () => {
    // A knock of 2.6 and 1.4 g, 4 s before liquid starts to arrive, during the pump's vibration.
    const knock = (t: number) => (t > 3.95 && t < 4.05 ? 2.6 : t > 4.05 && t < 4.15 ? 1.4 : 0);
    for (let seed = 1; seed <= 10; seed++) {
      const { liquid, window } = synthetic((t) => knock(t) + onset(8, 0.4, 2, 0.025)(t), {
        endT: 14,
        baselineEndT: 3.5,
        sigmaG: 0.1,
        seed,
      });
      const drip = findFirstDrip(liquid, window, OPTIONS)!;
      expect(Math.abs(drip.t - 8)).toBeLessThan(0.5);
      expect(drip.changeT).toBeGreaterThan(5);
      // Capped, the knock leaves σ (0.1 g) well short of the 0.28 g it gives uncapped.
      expect(drip.sigmaG).toBeLessThan(0.18);
    }
  });

  it('finds nothing in liquid that never rises, or only knocks', () => {
    const { liquid, window } = synthetic(() => 0, { endT: 10, baselineEndT: 3, sigmaG: 0.015 });
    expect(findFirstDrip(liquid, window, OPTIONS)).toBeNull();
    const knocked = synthetic((t) => (t > 5.95 && t < 6.15 ? 3 : 0), {
      endT: 10,
      baselineEndT: 3,
      sigmaG: 0.015,
    });
    expect(findFirstDrip(knocked.liquid, knocked.window, OPTIONS)).toBeNull();
  });

  it('dates the drip from the readings either side of a stretch left out (T1.16)', () => {
    // Liquid from 5 s at 1.5 g/s (an abrupt start, as hardware session 2's shot A), and the
    // scale moved from 5.25 to 7.25 s: those readings are left out, NaN on the grid. Read as 0
    // they would put the drip at the gap's end.
    const curve = onset(5, 1.5, 1, 0.025);
    const { liquid, window } = synthetic(curve, { endT: 12, baselineEndT: 4.8, sigmaG: 0 });
    const gap = (t: number) => t > 5.25 && t < 7.25;
    const kept = liquid.t.map((t, i) => [t, liquid.g[i]] as const).filter(([t]) => !gap(t));
    const holed: WindowLiquid = {
      ...liquid,
      t: kept.map(([t]) => t),
      g: kept.map(([, g]) => g),
      grid: { ...liquid.grid, values: liquid.grid.values.map((g, k) => (gap(k * 0.1) ? NaN : g)) },
    };
    const drip = findFirstDrip(holed, window, OPTIONS)!;
    expect(drip.changeT).toBeLessThan(5.3);
    expect(Math.abs(drip.t - 5)).toBeLessThan(0.1);
  });

  it('times a start in lumps of 0.2 g, as the real machine’s, with the defaults (T1.16)', () => {
    // As shot B of hardware session 2, in 0.1 g readings: a first lump of 0.2 g, then the flow
    // at 0.45 g/s, rising by 0.04 g/s each second. Fitted on to 1.5 g, a line through it reached
    // back 0.27 s; to 1 g, with the half lump, it doesn't.
    const flow = (t: number) => (t > 5 ? 0.2 + 0.45 * (t - 5) + 0.02 * (t - 5) ** 2 : 0);
    const { liquid, window } = synthetic((t) => Math.round(flow(t) * 10) / 10, {
      endT: 12,
      baselineEndT: 5.3,
      sigmaG: 0,
    });
    const defaults = { params: DEFAULT_LIQUID_PARAMS, sigmaFloorG: 0.1 / Math.sqrt(12) };
    const drip = findFirstDrip(liquid, window, defaults)!;
    expect(drip.onset).toBe('abrupt');
    expect(Math.abs(drip.t - 5)).toBeLessThan(0.1);
  });

  it('fits a smaller shot up to three quarters of its rise', () => {
    // A rise of 1 g, below the 1.5 g the fit normally runs to.
    const curve = (t: number) => Math.min(1, onset(4, 0.4, 2, 0.025)(t));
    const { liquid, window } = synthetic(curve, { endT: 10, baselineEndT: 2, sigmaG: 0 });
    expect(findFirstDrip(liquid, window, OPTIONS)!.t).toBeCloseTo(4, 2);
  });
});
