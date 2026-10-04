/**
 * Fitting device runs' timer onto the arrival clock (T1.9, D-032): `arrival ≈ offset + rate ×
 * timer`. Each frame arrives at its sample time plus the link's least latency plus a delay that
 * is never negative: waiting for the next BLE connection event, the phone's own jitter, and now
 * and then a stall that delivers a burst late.
 *
 * - **The rate** is the least-squares slope of arrival against timer, refitted without the
 *   frames that arrived far later than the rest (stalls), and shared by every run of a
 *   recording: one scale clock drifts at one rate, while each restart of the timer gives a new
 *   offset. Least squares averages the connection events out: a sample period that isn't a
 *   multiple of the connection interval cycles the frames through spread-out waits. Fitting the
 *   fastest frames instead (the lower envelope) rides the slow sawtooth those waits make as the
 *   scale's clock drifts past the phone's, and was up to three times worse on simulated runs.
 * - **The offset** puts each run's line under every frame of it, touching the fastest: D-006's
 *   least `arrival − timer`, with the rate taken out.
 */

/** A point: for the timebase, x is the scale's timer field and y the arrival time, both ms. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * A frame further above its run's line than this many robust standard deviations (1.4826 × the
 * median absolute deviation) is taken for a stall, and left out of the next fit.
 */
const TRIM_SIGMAS = 3;

/** Refits at most this many times; the frames left out usually settle after one or two. */
const MAX_REFITS = 4;

/**
 * The least-squares slope of y on x that every group of points shares, each group with its own
 * intercept, refitted without points far above their group's line.
 *
 * @throws RangeError if no group has two points with different x.
 */
export function robustSlope(groups: readonly (readonly Point[])[]): number {
  let slope = pooledSlope(groups);
  let keptCount = groups.reduce((total, group) => total + group.length, 0);
  for (let refit = 0; refit < MAX_REFITS; refit++) {
    // Each group's offsets, centred on their median, so a stall doesn't move the centre.
    const residuals = groups.map((group) => {
      const offsets = group.map((p) => p.y - slope * p.x);
      const centre = offsets.length > 0 ? median(offsets) : 0;
      return offsets.map((offset) => offset - centre);
    });
    const spread = 1.4826 * median(residuals.flat().map(Math.abs));
    const kept = groups.map((group, g) =>
      group.filter((_, i) => residuals[g][i] <= TRIM_SIGMAS * spread),
    );
    const count = kept.reduce((total, group) => total + group.length, 0);
    if (count === keptCount) break;
    try {
      slope = pooledSlope(kept);
    } catch {
      break; // too little left to fit: keep the last slope
    }
    keptCount = count;
  }
  return slope;
}

/** The intercept of the line with `slope` that passes under every point and touches one. */
export function leastIntercept(points: readonly Point[], slope: number): number {
  let least = Number.POSITIVE_INFINITY;
  for (const p of points) least = Math.min(least, p.y - slope * p.x);
  return least;
}

/**
 * The least-squares slope shared by the groups, each centred on its own means: so large timer
 * and arrival values keep their precision, and each group keeps its own intercept.
 *
 * @throws RangeError if no group has any spread in x.
 */
function pooledSlope(groups: readonly (readonly Point[])[]): number {
  let sxx = 0;
  let sxy = 0;
  for (const group of groups) {
    if (group.length < 2) continue;
    let sumX = 0;
    let sumY = 0;
    for (const p of group) {
      sumX += p.x;
      sumY += p.y;
    }
    const meanX = sumX / group.length;
    const meanY = sumY / group.length;
    for (const p of group) {
      sxx += (p.x - meanX) ** 2;
      sxy += (p.x - meanX) * (p.y - meanY);
    }
  }
  if (!(sxx > 0)) throw new RangeError('robustSlope: no group has two points with different x');
  return sxy / sxx;
}

/** The median; for an even count, the mean of the middle two. */
export function median(values: readonly number[]): number {
  return quantile(
    [...values].sort((a, b) => a - b),
    0.5,
  );
}

/** The q-quantile of sorted values, interpolating linearly between neighbours. */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) throw new RangeError('quantile: no values');
  const position = (sorted.length - 1) * q;
  const below = Math.floor(position);
  const above = Math.min(below + 1, sorted.length - 1);
  return sorted[below] + (sorted[above] - sorted[below]) * (position - below);
}
