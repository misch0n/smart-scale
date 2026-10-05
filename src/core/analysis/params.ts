/**
 * The analysis's parameters, with their defaults: the timeline's (T1.9), the segmentation's
 * (T1.11), the liquid markers' (T1.12) and the pump markers' (T1.13). Every value is plain JSON,
 * and every result is stamped with the whole set that made it (`AnalysisParams`, T1.14).
 *
 * Values that depend on the real scale are provisional until the hardware tests (D-029): each
 * names its test, and T1.16 tunes them on real recordings.
 */

import {
  DEFAULT_MAX_DRIFT_PPM,
  DEFAULT_MIN_FIT_SPAN_MS,
  DEFAULT_MIN_RUN_FRAMES,
  type TimelineOptions,
} from '../timebase';

export interface SegmentationParams {
  /** Stability: the span of a stability window, s (spec "Tare arming"). */
  readonly stableSpanS: number;
  /**
   * Stability: the largest range of samples a stable window may show, g, unless the
   * quantisation allowance is larger (spec "Tare arming": 0.05 g over 0.5 s).
   */
  readonly stableRangeG: number;
  /**
   * Stability: the range allowed as a multiple of the quantisation step. Readings that flicker
   * between two neighbouring values span one step, so at a coarse resolution the band widens to
   * this many steps.
   */
  readonly stableQuantisationSteps: number;
  /**
   * Steps: consecutive samples that differ by more than this, plus `maxFlowGps` times the time
   * between them, are a jump: part of a transition, not liquid or noise.
   */
  readonly jumpG: number;
  /** Steps: faster than any espresso flows, g/s; it keeps a shot's rise from counting as jumps. */
  readonly maxFlowGps: number;
  /** Steps: the line fits on either side of a transition span this long, s. */
  readonly stepFitS: number;
  /**
   * Steps: a transition of more than one jump is a vessel settling in or out, so the fit after
   * it starts this long after its last jump, s.
   */
  readonly settleS: number;
  /** Steps: a smaller net change across a transition is a transient (a knock), not a step, g. */
  readonly minStepG: number;
  /** Steps: a step at least this large is a vessel placed or lifted, g. */
  readonly minVesselG: number;
  /** Tares: how long after a logged tare command to look for its step, s. */
  readonly tareSearchS: number;
  /** Tares: a step lands on zero when the level just after it is within this of zero, g. */
  readonly tareZeroG: number;
  /**
   * Tares: a logged tare too small to jump is applied only when its step exceeds this many
   * standard errors. Applying a step that's only noise would add the noise to the yield.
   */
  readonly quietTareSigmas: number;
  /** Shots: the least rise from the baseline that makes a shot window, g. */
  readonly minRiseG: number;
  /** Shots: the rise must take at least this long, s; a quicker change is a step. */
  readonly minRiseS: number;
  /**
   * Shots: a baseline, or the level a rise ends at, needs a stable stretch at least this long, s.
   * The pump's vibration lets a few samples in a row look stable now and then; a second of them
   * doesn't.
   */
  readonly minBaselineS: number;
  /** Shots: the baseline is at most the last this many seconds of its stable stretch, s. */
  readonly baselineS: number;
}

export const DEFAULT_SEGMENTATION_PARAMS: SegmentationParams = {
  stableSpanS: 0.5,
  stableRangeG: 0.05, // PROVISIONAL(U1.1: A11)
  stableQuantisationSteps: 1, // PROVISIONAL(U1.1: A11)
  jumpG: 1, // PROVISIONAL(U1.1: A2)
  maxFlowGps: 5,
  stepFitS: 1,
  settleS: 0.3, // PROVISIONAL(U1.1: C2)
  minStepG: 1,
  minVesselG: 20,
  tareSearchS: 0.5, // PROVISIONAL(U1.1: A5)
  tareZeroG: 0.5, // PROVISIONAL(U1.1: C4)
  quietTareSigmas: 4,
  minRiseG: 1,
  minRiseS: 3,
  minBaselineS: 1, // PROVISIONAL(U1.1: A2)
  baselineS: 2,
};

/**
 * The defaults with `overrides` applied (an `undefined` value keeps the default), validated.
 *
 * @throws RangeError on an unknown name, or a value that isn't a finite number above 0.
 */
export function resolveSegmentationParams(
  overrides: Partial<SegmentationParams> = {},
): SegmentationParams {
  return resolveParams('segmentation', DEFAULT_SEGMENTATION_PARAMS, overrides);
}

