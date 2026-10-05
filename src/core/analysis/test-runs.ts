/**
 * Simulated runs for the analysis's ground-truth tests (test support only): a scenario through the
 * simulator, the recorder's raw form, the timeline and the segmentation, with true times mapped
 * onto the timeline.
 */

import type { RawFrame } from '../model';
import { median, quantile } from '../signal';
import {
  simulateSession,
  toRawRecording,
  type ScaleParams,
  type Scenario,
  type ShotParams,
  type SimulatedSession,
} from '../sim';
import { buildTimeline } from '../timebase';
import type { LiquidParams } from './params';
import { segment, type Segmentation } from './segment';

export interface SimulatedRun {
  readonly session: SimulatedSession;
  readonly segmentation: Segmentation;
  /** Timeline time less the true sample time, s: the link's latency, a constant per recording. */
  readonly offset: number;
  /** A true time on the session, ms, on the timeline, s. */
  readonly at: (ms: number) => number;
}

/**
 * Runs `scenario` and segments it. `frames` may change the raw frames before the analysis sees
 * them (cut a recording short, add a spoon).
 */
export function simulateRun(
  scenario: Scenario,
  frames?: (frames: RawFrame[], session: SimulatedSession) => RawFrame[],
): SimulatedRun {
  const session = simulateSession(scenario);
  const raw = toRawRecording(session);
  const seen = frames ? frames([...raw.frames], session) : [...raw.frames];
  const timeline = buildTimeline(seen);
  // toRawRecording keeps the frames in arrival order, as session.frames has them.
  const truth = new Map(raw.frames.map((frame, i) => [frame.seq, session.frames[i].truth]));
  const offset = median(
    timeline.samples.map((sample) => sample.t - truth.get(sample.seq)!.sampleTMs / 1000),
  );
  return {
    session,
    segmentation: segment(timeline, raw.events),
    offset,
    at: (ms: number) => ms / 1000 + offset,
  };
}

/**
 * The simulator's scale before hardware session 2 showed none (D-048): the pump's vibration with
 * σ 0.1 g, and drops of 0.05 g. The variance detector's tests keep it on purpose: it is for a
 * scale or a machine where the vibration does show.
 */
export const VIBRATING_SCALE: Partial<ScaleParams> = { vibrationSigmaG: 0.1, dropG: 0.05 };

/** The simulator's shot before session 2 (D-048): a drain with τ 1.5 s, and no first lump. */
export const SLOW_DRAIN_SHOT: Partial<ShotParams> = { tailTauMs: 1500, firstDropG: 0 };

/**
 * What the analysis assumed of that world (D-035): drops of 0.05 g, and the rise fitted up to
 * 1.5 g. Where a test simulates it, the analysis is told so.
 */
export const VIBRATING_LIQUID: Partial<LiquidParams> = { dropG: 0.05, riseFitG: 1.5 };

/**
 * The scale the T1.12 and T1.13 targets were agreed on with the user (D-035, D-036): readings in
 * 0.01 g steps, where the real scale gives 0.1 g (D-037), the pump's vibration and 0.05 g
 * drops. Their tests keep it, with `AGREED_SHOT` and `AGREED_LIQUID`, until T1.16 re-agrees the
 * targets on the real scale; so does T1.11's usual shot (D-046). D-037 has what the targets
 * come to at 0.1 g.
 */
export const AGREED_SCALE: Partial<ScaleParams> = { resolutionG: 0.01, ...VIBRATING_SCALE };

/** The shot those targets were agreed on: the slow drain (`SLOW_DRAIN_SHOT`). */
export const AGREED_SHOT: Partial<ShotParams> = SLOW_DRAIN_SHOT;

/** The analysis's assumptions they were agreed with (`VIBRATING_LIQUID`). */
export const AGREED_LIQUID: Partial<LiquidParams> = VIBRATING_LIQUID;

/** Seeds 1 … count. */
export const seeds = (count: number) => Array.from({ length: count }, (_, i) => i + 1);

/**
 * A pump_on time for `seed`: 7 s (the espresso scenario's) plus a phase that varies with the
 * seed, so the pump doesn't start at the same point between two samples in every shot.
 */
export const phasedPumpOnMs = (seed: number) => 7000 + ((seed * 37) % 100);

/** The p-quantile of the values' magnitudes. */
export function absQuantile(values: readonly number[], p: number): number {
  return quantile(
    values.map(Math.abs).sort((a, b) => a - b),
    p,
  );
}
