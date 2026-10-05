/**
 * The pump markers in sessions beyond the usual shot (T1.13, D-036): knocks, a flush, the cup
 * lifted early, a recording cut short, other flows and drains, coarse readings, the link's
 * arrival times, two shots in one cup and a spoon. Against the simulator's ground truth, on the
 * 0.01 g scale D-036 was agreed on (`AGREED_SCALE`); the acceptance at the usual shot is in
 * `pump-markers.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import type { RawFrame } from '../model';
import { decodeFrame, encodeWeightFrame, tareAndStartTimer } from '../protocol';
import {
  espressoScenario,
  type EspressoScenarioOptions,
  type Scenario,
  type ScriptEvent,
  type SimulatedSession,
} from '../sim';
import { pumpMarkers } from './pump-markers';
import { shotMarkers, type ShotMarkers } from './shot-markers';
import {
  AGREED_SCALE,
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

type Frames = (frames: RawFrame[], session: SimulatedSession) => RawFrame[];

function shotOf(scenario: Scenario, frames?: Frames): Shot {
  const run = simulateRun(scenario, frames);
  expect(run.segmentation.shotWindows).toHaveLength(1);
  const m = shotMarkers(run.segmentation, run.segmentation.shotWindows[0]);
  const [truth] = run.session.truth.shots;
  return {
    run,
    m,
    onError: m.pump.pumpOn ? m.pump.pumpOn.t - run.at(truth.pumpOnMs) : Number.NaN,
    offError: m.pump.pumpOff ? m.pump.pumpOff.t - run.at(truth.pumpOffMs) : Number.NaN,
  };
}

/** The espresso scenario with the pump's phase varied by the seed, and extra script events. */
function espresso(
  seed: number,
  options: EspressoScenarioOptions = {},
  extra: (pumpOnMs: number) => ScriptEvent[] = () => [],
): Scenario {
  const pumpOnMs = options.pumpOnMs ?? phasedPumpOnMs(seed);
  const scale = { ...AGREED_SCALE, ...options.scale };
  const scenario = espressoScenario({ seed, pumpOnMs, ...options, scale });
  return { ...scenario, script: [...scenario.script, ...extra(pumpOnMs)] };
}

/**
 * The frames with `massG` more on the platform from `fromMs` until `toMs` (true sample times).
 * The sign byte follows the new weight: near 0 a reading can change sign.
 */
const adding =
  (fromMs: number, massG: number, toMs = Infinity): Frames =>
  (frames, session) =>
    frames.map((frame, i) => {
      const decoded = decodeFrame(frame.bytes);
      const sampleMs = session.frames[i].truth.sampleTMs;
      if (decoded.kind !== 'weight' || sampleMs < fromMs || sampleMs >= toMs) return frame;
      const input = { ...decoded, weightG: decoded.weightG + massG, weightSignByte: undefined };
      return { ...frame, bytes: encodeWeightFrame(input) };
    });

describe('pumpMarkers: knocks and the mean', () => {
  it('takes the pump’s onset, not a knock’s, before the pump', () => {
    // A knock (3 g for 0.2 s: the portafilter locked in) 1.5 s or 0.4 s before the pump starts.
    // The app's tare+start comes at 4 s, clear of the knock: a knock within half a second after
    // a tare can make the tare read as a cup lifted, and lose the window (T1.16 note).
    for (const leadMs of [1500, 400]) {
      let found = 0;
      for (const seed of seeds(12)) {
        const { m, onError, offError } = shotOf(
          espresso(seed, { tareAndStartMs: 4000 }, (pumpOnMs) => [
            { type: 'bump', atMs: pumpOnMs - leadMs, durationMs: 200, peakG: 3 },
          ]),
        );
        expect(Math.abs(offError)).toBeLessThan(0.2);
        if (m.pump.pumpOn === null) continue;
        found++;
        // Never the knock's time, the lead or more early; late within the information limit.
        expect(onError).toBeGreaterThan(-0.3);
        expect(onError).toBeLessThan(0.7);
      }
      // pump_on can be missing in any shot (D-036), a little more often when the samples next
      // to a knock are left out: 2 of 12 at a lead of 0.4 s.
      expect(found).toBeGreaterThanOrEqual(10);
    }
  });

  it('takes no knock for the pump when the vibration doesn’t show', () => {
    for (const seed of seeds(10)) {
      const { m, offError } = shotOf(
        espresso(seed, { scale: { vibrationSigmaG: 0 } }, (pumpOnMs) => [
          { type: 'bump', atMs: pumpOnMs + 1000, durationMs: 200, peakG: 3 },
        ]),
      );
      expect(m.pump.pumpOn).toBeNull();
      expect(m.pump.flags).toEqual(['no-vibration']);
      expect(Math.abs(offError)).toBeLessThan(0.1);
    }
  });

  it('rejects an onset where the mean moves too (spec: requiring both rejects a bump)', () => {
    // The reading settles 0.3 g higher as the pump starts: too little to be a step or a knock,
    // but no vibration moves the mean. first_drip would take a lasting shift for liquid, so it
    // comes from the same shot without the shift: this tests the pump's rule alone.
    for (const seed of seeds(10)) {
      const pumpOnMs = phasedPumpOnMs(seed);
      const clean = shotOf(espresso(seed));
      const shifted = simulateRun(espresso(seed), adding(pumpOnMs, 0.3));
      const pump = pumpMarkers(shifted.segmentation, shifted.segmentation.shotWindows[0], {
        firstDrip: clean.m.liquid.firstDrip,
      });
      expect(pump.pumpOn).toBeNull();
      expect(pump.flags).toContain('mean-moved');
      expect(pump.vibration?.clear).toBe(true);
      // Its step is still the pump's.
      expect(Math.abs(pump.vibration!.t - clean.run.at(pumpOnMs))).toBeLessThan(0.6);
    }
  });

  it('starts at the shot’s pump, not a flush before it with the cup on', () => {
    for (const seed of seeds(10)) {
      const { onError, offError } = shotOf(
        espresso(seed, { tareAndStartMs: 9000, pumpOnMs: 11_000 + (seed % 10) * 10 }, () => [
          { type: 'pump', atMs: 2600, durationMs: 1500 },
        ]),
      );
      expect(Math.abs(onError)).toBeLessThan(0.6);
      expect(Math.abs(offError)).toBeLessThan(0.2);
    }
  });
});

