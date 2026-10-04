/**
 * The knee at pump_off (T1.13, D-036; spec "Fallback if vibration does not survive", "Tail
 * handling"): pump-driven flow and gravity drainage obey different laws, so the weight changes
 * its law where the pump stops.
 *
 * - **The model**, with u = t − c for a knee at c:
 *   - before it, the pump-driven weight a + b·u + p·u², flow changing steadily;
 *   - after it, the drain a + b·τ·(1 − e^(−u/τ)): flow b at the knee, decaying with τ, so the
 *     weight and the flow are continuous there and the weight tends to a + b·τ (the spec's
 *     w_final).
 * - **The noise** has one variance before the knee and another after it. With the two equal the
 *   fit reads only the change of law: the regime-change fallback, which works without the pump's
 *   vibration. With the vibration's variance before and the quiet one after, the fit reads the
 *   variance step as well, which pins the knee far more closely (the variance detector's timing).
 * - **The fit**: a, b and p by weighted least squares for each knee and τ tried. τ comes from a
 *   log grid, then golden-section search between the best point's neighbours: a τ a few percent
 *   off moves the knee by tens of milliseconds. The knee comes from the caller's candidates,
 *   continuous in time: the change of law dates it between samples.
 *
 * The caller chooses the samples: a few seconds either side of the knee, so that a quadratic
 * holds before it and the drain dominates after it.
 */

/** τ is searched from this, s: faster than any drain through a puck. */
export const KNEE_TAU_MIN_S = 0.2;

/** …to this, s: slower and the drain can't be told from the pump-driven flow. */
export const KNEE_TAU_MAX_S = 10;

/** The coarse τ grid's points, log-spaced: about 10% apart. */
const TAU_GRID_POINTS = 41;

/** Golden-section iterations in ln τ: the bracket shrinks to 1% of its width, τ to 0.2%. */
const TAU_ITERATIONS = 10;

/** With `tauNear`, τ's grid is searched this many points either side of it. */
const TAU_NEAR_POINTS = 3;

/** Each side of the knee needs at least this many samples. */
const MIN_SIDE_SAMPLES = 3;

/**
 * The knee's interval holds the knees tried whose twice-log-likelihood comes within this of the
 * best's: about 95% for one parameter, when the variances given are the noise's own.
 */
const INTERVAL_DROP = 4;

export interface KneeOptions {
  /** The knee times to try, s, in any order. */
  readonly knees: readonly number[];
  /** The noise variance before the knee, g². Only the ratio to `afterVarG2` shapes the fit. */
  readonly beforeVarG2: number;
  /** The noise variance after the knee, g². */
  readonly afterVarG2: number;
  /** Refine τ between grid points (golden section) for every knee tried. Default true. */
  readonly refineTau?: boolean;
  /**
   * τ is about this, s (from an earlier fit): only `TAU_NEAR_POINTS` grid points either side of
   * it are searched. Default: the whole grid.
   */
  readonly tauNear?: number;
}

export interface KneeSide {
  readonly count: number;
  /** The mean squared residual, g². */
  readonly meanSquareG2: number;
}

export interface KneeFit {
  /** The knee, s: where the law changes. */
  readonly t: number;
  /** The drain's time constant, s. */
  readonly tauS: number;
  /** The fitted weight and flow at the knee, g and g/s. */
  readonly weightG: number;
  readonly flowGps: number;
  /** The pump-driven side's second coefficient p, g/s²: half its rate of change of flow. */
  readonly curvatureGps2: number;
  readonly before: KneeSide;
  readonly after: KneeSide;
  /**
   * The earliest and latest knees tried that fit nearly as well as the best (twice the
   * log-likelihood within `INTERVAL_DROP`): how closely the samples pin the knee, given the
   * variances are the noise's own. Reaching the knees' ends, it may be wider still.
   */
  readonly interval: { readonly from: number; readonly to: number };
  /**
   * The log-likelihood of the samples under the fit, up to a constant:
   * −½ [n_before ln(before variance) + n_after ln(after variance) + weighted squared residuals].
   */
  readonly logLikelihood: number;
}

/**
 * The best knee among `options.knees` for samples `t` (s, ascending) and `y` (g). Pure.
 *
 * @returns null when no knee tried has `MIN_SIDE_SAMPLES` samples either side.
 * @throws RangeError when the arrays differ in length, or a variance isn't a positive finite
 *   number.
 */
