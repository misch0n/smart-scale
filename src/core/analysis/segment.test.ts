/**
 * The segmentation against the simulator's ground truth (T1.11 acceptance). Times from the
 * timeline are the sample's time plus the link's latency (15 ms and up), so comparisons with
 * true times allow a sample period or so.
 */

import { describe, expect, it } from 'vitest';
import type { AppEvent, RawFrame } from '../model';
import { decodeFrame, encodeWeightFrame, tareAndStartTimer } from '../protocol';
import {
  demoScenario,
  espressoScenario,
  simulateSession,
  toRawRecording,
  type FrameTruth,
  type Scenario,
  type ScriptEvent,
} from '../sim';
import { buildTimeline } from '../timebase';
import { segment, type Segmentation } from './segment';
import { AGREED_SCALE, AGREED_SHOT } from './test-runs';

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);

interface Simulated {
  readonly segmentation: Segmentation;
  readonly session: ReturnType<typeof simulateSession>;
  readonly truth: ReadonlyMap<number, FrameTruth>;
}

function simulate(scenario: Scenario, keep: (frame: RawFrame) => boolean = () => true): Simulated {
  const session = simulateSession(scenario);
  const raw = toRawRecording(session);
  // toRawRecording keeps the frames in arrival order, as session.frames has them.
  const truth = new Map(raw.frames.map((frame, i) => [frame.seq, session.frames[i].truth]));
  const frames = raw.frames.filter(keep);
  return { segmentation: segment(buildTimeline(frames), raw.events), session, truth };
}

/** A scenario with more script events. */
function plus(scenario: Scenario, ...events: ScriptEvent[]): Scenario {
  return { ...scenario, script: [...scenario.script, ...events] };
}

const command07 = (atMs: number): ScriptEvent => ({
  type: 'command',
  atMs,
  command: tareAndStartTimer(),
  reason: 'manual-start',
});

/**
 * The largest zero-tracking error, g: each zero-tracked sample against its reading with the
 * scale's true zero added back, which is the weight relative to the zero it started with.
 */
function zeroTrackingError({ segmentation, truth }: Simulated): number {
  const { seq, weightG } = segmentation.samples;
  return Math.max(
    ...seq.map((s, i) => {
      const frame = truth.get(s)!;
      return Math.abs(weightG[i] - (frame.weightG + frame.offsetG));
    }),
  );
}

/** Grams on the scale's 0.1 g grid, as the frame carries them. */
const round01 = (g: number) => Math.round(g * 10) / 10 + 0;

const kinds = (segmentation: Segmentation) =>
  segmentation.steps.map((step) => (step.tareSource ? `tare/${step.tareSource}` : step.kind));

