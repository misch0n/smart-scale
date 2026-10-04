/**
 * Rolling statistics in O(n): the mean, variance and range of every run of `window`
 * consecutive values, for stability tests and the variance detector on a uniform grid.
 *
 * Every function returns one value for each position where the whole window fits, n − window + 1
 * of them, and none when the series is shorter than the window. The k-th covers values
 * k … k + window − 1, so its centre is at k + (window − 1) / 2. A partial window at either end
 * would look quieter than it is (one sample has no range), so there are none.
 */

import { checkInteger } from './checks';
import { mean } from './stats';

/**
 * The mean of each window.
 *
 * @throws RangeError unless `window` is a positive integer.
 */
export function rollingMean(values: ArrayLike<number>, window: number): number[] {
  checkInteger('rollingMean', 'window', window, 1);
  const out: number[] = [];
  let current = 0;
  for (let k = 0; k + window <= values.length; k++) {
    // Summed afresh every `window` steps, so rounding from the updates can't build up.
    if (k % window === 0) current = mean(values, k, k + window);
    else current += (values[k + window - 1] - values[k - 1]) / window;
    out.push(current);
  }
  return out;
}

/**
 * The sample variance of each window (dividing by window − 1), never below 0. A window of equal
 * values gives 0, or within rounding of it when it follows unequal ones.
 *
 * @throws RangeError unless `window` is an integer of at least 2.
 */
export function rollingVariance(values: ArrayLike<number>, window: number): number[] {
  checkInteger('rollingVariance', 'window', window, 2);
  const out: number[] = [];
  let centre = 0;
  let squares = 0; // Σ (value − centre)² over the window
  for (let k = 0; k + window <= values.length; k++) {
    if (k % window === 0) {
      // Two passes afresh every `window` steps, so rounding from the updates can't build up.
      centre = mean(values, k, k + window);
      squares = 0;
      for (let i = k; i < k + window; i++) squares += (values[i] - centre) ** 2;
    } else {
      // Welford's update for one value replacing another: no sums of large squares to cancel.
      const leaving = values[k - 1];
      const entering = values[k + window - 1];
      const next = centre + (entering - leaving) / window;
      squares += (entering - leaving) * (entering - next + leaving - centre);
      centre = next;
    }
    out.push(Math.max(0, squares) / (window - 1));
  }
  return out;
}

/**
 * The largest value less the smallest in each window, by monotonic queues. Exact: a window of
 * equal values gives 0.
 *
 * @throws RangeError unless `window` is a positive integer.
 */
export function rollingRange(values: ArrayLike<number>, window: number): number[] {
  checkInteger('rollingRange', 'window', window, 1);
  const out: number[] = [];
  const n = values.length;
  if (n < window) return out;
  // Indexes whose values decrease (maxima) or increase (minima) from head to tail: the head is
  // the window's extreme, and a newcomer evicts every value it beats from the tail.
  const maxima = new Int32Array(n);
  const minima = new Int32Array(n);
  let maxHead = 0;
  let maxTail = 0;
  let minHead = 0;
  let minTail = 0;
  for (let i = 0; i < n; i++) {
    const value = values[i];
    while (maxTail > maxHead && values[maxima[maxTail - 1]] <= value) maxTail--;
    maxima[maxTail++] = i;
    while (minTail > minHead && values[minima[minTail - 1]] >= value) minTail--;
    minima[minTail++] = i;
    const first = i - window + 1;
    if (first < 0) continue;
    while (maxima[maxHead] < first) maxHead++;
    while (minima[minHead] < first) minHead++;
    out.push(values[maxima[maxHead]] - values[minima[minHead]]);
  }
  return out;
}