export function fitKnee(
  t: readonly number[],
  y: readonly number[],
  options: KneeOptions,
): KneeFit | null {
  const { beforeVarG2, afterVarG2, refineTau = true } = options;
  const grid = gridNear(options.tauNear);
  if (t.length !== y.length) {
    throw new RangeError(`fitKnee: ${t.length} times but ${y.length} weights`);
  }
  for (const [name, value] of [
    ['beforeVarG2', beforeVarG2],
    ['afterVarG2', afterVarG2],
  ] as const) {
    if (!(value > 0) || !Number.isFinite(value)) {
      throw new RangeError(`fitKnee: ${name} ${value} is not a positive finite number`);
    }
  }
  const n = t.length;
  if (n < 2 * MIN_SIDE_SAMPLES) return null;
  // Times and weights about the middle, so that powers and squares keep their precision.
  const t0 = (t[0] + t[n - 1]) / 2;
  let y0 = 0;
  for (const value of y) y0 += value / n;
  const s = t.map((time) => time - t0);
  const z = y.map((value) => value - y0);
  const before = prefixSums(s, z);

  let best: Candidate | null = null;
  const profile: { c: number; total: number }[] = [];
  for (const c of options.knees) {
    const k = firstAtOrAfter(t, c);
    if (k < MIN_SIDE_SAMPLES || n - k < MIN_SIDE_SAMPLES) continue;
    const d = c - t0;
    const sideBefore = before.at(k, d);
    const fit = (tau: number) => solveKnee(s, z, k, d, tau, sideBefore, beforeVarG2, afterVarG2);
    let candidate = bestOnGrid(fit, grid);
    if (refineTau) candidate = refineOnTau(fit, candidate);
    if (candidate.solution === null) continue;
    // Between knees the sides' sizes change, so their variances count: twice the log-likelihood.
    const total = candidate.score - k * Math.log(beforeVarG2) - (n - k) * Math.log(afterVarG2);
    profile.push({ c, total });
    if (best === null || total > best.total) best = { ...candidate, c, k, total };
  }
  if (best === null || best.solution === null) return null;
  const near = profile.filter((point) => best.total - point.total <= INTERVAL_DROP);
  const interval = {
    from: Math.min(...near.map((point) => point.c)),
    to: Math.max(...near.map((point) => point.c)),
  };
  const { solution, tau, c, k } = best;
  const [a, b, p] = solution.beta;
  const ss = squaresBySide(s, z, k, c - t0, tau, solution.beta);
  return {
    t: c,
    tauS: tau,
    weightG: a + y0,
    flowGps: b,
    curvatureGps2: p,
    before: { count: k, meanSquareG2: ss.before / k },
    after: { count: n - k, meanSquareG2: ss.after / (n - k) },
    interval,
    logLikelihood:
      -0.5 *
      (k * Math.log(beforeVarG2) +
        (n - k) * Math.log(afterVarG2) +
        ss.before / beforeVarG2 +
        ss.after / afterVarG2),
  };
}

/** The fitted weight at `t`, g: the pump-driven parabola before the knee, the drain after it. */
export function kneeWeightAt(fit: KneeFit, t: number): number {
  const u = t - fit.t;
  if (u < 0) return fit.weightG + fit.flowGps * u + fit.curvatureGps2 * u * u;
  return fit.weightG - fit.flowGps * fit.tauS * Math.expm1(-u / fit.tauS);
}

interface Solution {
  readonly beta: readonly [number, number, number];
  /** Weighted squared residuals. */
  readonly wrss: number;
}

interface Scored {
  readonly tau: number;
  readonly solution: Solution | null;
  /** −weighted squared residuals: higher is better at one knee. */
  readonly score: number;
}

interface Candidate extends Scored {
  readonly c: number;
  readonly k: number;
  /** Twice the log-likelihood, up to a constant: comparable between knees. */
  readonly total: number;
}

/** The before-side sums for k samples, about the knee at d (in centred time). */
interface BeforeSums {
  /** Σ uᵐ for m = 0…4, Σ z·uᵐ for m = 0…2, Σ z². */
  readonly u: readonly number[];
  readonly zu: readonly number[];
  readonly zz: number;
}

const BINOMIAL = [[1], [1, 1], [1, 2, 1], [1, 3, 3, 1], [1, 4, 6, 4, 1]];

