/**
 * The pump markers of a shot window (T1.13, D-036; spec "Markers", "Fallback if vibration does
 * not survive"): pump_on and pump_off. The pump reads off the weight's variance, as liquid reads
 * off its mean (T1.12). Two detectors, chosen per window from what the data shows; the result
 * says which ran.
 *
 * - **The samples** are the window's liquid samples, less any in an arrival-timed burst (closer
 *   than half a step to a neighbour): those carry the time they arrived, not the time they were
 *   taken.
 * - **pump_on, by the variance:** before the first drip the liquid holds still, so its noise is
 *   all there is: the scale's own, then the pump's vibration as well. The split into a quiet
 *   level and a louder one, each about its own mean, that is likeliest is the onset (the
 *   retrospective change point, to the midpoint between two samples: the vibration holds no
 *   finer timing). The search runs from the window's start, or the last step before the
 *   baseline ends (a tare's zero-tracking leaves a small offset), to the drip: a weak vibration
 *   can pass for stable, so the baseline itself may start after the pump does.
 *   - *The vibration shows* when the louder level is at least `vibrationRatio` times the quiet
 *     one and the step's evidence (twice the log-likelihood ratio of two levels against one)
 *     reaches `vibrationEvidence`. Otherwise it gives no pump_on (`no-vibration`).
 *   - *Knocks* move the mean as well (spec: requiring both rejects a bump): a sample further
 *     from the liquid's level than `knockSigmas` σ of the pump's noise, and its neighbours, are
 *     left out, as are the samples next to readings the liquid left out (a knock big enough to
 *     jump is a transient, T1.11). An onset next to such samples is flagged `knock-at-pump-on`.
 *   - *The mean stays stationary*: the second after the onset must keep within
 *     `stationarySigmas` standard errors of the second before it (each side's noise from its
 *     second differences, which a moved mean doesn't touch), or the stability tolerance;
 *     otherwise it gives no pump_on (`mean-moved`).
 * - **pump_on, by the tap** (Q4, D-048), when the variance gives none: the last manual start
 *   (`manual-start.ts`) at most `manualStartS` before the first drip, flagged `manual-pump-on`.
 *   The real scale shows no vibration (A2), so this is its pump_on until the microphone (T3.1).
 *   The tap carries the user's latency, a few tenths of a second either way.
 * - **pump_off, by the regime change** (always tried): pump-driven flow and gravity drainage obey
 *   different laws, and the weight's knee between them is pump_off (`knee.ts`, one noise level).
 *   It counts when it drains (flow at the knee, τ at most `maxDrainTauS`), beats the pump-driven
 *   law carried on (a parabola) by `regimeEvidence`, and is pinned: `minTailS` of samples after
 *   it, and no knee more than `maxKneeSpreadS` away fits nearly as well. Without the vibration
 *   that's within about 0.1 s; with it, the noise before the knee can leave it unpinned.
 * - **pump_off, by the variance** (when the vibration shows): the same knee with the pump's noise
 *   before it and the quiet noise after, so the step down pins it far closer. The step is clear
 *   by pump_on's test, on residuals of what holds either side (`levelSpanS` each: a parabola
 *   through the pump-driven samples, the fitted drain after the knee, which follows a fast drain
 *   where a parabola can't), and when the knee is pinned.
 * - **Choosing:** the variance's pump_off when its step is clear, else the regime change
 *   (`variance-step-unclear` when the vibration showed), else none (`no-pump-off`: the window
 *   ends before the pump stops, or too soon after). Both, more than `disagreementS` apart:
 *   `detectors-disagree`.
 *
 * Simulated (D-036), at the default vibration (σ 0.1 g): pump_on within the information limit,
 * about one shot in ten beyond 0.2 s; pump_off within 0.2 s. Without vibration the regime change
 * alone is within 0.1 s. Every time is timeline seconds; every weight is liquid, g.
 */

import { median, quantile, savitzkyGolayCoefficients } from '../signal';
import type { FirstDrip } from './first-drip';
import { fitKnee, fitParabolaSse, kneeWeightAt, type KneeFit } from './knee';
import { quadraticSG, sgWindowSamples, windowLiquid, type WindowLiquid } from './liquid';
import { resolvePumpParams, type PumpParams } from './params';
import type { Segmentation } from './segment';
import type { ShotWindow } from './shot-windows';

/** Which detector gave pump_off. */
export const PUMP_DETECTORS = ['variance', 'regime-change'] as const;
export type PumpDetector = (typeof PUMP_DETECTORS)[number];

