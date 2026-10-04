/**
 * Savitzky–Golay filtering (spec "Signal processing"): each output is a least-squares
 * polynomial fitted to the samples around it, evaluated there, or a derivative of it. A fit of
 * order 2 or more keeps a peak's height and a rise's slope, which a moving average flattens,
 * and it gives the derivative (the flow) directly.
 *
 * The weights come from the general least-squares problem, solved by Householder QR on
 * abscissae centred on the evaluation point and scaled to about ±1, rather than from tables or
 * the normal equations: any window, order, derivative and evaluation point works, and high
 * orders stay accurate.
 *
 * Edges: the first and last `(window − 1) / 2` outputs take the polynomial fitted to the first
 * or last `window` samples, evaluated at their own position (scipy's `mode='interp'`). Padding
 * or mirroring the series would bend the derivative there; this keeps every output an exact
 * fit, so polynomials up to `order` come out exact everywhere.
 */

import { checkInteger, checkPositive } from './checks';

export interface SavitzkyGolayFit {
  /** Samples in each fit: odd, and more than `order`. */
  readonly window: number;
  /** The polynomial's degree. */
  readonly order: number;
  /** 0 smooths; 1 and 2 give the first and second derivative. Default 0. At most `order`. */
  readonly derivative?: number;
}

export interface SavitzkyGolayOptions extends SavitzkyGolayFit {
  /** The spacing of the samples, so a derivative comes out per unit of time. Default 1. */
  readonly step?: number;
}

export interface SavitzkyGolayCoefficientOptions extends SavitzkyGolayFit {
  /**
   * Where to evaluate the fit, as a position in the window: 0 is its first sample, `window − 1`
   * its last, and fractions lie between. Default the centre.
   */
  readonly position?: number;
}

/**
 * The weights that estimate the fitted polynomial, or its derivative, at one position in a
 * window of samples: the estimate is `Σ weights[j] × y[j]`, with `y[0]` the window's first
 * sample. That is the reverse of the order a convolution kernel takes, which matters for odd
 * derivatives. A derivative is per sample; divide it by stepᵈ.
 *
 * @throws RangeError unless the window is an odd integer above `order`, `order` and
 *   `derivative` are integers with 0 ≤ derivative ≤ order, and `position` is within the window.
 */
export function savitzkyGolayCoefficients(options: SavitzkyGolayCoefficientOptions): number[] {
  const { window, order, derivative = 0 } = options;
  checkFit('savitzkyGolayCoefficients', window, order, derivative);
  const position = options.position ?? (window - 1) / 2;
  if (!(position >= 0 && position <= window - 1)) {
    throw new RangeError(
      `savitzkyGolayCoefficients: position ${position} is not within 0 … ${window - 1}`,
    );
  }
  return coefficients(window, order, derivative, position);
}

/**
 * Smooths `values`, or differentiates them, with a Savitzky–Golay filter: one output per value.
 * Edges take the fit over the first or last `window` values (see the module comment); a series
 * shorter than the window takes one fit over all of it, which needs more than `order` values.
 *
 * @throws RangeError for options `savitzkyGolayCoefficients` refuses, a `step` that isn't a
 *   positive finite number, or a non-empty series of `order` values or fewer.
 */
export function savitzkyGolay(values: ArrayLike<number>, options: SavitzkyGolayOptions): number[] {
  const { window, order, derivative = 0, step = 1 } = options;
  checkFit('savitzkyGolay', window, order, derivative);
  checkPositive('savitzkyGolay', 'step', step);
  const n = values.length;
  if (n === 0) return [];
  const scale = step ** derivative;
  if (n < window) {
    if (n <= order) {
      throw new RangeError(`savitzkyGolay: ${n} values are too few to fit order ${order}`);
    }
    return Array.from(
      { length: n },
      (_, i) => dot(coefficients(n, order, derivative, i), values, 0) / scale,
    );
  }
  const half = (window - 1) / 2;
  const out = new Array<number>(n);
  const centre = coefficients(window, order, derivative, half);
  for (let i = half; i < n - half; i++) out[i] = dot(centre, values, i - half) / scale;
  for (let i = 0; i < half; i++) {
    out[i] = dot(coefficients(window, order, derivative, i), values, 0) / scale;
    const fromEnd = window - 1 - i;
    out[n - 1 - i] =
      dot(coefficients(window, order, derivative, fromEnd), values, n - window) / scale;
  }
  return out;
}

