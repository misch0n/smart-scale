/**
 * The analysis's parameters, with their defaults: the segmentation's (T1.11) and the liquid
 * markers' (T1.12). Every value is plain JSON, so T1.14 can stamp a result with the set that
 * made it.
 *
 * Values that depend on the real scale are provisional until the hardware tests (D-029): each
 * names its test, and T1.16 tunes them on real recordings.
 */

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