/** The liquid markers' parameters (T1.12, D-035): `first_drip`, the tail fit and `settled`. */
export interface LiquidParams {
  /**
   * first_drip: the CUSUM's slack, in σ of the pre-infusion's noise (spec "Markers": about
   * 0.5σ).
   */
  readonly cusumSlackSigmas: number;
  /** first_drip: the CUSUM's alarm, in σ (spec "Markers": about 4–5σ). */
  readonly cusumAlarmSigmas: number;
  /**
   * first_drip: the CUSUM starts this long before the baseline ends, s. Without the pump's
   * vibration the baseline runs on to about first_drip, now and then past it.
   */
  readonly onsetScanBackS: number;
  /** first_drip: the rise is fitted until the liquid reaches this, g. */
  readonly riseFitG: number;
  /** first_drip: the rise fit starts this long before the CUSUM's change point, s. */
  readonly riseLookbackS: number;
  /**
   * The mass of one drop, g, or 0 for a stream. Liquid lands in whole drops, the first at
   * first_drip, so the weight runs half a drop ahead of the stream on average: the rise model
   * starts with that half drop.
   */
  readonly dropG: number;
  /**
   * first_drip: a rise fitted as a line (flow from the start) is chosen over the parabola (flow
   * ramping up from nothing) only when its squared residuals are smaller by this many σ².
   */
  readonly linearOnsetMargin: number;
  /**
   * The Savitzky–Golay window for the flow and the smoothed weight, s (spec "Signal
   * processing": about 0.5 s, quadratic).
   */
  readonly sgWindowS: number;
  /**
   * Tail: the fit's first flow window starts this long after pump_off, s, so that the pump's
   * vibration stays out of it when pump_off comes a little early.
   */
  readonly tailStartS: number;
  /** Tail: flow is fitted where the fit predicts more than this many σ of the flow's noise. */
  readonly tailFlowSigmas: number;
  /** Tail: the fitted flow must span at least this long, s; a shorter tail isn't fitted. */
  readonly tailMinSpanS: number;
  /** Tail: w_final comes from the last this many seconds of the tail, s. */
  readonly finalSpanS: number;
}

export const DEFAULT_LIQUID_PARAMS: LiquidParams = {
  cusumSlackSigmas: 0.5,
  cusumAlarmSigmas: 4.5,
  onsetScanBackS: 1,
  riseFitG: 1.5, // PROVISIONAL(U1.1: C3)
  riseLookbackS: 1.5,
  dropG: 0.05, // PROVISIONAL(U1.1: C3)
  linearOnsetMargin: 2,
  sgWindowS: 0.5, // PROVISIONAL(U1.1: A1)
  tailStartS: 0.2,
  tailFlowSigmas: 3, // PROVISIONAL(U1.1: C3)
  tailMinSpanS: 1, // PROVISIONAL(U1.1: C5)
  finalSpanS: 1,
};

/** Liquid parameters that may be 0: a stream without drops, a plain comparison, no margin. */
const LIQUID_ZERO_ALLOWED: ReadonlySet<string> = new Set([
  'dropG',
  'linearOnsetMargin',
  'tailStartS',
]);

/**
 * The defaults with `overrides` applied (an `undefined` value keeps the default), validated.
 *
 * @throws RangeError on an unknown name, or a value that isn't a finite number above 0 (at
 *   least 0 for `dropG`, `linearOnsetMargin` and `tailStartS`).
 */
export function resolveLiquidParams(overrides: Partial<LiquidParams> = {}): LiquidParams {
  return resolveParams('liquid markers', DEFAULT_LIQUID_PARAMS, overrides, LIQUID_ZERO_ALLOWED);
}

/** The pump markers' parameters (T1.13, D-036): `pump_on`, `pump_off` and which detector ran. */
export interface PumpParams {
  /**
   * The pump's vibration shows when the noise variance steps up at least this many times its
   * quiet level, between the baseline and the first drip: the spec's "clearly above".
   */
  readonly vibrationRatio: number;
  /**
   * …and that step is this sure: twice the log-likelihood ratio of two noise levels against
   * one. The same test, with `vibrationRatio`, makes the variance step at pump_off clear.
   */
  readonly vibrationEvidence: number;
  /** Either side of a variance step needs at least this long of samples, s. */
  readonly minLevelS: number;
  /**
   * Before the first drip the liquid holds still, so a sample further from its level than this
   * many σ of the pump's noise is a knock (spec: a bump moves the mean). It and its neighbours
   * are left out of the variance step.
   */
  readonly knockSigmas: number;
  /**
   * pump_on: the mean of the second after the onset must stay within this many standard errors
   * of the second before it (or the stability tolerance, if more): the spec's "mean stays
   * stationary".
   */
  readonly stationarySigmas: number;
  /** The knee fit's samples run from this long before the knees tried, s… */
  readonly kneeBeforeS: number;
  /** …to this long after them, s. */
  readonly kneeAfterS: number;
  /** The knees tried first lie within this of the coarse estimate, s. */
  readonly kneeScanS: number;
  /** The levels either side of pump_off's variance step come from this long of samples, s. */
  readonly levelSpanS: number;
  /** pump_off needs at least this long of samples after it, s. */
  readonly minTailS: number;
  /**
   * …and its knee must be pinned this closely: no knee further away fits nearly as well (twice
   * the log-likelihood within 4), s.
   */
  readonly maxKneeSpreadS: number;
  /** A regime change drains with τ of at most this, s; slower is no drain. */
  readonly maxDrainTauS: number;
  /**
   * A regime change must fit better than the pump-driven law carried on (a parabola) by this
   * much: twice the log-likelihood ratio.
   */
  readonly regimeEvidence: number;
  /** The two pump_off estimates disagree when they're more than this apart, s. */
  readonly disagreementS: number;
}

