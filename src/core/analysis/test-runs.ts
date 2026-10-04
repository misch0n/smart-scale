/**
 * Simulated runs for the analysis's ground-truth tests (test support only): a scenario through the
 * simulator, the recorder's raw form, the timeline and the segmentation, with true times mapped
 * onto the timeline.
 */

import type { RawFrame } from '../model';
import { median, quantile } from '../signal';
import { simulateSession, toRawRecording, type Scenario, type SimulatedSession } from '../sim';
import { buildTimeline } from '../timebase';
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
