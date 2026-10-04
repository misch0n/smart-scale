/**
 * Descriptive statistics: the mean, and the robust median, quantiles and median absolute
 * deviation (MAD). The robust ones shrug off the odd wild value (a stall, a bump, a dropped
 * cup), which makes them the analysis's choice for centres and noise levels.
 */

import { checkRange } from './checks';

/**
 * Turns a MAD into a standard deviation for normally distributed values: 1 / Φ⁻¹(3/4). On
 * normal noise `MAD_TO_SIGMA × mad(values)` estimates σ, and outliers barely move it.
 */
export const MAD_TO_SIGMA = 1.482602218505602;

/**
 * The mean of `values[from … to − 1]`, all of them by default. It sums the differences from the
 * first value, so values that are all equal give that value exactly.
 *
 * @throws RangeError when the range is empty or not within the values.
 */
export function mean(values: ArrayLike<number>, from = 0, to = values.length): number {
  checkRange('mean', values.length, from, to);
  const shift = values[from];
  let sum = 0;
  for (let i = from; i < to; i++) sum += values[i] - shift;
  return shift + sum / (to - from);
}

/**
 * The median; for an even count, the mean of the middle two.
 *
 * @throws RangeError when there are no values.
 */
export function median(values: ArrayLike<number>): number {
  return quantile(
    Array.from(values).sort((a, b) => a - b),
    0.5,
  );
}

/**
 * The q-quantile of values sorted in ascending order, interpolating linearly between
 * neighbours (Hyndman and Fan's type 7, the default in R and numpy).
 *
 * @throws RangeError when there are no values, or q is not within 0 … 1.
 */
export function quantile(sorted: ArrayLike<number>, q: number): number {
  if (sorted.length === 0) throw new RangeError('quantile: no values');
  if (!(q >= 0 && q <= 1)) throw new RangeError(`quantile: q ${q} is not within 0 … 1`);
  const position = (sorted.length - 1) * q;
  const below = Math.floor(position);
  const above = Math.min(below + 1, sorted.length - 1);
  return sorted[below] + (sorted[above] - sorted[below]) * (position - below);
}

/**
 * The median absolute deviation from the median, unscaled. Multiply by `MAD_TO_SIGMA` for a
 * standard deviation.
 *
 * @throws RangeError when there are no values.
 */
export function mad(values: ArrayLike<number>): number {
  const centre = median(values);
  return median(Array.from(values, (value) => Math.abs(value - centre)));
}