/** A step in the noise: its levels either side and how sure it is. */
export interface NoiseStep {
  /** Where the noise changes, s. */
  readonly t: number;
  /**
   * How far from it another change still fits nearly as well (twice the log-likelihood within
   * 4), s: about a 95% interval's half-width.
   */
  readonly spreadS: number;
  /** The noise variance on the quiet side and on the pump's side, g². */
  readonly quietVarG2: number;
  readonly pumpVarG2: number;
  /** Twice the log-likelihood ratio of the two levels against one. */
  readonly evidence: number;
  /** Whether the step is clear: `vibrationRatio` and `vibrationEvidence` reached. */
  readonly clear: boolean;
}

/** A knee found at pump_off: how much tail it has and how closely the samples pin it. */
export interface KneeQuality {
  /** Samples after the knee, s. */
  readonly tailS: number;
  /**
   * How far from the knee another knee still fits nearly as well (twice the log-likelihood
   * within 4), s: about a 95% interval's half-width.
   */
  readonly spreadS: number;
}

/**
 * The drain a knee fit found after pump_off (`knee.ts`): w(t) = weight + flow·τ·(1 − e^(−u/τ))
 * with u = t − the knee.
 */
export interface Drain {
  /** The knee, s. */
  readonly t: number;
  /** The drain's time constant, s, and the flow at the knee, g/s. */
  readonly tauS: number;
  readonly flowGps: number;
  /** The fitted liquid at the knee, g: the drain runs from it towards it plus flow × τ. */
  readonly weightG: number;
}

/**
 * The step down at pump_off, by the variance: the knee with the noise stepping down at it. Clear
 * also needs the knee pinned (`minTailS`, `maxKneeSpreadS`).
 */
export interface VarianceStep extends NoiseStep, KneeQuality, Drain {}

/** The regime change at pump_off: the knee of the weight's law. */
export interface RegimeChange extends KneeQuality, Drain {
  /** Twice the log-likelihood ratio of the knee against the pump-driven law carried on. */
  readonly evidence: number;
  /** Whether it counts as pump_off: it drains, is pinned, and has the tail and the evidence. */
  readonly accepted: boolean;
}

export interface PumpEvent {
  /** s on the timeline. */
  readonly t: number;
}

/** What gave pump_on: the variance's onset, or the manual start (the tap, Q4). */
export const PUMP_ON_SOURCES = ['variance', 'manual'] as const;
export type PumpOnSource = (typeof PUMP_ON_SOURCES)[number];

export interface PumpOn extends PumpEvent {
  readonly source: PumpOnSource;
}

export interface PumpOff extends PumpEvent {
  readonly detector: PumpDetector;
}

/**
 * - `no-first-drip`: without a first drip there's no window to look in, so no markers;
 * - `no-vibration`: the pump's vibration doesn't show, so pump_on is the manual start if there
 *   is one (else null) and pump_off comes from the regime change;
 * - `knock-at-pump-on`: pump_on sits next to samples left out as a knock, so it's less sure;
 * - `mean-moved`: the variance stepped up but the mean moved too, so it gives no pump_on;
 * - `manual-pump-on`: pump_on is the manual start, the tap made with the pump (Q4): its human
 *   latency is in the first-drip time and the total;
 * - `variance-step-unclear`: the vibration showed but its step down at pump_off didn't, so
 *   pump_off comes from the regime change;
 * - `no-pump-off`: neither detector found pump_off;
 * - `detectors-disagree`: the two pump_off estimates are more than `disagreementS` apart.
 */
export const PUMP_FLAGS = [
  'no-first-drip',
  'no-vibration',
  'knock-at-pump-on',
  'mean-moved',
  'manual-pump-on',
  'variance-step-unclear',
  'no-pump-off',
  'detectors-disagree',
] as const;
export type PumpFlag = (typeof PUMP_FLAGS)[number];

export interface PumpMarkers {
  /** The parameters it ran with, defaults filled in. */
  readonly params: PumpParams;
  readonly pumpOn: PumpOn | null;
  readonly pumpOff: PumpOff | null;
  /**
   * The step up before the first drip: whether the vibration shows. Null when there was too
   * little to test, or the later noise wasn't the louder.
   */
  readonly vibration: NoiseStep | null;
  /** The step down at pump_off, when the vibration showed and a knee was found. */
  readonly varianceStep: VarianceStep | null;
  /** The regime change, when a knee was found: pump_off without the vibration, else a check. */
  readonly regimeChange: RegimeChange | null;
  /** The drain after pump_off, from the knee of the detector that gave it; null without one. */
  readonly drain: Drain | null;
  readonly flags: readonly PumpFlag[];
}

