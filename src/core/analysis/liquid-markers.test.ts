/**
 * The liquid markers against the simulator's ground truth (T1.12 acceptance, D-035). pump_off
 * comes from the truth until T1.13 finds it. Timeline times are the sample's time plus the
 * link's least latency, a constant per recording, so each comparison adds the recording's
 * `offset`, read off the frames' truth.
 */

import { describe, expect, it } from 'vitest';
import type { RawFrame } from '../model';
import { decodeFrame, encodeWeightFrame, tareAndStartTimer } from '../protocol';
import { median, quantile } from '../signal';
import {
  espressoScenario,
  simulateSession,
  toRawRecording,
  type EspressoScenarioOptions,
  type Scenario,
  type ScriptEvent,
  type ShotTruth,
  type SimulatedSession,
} from '../sim';
import { buildTimeline } from '../timebase';
import { liquidMarkers, type LiquidMarkers } from './liquid-markers';
import { segment, type Segmentation } from './segment';
import { AGREED_LIQUID, AGREED_SCALE, AGREED_SHOT } from './test-runs';

interface Run {
  readonly session: SimulatedSession;
  readonly segmentation: Segmentation;
  /** Timeline time less the true sample time, s: the link's latency. */
  readonly offset: number;
  /** One per shot window, in order, with pump_off from the truth. */
  readonly markers: LiquidMarkers[];
  /** A true time on the session, ms, on the timeline, s. */
  readonly at: (ms: number) => number;
}

interface RunOptions {
  /** pump_off is the truth moved by this, s; null gives none. Default 0. */
  readonly pumpOffShiftS?: number | null;
  /** Changes the raw frames before the analysis sees them. */
  readonly frames?: (frames: RawFrame[], session: SimulatedSession) => RawFrame[];
}

function run(scenario: Scenario, options: RunOptions = {}): Run {
  const session = simulateSession(scenario);
  const raw = toRawRecording(session);
  const frames = options.frames ? options.frames([...raw.frames], session) : [...raw.frames];
  const timeline = buildTimeline(frames);
  // toRawRecording keeps the frames in arrival order, as session.frames has them.
  const truth = new Map(raw.frames.map((frame, i) => [frame.seq, session.frames[i].truth]));
  const offset = median(
    timeline.samples.map((sample) => sample.t - truth.get(sample.seq)!.sampleTMs / 1000),
  );
  const at = (ms: number) => ms / 1000 + offset;
  const segmentation = segment(timeline, raw.events);
  const shift = options.pumpOffShiftS === undefined ? 0 : options.pumpOffShiftS;
  const markers = segmentation.shotWindows.map((window, k) =>
    liquidMarkers(
      segmentation,
      window,
      { pumpOffT: shift === null ? null : at(session.truth.shots[k].pumpOffMs) + shift },
      AGREED_LIQUID,
    ),
  );
  return { session, segmentation, offset, markers, at };
}

/**
 * The usual shot, on the 0.01 g scale with the pump's vibration and the slow drain D-035 was
 * agreed on: one window, its truth and markers.
 */
function espresso(options: EspressoScenarioOptions, runOptions: RunOptions = {}) {
  const scale = { ...AGREED_SCALE, ...options.scale };
  const params = { ...AGREED_SHOT, ...options.shot };
  const result = run(espressoScenario({ ...options, scale, shot: params }), runOptions);
  expect(result.markers).toHaveLength(1);
  const [shot] = result.session.truth.shots;
  return { ...result, shot, m: result.markers[0] };
}

const seeds = (count: number) => Array.from({ length: count }, (_, i) => i + 1);

/** The p-quantile of the absolute values. */
function absQuantile(values: readonly number[], p: number): number {
  return quantile(
    values.map(Math.abs).sort((a, b) => a - b),
    p,
  );
}

/** first_drip less the truth, s. */
const firstDripError = (r: { m: LiquidMarkers; shot: ShotTruth; at: (ms: number) => number }) =>
  r.m.firstDrip!.t - r.at(r.shot.firstDripMs);

