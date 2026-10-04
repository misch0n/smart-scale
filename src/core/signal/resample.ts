/**
 * Uniform resampling by linear interpolation. The analysis's sample times are uneven: arrival
 * jitter, a timer that runs only part of the time, and bursts of arrival-timed frames that share
 * one time (T1.9, D-032). Savitzky–Golay, rolling statistics and CUSUM want evenly spaced
 * values, so the analysis resamples onto a uniform grid first.
 */

import { checkPositive } from './checks';
import { mean } from './stats';

/** Evenly spaced values: `values[k]` belongs at time `start + k × step`. */
export interface UniformSeries {
  readonly start: number;
  readonly step: number;
  readonly values: number[];
}

export interface ResampleOptions {
  /** The grid's first time. Default: the first input time. */
  readonly start?: number;
  /** The grid's last time is the last one not past this. Default: the last input time. */
  readonly end?: number;
}

/**
 * Grid times may pass `end` by this fraction of a step, so that rounding (0.3 / 0.1 is
 * 2.9999999999999996) doesn't drop the last point.
 */
const END_TOLERANCE = 1e-9;

/**
 * Resamples `values`, taken at `times`, onto the grid `start + k × step` by linear
 * interpolation between the input samples on either side of each grid time.
 *
 * - `times` must not decrease. Samples that share a time count as one sample with their mean:
 *   frames that arrived in one burst, whose own spacing was lost.
 * - Before the first input time and after the last, the grid holds the first or last value.
 * - A grid time equal to an input time takes that input's value exactly.
 *
 * @throws RangeError when `times` and `values` differ in length or are empty, a time isn't
 *   finite or decreases, `step` isn't a positive finite number, or `end` is before `start`.
 */
export function resampleLinear(
  times: ArrayLike<number>,
  values: ArrayLike<number>,
  step: number,
  options: ResampleOptions = {},
): UniformSeries {
  const n = times.length;
  if (values.length !== n) {
    throw new RangeError(`resampleLinear: ${n} times but ${values.length} values`);
  }
  if (n === 0) throw new RangeError('resampleLinear: no samples');
  checkPositive('resampleLinear', 'step', step);
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(times[i])) {
      throw new RangeError(`resampleLinear: time ${times[i]} at ${i} is not finite`);
    }
    if (i > 0 && times[i] < times[i - 1]) {
      throw new RangeError(`resampleLinear: time decreases at ${i}`);
    }
  }

  // One knot per distinct time, with the mean of the values there.
  const knotTimes: number[] = [];
  const knotValues: number[] = [];
  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && times[j] === times[i]) j++;
    knotTimes.push(times[i]);
    knotValues.push(j - i === 1 ? values[i] : mean(values, i, j));
    i = j;
  }

  const last = knotTimes.length - 1;
  const start = options.start ?? knotTimes[0];
  const end = options.end ?? knotTimes[last];
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new RangeError(`resampleLinear: grid ${start} … ${end} is not a finite span`);
  }
  const count = Math.floor((end - start) / step + END_TOLERANCE) + 1;
  const grid = new Array<number>(count);
  let k = 0; // knotTimes[k] ≤ t < knotTimes[k + 1] while t is inside the knots
  for (let g = 0; g < count; g++) {
    const t = start + g * step;
    if (t <= knotTimes[0]) {
      grid[g] = knotValues[0];
    } else if (t >= knotTimes[last]) {
      grid[g] = knotValues[last];
    } else {
      while (knotTimes[k + 1] <= t) k++;
      const fraction = (t - knotTimes[k]) / (knotTimes[k + 1] - knotTimes[k]);
      grid[g] = knotValues[k] + (knotValues[k + 1] - knotValues[k]) * fraction;
    }
  }
  return { start, step, values: grid };
}