export interface PumpInputs {
  /** first_drip (`findFirstDrip`, T1.12), or null when there isn't one. */
  readonly firstDrip: FirstDrip | null;
}

/** Times this close are the same, s: knees and spreads are multiplied out from steps. */
const TIME_EPSILON_S = 1e-9;

/** The knees tried first lie this far apart, s. */
const COARSE_KNEE_STEP_S = 0.05;

/** The knees tried then lie within this of the first pass's, s (wider than a knee's spread)… */
const FINE_KNEE_HALF_S = 0.3;

/** …this far apart, s. */
const FINE_KNEE_STEP_S = 0.005;

/** The coarse regime change reads the flow from Savitzky–Golay windows this long, s. */
const COARSE_FLOW_WINDOW_S = 0.5;

/**
 * The coarse regime change starts this long after the flow first reaches 80% of its high (the
 * 90th percentile): its two lines can't follow the ramp up from the first drip.
 */
const RAMP_SETTLE_S = 0.5;

/**
 * …and at most this long before the flow is last at 80% of its high: pump_off is where the flow
 * falls from there. A shot whose flow gushes at the first drip, dips and climbs again (the user's
 * of 2026-10-06) has a stronger bend in ln(flow) early on than at its end (D-087).
 */
const LAST_HIGH_LEAD_S = 5;

/** The pre-drip noise that sizes the knock test comes from this long before the drip, s. */
const PRE_DRIP_S = 1;

/** The mean-stationarity test compares this long either side of pump_on, s. */
const STATIONARY_SPAN_S = 1;

/** pump_on's interval holds the splits within this of the best's twice-log-likelihood. */
const SPLIT_INTERVAL_DROP = 4;

/**
 * The pump markers of `window`, one of `segmentation.shotWindows`. Pure: the same input always
 * gives the same output.
 *
 * @throws RangeError on invalid parameters.
 */
export function pumpMarkers(
  segmentation: Segmentation,
  window: ShotWindow,
  inputs: PumpInputs,
  overrides: Partial<PumpParams> = {},
): PumpMarkers {
  const params = resolvePumpParams(overrides);
  const { firstDrip } = inputs;
  const none = {
    params,
    pumpOn: null,
    pumpOff: null,
    varianceStep: null,
    regimeChange: null,
    drain: null,
  };
  if (firstDrip === null) return { ...none, vibration: null, flags: ['no-first-drip'] };

  const liquid = windowLiquid(segmentation, window);
  const step = segmentation.series.step;
  const samples = steadySamples(liquid, step);
  const context: Context = {
    params,
    step,
    floorVarG2: segmentation.sigmaFloorG ** 2,
    toleranceG: segmentation.toleranceG,
    minCount: Math.max(3, Math.round(params.minLevelS / step)),
  };
  const flags: PumpFlag[] = [];

  // pump_on is looked for from the window's start, or the last step before the baseline ends
  // (a tare's zero-tracking leaves a small offset, which would count as noise), to the drip.
  const lastStep = segmentation.steps
    .filter((change) => change.endT <= window.baseline.endT)
    .reduce((latest, change) => Math.max(latest, change.endT), -Infinity);
  const onset = findPumpOn(samples, Math.max(window.startT, lastStep), firstDrip.t, context);
  flags.push(...onset.flags);
  const vibration = onset.vibration;
  let pumpOn: PumpOn | null = onset.pumpOn && { t: onset.pumpOn.t, source: 'variance' };
  if (pumpOn === null) {
    const tapT = lastManualStart(segmentation.manualStartsT, firstDrip.t, params.manualStartS);
    if (tapT !== null) {
      pumpOn = { t: tapT, source: 'manual' };
      flags.push('manual-pump-on');
    }
  }
  const quietVarG2 = Math.max(vibration?.quietVarG2 ?? 0, window.baseline.sigmaG ** 2);

  const regimeChange = findRegimeChange(samples, liquid, firstDrip.t, quietVarG2, context);
  const varianceStep = vibration?.clear
    ? findVarianceStep(samples, firstDrip.t, quietVarG2, regimeChange?.t ?? null, context)
    : null;

  let pumpOff: PumpOff | null = null;
  let drain: Drain | null = null;
  if (varianceStep?.clear) {
    pumpOff = { t: varianceStep.t, detector: 'variance' };
    drain = drainOf(varianceStep);
  } else if (regimeChange?.accepted) {
    pumpOff = { t: regimeChange.t, detector: 'regime-change' };
    drain = drainOf(regimeChange);
    if (vibration?.clear) flags.push('variance-step-unclear');
  } else {
    if (vibration?.clear) flags.push('variance-step-unclear');
    flags.push('no-pump-off');
  }
  if (
    varianceStep?.clear &&
    regimeChange?.accepted &&
    Math.abs(varianceStep.t - regimeChange.t) > params.disagreementS
  ) {
    flags.push('detectors-disagree');
  }
  return {
    params,
    pumpOn,
    pumpOff,
    vibration,
    varianceStep,
    regimeChange,
    drain,
    flags,
  };
}

