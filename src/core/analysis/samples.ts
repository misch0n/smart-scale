/**
 * The weight samples the analysis works on: the timeline's frames whose weight can be trusted,
 * and the scale's quantisation step, read off the data.
 */

import { hasTrustedWeight } from '../protocol';
import type { Timeline } from '../timebase';

/** Weight samples in timeline order, as parallel arrays. */
export interface WeightSamples {
  /** Each sample's frame (`RawFrame.seq`). */
  readonly seq: number[];
  /** s since the recording started (`TimelineSample.t`): never decreases, may repeat. */
  readonly t: number[];
  readonly weightG: number[];
}

export interface TrustedWeights {
  /** Frames whose weight can be read as grams (`hasTrustedWeight`). */
  readonly samples: WeightSamples;
  /**
   * Weight frames left out because their unit or sign byte isn't recognised (D-005, D-014).
   * Anything above 0 must be shown, not swallowed: those weights can't be read.
   */
  readonly refusedFrames: number;
}

/** The frame's own resolution: weights travel as hundredths of a gram. */
export const FRAME_RESOLUTION_G = 0.01;

/** The timeline's weight samples, without frames whose weight can't be trusted. */
export function trustedWeights(timeline: Timeline): TrustedWeights {
  const seq: number[] = [];
  const t: number[] = [];
  const weightG: number[] = [];
  let refusedFrames = 0;
  for (const sample of timeline.samples) {
    if (!hasTrustedWeight(sample.frame)) {
      refusedFrames++;
      continue;
    }
    seq.push(sample.seq);
    t.push(sample.t);
    weightG.push(sample.frame.weightG);
  }
  return { samples: { seq, t, weightG }, refusedFrames };
}

/**
 * The scale's quantisation step, g: the smallest change between consecutive weights, as
 * hardware test A11 reads it. Weights are whole hundredths, so it's compared in those. With no
 * change at all, the frame's resolution.
 */
export function quantisationStep(weightG: readonly number[]): number {
  let least = Infinity;
  for (let i = 1; i < weightG.length; i++) {
    const change = Math.abs(Math.round(weightG[i] * 100) - Math.round(weightG[i - 1] * 100));
    if (change > 0 && change < least) least = change;
  }
  return least === Infinity ? FRAME_RESOLUTION_G : least / 100;
}
