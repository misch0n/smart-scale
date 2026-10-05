/**
 * The tail fit (T1.12, D-035; spec "Tail handling"): after pump_off the cup drains about
 * exponentially, so ln(flow) is a straight line in time. Its slope gives τ, and with it the
 * weight the tail drains to, w_final = w(pump_off) + ẇ(pump_off)·τ. Nothing is trimmed at a
 * threshold.
 *
 * - **Flow:** the quadratic Savitzky–Golay derivative of the liquid on the grid, in whole windows
 *   that start `tailStartS` after pump_off (so a pump_off a little early leaves the pump's
 *   vibration out) and end inside the shot window.
 * - **The fit:** weighted least squares of ln(flow) on time. The noise of ln(flow) is about
 *   σ/flow, so the weights are flow². A first pass takes the flow while it stays above
 *   `tailFlowSigmas` σ of its noise and weighs it by itself; three more passes take the points
 *   where the last fit predicts that much, weighed by the prediction. Ending and weighing by the
 *   data favoured the points that noise had raised, which put τ about 3% long.
 * - **w_final:** w(t) + ẇ(t)·τ is the same anywhere on an exponential tail, so it is averaged
 *   over the last `finalSpanS` of the tail rather than taken at pump_off. There the rest of the
 *   tail, and the error τ brings into it, is smallest, and a cup left until the tail settled
 *   gives the settled level itself: within 0.02 g simulated, against 0.2 g at pump_off.
 * - **Refusals**, which name why there's no fit: the shot window ends before a flow window
 *   after pump_off fits in it; the fitted flow spans less than `tailMinSpanS` (the cup came off
 *   right after pump_off); the flow doesn't fall.
 * - **A drain too fast for the flow** (T1.16, D-059): the user's machine drains with τ 0.18–0.27 s,
 *   over before a Savitzky–Golay window of the flow fits in, so the fit always refuses there.
 *   The knee fit that found pump_off has the drain in the weight itself (`knee.ts`), and
 *   `drainTail` makes the tail from it: τ, the flow at pump_off, and w_final = w + flow·τ.
 */

import { fitLine, savitzkyGolayCoefficients } from '../signal';
import { quadraticSG, sgWindowSamples, type WindowLiquid } from './liquid';
import type { LiquidParams } from './params';
import type { Drain } from './pump-markers';

/** Where a tail fit comes from: ln(flow) (the spec's), or the knee at pump_off (`drainTail`). */
export const TAIL_SOURCES = ['flow', 'knee'] as const;
export type TailSource = (typeof TAIL_SOURCES)[number];

export interface TailFit {
  readonly source: TailSource;
  /** The drain's time constant τ, s. */
  readonly tauS: number;
  /** ẇ(pump_off): the fitted flow there, g/s. */
  readonly flowAtPumpOffGps: number;
  /** w_final: the liquid the tail drains to, g, everything the shot delivers. */
  readonly finalWeightG: number;
  /** The ln(flow) fit's quality, its weighted R²; null for the knee's. */
  readonly rSquared: number | null;
  /**
   * Flow points fitted, and the times of the first and last, s. For the knee's: the liquid's
   * samples from the knee to the window's end.
   */
  readonly points: number;
  readonly startT: number;
  readonly endT: number;
}

/** Why there's no tail fit. */
export const TAIL_ISSUES = [
  'pump-off-after-window',
  'tail-too-short',
  'tail-not-draining',
] as const;
export type TailIssue = (typeof TAIL_ISSUES)[number];

export interface TailOptions {
  readonly params: LiquidParams;
  /** The noise of the liquid once the pump has stopped, g: the baseline's quiet σ. */
  readonly sigmaG: number;
}

/** Fitting passes after the first, each ranged and weighted by the one before. */
const REFITS = 3;