describe('pumpMarkers: where the window ends', () => {
  it('times pump_off with 2 s of tail before the cup comes off', () => {
    for (const seed of seeds(12)) {
      const { m, offError } = shotOf(espresso(seed, { cupOffAfterPumpOffMs: 2000 }));
      expect(m.pump.pumpOff?.detector).toBe('variance');
      expect(Math.abs(offError)).toBeLessThan(0.2);
    }
  });

  it('with 1 s of tail, times pump_off or says it can’t, never wrongly', () => {
    let found = 0;
    for (const seed of seeds(12)) {
      const { m, offError } = shotOf(espresso(seed, { cupOffAfterPumpOffMs: 1000 }));
      if (m.pump.pumpOff === null) {
        expect(m.pump.flags).toContain('no-pump-off');
        continue;
      }
      found++;
      expect(Math.abs(offError)).toBeLessThan(0.2);
    }
    expect(found).toBeGreaterThanOrEqual(6);
    // Without the vibration the regime change alone manages it.
    for (const seed of seeds(6)) {
      const { offError } = shotOf(
        espresso(seed, { cupOffAfterPumpOffMs: 1000, scale: { vibrationSigmaG: 0 } }),
      );
      expect(Math.abs(offError)).toBeLessThan(0.2);
    }
  });

  it('finds no pump_off in a recording cut before the pump stopped', () => {
    for (const seed of seeds(10)) {
      for (const vibrationSigmaG of [0.1, 0]) {
        const { m } = shotOf(espresso(seed, { scale: { vibrationSigmaG } }), (frames) =>
          frames.filter((frame) => frame.tMs < 25_000),
        );
        expect(m.pump.pumpOff).toBeNull();
        expect(m.pump.flags).toContain('no-pump-off');
        expect(m.liquid.flags).toContain('no-pump-off');
      }
    }
  });
});