function checkFit(caller: string, window: number, order: number, derivative: number): void {
  checkInteger(caller, 'order', order, 0);
  checkInteger(caller, 'window', window, order + 1);
  if (window % 2 === 0) throw new RangeError(`${caller}: window ${window} is not odd`);
  checkInteger(caller, 'derivative', derivative, 0);
  if (derivative > order) {
    throw new RangeError(`${caller}: derivative ${derivative} is above order ${order}`);
  }
}

/** Σ weights[j] × values[from + j]. */
function dot(weights: readonly number[], values: ArrayLike<number>, from: number): number {
  let sum = 0;
  for (let j = 0; j < weights.length; j++) sum += weights[j] * values[from + j];
  return sum;
}

/**
 * The least-squares weights for any `window` above `order` (odd or not) and any `position`.
 *
 * The fit is y ≈ A β, with A's columns the powers 0 … order of u = (j − position) / s, s about
 * half the window, so the estimate is d! β_d / sᵈ: a fixed vector v applied to β = (AᵀA)⁻¹Aᵀy.
 * The weights are therefore A(AᵀA)⁻¹v. With A = QR (Householder) that is Q₁z, where Rᵀz = v.
 */
function coefficients(
  window: number,
  order: number,
  derivative: number,
  position: number,
): number[] {
  const columns = order + 1;
  const scale = Math.max(1, (window - 1) / 2);
  // Column-major: a[c][j] = u_j^c. Householder turns it into R on and above the diagonal.
  const a: number[][] = [];
  for (let c = 0; c < columns; c++) {
    a.push(Array.from({ length: window }, (_, j) => ((j - position) / scale) ** c));
  }
  // reflectors[c] is zero above row c; reflecting by it zeroes column c below the diagonal.
  const reflectors: number[][] = [];
  const reflectorSquares: number[] = []; // vᵀv of each
  for (let c = 0; c < columns; c++) {
    const column = a[c];
    let norm = 0;
    for (let j = c; j < window; j++) norm += column[j] ** 2;
    norm = Math.sqrt(norm);
    const reflector = new Array<number>(window).fill(0);
    for (let j = c; j < window; j++) reflector[j] = column[j];
    // The norm goes on with the entry's own sign, so the two can't cancel.
    reflector[c] += column[c] >= 0 ? norm : -norm;
    let squares = 0;
    for (let j = c; j < window; j++) squares += reflector[j] ** 2;
    for (let k = c; k < columns; k++) reflect(a[k], reflector, squares, c);
    reflectors.push(reflector);
    reflectorSquares.push(squares);
  }
  // Rᵀz = v by forward substitution; R[r][c] is a[c][r], and v is d! / sᵈ at row d.
  const z = new Array<number>(columns).fill(0);
  for (let r = 0; r < columns; r++) {
    let rhs = r === derivative ? factorial(derivative) / scale ** derivative : 0;
    for (let c = 0; c < r; c++) rhs -= a[r][c] * z[c];
    z[r] = rhs / a[r][r];
  }
  // Q₁z = Q (z, 0, …, 0): the reflectors applied last to first.
  const weights = new Array<number>(window).fill(0);
  for (let r = 0; r < columns; r++) weights[r] = z[r];
  for (let c = columns - 1; c >= 0; c--) reflect(weights, reflectors[c], reflectorSquares[c], c);
  return weights;
}

/** x ← (I − 2vvᵀ / vᵀv) x, where v is zero before `from` and `squares` is vᵀv. */
function reflect(x: number[], v: readonly number[], squares: number, from: number): void {
  if (squares === 0) return;
  let projection = 0;
  for (let j = from; j < x.length; j++) projection += v[j] * x[j];
  const factor = (2 * projection) / squares;
  for (let j = from; j < x.length; j++) x[j] -= factor * v[j];
}

function factorial(n: number): number {
  let product = 1;
  for (let k = 2; k <= n; k++) product *= k;
  return product;
}
