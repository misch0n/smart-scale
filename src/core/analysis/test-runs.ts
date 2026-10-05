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
  type ShotTruth,
  type SimulatedSession,
} from '../sim';
import { buildTimeline, type Timeline } from '../timebase';
import type { LiquidParams } from './params';
import type { SegmentAnalysis } from './recording-analysis';
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
  const offset = timelineOffset(session, raw.frames, timeline);
  return {
    session,
    segmentation: segment(timeline, raw.events),
    offset,
    at: (ms: number) => ms / 1000 + offset,
  };
}

/**
 * Timeline time less the true sample time, s: the link's latency, a constant per recording.
 * `frames` are the session's raw frames, in arrival order as `toRawRecording` keeps them and
 * `session.frames` has them; `timeline` may be built from fewer.
 */
export function timelineOffset(
  session: SimulatedSession,
  frames: readonly RawFrame[],
  timeline: Timeline,
): number {
  const truth = new Map(frames.map((frame, i) => [frame.seq, session.frames[i].truth]));
  return median(
    timeline.samples.map((sample) => sample.t - truth.get(sample.seq)!.sampleTMs / 1000),
  );
}

/**
 * A segment's markers and metrics less its shot's truth: times in s, weights in g, and the
 * average flow and τ as the ratio of found to true, less 1. Null where the analysis has none.
 */
export interface ShotErrors {
  readonly firstDripT: number | null;
  readonly pumpOffT: number | null;
  readonly firstDripS: number | null;
  readonly extractionS: number | null;
  readonly totalS: number | null;
  readonly flowRatio: number | null;
  readonly pumpOffWeightG: number | null;
  readonly yieldG: number | null;
  readonly honestYieldG: number | null;
  readonly tailMassG: number | null;
  readonly tauRatio: number | null;
}

/** `segment`'s errors against `truth`, whose times `offset` (s) moves onto the timeline. */
export function shotErrors(segment: SegmentAnalysis, truth: ShotTruth, offset: number): ShotErrors {
  const { markers, metrics: m } = segment;
  const less = (got: number | null | undefined, want: number | null) =>
    got === null || got === undefined || want === null ? null : got - want;
  return {
    firstDripT: less(markers.firstDrip?.t, truth.firstDripMs / 1000 + offset),
    pumpOffT: less(markers.pumpOff?.t, truth.pumpOffMs / 1000 + offset),
    firstDripS: less(m.firstDripS, truth.preInfusionMs / 1000),
    extractionS: less(m.extractionS, truth.extractionMs / 1000),
    totalS: less(m.totalS, truth.totalMs / 1000),
    flowRatio: less(m.averageFlowGps && m.averageFlowGps / truth.averageFlowGps, 1),
    pumpOffWeightG: less(m.pumpOffWeightG, truth.weightAtPumpOffG),
    yieldG: less(m.yieldG, truth.yieldG),
    honestYieldG: less(m.honestYieldG, truth.honestYieldG),
    tailMassG: less(m.tailMassG, truth.tailMassG),
    tauRatio: less(m.tauS && m.tauS / (truth.tailTauMs / 1000), 1),
  };
}

/** One kind of error over shots, where it isn't null. */
export const errorsOf = (shots: readonly { errors: ShotErrors }[], key: keyof ShotErrors) =>
  shots.map((shot) => shot.errors[key]).filter((error): error is number => error !== null);

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
 * drops. Their tests keep it, with `AGREED_SHOT` and `AGREED_LIQUID`, as regression tests of
 * that world (D-046); so does T1.11's usual shot. T1.16 re-agreed the targets for the real scale
 * (D-060), and `targets.test.ts` holds the analysis to them on the simulator's defaults.
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