describe('liquidMarkers: first_drip', () => {
  it('times the first drip to about ±0.1 s under the pump’s vibration, the limit there', () => {
    // σ 0.1 g of vibration at 10 Hz: a rise of unknown shape can't be timed closer than about
    // ±0.1 s by any method (D-035). Measured over 100 seeds: median 0.07 s, 92% within 0.2 s.
    const errors = seeds(100).map((seed) => firstDripError(espresso({ seed })));
    expect(Math.abs(median(errors))).toBeLessThan(0.03); // no bias
    expect(absQuantile(errors, 0.5)).toBeLessThan(0.1);
    expect(absQuantile(errors, 0.9)).toBeLessThan(0.25);
    expect(absQuantile(errors, 1)).toBeLessThan(0.7);
  });

  it('times it within 0.1 s without the vibration', () => {
    for (const seed of seeds(40)) {
      const r = espresso({ seed, scale: { vibrationSigmaG: 0 } });
      expect(Math.abs(firstDripError(r))).toBeLessThan(0.1);
      expect(r.m.firstDrip!.onset).toBe('gradual');
    }
  });

  it('reads a flow there at once as abrupt, and a slow ramp as gradual', () => {
    const abrupt = seeds(40).map((seed) =>
      espresso({
        seed,
        shot: {
          flowProfile: [
            [0, 1],
            [1, 1.25],
          ],
        },
      }),
    );
    const read = abrupt.filter((r) => r.m.firstDrip!.onset === 'abrupt').length;
    expect(read).toBeGreaterThanOrEqual(30);
    expect(absQuantile(abrupt.map(firstDripError), 0.5)).toBeLessThan(0.05);

    const slow = seeds(40).map((seed) =>
      espresso({
        seed,
        shot: {
          flowProfile: [
            [0, 0],
            [0.25, 1],
            [1, 1.25],
          ],
        },
      }),
    );
    expect(slow.filter((r) => r.m.firstDrip!.onset === 'abrupt')).toEqual([]);
    expect(absQuantile(slow.map(firstDripError), 0.5)).toBeLessThan(0.15);
  });

  it('runs the CUSUM on the pre-infusion’s noise, dating back from an alarm after the drip', () => {
    for (const seed of seeds(12)) {
      const r = espresso({ seed });
      const drip = r.m.firstDrip!;
      // The vibration's 0.1 g with the scale's own 0.012 g, as this shot drew them.
      const drawn = r.session.frames
        .filter(
          (f) => f.truth.sampleTMs > r.shot.pumpOnMs && f.truth.sampleTMs < r.shot.firstDripMs,
        )
        .map((f) => f.truth.noiseG);
      const mean = drawn.reduce((a, b) => a + b, 0) / drawn.length;
      const sd = Math.sqrt(drawn.reduce((a, b) => a + (b - mean) ** 2, 0) / (drawn.length - 1));
      expect(Math.abs(drip.sigmaG / sd - 1)).toBeLessThan(0.2);
      expect(drip.alarmT).toBeGreaterThan(r.at(r.shot.firstDripMs));
      expect(drip.changeT).toBeLessThanOrEqual(drip.alarmT);
      expect(drip.fitPoints).toBeGreaterThan(20);
    }
  });
});

