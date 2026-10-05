/**
 * The liquid markers of a shot window (T1.12, D-035; spec "Markers", "Tail handling", "Flow and
 * yield"). Liquid reads off the weight's mean, as the pump reads off its variance (T1.13).
 *
 * - `firstDrip`: when the first liquid reached the cup (`first-drip.ts`).
 * - `pumpOff`: the liquid at pump_off, w(pump_off), when pump_off is given: a parabola through
 *   the quiet samples of the second after the tail's start, evaluated at pump_off.
 * - `tail`: τ and w_final from the drain after pump_off (`tail.ts`).
 * - `settled`: from when the mean stopped moving, staying within the stability tolerance of the
 *   level it drained to. Its liquid is the yield, w(settled): with a tail fit, w_final.
 *   - Measured when the window lasts that long: the time is where the smoothed liquid was last
 *     further below that level. Without a tail fit (no pump_off yet), the level is the plateau
 *     the window ends on, if there is one.
 *   - Extrapolated when the cup came off first: the time is where the fitted tail has less than
 *     the tolerance left to deliver.
 * - `cupRemoved`: the window's lift (T1.11), with the honest yield, w(cup_removed): the level
 *   just before it.
 *
 * Every weight here is liquid, g: the zero-tracked weight less the window's baseline and any
 * other steps inside the window. Times are timeline seconds.
 */

import { savitzkyGolayCoefficients } from '../signal';
import { findFirstDrip, type FirstDrip } from './first-drip';
import { quadraticSG, sgWindowSamples, windowLiquid, type WindowLiquid } from './liquid';
import { resolveLiquidParams, type LiquidParams } from './params';
import type { Segmentation } from './segment';
import { FIRM_STRETCH_S, type ShotWindow } from './shot-windows';
import { WEIGHT_EPSILON_G } from './steps';
import { fitTail, TAIL_ISSUES, type TailFit } from './tail';

/** The liquid at pump_off. */
export interface PumpOffWeight {
  /** pump_off as given, s. */
  readonly t: number;
  /** w(pump_off), g. */
  readonly weightG: number;
}

/** How `settled` was found. */
export const SETTLED_SOURCES = ['measured', 'extrapolated'] as const;
export type SettledSource = (typeof SETTLED_SOURCES)[number];

export interface Settled {
  /** From when the mean stayed within the stability tolerance of its final level, s. */
  readonly t: number;
  /** w(settled), g: the yield, everything the shot delivers had the cup stayed. */
  readonly weightG: number;
  /**
   * `measured`: the window lasted until the liquid settled. `extrapolated`: the cup came off, or
   * the recording ended, first, and the tail fit says when it would have.
   */
  readonly source: SettledSource;
}

export interface CupRemoved {
  /** The last sample before the lift, s. */
  readonly t: number;
  /** w(cup_removed), g: the honest yield, what actually reached the cup. */
  readonly weightG: number;
}

/**
 * Why markers are missing or need care:
 * - `no-pump-off`: pump_off wasn't given, so there's no pump_off weight or tail fit;
 * - a `TailIssue`: why there's no tail fit;
 * - `other-steps`: other steps inside the window (a spoon set down) were taken out of the
 *   liquid; their sizes come from the segmentation's fits;
 * - `pour-disturbed`: the pour itself moved the reading by more than liquid flows, over several
 *   jumps (beans in bursts, the scale or cup moved): those readings were left out, and nothing
 *   was taken off (D-048).
 */
export const LIQUID_FLAGS = [
  'no-pump-off',
  ...TAIL_ISSUES,
  'other-steps',
  'pour-disturbed',
] as const;
export type LiquidFlag = (typeof LIQUID_FLAGS)[number];

export interface LiquidMarkers {
  /** The parameters it ran with, defaults filled in. */
  readonly params: LiquidParams;
  readonly firstDrip: FirstDrip | null;
  readonly pumpOff: PumpOffWeight | null;
  readonly tail: TailFit | null;
  readonly settled: Settled | null;
  readonly cupRemoved: CupRemoved | null;
  readonly flags: readonly LiquidFlag[];
}