export const DEFAULT_PUMP_PARAMS: PumpParams = {
  vibrationRatio: 8, // PROVISIONAL(U1.1: A2)
  vibrationEvidence: 15, // PROVISIONAL(U1.1: A2)
  minLevelS: 0.5,
  knockSigmas: 6,
  stationarySigmas: 4,
  kneeBeforeS: 3,
  kneeAfterS: 6,
  kneeScanS: 1.5,
  levelSpanS: 2,
  minTailS: 0.5, // PROVISIONAL(U1.1: C5)
  maxKneeSpreadS: 0.2,
  maxDrainTauS: 5, // PROVISIONAL(U1.1: C3)
  regimeEvidence: 20, // PROVISIONAL(U1.1: C3)
  disagreementS: 0.5, // PROVISIONAL(U1.1: A2)
};

/**
 * The defaults with `overrides` applied (an `undefined` value keeps the default), validated.
 *
 * @throws RangeError on an unknown name, or a value that isn't a finite number above 0.
 */
export function resolvePumpParams(overrides: Partial<PumpParams> = {}): PumpParams {
  return resolveParams('pump markers', DEFAULT_PUMP_PARAMS, overrides);
}

/** The timeline's options (T1.9), defaults filled in: `TimelineOptions` made complete. */
export interface TimelineParams {
  readonly minRunFrames: number;
  readonly minFitSpanMs: number;
  readonly maxDriftPpm: number;
}

export const DEFAULT_TIMELINE_PARAMS: TimelineParams = {
  minRunFrames: DEFAULT_MIN_RUN_FRAMES,
  minFitSpanMs: DEFAULT_MIN_FIT_SPAN_MS,
  maxDriftPpm: DEFAULT_MAX_DRIFT_PPM,
};

/** Timeline options that may be 0: fit from any span, take any drift for the scale's. */
const TIMELINE_ZERO_ALLOWED: ReadonlySet<string> = new Set(['minFitSpanMs', 'maxDriftPpm']);

/**
 * The defaults with `overrides` applied (an `undefined` value keeps the default), validated.
 * Building the timeline checks the rest: `minRunFrames` must be a whole number from 2.
 *
 * @throws RangeError on an unknown name, or a value that isn't a finite number above 0 (at
 *   least 0 for `minFitSpanMs` and `maxDriftPpm`).
 */
export function resolveTimelineParams(overrides: TimelineOptions = {}): TimelineParams {
  return resolveParams('timeline', DEFAULT_TIMELINE_PARAMS, overrides, TIMELINE_ZERO_ALLOWED);
}

/** Every parameter of the analysis, as a result is stamped with them. */
export interface AnalysisParams {
  readonly timeline: TimelineParams;
  readonly segmentation: SegmentationParams;
  readonly liquid: LiquidParams;
  readonly pump: PumpParams;
}

/** Parameters to change from their defaults, by stage. */
export interface AnalysisOverrides {
  readonly timeline?: TimelineOptions;
  readonly segmentation?: Partial<SegmentationParams>;
  readonly liquid?: Partial<LiquidParams>;
  readonly pump?: Partial<PumpParams>;
}

/**
 * The defaults with `overrides` applied, validated: every value is a finite number, so a result
 * stamped with them is JSON.
 *
 * @throws RangeError on an unknown name, or a value out of range.
 */
export function resolveAnalysisParams(overrides: AnalysisOverrides = {}): AnalysisParams {
  return {
    timeline: resolveTimelineParams(overrides.timeline),
    segmentation: resolveSegmentationParams(overrides.segmentation),
    liquid: resolveLiquidParams(overrides.liquid),
    pump: resolvePumpParams(overrides.pump),
  };
}

function resolveParams<T extends object>(
  label: string,
  defaults: T,
  overrides: Partial<T>,
  zeroAllowed: ReadonlySet<string> = new Set(),
): T {
  const params: Record<string, number> = { ...(defaults as Record<string, number>) };
  for (const [name, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(defaults, name)) {
      throw new RangeError(`${label}: unknown parameter ${name}`);
    }
    if (value !== undefined) params[name] = value as number;
  }
  for (const [name, value] of Object.entries(params)) {
    const least = zeroAllowed.has(name) ? 'at least 0' : 'above 0';
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0 ||
      (value === 0 && !zeroAllowed.has(name))
    ) {
      throw new RangeError(`${label}: ${name} ${value} is not a finite number ${least}`);
    }
  }
  return params as T;
}
