/**
 * The segmentation's parameters (T1.11), with their defaults. Every value is plain JSON, so
 * T1.14 can stamp a result with the set that made it.
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
  const params: Record<string, number> = { ...DEFAULT_SEGMENTATION_PARAMS };
  for (const [name, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(DEFAULT_SEGMENTATION_PARAMS, name)) {
      throw new RangeError(`segmentation: unknown parameter ${name}`);
    }
    if (value !== undefined) params[name] = value;
  }
  for (const [name, value] of Object.entries(params)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new RangeError(`segmentation: ${name} ${value} is not a positive finite number`);
    }
  }
  return params as unknown as SegmentationParams;
}
