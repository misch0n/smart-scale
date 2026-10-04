/**
 * Segmentation (T1.11, D-034): the analysis's steps from the timeline to the shot windows.
 *
 * timeline → trusted weights → steps and zero-tracking → uniform grid → stable stretches →
 * shot windows, each with its baseline and σ. The markers (T1.12, T1.13) and metrics (T1.14)
 * work inside the windows, on the zero-tracked grid.
 */

import type { AppEvent } from '../model';
import { resampleLinear, type UniformSeries } from '../signal';
import type { Timeline } from '../timebase';
import { resolveSegmentationParams, type SegmentationParams } from './params';
import { quantisationStep, trustedWeights, type WeightSamples } from './samples';
import { shotWindows, type ShotWindow } from './shot-windows';
import { stableStretches, type StableStretch } from './stability';
import { zeroTrack, type Step } from './steps';

export interface Segmentation {
  /** The parameters it ran with, defaults filled in. */
  readonly params: SegmentationParams;
  /**
   * Weight frames left out for an unknown unit or sign byte (D-005, D-014). Above 0, the
   * analysis is missing weights, and the UI must say so.
   */
  readonly refusedFrames: number;
  /** The scale's quantisation step q, read off the data, g. */
  readonly quantisationG: number;
  /** The stability tolerance, max(`stableRangeG`, `stableQuantisationSteps` × q), g. */
  readonly toleranceG: number;
  /** The least σ reported, q / √12, g: quantised readings at rest can show none at all. */
  readonly sigmaFloorG: number;
  /** Grid samples per stability window: `stableSpanS` at the grid's step. */
  readonly stableWindow: number;
  /** The trusted weight samples, zero-tracked. */
  readonly samples: WeightSamples;
  /** The zero-tracked weight on a uniform grid; the step is the nominal sample interval, s. */
  readonly series: UniformSeries;
  /** Tares, vessels placed and lifted, and other steps, in time order. */
  readonly steps: readonly Step[];
  /** Where the weight held still, in order. */
  readonly stretches: readonly StableStretch[];
  readonly shotWindows: readonly ShotWindow[];
}

/** The sample interval when a recording can't tell, s: the 10 Hz the spec expects. */
const FALLBACK_INTERVAL_S = 0.1;

/**
 * Segments a recording: `timeline` is `buildTimeline(raw.frames)`, `events` its app events (the
 * tare commands matter). Pure: the same input always gives the same output.
 *
 * @throws RangeError on invalid parameters.
 */
export function segment(
  timeline: Timeline,
  events: readonly AppEvent[],
  overrides: Partial<SegmentationParams> = {},
): Segmentation {
  const params = resolveSegmentationParams(overrides);
  const { samples, refusedFrames } = trustedWeights(timeline);
  const quantisationG = quantisationStep(samples.weightG);
  const toleranceG = Math.max(params.stableRangeG, params.stableQuantisationSteps * quantisationG);
  const sigmaFloorG = quantisationG / Math.sqrt(12);
  const intervalS = sampleInterval(timeline, samples);
  const stableWindow = Math.max(2, Math.round(params.stableSpanS / intervalS));

  const tracked = zeroTrack(samples, events, params, intervalS);
  const series: UniformSeries =
    tracked.samples.t.length > 0
      ? resampleLinear(tracked.samples.t, tracked.samples.weightG, intervalS)
      : { start: 0, step: intervalS, values: [] };
  const stretches = stableStretches(series, tracked.samples, {
    window: stableWindow,
    toleranceG,
    sigmaFloorG,
  });
  return {
    params,
    refusedFrames,
    quantisationG,
    toleranceG,
    sigmaFloorG,
    stableWindow,
    samples: tracked.samples,
    series,
    steps: tracked.steps,
    stretches,
    shotWindows: shotWindows(series, tracked.samples, stretches, tracked.steps, {
      params,
      toleranceG,
      sigmaFloorG,
      window: stableWindow,
    }),
  };
}

/**
 * The grid's step, s: the timeline's nominal interval, else the samples' mean spacing, else
 * 10 Hz.
 */
function sampleInterval(timeline: Timeline, samples: WeightSamples): number {
  const nominal = timeline.nominalInterval?.ms;
  if (nominal !== undefined && nominal > 0) return nominal / 1000;
  const { t } = samples;
  const span = t.length > 1 ? t[t.length - 1] - t[0] : 0;
  return span > 0 ? span / (t.length - 1) : FALLBACK_INTERVAL_S;
}
