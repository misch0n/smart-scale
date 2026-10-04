/**
 * Stable stretches (T1.11): where the zero-tracked weight holds still, by the spec's test ("Tare
 * arming"): no range of samples above the tolerance across a 0.5 s window. They give the shot
 * windows their baselines and noise floors.
 *
 * The test runs on the uniform grid, but only where samples back it: across a gap in the samples
 * (a stall, then a burst) the grid is a straight line between two samples, which would pass for
 * stable whatever the weight did meanwhile, the pump's vibration included. The level and noise of
 * a stretch come from the samples themselves, too: interpolating onto a grid whose phase differs
 * from the samples' averages neighbours, which would shrink σ by up to √2.
 *
 * σ is the samples' standard deviation. Every window of a stretch keeps within the tolerance, so
 * there are no outliers to resist, and the MAD would read quantised data badly: with noise about
 * one step, it jumps between 0, one step and two.
 */

import { mean, rollingRange, type UniformSeries } from '../signal';
import type { WeightSamples } from './samples';
import { WEIGHT_EPSILON_G } from './steps';

/**
 * A run of consecutive stable windows, so that every window within it passes the test. Two
 * stretches share grid samples when a window between them fails though both neighbours pass (a
 * slow drift), and a stretch ends at an instant step even when one starts right after it.
 */
export interface StableStretch {
  /** The grid samples `startIndex` … `endIndex − 1`. */
  readonly startIndex: number;
  readonly endIndex: number;
  /** The times of its first and last grid sample, s. */
  readonly startT: number;
  readonly endT: number;
  /** The mean of the zero-tracked samples from `startT` to `endT`, g. */
  readonly levelG: number;
  /** Their standard deviation, never below the floor, g. */
  readonly sigmaG: number;
  /** How many samples (not grid samples) the level and σ come from. */
  readonly sampleCount: number;
}

/** The level and noise of some samples. */
export interface NoiseStats {
  readonly levelG: number;
  readonly sigmaG: number;
  readonly sampleCount: number;
}

/**
 * A grid sample is backed by data when the samples either side of it are at most this many grid
 * steps apart. Arrivals land on the BLE connection-event grid, so gaps of 1.2 steps are normal.
 */
export const MAX_BACKED_GAP_STEPS = 1.5;

/**
 * Times this close are the same, s: grid times are multiplied out (0.1 × 3 is
 * 0.30000000000000004), and a grid time must still meet the sample it was meant to.
 */
const TIME_EPSILON_S = 1e-9;

export interface StabilityOptions {
  /** Grid samples per stability window. */
  readonly window: number;
  /** The largest range a stable window may show, g. */
  readonly toleranceG: number;
  /**
   * The least σ to report, g: quantised readings at rest can all be equal, which isn't σ = 0
   * but noise below one step (q / √12).
   */
  readonly sigmaFloorG: number;
}

/**
 * The stable stretches of `series`, the zero-tracked weight on its grid, in order. `samples`
 * are the zero-tracked samples it was resampled from.
 */
export function stableStretches(
  series: UniformSeries,
  samples: WeightSamples,
  options: StabilityOptions,
): StableStretch[] {
  const { window, toleranceG, sigmaFloorG } = options;
  const values = series.values;
  const ranges = rollingRange(values, window);
  // Unbacked grid samples so far, so that a window's count is a difference.
  const unbacked = new Int32Array(values.length + 1);
  backedGridSamples(series, samples.t).forEach((backed, k) => {
    unbacked[k + 1] = unbacked[k] + (backed ? 0 : 1);
  });
  const stable = ranges.map(
    (range, k) => range <= toleranceG + WEIGHT_EPSILON_G && unbacked[k + window] === unbacked[k],
  );

  const stretches: StableStretch[] = [];
  for (let first = 0; first < stable.length; first++) {
    if (!stable[first]) continue;
    let last = first;
    while (last + 1 < stable.length && stable[last + 1]) last++;
    const endIndex = last + window;
    const startT = series.start + first * series.step;
    const endT = series.start + (endIndex - 1) * series.step;
    stretches.push({
      startIndex: first,
      endIndex,
      startT,
      endT,
      ...noiseBetween(samples, startT, endT, sigmaFloorG, values.slice(first, endIndex)),
    });
    first = last;
  }
  return stretches;
}

/**
 * Whether each grid sample is backed by data: the samples either side of it in time are at most
 * `MAX_BACKED_GAP_STEPS` grid steps apart. A grid sample at a sample's time is backed.
 */
export function backedGridSamples(series: UniformSeries, times: readonly number[]): boolean[] {
  const maxGap = MAX_BACKED_GAP_STEPS * series.step;
  const backed: boolean[] = [];
  let next = 0; // the first sample at or after the grid time
  for (let k = 0; k < series.values.length; k++) {
    const t = series.start + k * series.step;
    while (next < times.length && times[next] < t - TIME_EPSILON_S) next++;
    if (next < times.length && times[next] <= t + TIME_EPSILON_S) backed.push(true);
    else backed.push(next > 0 && next < times.length && times[next] - times[next - 1] <= maxGap);
  }
  return backed;
}

/**
 * The level (mean) and standard deviation of the samples timed from `fromT` to `toT`, σ floored
 * at `sigmaFloorG`. With fewer than 3 such samples (a stall), from `fallback` instead.
 */
export function noiseBetween(
  samples: WeightSamples,
  fromT: number,
  toT: number,
  sigmaFloorG: number,
  fallback: readonly number[],
): NoiseStats {
  const from = firstAtOrAfter(samples.t, fromT - TIME_EPSILON_S);
  const to = firstAtOrAfter(samples.t, toT + TIME_EPSILON_S, true);
  const values = to - from >= 3 ? samples.weightG.slice(from, to) : fallback;
  const levelG = mean(values);
  const squares = values.reduce((total, value) => total + (value - levelG) ** 2, 0);
  return {
    levelG,
    sigmaG: Math.max(sigmaFloorG, values.length > 1 ? Math.sqrt(squares / (values.length - 1)) : 0),
    sampleCount: values.length,
  };
}

/**
 * The first index whose time is at least `t` (or, with `after`, beyond it), by bisection: the
 * times never decrease.
 */
function firstAtOrAfter(times: readonly number[], t: number, after = false): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (after ? times[mid] <= t : times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