export interface LiquidInputs {
  /** pump_off, s on the timeline (T1.13 finds it), or null when it isn't known. */
  readonly pumpOffT: number | null;
}

/** w(pump_off) comes from the samples in this long after the tail's start, s. */
const PUMP_OFF_SPAN_S = 1;

/** The parabola for w(pump_off) needs this many samples. */
const MIN_PUMP_OFF_SAMPLES = 5;

/** `settled` allows this many σ of the smoothed liquid's noise beyond the tolerance. */
const SETTLED_NOISE_SIGMAS = 2;

/**
 * The liquid markers of `window`, one of `segmentation.shotWindows`. Pure: the same input always
 * gives the same output.
 *
 * @throws RangeError on invalid parameters.
 */
export function liquidMarkers(
  segmentation: Segmentation,
  window: ShotWindow,
  inputs: LiquidInputs,
  overrides: Partial<LiquidParams> = {},
): LiquidMarkers {
  const params = resolveLiquidParams(overrides);
  const liquid = windowLiquid(segmentation, window);
  const flags: LiquidFlag[] = [];
  if (liquid.otherSteps.length > 0) flags.push('other-steps');
  if (liquid.pourSteps.length > 0) flags.push('pour-disturbed');
  const firstDrip = findFirstDrip(liquid, window, {
    params,
    sigmaFloorG: segmentation.sigmaFloorG,
  });

  const { pumpOffT } = inputs;
  let pumpOff: PumpOffWeight | null = null;
  let tail: TailFit | null = null;
  if (pumpOffT === null) {
    flags.push('no-pump-off');
  } else {
    pumpOff = pumpOffWeight(liquid, pumpOffT, params);
    const fit = fitTail(liquid, pumpOffT, { params, sigmaG: window.baseline.sigmaG });
    if (typeof fit === 'string') flags.push(fit);
    else tail = fit;
  }

  const lift = window.cupRemoved;
  const cupRemoved: CupRemoved | null = lift && {
    t: lift.startT,
    weightG:
      lift.levelBeforeG -
      window.baseline.levelG -
      liquid.otherSteps
        .filter((step) => step.endT <= lift.startT)
        .reduce((sum, step) => sum + step.sizeG, 0),
  };
  return {
    params,
    firstDrip,
    pumpOff,
    tail,
    settled: findSettled(segmentation, window, liquid, tail, pumpOffT, params),
    cupRemoved,
    flags,
  };
}

/**
 * w(pump_off): the least-squares parabola through the samples from the tail's start to a second
 * later, where the pump's vibration has stopped, evaluated at pump_off. Null with too few.
 */
function pumpOffWeight(
  liquid: WindowLiquid,
  pumpOffT: number,
  params: LiquidParams,
): PumpOffWeight | null {
  const fromT = pumpOffT + params.tailStartS;
  // Centred on pump_off: y = c₀ + c₁u + c₂u² with u = t − pump_off, and w(pump_off) is c₀.
  const s = [0, 0, 0, 0, 0]; // Σ uⁿ
  const r = [0, 0, 0]; // Σ y·uⁿ
  liquid.t.forEach((t, i) => {
    if (t < fromT || t > fromT + PUMP_OFF_SPAN_S) return;
    const u = t - pumpOffT;
    for (let n = 0; n < 5; n++) s[n] += u ** n;
    for (let n = 0; n < 3; n++) r[n] += liquid.g[i] * u ** n;
  });
  if (s[0] < MIN_PUMP_OFF_SAMPLES) return null;
  // Cramer's rule for c₀ in the normal equations.
  const det3 = (a: number[], b: number[], c: number[]) =>
    a[0] * (b[1] * c[2] - b[2] * c[1]) -
    a[1] * (b[0] * c[2] - b[2] * c[0]) +
    a[2] * (b[0] * c[1] - b[1] * c[0]);
  const rows = [
    [s[0], s[1], s[2]],
    [s[1], s[2], s[3]],
    [s[2], s[3], s[4]],
  ];
  const det = det3(rows[0], rows[1], rows[2]);
  if (!(Math.abs(det) > 0)) return null;
  const replaced = rows.map((row, n) => [r[n], row[1], row[2]]);
  return { t: pumpOffT, weightG: det3(replaced[0], replaced[1], replaced[2]) / det };
}