describe('segment: the usual shot', () => {
  it('finds the cup, the auto-tare, the removal and one window around the shot', () => {
    // In 0.01 g steps, as T1.11 was built: at the scale's 0.1 g the baseline can run into the
    // pre-infusion (D-034's limit), which the quantised test below covers.
    for (const seed of SEEDS) {
      const sim = simulate(espressoScenario({ seed, scale: AGREED_SCALE, shot: AGREED_SHOT }));
      const { segmentation } = sim;
      const [shot] = sim.session.truth.shots;
      expect(kinds(segmentation)).toEqual(['cup-placed', 'tare/command', 'cup-removed']);
      expect(segmentation.refusedFrames).toBe(0);
      expect(segmentation.shotWindows).toHaveLength(1);
      const [window] = segmentation.shotWindows;
      expect(window.end).toBe('cup-removed');
      expect(window.cupPlaced).toBe(segmentation.steps[0]);
      expect(window.cupRemoved).toBe(segmentation.steps[2]);
      // The window holds the shot from pump_on to settled, and ends as the cup comes off.
      expect(window.startT).toBeLessThan(shot.pumpOnMs / 1000);
      expect(Math.abs(window.endT - shot.cupRemovedMs! / 1000)).toBeLessThan(0.15);
      expect(window.endT).toBeGreaterThan(shot.settledMs / 1000);
      const { startIndex, endIndex } = window;
      const { start, step } = segmentation.series;
      expect(start + startIndex * step).toBeGreaterThanOrEqual(window.startT - 1e-9);
      expect(start + (endIndex - 1) * step).toBeLessThanOrEqual(window.endT + 1e-9);
      expect(start + endIndex * step).toBeGreaterThan(window.endT);
      // The baseline: the cup's weight from the scale's first zero, before the pump.
      expect(window.baseline.levelG).toBeCloseTo(110, 1);
      expect(window.baseline.endT).toBeGreaterThan(shot.pumpOnMs / 1000 - 2.5);
      expect(window.baseline.endT).toBeLessThan(shot.pumpOnMs / 1000 + 0.5);
      expect(window.baseline.endT - window.baseline.startT).toBeGreaterThanOrEqual(1);
      expect(window.baseline.sigmaG).toBeGreaterThan(0.005); // the quiet σ is 0.012 g
      expect(window.baseline.sigmaG).toBeLessThan(0.03);
      expect(window.riseG).toBeCloseTo(shot.yieldG, 1);
      expect(zeroTrackingError(sim)).toBeLessThan(0.05);
    }
  });

  it('is pure: the same recording gives the same segmentation', () => {
    const session = simulateSession(espressoScenario({ seed: 3 }));
    const raw = toRawRecording(session);
    const once = segment(buildTimeline(raw.frames), raw.events);
    expect(segment(buildTimeline(raw.frames), raw.events)).toEqual(once);
  });

  it('runs the stability test on the quantisation step it reads off the data', () => {
    const fine = simulate(
      espressoScenario({ seed: 1, scale: AGREED_SCALE, shot: AGREED_SHOT }),
    ).segmentation;
    expect(fine.quantisationG).toBe(0.01);
    expect(fine.toleranceG).toBe(0.05);
    expect(fine.sigmaFloorG).toBeCloseTo(0.01 / Math.sqrt(12), 12);
    // The scale's own 0.1 g steps (D-037): two neighbouring readings are stable.
    const { segmentation } = simulate(espressoScenario({ seed: 1 }));
    expect(segmentation.quantisationG).toBe(0.1);
    expect(segmentation.toleranceG).toBe(0.1);
    expect(segmentation.sigmaFloorG).toBeCloseTo(0.1 / Math.sqrt(12), 12);
    expect(segmentation.stableWindow).toBe(5); // 0.5 s at 9.93 Hz
    expect(segmentation.series.step).toBeCloseTo(0.1007, 3);
  });
});