/** A knee's drain, alone. */
function drainOf({ t, tauS, flowGps, weightG }: Drain): Drain {
  return { t, tauS, flowGps, weightG };
}

interface Context {
  readonly params: PumpParams;
  /** The grid's step: the nominal sample interval, s. */
  readonly step: number;
  /** The least variance to report, g²: the quantisation's (q/√12)². */
  readonly floorVarG2: number;
  /** The stability tolerance, g. */
  readonly toleranceG: number;
  /** Samples either side of a variance step, at least. */
  readonly minCount: number;
}

/** Samples as parallel arrays, in time order. */
interface Samples {
  readonly t: readonly number[];
  readonly g: readonly number[];
}

/** The liquid's samples less those in a burst: closer than half a step to a neighbour. */
function steadySamples(liquid: WindowLiquid, step: number): Samples {
  const t: number[] = [];
  const g: number[] = [];
  const near = (i: number, j: number) =>
    j >= 0 && j < liquid.t.length && Math.abs(liquid.t[j] - liquid.t[i]) < step / 2;
  liquid.t.forEach((time, i) => {
    if (near(i, i - 1) || near(i, i + 1)) return;
    t.push(time);
    g.push(liquid.g[i]);
  });
  return { t, g };
}

// ── pump_on ──────────────────────────────────────────────────────────────────────────────────

/** The last of `startsT` (in order) at most `withinS` before `dripT`, or null. */
function lastManualStart(
  startsT: readonly number[],
  dripT: number,
  withinS: number,
): number | null {
  for (let i = startsT.length - 1; i >= 0; i--) {
    if (startsT[i] > dripT) continue;
    return dripT - startsT[i] <= withinS + TIME_EPSILON_S ? startsT[i] : null;
  }
  return null;
}

function findPumpOn(
  samples: Samples,
  fromT: number,
  dripT: number,
  context: Context,
): { vibration: NoiseStep | null; pumpOn: PumpEvent | null; flags: PumpFlag[] } {
  const { params, floorVarG2, toleranceG, minCount } = context;
  const { t, g } = samples;
  const from = firstAtOrAfter(t, fromT);
  const to = firstAtOrAfter(t, dripT);
  if (to - from < 2 * minCount) return { vibration: null, pumpOn: null, flags: ['no-vibration'] };

  // Knocks: far from the still liquid's level by the pump's noise, which the pre-drip second
  // shows when there's vibration (and the quiet noise when there isn't, a tighter test).
  const level = median(g.slice(from, to));
  const preDrip = diffVariance(samples, Math.max(fromT, dripT - PRE_DRIP_S), dripT, context);
  const bound = Math.max(
    toleranceG,
    params.knockSigmas * Math.sqrt(Math.max(preDrip ?? floorVarG2, floorVarG2)),
  );
  const far = (i: number) => i >= from && i < to && Math.abs(g[i] - level) > bound;
  // Readings left out before sample i: a gap of more than a step and a half.
  const gapBefore = (i: number) => i > 0 && t[i] - t[i - 1] > 1.5 * context.step;
  const kept: number[] = [];
  for (let i = from; i < to; i++) {
    if (!far(i - 1) && !far(i) && !far(i + 1) && !gapBefore(i) && !gapBefore(i + 1)) kept.push(i);
  }

  const split = varianceSplit(
    kept.map((i) => g[i]),
    minCount,
    floorVarG2,
  );
  if (split === null) return { vibration: null, pumpOn: null, flags: ['no-vibration'] };
  const before = kept[split.k - 1];
  const after = kept[split.k];
  const onT = (t[before] + t[after]) / 2;
  const splitT = (k: number) => (t[kept[k - 1]] + t[kept[k]]) / 2;
  const spreadS = Math.max(onT - splitT(split.first), splitT(split.last) - onT);
  const vibration: NoiseStep = {
    t: onT,
    spreadS,
    quietVarG2: split.lowVarG2,
    pumpVarG2: split.highVarG2,
    evidence: split.evidence,
    clear: isClear(split.lowVarG2, split.highVarG2, split.evidence, params),
  };
  if (!vibration.clear) return { vibration, pumpOn: null, flags: ['no-vibration'] };

  const flags: PumpFlag[] = [];
  if (after - before > 1) flags.push('knock-at-pump-on');
  // The mean must stay stationary across the onset. Each side's noise comes from its second
  // differences, which a moved mean doesn't touch (it would hide in the split's levels, which
  // are about one level), over the whole side rather than the second compared.
  const side = (lo: number, hi: number) =>
    kept.filter((i) => t[i] >= lo && t[i] < hi).map((i) => g[i]);
  const quiet = side(onT - STATIONARY_SPAN_S, onT);
  const loud = side(onT, onT + STATIONARY_SPAN_S);
  if (quiet.length > 0 && loud.length > 0) {
    const noise = (lo: number, hi: number, fallback: number) =>
      Math.max(floorVarG2, diffVariance(samples, lo, hi, context) ?? fallback);
    const moved = Math.abs(average(loud) - average(quiet));
    const allowed = Math.max(
      toleranceG,
      params.stationarySigmas *
        Math.sqrt(
          noise(onT, dripT, vibration.pumpVarG2) / loud.length +
            noise(fromT, onT, vibration.quietVarG2) / quiet.length,
        ),
    );
    if (moved > allowed) return { vibration, pumpOn: null, flags: [...flags, 'mean-moved'] };
  }
  return { vibration, pumpOn: { t: onT }, flags };
}

