/**
 * One-sided CUSUM (Page 1954) with a retrospective change point (spec "Markers"). Detection
 * latency and timestamp accuracy are separate: the sum needs a run of evidence to cross the
 * threshold, and once it has, the change is placed where that run began, not where it was
 * noticed.
 *
 * For an upward change, S₀ = 0 and Sᵢ = max(0, Sᵢ₋₁ + xᵢ − reference − slack). The alarm is the
 * first sample where S exceeds the threshold. The change point is the first sample after the
 * last one where S was 0 before the alarm: equivalently, the first sample after the argmin of
 * the unclamped cumulative sum Σ (x − reference − slack), the latest one if several tie.
 */

import { checkRange } from './checks';

export interface CusumOptions {
  /** The level before the change: the mean the sum measures from. */
  readonly reference: number;
  /**
   * The slack k, subtracted from each sample's excess over the reference: a shift smaller than
   * this doesn't build up. Typically half the shift to detect.
   */
  readonly slack: number;
  /** The threshold h: the sum that raises the alarm. */
  readonly threshold: number;
  /** `up` watches for a rise above the reference, `down` for a fall below it. Default `up`. */
  readonly direction?: 'up' | 'down';
  /** The first index to scan. Default 0. */
  readonly from?: number;
  /** The index after the last to scan. Default the length. */
  readonly to?: number;
}

export interface CusumAlarm {
  /** The first index at which the sum exceeded the threshold. */
  readonly alarmIndex: number;
  /** Where the change began: the first index of the run that raised the alarm. */
  readonly changeIndex: number;
}

/**
 * Scans `values[from … to − 1]` for a sustained shift away from `reference`.
 *
 * @returns the first alarm and its change point, as indexes into `values`; null without an
 *   alarm.
 * @throws RangeError unless `slack` is at least 0, `threshold` is above 0, `reference` is
 *   finite, and `from … to − 1` is a range of indexes into the values (it may be empty).
 */
export function cusum(values: ArrayLike<number>, options: CusumOptions): CusumAlarm | null {
  const { reference, slack, threshold, direction = 'up' } = options;
  const from = options.from ?? 0;
  const to = options.to ?? values.length;
  if (!Number.isFinite(reference)) {
    throw new RangeError(`cusum: reference ${reference} is not finite`);
  }
  if (!(slack >= 0) || !Number.isFinite(slack)) {
    throw new RangeError(`cusum: slack ${slack} is not a finite number of at least 0`);
  }
  if (!(threshold > 0) || !Number.isFinite(threshold)) {
    throw new RangeError(`cusum: threshold ${threshold} is not a positive finite number`);
  }
  checkRange('cusum', values.length, from, to, true);
  const sign = direction === 'up' ? 1 : -1;
  let sum = 0;
  let lastZero = from - 1; // the sum is 0 before the first sample
  for (let i = from; i < to; i++) {
    sum = Math.max(0, sum + sign * (values[i] - reference) - slack);
    if (sum === 0) lastZero = i;
    else if (sum > threshold) return { alarmIndex: i, changeIndex: lastZero + 1 };
  }
  return null;
}