describe('segment: acceptance scenarios', () => {
  it('takes off a tare while idle, from the app or from the button', () => {
    for (const seed of SEEDS) {
      const fromApp = simulate(espressoScenario({ seed }));
      const fromButton = simulate(
        plus(espressoScenario({ seed, tareAndStartMs: null }), { type: 'tare-button', atMs: 4000 }),
      );
      expect(kinds(fromButton.segmentation)).toEqual(['cup-placed', 'tare/jump', 'cup-removed']);
      for (const sim of [fromApp, fromButton]) {
        const tare = sim.segmentation.steps[1];
        expect(tare.sizeG).toBeCloseTo(-110, 1);
        expect(Math.abs(tare.levelAfterG - tare.levelBeforeG)).toBeLessThan(0.05);
        expect(zeroTrackingError(sim)).toBeLessThan(0.05);
        expect(sim.segmentation.shotWindows).toHaveLength(1);
        expect(sim.segmentation.shotWindows[0].baseline.levelG).toBeCloseTo(110, 1);
      }
    }
  });

  it('takes off the button’s tare from before its press, and leaves the press out (D-051)', () => {
    // The press weighs on the platform until the scale tares as it's let go, and both show in
    // one frame, as in hardware session 1 at 118.5 s.
    for (const seed of SEEDS) {
      for (const pressG of [3, 13.1, 60]) {
        const press: ScriptEvent = { type: 'tare-button', atMs: 4000, pressG, pressMs: 900 };
        const sim = simulate(plus(espressoScenario({ seed, tareAndStartMs: null }), press));
        const { steps, transients, shotWindows } = sim.segmentation;
        expect(kinds(sim.segmentation)).toEqual(['cup-placed', 'tare/jump', 'cup-removed']);
        const tare = steps[1];
        expect(tare.jumps).toBe(2);
        expect(Math.abs(tare.startT - 3.1)).toBeLessThan(0.15);
        expect(tare.sizeG).toBeCloseTo(-110, 1);
        expect(Math.abs(tare.levelAfterG - tare.levelBeforeG)).toBeLessThan(0.05);
        expect(transients).toContainEqual({ startT: tare.startT, endT: tare.endT, jumps: 2 });
        expect(zeroTrackingError(sim)).toBeLessThan(0.05);
        expect(shotWindows).toHaveLength(1);
        expect(shotWindows[0].baseline.levelG).toBeCloseTo(110, 1);
      }
    }
  });

  it('subtracts a stray tare during the tail, which leaves the yield unchanged', () => {
    for (const afterPumpOffS of [0.3, 1, 2, 5, 10]) {
      for (const seed of SEEDS.slice(0, 8)) {
        const scenario = espressoScenario({ seed });
        const tareMs = 35_000 + afterPumpOffS * 1000; // pump_off is at 35 s
        const clean = simulate(scenario);
        const stray = simulate(plus(scenario, { type: 'tare-button', atMs: tareMs }));
        expect(kinds(stray.segmentation)).toEqual([
          'cup-placed',
          'tare/command',
          'tare/jump',
          'cup-removed',
        ]);
        const tare = stray.segmentation.steps[2];
        expect(Math.abs(tare.startT - tareMs / 1000)).toBeLessThan(0.15);
        // 0.3 s after pump_off the drain (τ 0.2 s, D-059) still curves within the second of
        // readings either side that measures the tare: up to 0.3 g off. A second on, 0.05 g.
        const within = afterPumpOffS < 1 ? 0.35 : 0.15;
        expect(zeroTrackingError(stray)).toBeLessThan(within);
        // Simulated frames are the same with and without the press, but for the scale's zero.
        const [cleanWindow] = clean.segmentation.shotWindows;
        const [strayWindow] = stray.segmentation.shotWindows;
        expect(stray.segmentation.shotWindows).toHaveLength(1);
        expect(strayWindow.baseline).toEqual(cleanWindow.baseline);
        expect(Math.abs(strayWindow.riseG - cleanWindow.riseG)).toBeLessThan(within);
      }
    }
  });

  it('finds two shots in one recording, with the cup changed between them', () => {
    const script: ScriptEvent[] = [
      { type: 'cup-on', atMs: 2000, massG: 110 },
      command07(5000),
      { type: 'shot', atMs: 7000 },
      { type: 'cup-off', atMs: 60_000 },
      { type: 'cup-on', atMs: 70_000, massG: 95 },
      command07(73_000),
      { type: 'shot', atMs: 76_000, yieldG: 34 },
      { type: 'cup-off', atMs: 130_000 },
    ];
    for (const seed of SEEDS.slice(0, 6)) {
      const sim = simulate({ seed, durationMs: 140_000, script });
      const { shotWindows } = sim.segmentation;
      expect(kinds(sim.segmentation)).toEqual([
        'cup-placed',
        'tare/command',
        'cup-removed',
        'cup-placed',
        'tare/command',
        'cup-removed',
      ]);
      expect(shotWindows.map((window) => window.end)).toEqual(['cup-removed', 'cup-removed']);
      sim.session.truth.shots.forEach((shot, k) => {
        const window = shotWindows[k];
        expect(window.startT).toBeLessThan(shot.pumpOnMs / 1000);
        expect(window.endT).toBeGreaterThan(shot.settledMs / 1000);
        expect(window.riseG).toBeCloseTo(shot.yieldG, 1);
      });
      // Zero-tracked, each baseline is its cup's weight from the scale's first zero, give or
      // take the error of each tare's correction (about 0.03 g at rest), which adds up. A yield
      // doesn't carry it: each baseline comes after the tares before it.
      expect(shotWindows[0].baseline.levelG).toBeCloseTo(110, 1);
      expect(Math.abs(shotWindows[1].baseline.levelG - 95)).toBeLessThan(0.1);
      expect(shotWindows[1].endT).toBeGreaterThan(shotWindows[0].endT);
      expect(zeroTrackingError(sim)).toBeLessThan(0.1);
    }
  });

  it('starts a second shot into the same cup from the first one’s settled level', () => {
    const script: ScriptEvent[] = [
      { type: 'cup-on', atMs: 2000, massG: 110 },
      command07(5000),
      { type: 'shot', atMs: 7000 },
      { type: 'shot', atMs: 60_000, yieldG: 30 },
      { type: 'cup-off', atMs: 110_000 },
    ];
    const sim = simulate({ seed: 4, durationMs: 120_000, script });
    const [first, second] = sim.segmentation.shotWindows;
    expect(sim.segmentation.shotWindows).toHaveLength(2);
    expect(first.end).toBe('next-shot');
    expect(first.cupRemoved).toBeNull();
    expect(second.end).toBe('cup-removed');
    expect(second.baseline.levelG).toBeCloseTo(148, 0);
    expect(first.endT).toBeCloseTo(second.baseline.endT, 9);
    expect(first.riseG).toBeCloseTo(38, 1);
    expect(second.riseG).toBeCloseTo(30, 1);
  });

  it('ends the window at a cup removed before the tail settles, and ignores the late drips', () => {
    for (const seed of SEEDS) {
      const sim = simulate(espressoScenario({ seed, cupOffAfterPumpOffMs: 1000 }));
      const [shot] = sim.session.truth.shots;
      const { shotWindows, steps, stretches } = sim.segmentation;
      expect(kinds(sim.segmentation)).toEqual(['cup-placed', 'tare/command', 'cup-removed']);
      expect(shotWindows).toHaveLength(1);
      const [window] = shotWindows;
      expect(window.end).toBe('cup-removed');
      expect(window.cupRemoved).toBe(steps[2]);
      expect(Math.abs(window.endT - shot.cupRemovedMs! / 1000)).toBeLessThan(0.15);
      // Honest yield: what was in the cup as it came off.
      const honest = window.cupRemoved!.levelBeforeG - window.baseline.levelG;
      expect(Math.abs(honest - shot.honestYieldG!)).toBeLessThan(0.1);
      // The drips that land on the bare platform later settle, but make no shot.
      expect(stretches.at(-1)!.startT).toBeGreaterThan(window.endT);
    }
  });

  it('floors σ at q/√12 on quantised data, whose readings at rest can all be equal', () => {
    for (const seed of SEEDS) {
      const sim = simulate(espressoScenario({ seed, scale: { resolutionG: 0.1 } }));
      const { segmentation } = sim;
      const floor = 0.1 / Math.sqrt(12);
      expect(segmentation.quantisationG).toBe(0.1);
      expect(segmentation.toleranceG).toBe(0.1); // one step: two neighbouring readings
      expect(segmentation.sigmaFloorG).toBeCloseTo(floor, 12);
      for (const stretch of segmentation.stretches) {
        expect(stretch.sigmaG).toBeGreaterThanOrEqual(floor);
      }
      // The empty platform before the cup: noise of 0.012 g reads as 0.0 throughout.
      const [empty] = segmentation.stretches;
      expect(empty.endT).toBeLessThan(2);
      expect(empty.sigmaG).toBeCloseTo(floor, 12);
      // With steps as coarse as the pump's vibration, a second of the pre-infusion can pass for
      // stable, so the baseline may run into it (D-034); its level stays close.
      expect(segmentation.shotWindows).toHaveLength(1);
      const [window] = segmentation.shotWindows;
      expect(Math.abs(window.baseline.levelG - 110)).toBeLessThan(0.15);
      expect(Math.abs(window.riseG - 38)).toBeLessThan(0.15);
    }
  });
});

