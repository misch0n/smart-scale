/**
 * The pump markers against the simulator's ground truth (T1.13 acceptance, D-036): at the pump's
 * vibration of σ 0.1 g, without it, and at other levels, on the 0.01 g scale D-036's targets
 * were agreed on (`AGREED_SCALE`). The real scale shows no vibration (D-048), so since D-060
 * these are regression tests of the variance detector, kept for a scale or a machine where it
 * shows; the targets for the real scale are in `targets.test.ts`. `shotMarkers` runs them as
 * T1.14 does, feeding the pump_off found to the liquid markers. Scenarios beyond the usual shot
 * are in `pump-markers-scenarios.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { median } from '../signal';
import { espressoScenario, type EspressoScenarioOptions } from '../sim';
import { pumpMarkers } from './pump-markers';
import { shotMarkers, type ShotMarkers } from './shot-markers';
import {
  AGREED_LIQUID,
  AGREED_SCALE,
  AGREED_SHOT,
  absQuantile,
  phasedPumpOnMs,
  seeds,
  simulateRun,
  type SimulatedRun,
} from './test-runs';

interface Shot {
  readonly run: SimulatedRun;
  readonly m: ShotMarkers;
  /** pump_on and pump_off found less the truth, s; NaN where none was found. */
  readonly onError: number;
  readonly offError: number;
}

function shot(options: EspressoScenarioOptions & { readonly seed: number }): Shot {
  const run = simulateRun(
    espressoScenario({
      pumpOnMs: phasedPumpOnMs(options.seed),
      ...options,
      scale: { ...AGREED_SCALE, ...options.scale },
      shot: { ...AGREED_SHOT, ...options.shot },
    }),
  );
  expect(run.segmentation.shotWindows).toHaveLength(1);
  const m = shotMarkers(run.segmentation, run.segmentation.shotWindows[0], {
    liquid: AGREED_LIQUID,
  });
  const [truth] = run.session.truth.shots;
  const { pumpOn, pumpOff } = m.pump;
  return {
    run,
    m,
    onError: pumpOn ? pumpOn.t - run.at(truth.pumpOnMs) : Number.NaN,
    offError: pumpOff ? pumpOff.t - run.at(truth.pumpOffMs) : Number.NaN,
  };
}

/** Shots of 100 seeds at the agreed scale's vibration (σ 0.1 g), for the tests that read them. */
const vibratingShots = (() => {
  let shots: Shot[] | null = null;
  return () => (shots ??= seeds(100).map((seed) => shot({ seed })));
})();

describe('pumpMarkers: at the agreed scale’s vibration (σ 0.1 g)', () => {
  it('times pump_off within 0.2 s in every shot, nearly always by the variance', () => {
    let byVariance = 0;
    for (const { m, offError } of vibratingShots()) {
      expect(Math.abs(offError)).toBeLessThan(0.2);
      expect(m.pump.vibration?.clear).toBe(true);
      if (m.pump.pumpOff?.detector === 'variance') {
        byVariance++;
        expect(m.pump.flags).toEqual([]);
        expect(m.pump.varianceStep?.clear).toBe(true);
      } else {
        // A step down the noise draws made unclear: the regime change stands in, flagged.
        expect(m.pump.pumpOff?.detector).toBe('regime-change');
        expect(m.pump.flags).toEqual(['variance-step-unclear']);
      }
    }
    expect(byVariance).toBeGreaterThanOrEqual(98);
    // Measured: median 0.024 s, 90% within 0.09 s, worst 0.16 s.
    expect(
      absQuantile(
        vibratingShots().map((s) => s.offError),
        0.5,
      ),
    ).toBeLessThan(0.05);
    // The first to ask simulates the 100 shots: about 5 s alone, more with the whole suite.
  }, 30_000);

  it('times pump_on to the information limit: about one shot in ten beyond 0.2 s', () => {
    // When the first vibrating samples happen to look quiet, no method can tell (D-036): an
    // oracle knowing both noise levels had 9% beyond 0.2 s. Measured: median 0.034 s, 90% within
    // 0.2 s, worst 0.30 s, median signed error 0.019 s (late: quiet-looking samples only delay).
    const errors = vibratingShots().map((s) => s.onError);
    expect(errors.every(Number.isFinite)).toBe(true);
    expect(Math.abs(median(errors))).toBeLessThan(0.03);
    expect(absQuantile(errors, 0.5)).toBeLessThan(0.05);
    expect(absQuantile(errors, 0.85)).toBeLessThan(0.2);
    expect(absQuantile(errors, 1)).toBeLessThan(0.5);
  });

  it('gives the tail fit a pump_off good enough for τ within 10% and the yield within 0.05 g', () => {
    for (const { m, run } of vibratingShots()) {
      const [truth] = run.session.truth.shots;
      expect(m.liquid.pumpOff?.t).toBe(m.pump.pumpOff?.t);
      expect(Math.abs(m.liquid.tail!.tauS / (truth.tailTauMs / 1000) - 1)).toBeLessThan(0.1);
      expect(Math.abs(m.liquid.settled!.weightG - truth.yieldG)).toBeLessThan(0.05);
    }
  });

  it('agrees with the regime change, its cross-check', () => {
    // Under the vibration the regime change alone is often too loose to count; where it counts
    // it lands near the variance's pump_off.
    let accepted = 0;
    for (const { m } of vibratingShots()) {
      const { regimeChange, varianceStep } = m.pump;
      if (!regimeChange?.accepted) continue;
      accepted++;
      expect(Math.abs(regimeChange.t - varianceStep!.t)).toBeLessThan(0.3);
    }
    expect(accepted).toBeGreaterThan(80);
  });
});