/**
 * The likeliest split of values into a quieter run and a louder one after it, each at least
 * `minCount` long and each about its own mean (a moved mean is the stationarity test's to find,
 * not noise): the first index of the louder run, both variances (at least `floor`), twice the
 * log-likelihood ratio against one variance, and the splits nearly as likely. Null with too few
 * values, or when the later run isn't the louder.
 */
function varianceSplit(x: readonly number[], minCount: number, floor: number) {
  const n = x.length;
  if (n < 2 * minCount) return null;
  // Sums about the first value, so that a level far from 0 costs no precision.
  const shift = x[0];
  const sums = [0];
  const squares = [0];
  for (const value of x) {
    sums.push(sums[sums.length - 1] + (value - shift));
    squares.push(squares[squares.length - 1] + (value - shift) ** 2);
  }
  /** The variance of values `from` … `to − 1` about their mean, at least `floor`. */
  const variance = (from: number, to: number) => {
    const count = to - from;
    const sum = sums[to] - sums[from];
    return Math.max(floor, (squares[to] - squares[from] - (sum * sum) / count) / count);
  };
  // Twice the log-likelihood of each split, up to a constant.
  const scores: number[] = [];
  let best = -1;
  for (let k = minCount; k <= n - minCount; k++) {
    const score = -(k * Math.log(variance(0, k)) + (n - k) * Math.log(variance(k, n)));
    scores[k] = score;
    if (best < 0 || score > scores[best]) best = k;
  }
  const lowVarG2 = variance(0, best);
  const highVarG2 = variance(best, n);
  if (!(highVarG2 > lowVarG2)) return null;
  const evidence = scores[best] + n * Math.log(variance(0, n));
  // The splits that fit nearly as well: the profile likelihood's interval, about 95%.
  let first = best;
  let last = best;
  for (let k = minCount; k <= n - minCount; k++) {
    if (scores[best] - scores[k] <= SPLIT_INTERVAL_DROP) {
      first = Math.min(first, k);
      last = Math.max(last, k);
    }
  }
  return { k: best, first, last, lowVarG2, highVarG2, evidence };
}

function isClear(low: number, high: number, evidence: number, params: PumpParams): boolean {
  return high >= params.vibrationRatio * low && evidence >= params.vibrationEvidence;
}

// ── pump_off ─────────────────────────────────────────────────────────────────────────────────

