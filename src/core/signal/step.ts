/**
 * Steps in the mean: the mean of a window after a gap less the mean of a window before it. The
 * gap skips the transition itself (a cup settling, a tare taking effect), so each window sees
 * only a level.
 */

import { checkInteger } from './checks';
import { rollingMean } from './rolling';
import { mean } from './stats';

export interface StepWindows {
  /** Values in each window. */
  readonly window: number;
}

export interface GapBounds extends StepWindows {
  /** The first index of the gap: the window before ends just before it. */
  readonly gapStart: number;
  /** The index after the gap: the window after starts here. */
  readonly gapEnd: number;
}

/**
 * The step across one gap: the mean of `values[gapEnd … gapEnd + window − 1]` less the mean of
 * `values[gapStart − window … gapStart − 1]`.
 *
 * @throws RangeError unless `window` is a positive integer, the gap doesn't end before it
 *   starts, and both windows lie within the values.
 */
export function stepAcrossGap(values: ArrayLike<number>, bounds: GapBounds): number {
  const { window, gapStart, gapEnd } = bounds;
  checkInteger('stepAcrossGap', 'window', window, 1);
  if (
    !Number.isInteger(gapStart) ||
    !Number.isInteger(gapEnd) ||
    gapEnd < gapStart ||
    gapStart - window < 0 ||
    gapEnd + window > values.length
  ) {
    throw new RangeError(
      `stepAcrossGap: windows of ${window} around the gap ${gapStart} … ${gapEnd} don't fit in ${values.length} values`,
    );
  }
  return mean(values, gapEnd, gapEnd + window) - mean(values, gapStart - window, gapStart);
}

export interface RollingStepOptions extends StepWindows {
  /** Values skipped between the windows. Default 0. */
  readonly gap?: number;
}

/**
 * The step across every gap of `gap` values with a whole window on each side, as
 * `stepAcrossGap` gives it: n − 2 × window − gap + 1 values, none when the series is too short.
 * The k-th has its window before at k … k + window − 1 and its gap starting at k + window.
 *
 * @throws RangeError unless `window` is a positive integer and `gap` an integer of at least 0.
 */
export function rollingStep(values: ArrayLike<number>, options: RollingStepOptions): number[] {
  const { window, gap = 0 } = options;
  checkInteger('rollingStep', 'window', window, 1);
  checkInteger('rollingStep', 'gap', gap, 0);
  const means = rollingMean(values, window);
  const out: number[] = [];
  for (let k = 0; k + window + gap < means.length; k++) {
    out.push(means[k + window + gap] - means[k]);
  }
  return out;
}