/** Prefix sums of sᵐ (m ≤ 4), z·sᵐ (m ≤ 2) and z², turned into sums about any knee. */
function prefixSums(s: readonly number[], z: readonly number[]) {
  const n = s.length;
  const pow: Float64Array[] = Array.from({ length: 5 }, () => new Float64Array(n + 1));
  const zpow: Float64Array[] = Array.from({ length: 3 }, () => new Float64Array(n + 1));
  const zz = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    let power = 1;
    for (let m = 0; m <= 4; m++) {
      pow[m][i + 1] = pow[m][i] + power;
      if (m <= 2) zpow[m][i + 1] = zpow[m][i] + z[i] * power;
      power *= s[i];
    }
    zz[i + 1] = zz[i] + z[i] * z[i];
  }
  return {
    /** Sums over the first k samples of uᵐ and z·uᵐ with u = s − d, by the binomial theorem. */
    at(k: number, d: number): BeforeSums {
      const about = (sums: Float64Array[], m: number) => {
        let total = 0;
        for (let j = 0; j <= m; j++) total += BINOMIAL[m][j] * sums[j][k] * (-d) ** (m - j);
        return total;
      };
      return {
        u: [0, 1, 2, 3, 4].map((m) => about(pow, m)),
        zu: [0, 1, 2].map((m) => about(zpow, m)),
        zz: zz[k],
      };
    },
  };
}

/** a, b, p for the knee at d with τ, by weighted least squares; null if singular. */
function solveKnee(
  s: readonly number[],
  z: readonly number[],
  k: number,
  d: number,
  tau: number,
  sums: BeforeSums,
  beforeVar: number,
  afterVar: number,
): Solution | null {
  // After the knee the design is (1, h, 0) with h = τ(1 − e^(−u/τ)).
  let count = 0;
  let sh = 0;
  let shh = 0;
  let sz = 0;
  let szh = 0;
  let szz = 0;
  for (let i = k; i < s.length; i++) {
    const h = -tau * Math.expm1(-(s[i] - d) / tau);
    count++;
    sh += h;
    shh += h * h;
    sz += z[i];
    szh += z[i] * h;
    szz += z[i] * z[i];
  }
  const wb = 1 / beforeVar;
  const wa = 1 / afterVar;
  const { u, zu, zz } = sums;
  const m00 = wb * u[0] + wa * count;
  const m01 = wb * u[1] + wa * sh;
  const m02 = wb * u[2];
  const m11 = wb * u[2] + wa * shh;
  const m12 = wb * u[3];
  const m22 = wb * u[4];
  const r0 = wb * zu[0] + wa * sz;
  const r1 = wb * zu[1] + wa * szh;
  const r2 = wb * zu[2];
  const beta = solveSymmetric3(m00, m01, m02, m11, m12, m22, r0, r1, r2);
  if (beta === null) return null;
  const wzz = wb * zz + wa * szz;
  const wrss = Math.max(0, wzz - (beta[0] * r0 + beta[1] * r1 + beta[2] * r2));
  return { beta, wrss };
}

/** The squared residuals on each side, summed directly. */
function squaresBySide(
  s: readonly number[],
  z: readonly number[],
  k: number,
  d: number,
  tau: number,
  [a, b, p]: readonly [number, number, number],
): { before: number; after: number } {
  let before = 0;
  let after = 0;
  for (let i = 0; i < s.length; i++) {
    const u = s[i] - d;
    const fitted = i < k ? a + b * u + p * u * u : a - b * tau * Math.expm1(-u / tau);
    if (i < k) before += (z[i] - fitted) ** 2;
    else after += (z[i] - fitted) ** 2;
  }
  return { before, after };
}

const TAU_GRID: readonly number[] = Array.from(
  { length: TAU_GRID_POINTS },
  (_, j) => KNEE_TAU_MIN_S * (KNEE_TAU_MAX_S / KNEE_TAU_MIN_S) ** (j / (TAU_GRID_POINTS - 1)),
);

function score(tau: number, solution: Solution | null): Scored {
  return { tau, solution, score: solution ? -solution.wrss : -Infinity };
}

/** The grid's points to search: all of them, or those near `tauNear`. */
function gridNear(tauNear: number | undefined): readonly number[] {
  if (tauNear === undefined || !(tauNear > 0)) return TAU_GRID;
  const position = Math.log(tauNear / KNEE_TAU_MIN_S) / Math.log(KNEE_TAU_MAX_S / KNEE_TAU_MIN_S);
  const j = Math.round(position * (TAU_GRID_POINTS - 1));
  const from = Math.min(TAU_GRID_POINTS - 1, Math.max(0, j - TAU_NEAR_POINTS));
  const to = Math.max(from, Math.min(TAU_GRID_POINTS - 1, j + TAU_NEAR_POINTS));
  return TAU_GRID.slice(from, to + 1);
}