function findRegimeChange(
  samples: Samples,
  liquid: WindowLiquid,
  dripT: number,
  quietVarG2: number,
  context: Context,
): RegimeChange | null {
  const { params, floorVarG2 } = context;
  const coarse = coarseRegimeChange(liquid, dripT, quietVarG2);
  if (coarse === null) return null;
  // One noise level: none at first, then the coarse fit's own, so the spread means something.
  const found = searchKnee(samples, coarse, dripT, context, 1, (_, previous) => {
    if (previous === null) return { before: 1, after: 1 };
    const variance = Math.max(floorVarG2, squares(previous) / sampleCount(previous));
    return { before: variance, after: variance };
  });
  if (found === null) return null;
  const { fit, t, y } = found;
  const quality = kneeQuality(fit, t);
  const evidence =
    t.length * Math.log(fitParabolaSse(t, y) / Math.max(squares(fit), Number.MIN_VALUE));
  return {
    t: fit.t,
    tauS: fit.tauS,
    flowGps: fit.flowGps,
    weightG: fit.weightG,
    ...quality,
    evidence,
    accepted:
      fit.flowGps > 0 &&
      fit.tauS <= params.maxDrainTauS &&
      isPinned(quality, params) &&
      evidence >= params.regimeEvidence,
  };
}

function findVarianceStep(
  samples: Samples,
  dripT: number,
  quietVarG2: number,
  regimeT: number | null,
  context: Context,
): VarianceStep | null {
  const { params, floorVarG2 } = context;
  const coarse = coarseVarianceStep(samples, dripT, quietVarG2, context) ?? regimeT;
  if (coarse === null) return null;
  // The noise either side from second differences, which the trend barely touches: measured
  // again around the first fine pass's knee.
  const found = searchKnee(samples, coarse, dripT, context, 2, (c) => ({
    before: Math.max(
      floorVarG2,
      diffVariance(samples, c - params.levelSpanS, c, context) ?? quietVarG2,
    ),
    after: Math.max(
      floorVarG2,
      diffVariance(samples, c, c + params.levelSpanS, context) ?? quietVarG2,
    ),
  }));
  if (found === null) return null;
  const { fit } = found;
  const c = fit.t;
  const { t, g } = samples;
  // The step's levels from residuals of models that hold either side: a parabola through the
  // pump-driven samples, the fitted drain after the knee (a parabola can't follow a fast one).
  const from = firstAtOrAfter(t, c - params.levelSpanS);
  const at = firstAtOrAfter(t, c);
  const to = firstAtOrAfter(t, c + params.levelSpanS);
  if (at - from < 5 || to - at < 3) return null;
  const beforeSse = fitParabolaSse(t.slice(from, at), g.slice(from, at));
  let afterSse = 0;
  for (let i = at; i < to; i++) afterSse += (g[i] - kneeWeightAt(fit, t[i])) ** 2;
  const beforeFreedom = at - from - 3;
  const afterFreedom = to - at - 1;
  const pumpVarG2 = Math.max(floorVarG2, beforeSse / beforeFreedom);
  const quiet = Math.max(floorVarG2, afterSse / afterFreedom);
  const freedom = beforeFreedom + afterFreedom;
  const pooled = Math.max(floorVarG2, (beforeSse + afterSse) / freedom);
  const evidence =
    freedom * Math.log(pooled) -
    beforeFreedom * Math.log(pumpVarG2) -
    afterFreedom * Math.log(quiet);
  const quality = kneeQuality(fit, found.t);
  return {
    t: c,
    tauS: fit.tauS,
    flowGps: fit.flowGps,
    weightG: fit.weightG,
    quietVarG2: quiet,
    pumpVarG2,
    evidence,
    ...quality,
    clear: isPinned(quality, params) && isClear(quiet, pumpVarG2, evidence, params),
  };
}

/** The tail after a knee fitted to samples timed `t`, and how closely they pin it. */
function kneeQuality(fit: KneeFit, t: readonly number[]): KneeQuality {
  return {
    tailS: t[t.length - 1] - fit.t,
    spreadS: Math.max(fit.t - fit.interval.from, fit.interval.to - fit.t),
  };
}

function isPinned(quality: KneeQuality, params: PumpParams): boolean {
  return (
    quality.tailS >= params.minTailS - TIME_EPSILON_S &&
    quality.spreadS <= params.maxKneeSpreadS + TIME_EPSILON_S
  );
}

/** A knee fit's squared residuals, summed over both sides. */
function squares(fit: KneeFit): number {
  return fit.before.meanSquareG2 * fit.before.count + fit.after.meanSquareG2 * fit.after.count;
}

function sampleCount(fit: KneeFit): number {
  return fit.before.count + fit.after.count;
}