describe('segment: other sessions', () => {
  it('runs the baseline on through the pre-infusion when the pump’s vibration doesn’t show', () => {
    for (const seed of SEEDS) {
      const sim = simulate(espressoScenario({ seed, scale: { vibrationSigmaG: 0 } }));
      const [shot] = sim.session.truth.shots;
      const [window] = sim.segmentation.shotWindows;
      // Noise splits the stable stretch now and then: the baseline takes the last long piece.
      // In 0.1 g steps it runs on past the first drop until the reading has moved two steps,
      // 0.35–0.76 s in over 60 seeds.
      expect(window.baseline.endT).toBeGreaterThan(shot.firstDripMs / 1000 - 2);
      expect(window.baseline.endT).toBeLessThan(shot.firstDripMs / 1000 + 1);
      expect(window.riseG).toBeCloseTo(shot.yieldG, 1);
    }
  });

  it('takes a pause in a slow start for part of the shot, not its baseline (T1.16)', () => {
    // As shot B of hardware session 2: at 0.1 g without the vibration, the flow stops for 1.5 s
    // a second after the first drip, and the reading holds still meanwhile.
    const flowProfile = [
      [0, 0.4],
      [0.045, 0.4],
      [0.046, 0],
      [0.113, 0],
      [0.114, 0.4],
      [1, 1.2],
    ] as const;
    for (const seed of SEEDS.slice(0, 6)) {
      const sim = simulate(
        espressoScenario({ seed, scale: { vibrationSigmaG: 0 }, shot: { flowProfile } }),
      );
      const [shot] = sim.session.truth.shots;
      expect(sim.segmentation.shotWindows).toHaveLength(1);
      const [window] = sim.segmentation.shotWindows;
      expect(window.baseline.endT).toBeLessThan(shot.firstDripMs / 1000 + 1);
      expect(window.riseG).toBeCloseTo(shot.yieldG, 1);
    }
  });

  it('makes no window of things set down, however many jumps they take (T1.16)', () => {
    // A cup on, then 15 g set down in it three times, 1.6 s apart, each settling in over a few
    // samples: as hardware session 1's item, put on by hand. Several jumps each, too close
    // together for a plateau between them, and 3.5 s from the first to the last: a rise as long
    // as a shot's, but nothing poured.
    const session = simulateSession({
      seed: 1,
      durationMs: 20_000,
      script: [{ type: 'cup-on', atMs: 2000, massG: 110 }],
    });
    const raw = toRawRecording(session);
    const settledIn = (ms: number, atMs: number) =>
      ms < atMs ? 0 : 15 * (1 - Math.exp(-(ms - atMs) / 150));
    const frames = raw.frames.map((frame, i) => {
      const decoded = decodeFrame(frame.bytes);
      if (decoded.kind !== 'weight') return frame;
      const ms = session.frames[i].truth.sampleTMs;
      const weightG =
        decoded.weightG + settledIn(ms, 7000) + settledIn(ms, 8600) + settledIn(ms, 10_200);
      return { ...frame, bytes: encodeWeightFrame({ ...decoded, weightG: round01(weightG) }) };
    });
    const segmentation = segment(buildTimeline(frames), raw.events);
    const others = segmentation.steps.filter((step) => step.kind === 'other');
    expect(others.map((step) => step.jumps > 1)).toEqual([true, true, true]);
    expect(segmentation.shotWindows).toEqual([]);
  });

  it('leaves a manual start that meets an auto-tared, empty cup alone', () => {
    for (const seed of SEEDS) {
      // The auto-tare at 5 s, the press 0.5 s after pump_on, during the pre-infusion.
      const sim = simulate(plus(espressoScenario({ seed }), command07(7500)));
      expect(kinds(sim.segmentation)).toEqual(['cup-placed', 'tare/command', 'cup-removed']);
      expect(zeroTrackingError(sim)).toBeLessThan(0.05);
    }
  });

  it('takes off a manual start pressed after the first drops landed', () => {
    for (const seed of SEEDS) {
      // 3 s after the first drip, about 3.5 g in the cup, during the pump's vibration.
      const sim = simulate(plus(espressoScenario({ seed }), command07(16_000)));
      expect(kinds(sim.segmentation)).toEqual([
        'cup-placed',
        'tare/command',
        'tare/command',
        'cup-removed',
      ]);
      // The pump's vibration (σ 0.1 g) limits the step's estimate to about 0.09 g rms.
      expect(zeroTrackingError(sim)).toBeLessThan(0.4);
      expect(sim.segmentation.shotWindows[0].riseG).toBeCloseTo(38, 0);
    }
  });

  it('makes no window, and no step, of a flush or a knock', () => {
    const flush = simulate({
      seed: 5,
      durationMs: 40_000,
      script: [
        { type: 'cup-on', atMs: 2000, massG: 110 },
        command07(5000),
        { type: 'pump', atMs: 8000, durationMs: 5000 },
        { type: 'bump', atMs: 20_000, durationMs: 200, peakG: 15 },
        { type: 'cup-off', atMs: 30_000 },
      ],
    });
    expect(kinds(flush.segmentation)).toEqual(['cup-placed', 'tare/command', 'cup-removed']);
    expect(flush.segmentation.shotWindows).toEqual([]);

    const knocked = simulate(
      plus(espressoScenario({ seed: 6 }), {
        type: 'bump',
        atMs: 25_000,
        durationMs: 300,
        peakG: -20,
      }),
    );
    expect(kinds(knocked.segmentation)).toEqual(['cup-placed', 'tare/command', 'cup-removed']);
    expect(knocked.segmentation.shotWindows[0].riseG).toBeCloseTo(38, 1);
  });

  it('finds a shot into a cup that was on before the recording started', () => {
    const sim = simulate(espressoScenario({ seed: 7 }), (frame) => frame.tMs > 3500);
    expect(kinds(sim.segmentation)).toEqual(['tare/command', 'cup-removed']);
    expect(sim.segmentation.shotWindows).toHaveLength(1);
    expect(sim.segmentation.shotWindows[0].cupPlaced).toBeNull();
    expect(sim.segmentation.shotWindows[0].riseG).toBeCloseTo(38, 1);
  });

  it('ends the window with the recording when it stops mid-shot', () => {
    const sim = simulate(espressoScenario({ seed: 8 }), (frame) => frame.tMs < 25_000);
    const [window] = sim.segmentation.shotWindows;
    expect(sim.segmentation.shotWindows).toHaveLength(1);
    expect(window.end).toBe('recording-end');
    expect(window.cupRemoved).toBeNull();
    expect(window.endIndex).toBe(sim.segmentation.series.values.length);
  });

  it('refuses frames whose unit byte is unknown, and counts them', () => {
    const sim = simulate(espressoScenario({ seed: 10, scale: { unitByte: 0x02 } }));
    const { segmentation } = sim;
    expect(segmentation.refusedFrames).toBe(sim.session.frames.length);
    expect(segmentation.samples.t).toEqual([]);
    expect(segmentation.series.values).toEqual([]);
    expect(segmentation.steps).toEqual([]);
    expect(segmentation.stretches).toEqual([]);
    expect(segmentation.shotWindows).toEqual([]);
  });

  it('copes with a recording without frames', () => {
    const empty = buildTimeline([]);
    const events: AppEvent[] = [];
    const segmentation = segment(empty, events);
    expect(segmentation.series).toEqual({ start: 0, step: 0.1, values: [] });
    expect(segmentation.shotWindows).toEqual([]);
  });

  it('segments the demo: smoothing on, and a tare-button press in a tail', () => {
    const sim = simulate(demoScenario(2));
    expect(kinds(sim.segmentation)).toEqual([
      'cup-placed',
      'cup-removed',
      'cup-placed',
      'tare/jump',
      'cup-removed',
    ]);
    expect(sim.segmentation.shotWindows).toHaveLength(2);
    // The smoothing, left on, smears each first lump into the baseline (D-059).
    sim.segmentation.shotWindows.forEach((window, k) => {
      expect(Math.abs(window.riseG - sim.session.truth.shots[k].yieldG)).toBeLessThan(0.15);
    });
  });
});