describe('liquidMarkers: the tail and the yields', () => {
  it('fits τ within 10% and w_final within 0.3 g when the cup stays', () => {
    for (const seed of seeds(40)) {
      const { m, shot, at } = espresso({ seed });
      const tail = m.tail!;
      expect(Math.abs(tail.tauS / (shot.tailTauMs / 1000) - 1)).toBeLessThan(0.1);
      expect(Math.abs(tail.finalWeightG - shot.yieldG)).toBeLessThan(0.3);
      expect(Math.abs(tail.flowAtPumpOffGps - shot.flowAtPumpOffGps)).toBeLessThan(0.15);
      // The first flow window starts 0.2 s after pump_off, on the grid: its centre 0.4–0.5 s.
      expect(tail.startT - at(shot.pumpOffMs)).toBeGreaterThanOrEqual(0.4 - 1e-9);
      expect(tail.startT - at(shot.pumpOffMs)).toBeLessThan(0.5);
      expect(tail.rSquared).toBeGreaterThan(0.9);
      expect(m.flags).toEqual([]);
    }
  });

  it('measures settled, the yield and w(pump_off), and the honest yield equals the yield', () => {
    for (const seed of seeds(40)) {
      const { m, shot, at } = espresso({ seed });
      // Within 0.02 g simulated: the cup stays 30 s, so w_final is the settled level itself.
      expect(m.settled!.source).toBe('measured');
      expect(Math.abs(m.settled!.weightG - shot.yieldG)).toBeLessThan(0.05);
      // Drops as big as the stability band leave the settling time a drop's wait uncertain.
      expect(m.settled!.t - at(shot.settledMs)).toBeGreaterThan(-0.3);
      expect(m.settled!.t - at(shot.settledMs)).toBeLessThan(1.3);
      expect(m.pumpOff!.t).toBe(at(shot.pumpOffMs));
      expect(Math.abs(m.pumpOff!.weightG - shot.weightAtPumpOffG)).toBeLessThan(0.15);
      expect(m.cupRemoved!.t).toBeCloseTo(at(shot.cupRemovedMs!), 0);
      expect(Math.abs(m.cupRemoved!.weightG - shot.honestYieldG!)).toBeLessThan(0.05);
    }
  });

  it('declines the tail when the cup comes off a second after pump_off', () => {
    for (const seed of seeds(40)) {
      const { m, shot } = espresso({ seed, cupOffAfterPumpOffMs: 1000 });
      expect(m.flags).toEqual(['tail-too-short']);
      expect(m.tail).toBeNull();
      expect(m.settled).toBeNull();
      // What reached the cup, and the liquid at pump_off, still read.
      expect(Math.abs(m.cupRemoved!.weightG - shot.honestYieldG!)).toBeLessThan(0.1);
      expect(Math.abs(m.pumpOff!.weightG - shot.weightAtPumpOffG)).toBeLessThan(0.2);
      expect(m.firstDrip).not.toBeNull();
    }
  });

  it('extrapolates settled and the yield when the cup comes off 2 s after pump_off', () => {
    const yieldErrors: number[] = [];
    for (const seed of seeds(40)) {
      const { m, shot, at } = espresso({ seed, cupOffAfterPumpOffMs: 2000 });
      expect(m.settled!.source).toBe('extrapolated');
      expect(m.settled!.t).toBeGreaterThan(at(shot.cupRemovedMs!));
      expect(Math.abs(m.tail!.tauS / (shot.tailTauMs / 1000) - 1)).toBeLessThan(0.3);
      // A third of the tail is still to come: τ's error carries into it.
      yieldErrors.push(m.settled!.weightG - shot.yieldG);
      expect(Math.abs(m.cupRemoved!.weightG - shot.honestYieldG!)).toBeLessThan(0.1);
    }
    expect(absQuantile(yieldErrors, 0.5)).toBeLessThan(0.15);
    expect(absQuantile(yieldErrors, 1)).toBeLessThan(0.5);
  });

  it('tolerates a pump_off 0.2 s early or late', () => {
    for (const shift of [-0.2, 0.2]) {
      for (const seed of seeds(20)) {
        const { m, shot } = espresso({ seed }, { pumpOffShiftS: shift });
        expect(Math.abs(m.tail!.tauS / (shot.tailTauMs / 1000) - 1)).toBeLessThan(0.15);
        expect(Math.abs(m.settled!.weightG - shot.yieldG)).toBeLessThan(0.05);
      }
    }
  });

  it('without pump_off, measures settled from the plateau the window ends on', () => {
    for (const seed of seeds(12)) {
      const { m, shot } = espresso({ seed }, { pumpOffShiftS: null });
      expect(m.flags).toEqual(['no-pump-off']);
      expect(m.tail).toBeNull();
      expect(m.pumpOff).toBeNull();
      expect(m.settled!.source).toBe('measured');
      expect(Math.abs(m.settled!.weightG - shot.yieldG)).toBeLessThan(0.05);
      expect(m.firstDrip).not.toBeNull();
    }
    // A cup lifted mid-tail ends on no plateau: no settled without the tail fit.
    const early = espresso({ seed: 1, cupOffAfterPumpOffMs: 2000 }, { pumpOffShiftS: null });
    expect(early.m.settled).toBeNull();
  });

  it('says the tail is missing when the recording ends before pump_off', () => {
    const r = run(espressoScenario({ seed: 8, scale: AGREED_SCALE, shot: AGREED_SHOT }), {
      frames: (frames) => frames.filter((frame) => frame.tMs < 25_000),
    });
    const [m] = r.markers;
    expect(r.segmentation.shotWindows[0].end).toBe('recording-end');
    expect(m.flags).toEqual(['pump-off-after-window']);
    expect(m.tail).toBeNull();
    expect(m.settled).toBeNull();
    expect(m.cupRemoved).toBeNull();
    expect(Math.abs(m.firstDrip!.t - r.at(r.session.truth.shots[0].firstDripMs))).toBeLessThan(0.5);
  });
});