describe('pumpMarkers: other shots', () => {
  it('times pump_off through other flows and drains', () => {
    const cases: EspressoScenarioOptions[] = [
      // Flow there from the first drip, flow falling through the shot, fast and slow drains.
      {
        shot: {
          flowProfile: [
            [0, 1],
            [1, 1.25],
          ],
        },
      },
      {
        shot: {
          flowProfile: [
            [0, 0],
            [0.08, 1],
            [1, 0.6],
          ],
        },
      },
      { shot: { tailTauMs: 800 } },
      { shot: { tailTauMs: 3000 } },
      { shot: { preInfusionMs: 1500 } },
    ];
    for (const options of cases) {
      for (const vibrationSigmaG of [0.1, 0]) {
        for (const seed of seeds(6)) {
          const { m, offError } = shotOf(
            espresso(seed, { ...options, scale: { vibrationSigmaG } }),
          );
          // Under the vibration a regime change can stand in, a little looser.
          const within =
            m.pump.pumpOff?.detector === 'regime-change' && vibrationSigmaG ? 0.35 : 0.2;
          expect(Math.abs(offError)).toBeLessThan(within);
        }
      }
    }
  });

  it('copes with readings quantised to 0.1 g', () => {
    // As coarse as the vibration: some vibrating samples read as still, so pump_on runs late
    // (D-034's limit); pump_off still holds.
    const onErrors: number[] = [];
    for (const seed of seeds(12)) {
      const { onError, offError } = shotOf(espresso(seed, { scale: { resolutionG: 0.1 } }));
      expect(Math.abs(offError)).toBeLessThan(0.2);
      if (Number.isFinite(onError)) onErrors.push(onError);
    }
    expect(absQuantile(onErrors, 0.5)).toBeLessThan(0.4);
  });

  it('copes with arrival times only, and with the link stalling', () => {
    for (const seed of seeds(10)) {
      for (const options of [
        { tareAndStartMs: null },
        { link: { stallProbability: 0.03 } },
      ] satisfies EspressoScenarioOptions[]) {
        const { offError, onError } = shotOf(espresso(seed, options));
        expect(Math.abs(offError)).toBeLessThan(0.2);
        expect(Math.abs(onError)).toBeLessThan(0.6);
      }
    }
  });

  it('reads two shots into the same cup, each in its own window', () => {
    const script: ScriptEvent[] = [
      { type: 'cup-on', atMs: 2000, massG: 110 },
      { type: 'command', atMs: 5000, command: tareAndStartTimer(), reason: 'manual-start' },
      { type: 'shot', atMs: 7030 },
      { type: 'shot', atMs: 60_070, yieldG: 30 },
      { type: 'cup-off', atMs: 110_000 },
    ];
    for (const seed of seeds(6)) {
      const run = simulateRun({ seed, durationMs: 120_000, script, scale: AGREED_SCALE });
      expect(run.segmentation.shotWindows).toHaveLength(2);
      run.session.truth.shots.forEach((truth, k) => {
        const { pump } = shotMarkers(run.segmentation, run.segmentation.shotWindows[k]);
        expect(Math.abs(pump.pumpOn!.t - run.at(truth.pumpOnMs))).toBeLessThan(0.6);
        expect(Math.abs(pump.pumpOff!.t - run.at(truth.pumpOffMs))).toBeLessThan(0.2);
      });
    }
  });

  it('takes a spoon set down during the extraction in its stride', () => {
    for (const seed of seeds(6)) {
      const { m, offError } = shotOf(espresso(seed), adding(20_000, 5));
      expect(m.liquid.flags).toContain('other-steps');
      expect(Math.abs(offError)).toBeLessThan(0.2);
    }
  });
});

describe('pumpMarkers: pump_on from the tap (Q4, D-048)', () => {
  /** The scale without the pump's vibration, as the real one (A2), and a tap `latencyMs` late. */
  const tapped = (seed: number, latencyMs: number, options: EspressoScenarioOptions = {}) =>
    espresso(seed, { scale: { vibrationSigmaG: 0 }, ...options }, (pumpOnMs) => [
      {
        type: 'command',
        atMs: pumpOnMs + latencyMs,
        command: tareAndStartTimer(),
        reason: 'manual-start',
      },
    ]);

  it('takes the Tare + start tap for pump_on where the vibration doesn’t show, flagged', () => {
    for (const seed of seeds(10)) {
      // The user's tap, up to 0.3 s either side of the pump.
      const latencyMs = ((seed * 53) % 600) - 300;
      const pumpOnMs = phasedPumpOnMs(seed);
      const { m, offError } = shotOf(tapped(seed, latencyMs));
      expect(m.pump.pumpOn).toEqual({ t: (pumpOnMs + latencyMs) / 1000, source: 'manual' });
      expect(m.pump.flags).toEqual(['no-vibration', 'manual-pump-on']);
      expect(Math.abs(offError)).toBeLessThan(0.1);
    }
  });

  it('leaves the auto-tare out, and a tap too long before the first drip', () => {
    for (const seed of seeds(4)) {
      // The usual scenario's only 07 is the auto-tare, 2 s before the pump.
      const auto = shotOf(espresso(seed, { scale: { vibrationSigmaG: 0 } }));
      expect(auto.m.pump.pumpOn).toBeNull();
      expect(auto.m.pump.flags).toEqual(['no-vibration']);
      // A tap 10 s before the pump starts, 16 s before the drip.
      const early = shotOf(tapped(seed, -10_000, { tareAndStartMs: null, pumpOnMs: 14_000 }));
      expect(early.m.pump.pumpOn).toBeNull();
      expect(early.m.pump.flags).not.toContain('manual-pump-on');
    }
  });

  it('takes the variance’s onset where the vibration shows, tap or no tap', () => {
    for (const seed of seeds(6)) {
      const { m } = shotOf(tapped(seed, 250, { scale: { vibrationSigmaG: 0.1 } }));
      if (m.pump.pumpOn === null) continue; // the vibration can miss one now and then (D-036)
      expect(m.pump.pumpOn.source).toBe('variance');
      expect(m.pump.flags).not.toContain('manual-pump-on');
    }
  });
});