describe('pumpMarkers: without the pump’s vibration', () => {
  it('falls back to the regime change, flags it, and times pump_off within 0.1 s', () => {
    const errors: number[] = [];
    for (const seed of seeds(100)) {
      const { m, offError } = shot({ seed, scale: { vibrationSigmaG: 0 } });
      expect(m.pump.pumpOn).toBeNull();
      expect(m.pump.flags).toEqual(['no-vibration']);
      expect(m.pump.vibration?.clear ?? false).toBe(false);
      expect(m.pump.varianceStep).toBeNull();
      expect(m.pump.pumpOff?.detector).toBe('regime-change');
      expect(Math.abs(offError)).toBeLessThan(0.1);
      errors.push(offError);
    }
    // Measured: median 0.013 s, worst 0.064 s; no bias.
    expect(Math.abs(median(errors))).toBeLessThan(0.01);
  });

  it('counts a vibration too weak to time well as none', () => {
    // σ 0.02 g on the scale's own 0.015 g: the step up is too slight to place the onset.
    let shown = 0;
    for (const seed of seeds(20)) {
      const { m, offError } = shot({ seed, scale: { vibrationSigmaG: 0.02 } });
      if (m.pump.pumpOn) shown++;
      expect(m.pump.pumpOff?.detector).toBe('regime-change');
      expect(Math.abs(offError)).toBeLessThan(0.1);
    }
    expect(shown).toBeLessThanOrEqual(1);
  });
});

describe('pumpMarkers: other vibration levels', () => {
  it('times pump_off within 0.2 s at a weaker vibration (σ 0.05 g), by either detector', () => {
    const detectors = new Set<string>();
    for (const seed of seeds(30)) {
      const { m, offError } = shot({ seed, scale: { vibrationSigmaG: 0.05 } });
      detectors.add(m.pump.pumpOff!.detector);
      expect(Math.abs(offError)).toBeLessThan(0.2);
    }
    expect([...detectors].sort()).toEqual(['regime-change', 'variance']);
  });

  it('times both at a stronger vibration (σ 0.2 g)', () => {
    const onErrors: number[] = [];
    for (const seed of seeds(30)) {
      const { m, onError, offError } = shot({ seed, scale: { vibrationSigmaG: 0.2 } });
      expect(m.pump.pumpOff?.detector).toBe('variance');
      expect(Math.abs(offError)).toBeLessThan(0.2);
      onErrors.push(onError);
    }
    expect(absQuantile(onErrors, 0.5)).toBeLessThan(0.05);
    expect(absQuantile(onErrors, 1)).toBeLessThan(0.4);
  });
});

describe('pumpMarkers: inputs and results', () => {
  it('finds nothing without a first drip', () => {
    const { run } = shot({ seed: 1 });
    const result = pumpMarkers(run.segmentation, run.segmentation.shotWindows[0], {
      firstDrip: null,
    });
    expect(result).toMatchObject({
      pumpOn: null,
      pumpOff: null,
      vibration: null,
      varianceStep: null,
      regimeChange: null,
      flags: ['no-first-drip'],
    });
  });

  it('runs with overridden parameters, and refuses invalid ones', () => {
    const { run, m } = shot({ seed: 2 });
    const window = run.segmentation.shotWindows[0];
    const firstDrip = m.liquid.firstDrip;
    // A ratio no vibration reaches: the regime change gives pump_off.
    const strict = pumpMarkers(run.segmentation, window, { firstDrip }, { vibrationRatio: 1e6 });
    expect(strict.pumpOn).toBeNull();
    expect(strict.params.vibrationRatio).toBe(1e6);
    expect(strict.flags).toContain('no-vibration');
    expect(() =>
      pumpMarkers(run.segmentation, window, { firstDrip }, { maxDrainTauS: -1 }),
    ).toThrow(RangeError);
  });

  it('is pure, and its result is plain JSON', () => {
    const { run, m } = shot({ seed: 3 });
    const again = shotMarkers(run.segmentation, run.segmentation.shotWindows[0], {
      liquid: AGREED_LIQUID,
    });
    expect(again).toEqual(m);
    expect(JSON.parse(JSON.stringify(m.pump))).toEqual(m.pump);
  });
});