function bestOnGrid(fit: (tau: number) => Solution | null, grid: readonly number[]): Scored {
  let best = score(grid[0], fit(grid[0]));
  for (const tau of grid.slice(1)) {
    const next = score(tau, fit(tau));
    if (next.score > best.score) best = next;
  }
  return best;
}

/** Golden-section search in ln τ between the grid neighbours of `start`. */
function refineOnTau(fit: (tau: number) => Solution | null, start: Scored): Scored {
  const j = TAU_GRID.indexOf(start.tau);
  let lo = Math.log(TAU_GRID[Math.max(0, j - 1)]);
  let hi = Math.log(TAU_GRID[Math.min(TAU_GRID.length - 1, j + 1)]);
  const ratio = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - ratio * (hi - lo);
  let x2 = lo + ratio * (hi - lo);
  let f1 = score(Math.exp(x1), fit(Math.exp(x1)));
  let f2 = score(Math.exp(x2), fit(Math.exp(x2)));
  let best = start;
  for (let i = 0; i < TAU_ITERATIONS; i++) {
    if (f1.score >= f2.score) {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - ratio * (hi - lo);
      f1 = score(Math.exp(x1), fit(Math.exp(x1)));
    } else {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + ratio * (hi - lo);
      f2 = score(Math.exp(x2), fit(Math.exp(x2)));
    }
    for (const point of [f1, f2]) if (point.score > best.score) best = point;
  }
  return best;
}

/** The first index whose time is at least `c`, by bisection. */
function firstAtOrAfter(times: readonly number[], c: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < c) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The squared residuals of the least-squares parabola through samples `t`, `y`: the pump-driven
 * law carried on, to weigh a knee against. Infinity with fewer than three samples or a single
 * time.
 *
 * @throws RangeError when the arrays differ in length.
 */
export function fitParabolaSse(t: readonly number[], y: readonly number[]): number {
  if (t.length !== y.length) {
    throw new RangeError(`fitParabolaSse: ${t.length} times but ${y.length} weights`);
  }
  const n = t.length;
  if (n < 3) return Infinity;
  const t0 = (t[0] + t[n - 1]) / 2;
  let y0 = 0;
  for (const value of y) y0 += value / n;
  const su = [0, 0, 0, 0, 0]; // Σ uᵐ
  const sz = [0, 0, 0]; // Σ z·uᵐ
  let zz = 0;
  for (let i = 0; i < n; i++) {
    const u = t[i] - t0;
    const z = y[i] - y0;
    let power = 1;
    for (let m = 0; m <= 4; m++) {
      su[m] += power;
      if (m <= 2) sz[m] += z * power;
      power *= u;
    }
    zz += z * z;
  }
  const beta = solveSymmetric3(su[0], su[1], su[2], su[2], su[3], su[4], sz[0], sz[1], sz[2]);
  if (beta === null) return Infinity;
  return Math.max(0, zz - (beta[0] * sz[0] + beta[1] * sz[1] + beta[2] * sz[2]));
}

/**
 * The solution of the symmetric system [[m00, m01, m02], [m01, m11, m12], [m02, m12, m22]] x =
 * (r0, r1, r2) by Cramer's rule, or null when it's singular.
 */
function solveSymmetric3(
  m00: number,
  m01: number,
  m02: number,
  m11: number,
  m12: number,
  m22: number,
  r0: number,
  r1: number,
  r2: number,
): [number, number, number] | null {
  const c00 = m11 * m22 - m12 * m12;
  const c01 = m02 * m12 - m01 * m22;
  const c02 = m01 * m12 - m02 * m11;
  const det = m00 * c00 + m01 * c01 + m02 * c02;
  if (!(Math.abs(det) > 0) || !Number.isFinite(det)) return null;
  const c11 = m00 * m22 - m02 * m02;
  const c12 = m01 * m02 - m00 * m12;
  const c22 = m00 * m11 - m01 * m01;
  return [
    (c00 * r0 + c01 * r1 + c02 * r2) / det,
    (c01 * r0 + c11 * r1 + c12 * r2) / det,
    (c02 * r0 + c12 * r1 + c22 * r2) / det,
  ];
}