/**
 * The best knee near `coarse`: knees every `COARSE_KNEE_STEP_S` within `kneeScanS` (once more
 * around the best if it came out at the edge), then every `FINE_KNEE_STEP_S` within
 * `FINE_KNEE_HALF_S`, τ refined, `fineRounds` times. Samples run `kneeBeforeS` before the knees
 * tried and `kneeAfterS` after, never before the first drip. `levels` gives each pass the noise
 * variances either side, from its centre and the previous pass's fit.
 */
function searchKnee(
  samples: Samples,
  coarse: number,
  dripT: number,
  context: Context,
  fineRounds: number,
  levels: (centre: number, previous: KneeFit | null) => { before: number; after: number },
): { fit: KneeFit; t: number[]; y: number[] } | null {
  const { params } = context;
  const pass = (
    centre: number,
    half: number,
    spacing: number,
    refineTau: boolean,
    previous: KneeFit | null,
  ) => {
    const from = firstAtOrAfter(samples.t, Math.max(dripT, centre - half - params.kneeBeforeS));
    const to = firstAtOrAfter(samples.t, centre + half + params.kneeAfterS);
    const t = samples.t.slice(from, to);
    const y = samples.g.slice(from, to);
    const variances = levels(centre, previous);
    const fit = fitKnee(t, y, {
      knees: spaced(centre - half, centre + half, spacing),
      beforeVarG2: variances.before,
      afterVarG2: variances.after,
      refineTau,
      tauNear: refineTau ? previous?.tauS : undefined,
    });
    return fit && { fit, t, y };
  };
  const scan = params.kneeScanS;
  let found = pass(coarse, scan, COARSE_KNEE_STEP_S, false, null);
  if (found && Math.abs(found.fit.t - coarse) > scan - 2 * COARSE_KNEE_STEP_S) {
    found = pass(found.fit.t, scan, COARSE_KNEE_STEP_S, false, found.fit) ?? found;
  }
  for (let round = 0; found && round < fineRounds; round++) {
    found = pass(found.fit.t, FINE_KNEE_HALF_S, FINE_KNEE_STEP_S, true, found.fit) ?? found;
  }
  return found;
}

/**
 * The coarse regime change: two straight lines through ln(flow), weighted by flow², meeting at
 * the knee, from `RAMP_SETTLE_S` after the flow first reaches 80% of its high (but no earlier
 * than `LAST_HIGH_LEAD_S` before it is last there) to where it last clears three times its
 * noise. Null when the flow never rises clear of its noise.
 */
function coarseRegimeChange(
  liquid: WindowLiquid,
  dripT: number,
  quietVarG2: number,
): number | null {
  const { start, step, values } = liquid.grid;
  const window = sgWindowSamples(COARSE_FLOW_WINDOW_S, step);
  if (values.length < window) return null;
  const flow = quadraticSG(values, window, step, 1);
  const gain = Math.sqrt(
    savitzkyGolayCoefficients({ window, order: 2, derivative: 1 }).reduce((s, c) => s + c * c, 0),
  );
  const floor = (3 * Math.sqrt(quietVarG2) * gain) / step;
  const first = Math.max(0, Math.ceil((dripT - start) / step - 1e-9));
  const flowing = flow.slice(first).filter((value) => Number.isFinite(value));
  if (flowing.length < 2) return null;
  const high = quantile(
    flowing.sort((a, b) => a - b),
    0.9,
  );
  let k0 = first;
  while (k0 < flow.length && !(flow[k0] >= 0.8 * high)) k0++;
  k0 += Math.round(RAMP_SETTLE_S / step);
  let lastHigh = flow.length - 1;
  while (lastHigh > k0 && !(flow[lastHigh] >= 0.8 * high)) lastHigh--;
  k0 = Math.max(k0, lastHigh - Math.round(LAST_HIGH_LEAD_S / step));
  let k1 = flow.length - 1;
  while (k1 > k0 && !(flow[k1] > floor)) k1--;
  const points: number[] = [];
  for (let k = k0; k <= k1; k++) if (flow[k] > floor) points.push(k);
  if (points.length < 10) return null;
  const x = points.map((k) => start + k * step);
  const y = points.map((k) => Math.log(flow[k]));
  const w = points.map((k) => flow[k] ** 2);
  let best: number | null = null;
  let bestSse = Infinity;
  for (const c of spaced(x[0] + 0.3, x[x.length - 1] - 0.3, 0.02)) {
    const sse = hingeSse(x, y, w, c);
    if (sse < bestSse) {
      bestSse = sse;
      best = c;
    }
  }
  return best;
}