/** `settled`: see the module comment. */
function findSettled(
  segmentation: Segmentation,
  window: ShotWindow,
  liquid: WindowLiquid,
  tail: TailFit | null,
  pumpOffT: number | null,
  params: LiquidParams,
): Settled | null {
  const { start, step, values } = liquid.grid;
  const sgWindow = sgWindowSamples(params.sgWindowS, step);
  const smooth = quadraticSG(values, sgWindow, step);
  // The tolerance, widened by the smoothed liquid's noise so that noise at its edge doesn't
  // count as movement: drops as big as the tolerance put a level right on that edge.
  const centre = savitzkyGolayCoefficients({ window: sgWindow, order: 2 });
  const tolerance =
    segmentation.toleranceG +
    SETTLED_NOISE_SIGMAS *
      window.baseline.sigmaG *
      Math.sqrt(centre.reduce((sum, c) => sum + c * c, 0));
  let last = smooth.length - 1;
  while (last >= 0 && !Number.isFinite(smooth[last])) last--;
  if (last < 0) return null;

  let finalG: number;
  let from = 0; // the scan for the settling time stops here
  if (tail && pumpOffT !== null) {
    finalG = tail.finalWeightG;
    if (!(smooth[last] >= finalG - tolerance)) {
      // When the fitted tail has less than the stability tolerance left to deliver.
      const rest = tail.flowAtPumpOffGps * tail.tauS;
      const band = segmentation.toleranceG;
      const t = rest > band ? pumpOffT + tail.tauS * Math.log(rest / band) : pumpOffT;
      return { t, weightG: finalG, source: 'extrapolated' };
    }
    from = Math.max(0, Math.ceil((pumpOffT - start) / step - 1e-9));
  } else {
    const plateau = finalPlateauG(segmentation, window, liquid);
    if (plateau === null || !(smooth[last] >= plateau - tolerance)) return null;
    finalG = plateau;
  }
  // The last grid sample still further below the final level than the tolerance.
  let k = last;
  while (k >= from && !(smooth[k] < finalG - tolerance)) k--;
  return { t: start + Math.max(k + 1, from) * step, weightG: finalG, source: 'measured' };
}

/**
 * The liquid of the plateau the window ends on, or null without one. As T1.11's anchors: the
 * stable stretches up to the window's end at one level, each within the stability tolerance of
 * the next with no step between them (noise splits a stretch now and then), whose firm stretches
 * (`FIRM_STRETCH_S`) together last `minBaselineS`. The level is the liquid's mean over them all.
 */
function finalPlateauG(
  segmentation: Segmentation,
  window: ShotWindow,
  liquid: WindowLiquid,
): number | null {
  const { steps, toleranceG, stableWindow } = segmentation;
  const stretches = segmentation.stretches.filter(
    (stretch) => stretch.startIndex >= window.startIndex && stretch.endIndex <= window.endIndex,
  );
  const last = stretches.length - 1;
  if (last < 0 || stretches[last].endIndex < window.endIndex - stableWindow) return null;
  let first = last;
  while (first > 0) {
    const before = stretches[first - 1];
    const after = stretches[first];
    if (
      Math.abs(after.levelG - before.levelG) > toleranceG + WEIGHT_EPSILON_G ||
      steps.some((step) => step.startT >= before.endT && step.endT <= after.startT)
    ) {
      break;
    }
    first--;
  }
  const plateau = stretches.slice(first);
  const firmS = plateau
    .map((stretch) => stretch.endT - stretch.startT)
    .filter((lasts) => lasts >= FIRM_STRETCH_S - WEIGHT_EPSILON_G)
    .reduce((total, lasts) => total + lasts, 0);
  if (!(firmS > 0 && firmS >= segmentation.params.minBaselineS - WEIGHT_EPSILON_G)) return null;
  let sum = 0;
  let count = 0;
  const { values } = liquid.grid;
  for (let k = plateau[0].startIndex; k < plateau[plateau.length - 1].endIndex; k++) {
    const value = values[k - window.startIndex];
    if (Number.isFinite(value)) {
      sum += value;
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}