/** The frames with `massG` more on the platform from `fromMs` on: a spoon set down. */
const withSpoon =
  (fromMs: number, massG: number) => (frames: RawFrame[], session: SimulatedSession) =>
    frames.map((frame, i) => {
      const decoded = decodeFrame(frame.bytes);
      if (decoded.kind !== 'weight' || session.frames[i].truth.sampleTMs < fromMs) return frame;
      return {
        ...frame,
        bytes: encodeWeightFrame({ ...decoded, weightG: decoded.weightG + massG }),
      };
    });

describe('liquidMarkers: other sessions', () => {
  it('reads two shots into the same cup, each from its own baseline', () => {
    const script: ScriptEvent[] = [
      { type: 'cup-on', atMs: 2000, massG: 110 },
      { type: 'command', atMs: 5000, command: tareAndStartTimer(), reason: 'manual-start' },
      { type: 'shot', atMs: 7000, ...AGREED_SHOT },
      { type: 'shot', atMs: 60_000, yieldG: 30, ...AGREED_SHOT },
      { type: 'cup-off', atMs: 110_000 },
    ];
    for (const seed of seeds(6)) {
      const r = run({ seed, durationMs: 120_000, script, scale: AGREED_SCALE });
      expect(r.markers).toHaveLength(2);
      r.session.truth.shots.forEach((shot, k) => {
        const m = r.markers[k];
        // D-035's worst case for the usual shot.
        expect(Math.abs(m.firstDrip!.t - r.at(shot.firstDripMs))).toBeLessThan(0.7);
        expect(Math.abs(m.tail!.tauS / (shot.tailTauMs / 1000) - 1)).toBeLessThan(0.1);
        expect(m.settled!.source).toBe('measured');
        expect(Math.abs(m.settled!.weightG - shot.yieldG)).toBeLessThan(0.1);
      });
      expect(r.markers[0].cupRemoved).toBeNull();
      expect(Math.abs(r.markers[1].cupRemoved!.weightG - 30)).toBeLessThan(0.1);
    }
  });

  it('takes a spoon set down in the cup out of the liquid', () => {
    // During the extraction its size is measured through the pump's vibration, about ±0.1 g;
    // in the tail, through the scale's own 0.015 g.
    for (const [spoonMs, withinG] of [
      [20_000, 0.3],
      [40_000, 0.05],
    ]) {
      for (const seed of seeds(6)) {
        const clean = espresso({ seed });
        const spoon = espresso({ seed }, { frames: withSpoon(spoonMs, 5) });
        expect(spoon.m.flags).toEqual(['other-steps']);
        expect(spoon.m.firstDrip!.t).toBeCloseTo(clean.m.firstDrip!.t, 9);
        expect(Math.abs(spoon.m.tail!.tauS / clean.m.tail!.tauS - 1)).toBeLessThan(0.02);
        expect(Math.abs(spoon.m.settled!.weightG - clean.m.settled!.weightG)).toBeLessThan(withinG);
        expect(Math.abs(spoon.m.cupRemoved!.weightG - clean.m.cupRemoved!.weightG)).toBeLessThan(
          withinG,
        );
      }
    }
  });

  it('copes with readings quantised to 0.1 g', () => {
    const errors: number[] = [];
    for (const seed of seeds(20)) {
      const r = espresso({ seed, scale: { resolutionG: 0.1 } });
      errors.push(firstDripError(r));
      expect(Math.abs(r.m.tail!.tauS / (r.shot.tailTauMs / 1000) - 1)).toBeLessThan(0.25);
      expect(Math.abs(r.m.settled!.weightG - r.shot.yieldG)).toBeLessThan(0.1);
    }
    expect(absQuantile(errors, 0.5)).toBeLessThan(0.15);
  });

  it('is pure: the same recording gives the same markers', () => {
    const once = espresso({ seed: 3 });
    const again = liquidMarkers(
      once.segmentation,
      once.segmentation.shotWindows[0],
      { pumpOffT: once.at(once.shot.pumpOffMs) },
      AGREED_LIQUID,
    );
    expect(again).toEqual(once.m);
    expect(JSON.parse(JSON.stringify(once.m))).toEqual(once.m);
  });
});
