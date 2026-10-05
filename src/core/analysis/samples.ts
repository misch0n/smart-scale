/**
 * The weight samples the analysis works on: the timeline's frames whose weight can be trusted,
 * snapped to the scale's grid, and the scale's quantisation step, read off the data.
 *
 * The Themis Mini weighs in tenths and holds a reading as a float32 in grams; the frame carries
 * it times 100, truncated to whole hundredths (D-048, protocol notes finding 16). Tenths that a
 * float32 holds a hair low come a hundredth short: 35.1 as 35.09, −264.8 as −264.79. Read as
 * they were sent, a reading that holds still at 35.1 seems to move by 0.09 g or 0.11 g, which
 * would fool the quantum and the stability test. Snapped back to the grid, it holds still.
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
 * The grids a scale's readings may lie on, coarsest first, g. A finer one can't be told apart:
 * every hundredth lies within a hundredth of a 0.02 g grid.
 */
export const READING_GRIDS_G = [1, 0.5, 0.2, 0.1, 0.05] as const;

/**
 * A grid fits when no more than this share of the readings lies further than a hundredth from
 * it: a stray reading shouldn't throw the whole recording onto a finer one.
 */
const GRID_OFF_SHARE = 0.001;

/**
 * The coarsest of `READING_GRIDS_G` that the readings lie on, each within a hundredth of a
 * multiple of it (the float's truncation; at most one reading in 1000 off), g. Null when none
 * fits: readings in hundredths, as the frame carries them.
 */
export function readingGrid(weightG: readonly number[]): number | null {
  if (weightG.length === 0) return null;
  const hundredths = weightG.map(toHundredths);
  const allowedOff = Math.floor(GRID_OFF_SHARE * hundredths.length);
  for (const gridG of READING_GRIDS_G) {
    const step = Math.round(gridG * 100);
    let off = 0;
    for (const h of hundredths) {
      if (Math.abs(h - step * Math.round(h / step)) > 1 && ++off > allowedOff) break;
    }
    if (off <= allowedOff) return gridG;
  }
  return null;
}

/**
 * The readings snapped to `gridG` (from `readingGrid`): each within a hundredth of a multiple
 * of it becomes that multiple, the rest stay as they are. Null leaves them all.
 */
export function snapToGrid(weightG: readonly number[], gridG: number | null): number[] {
  if (gridG === null) return [...weightG];
  const step = Math.round(gridG * 100);
  return weightG.map((g) => {
    const h = toHundredths(g);
    const snapped = step * Math.round(h / step);
    // + 0 turns -0 into 0, as the frame's encoder does.
    return Math.abs(h - snapped) <= 1 ? snapped / 100 + 0 : g;
  });
}

/**
 * The scale's quantisation step, g: the smallest change between consecutive weights once they
 * are snapped to their grid, as hardware test A11 reads it. Weights are whole hundredths, so
 * it's compared in those. With no change at all, the frame's resolution.
 */
export function quantisationStep(weightG: readonly number[]): number {
  const snapped = snapToGrid(weightG, readingGrid(weightG));
  let least = Infinity;
  for (let i = 1; i < snapped.length; i++) {
    const change = Math.abs(toHundredths(snapped[i]) - toHundredths(snapped[i - 1]));
    if (change > 0 && change < least) least = change;
  }
  return least === Infinity ? FRAME_RESOLUTION_G : least / 100;
}

/** A weight in whole hundredths, as the frame carries it. */
function toHundredths(g: number): number {
  return Math.round(g * 100);
}