/** Fits the tail after `pumpOffT` (s) in a window's liquid, or says why it can't. */
export function fitTail(
  liquid: WindowLiquid,
  pumpOffT: number,
  options: TailOptions,
): TailFit | TailIssue {
  const { params, sigmaG } = options;
  const { start, step, values } = liquid.grid;
  const window = sgWindowSamples(params.sgWindowS, step);
  const half = (window - 1) / 2;
  const timeAt = (k: number) => start + k * step;
  // Whole windows only: the first starting `tailStartS` after pump_off, the last ending at the end.
  const first = Math.max(
    half,
    Math.ceil((pumpOffT + params.tailStartS - start) / step - 1e-9) + half,
  );
  const last = values.length - 1 - half;
  if (first > last) {
    return pumpOffT + params.tailStartS >= timeAt(values.length - 1)
      ? 'pump-off-after-window'
      : 'tail-too-short';
  }
  const flow = quadraticSG(values, window, step, 1);
  const centre = savitzkyGolayCoefficients({ window, order: 2, derivative: 1 });
  const floorGps =
    (params.tailFlowSigmas * sigmaG * Math.sqrt(centre.reduce((sum, c) => sum + c * c, 0))) / step;

  // The first pass: the flow while it stays clearly above its noise, weighed by itself.
  let points: number[] = [];
  for (let k = first; k <= last && flow[k] > floorGps; k++) points.push(k);
  if (points.length < 3) return 'tail-too-short';
  let fit = fitLn(points, flow, timeAt, (k) => flow[k] ** 2);
  const issue = (): TailIssue | null => {
    if (timeAt(points[points.length - 1]) - timeAt(points[0]) < params.tailMinSpanS - 1e-9) {
      return 'tail-too-short';
    }
    return fit.slope < 0 ? null : 'tail-not-draining';
  };
  // A rising flow can't be ranged by its prediction, which would never fall.
  if (!(fit.slope < 0)) return issue() ?? 'tail-not-draining';
  for (let pass = 0; pass < REFITS; pass++) {
    const previous = fit;
    const predicted = (k: number) => Math.exp(previous.intercept + previous.slope * timeAt(k));
    const next: number[] = [];
    for (let k = first; k <= last && predicted(k) > floorGps; k++) {
      if (flow[k] > 0) next.push(k);
    }
    if (next.length < 3) break;
    points = next;
    fit = fitLn(points, flow, timeAt, (k) => predicted(k) ** 2);
  }
  const failure = issue();
  if (failure !== null) return failure;

  const tauS = -1 / fit.slope;
  const flowAt = (t: number) => Math.exp(fit.intercept + fit.slope * t);
  // w_final from the end of the tail, where the least of it remains to extrapolate.
  const fromT = Math.max(
    pumpOffT + params.tailStartS,
    liquid.t[liquid.t.length - 1] - params.finalSpanS,
  );
  let sum = 0;
  let count = 0;
  liquid.t.forEach((t, i) => {
    if (t >= fromT) {
      sum += liquid.g[i] + flowAt(t) * tauS;
      count++;
    }
  });
  if (count === 0) return 'tail-too-short';
  return {
    source: 'flow',
    tauS,
    flowAtPumpOffGps: flowAt(pumpOffT),
    finalWeightG: sum / count,
    rSquared: fit.rSquared,
    points: points.length,
    startT: timeAt(points[0]),
    endT: timeAt(points[points.length - 1]),
  };
}

/** The weighted line through ln(flow) at grid points `points`. */
function fitLn(
  points: readonly number[],
  flow: readonly number[],
  timeAt: (k: number) => number,
  weight: (k: number) => number,
) {
  return fitLine(
    points.map(timeAt),
    points.map((k) => Math.log(flow[k])),
    points.map(weight),
  );
}

/**
 * The tail from the knee's drain at pump_off, in a window's liquid: τ and the flow at the knee,
 * and w_final = w(knee) + flow·τ, where the drain tends.
 */
export function drainTail(liquid: WindowLiquid, drain: Drain): TailFit {
  const after = liquid.t.filter((t) => t >= drain.t);
  return {
    source: 'knee',
    tauS: drain.tauS,
    flowAtPumpOffGps: drain.flowGps,
    finalWeightG: drain.weightG + drain.flowGps * drain.tauS,
    rSquared: null,
    points: after.length,
    startT: drain.t,
    endT: after.length > 0 ? after[after.length - 1] : drain.t,
  };
}