/** The weighted squared residuals of y = a + b·min(x − c, 0) + d·max(x − c, 0). */
function hingeSse(
  x: readonly number[],
  y: readonly number[],
  w: readonly number[],
  c: number,
): number {
  const m = [0, 0, 0, 0, 0]; // Σw, Σw·l, Σw·r, Σw·l², Σw·r²; Σw·l·r is always 0
  let sy = 0;
  let sly = 0;
  let sry = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i++) {
    const l = Math.min(x[i] - c, 0);
    const r = Math.max(x[i] - c, 0);
    m[0] += w[i];
    m[1] += w[i] * l;
    m[2] += w[i] * r;
    m[3] += w[i] * l * l;
    m[4] += w[i] * r * r;
    sy += w[i] * y[i];
    sly += w[i] * l * y[i];
    sry += w[i] * r * y[i];
    syy += w[i] * y[i] * y[i];
  }
  // Cramer's rule on [[m0, m1, m2], [m1, m3, 0], [m2, 0, m4]].
  const det = m[0] * m[3] * m[4] - m[1] * m[1] * m[4] - m[2] * m[2] * m[3];
  if (!(Math.abs(det) > 0)) return Infinity;
  const a = (sy * m[3] * m[4] - m[1] * sly * m[4] - m[2] * m[3] * sry) / det;
  const b = (m[0] * sly * m[4] - sy * m[1] * m[4] + m[2] * m[1] * sry - m[2] * m[2] * sly) / det;
  const d = (m[0] * m[3] * sry - m[1] * m[1] * sry - sy * m[2] * m[3] + m[1] * m[2] * sly) / det;
  return Math.max(0, syy - a * sy - b * sly - d * sry);
}

/**
 * The coarse variance step after the drip: the likeliest split of ln(e² + quiet) into two means,
 * e the samples' second differences over √6. The quiet level inside the log keeps quantised
 * zeros and a knock's spikes from dominating. Null with too few.
 */
function coarseVarianceStep(
  samples: Samples,
  dripT: number,
  quietVarG2: number,
  context: Context,
): number | null {
  const diffs = secondDifferences(samples, dripT, Infinity, context.step);
  const y = diffs.e.map((e) => Math.log(e * e + quietVarG2));
  const n = y.length;
  const minCount = context.minCount;
  if (n < 2 * minCount) return null;
  let total = 0;
  for (const value of y) total += value;
  let left = 0;
  let best: number | null = null;
  let bestScore = -Infinity;
  for (let j = 0; j < n; j++) {
    if (j >= minCount && n - j >= minCount) {
      const score = (j * (n - j) * (left / j - (total - left) / (n - j)) ** 2) / n;
      if (score > bestScore) {
        bestScore = score;
        best = j;
      }
    }
    left += y[j];
  }
  return best === null ? null : diffs.t[best];
}

/**
 * The samples' second differences over √6 (white noise's own variance), centred on samples timed
 * from `fromT` to before `toT`, skipping any that span a gap of more than 2.5 steps.
 */
function secondDifferences(
  samples: Samples,
  fromT: number,
  toT: number,
  step: number,
): { t: number[]; e: number[] } {
  const { t, g } = samples;
  const out: { t: number[]; e: number[] } = { t: [], e: [] };
  for (let i = Math.max(1, firstAtOrAfter(t, fromT)); i + 1 < t.length && t[i] < toT; i++) {
    if (t[i + 1] - t[i - 1] > 2.5 * step) continue;
    out.t.push(t[i]);
    out.e.push((g[i - 1] - 2 * g[i] + g[i + 1]) / Math.sqrt(6));
  }
  return out;
}

/** The mean square of the second differences from `fromT` to `toT`, or null with too few. */
function diffVariance(
  samples: Samples,
  fromT: number,
  toT: number,
  context: Context,
): number | null {
  const { e } = secondDifferences(samples, fromT, toT, context.step);
  if (e.length < context.minCount) return null;
  return e.reduce((sum, value) => sum + value * value, 0) / e.length;
}

// ── helpers ──────────────────────────────────────────────────────────────────────────────────

/** `from`, then every `spacing` up to `to` (multiplied out, never accumulated). */
function spaced(from: number, to: number, spacing: number): number[] {
  const count = Math.floor((to - from) / spacing + 1e-9);
  return Array.from({ length: Math.max(0, count + 1) }, (_, j) => from + j * spacing);
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** The first index whose time is at least `t`, by bisection: the times never decrease. */
function firstAtOrAfter(times: readonly number[], t: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
