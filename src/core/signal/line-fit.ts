/**
 * Least-squares straight lines, ordinary or weighted, with residuals and fit quality: the tail
 * fit of ln(flow) against time, a rise extrapolated back to the baseline, and the regime-change
 * fallback for `pump_off` (spec "Tail handling", "Markers").
 */

export interface LineFit {
  readonly slope: number;
  readonly intercept: number;
  /**
   * y − (intercept + slope × x) for every point, in order, those of zero weight included (NaN
   * where such a point isn't finite).
   */
  readonly residuals: number[];
  /** The weighted sum of squared residuals. */
  readonly sse: number;
  /**
   * The share of y's weighted spread about its mean that the line explains, 0 … 1: 1 − sse /
   * Σ w (y − ȳ)². 1 when y doesn't vary.
   */
  readonly rSquared: number;
  /** The points that took part: those of positive weight. */
  readonly count: number;
}

/**
 * The line that minimises Σ wᵢ (yᵢ − intercept − slope × xᵢ)², all weights 1 by default. Weights
 * are relative: a weight of 2 counts like the point twice, and 0 leaves a point out. For points
 * of known noise σᵢ, give 1 / σᵢ²; for ln(flow), whose noise is about σ / flow, that is flow².
 *
 * Sums are taken about the first point of positive weight and then about the means, so large x
 * (seconds into a long recording) costs no precision, and equal values give an exact answer.
 *
 * @throws RangeError when the arrays differ in length, a weight is negative or not finite, a
 *   point of positive weight isn't finite, or fewer than two such points have different x.
 */
export function fitLine(
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  weights?: ArrayLike<number>,
): LineFit {
  const n = x.length;
  if (y.length !== n || (weights !== undefined && weights.length !== n)) {
    throw new RangeError(
      `fitLine: ${n} x, ${y.length} y and ${weights?.length ?? n} weights differ in number`,
    );
  }
  const weight = (i: number) => (weights === undefined ? 1 : weights[i]);
  let first = -1;
  let total = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const w = weight(i);
    if (!(w >= 0) || !Number.isFinite(w)) {
      throw new RangeError(`fitLine: weight ${w} at ${i} is not a finite number of at least 0`);
    }
    if (w === 0) continue;
    if (!Number.isFinite(x[i]) || !Number.isFinite(y[i])) {
      throw new RangeError(`fitLine: point ${i} (${x[i]}, ${y[i]}) is not finite`);
    }
    if (first < 0) first = i;
    total += w;
    count++;
  }
  if (count < 2) throw new RangeError(`fitLine: ${count} points of positive weight`);

  let sumX = 0;
  let sumY = 0;
  for (let i = first; i < n; i++) {
    const w = weight(i);
    if (w === 0) continue;
    sumX += w * (x[i] - x[first]);
    sumY += w * (y[i] - y[first]);
  }
  // Each point's distance from the weighted means, without forming the means themselves.
  const dx = (i: number) => x[i] - x[first] - sumX / total;
  const dy = (i: number) => y[i] - y[first] - sumY / total;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = first; i < n; i++) {
    const w = weight(i);
    if (w === 0) continue;
    sxx += w * dx(i) ** 2;
    sxy += w * dx(i) * dy(i);
    syy += w * dy(i) ** 2;
  }
  if (!(sxx > 0)) throw new RangeError('fitLine: the points of positive weight share one x');

  const slope = sxy / sxx;
  const meanX = x[first] + sumX / total;
  const meanY = y[first] + sumY / total;
  const residuals = Array.from({ length: n }, (_, i) => dy(i) - slope * dx(i));
  let sse = 0;
  for (let i = first; i < n; i++) if (weight(i) > 0) sse += weight(i) * residuals[i] ** 2;
  return {
    slope,
    intercept: meanY - slope * meanX,
    residuals,
    sse,
    rSquared: syy > 0 ? 1 - sse / syy : 1,
    count,
  };
}
