/**
 * The liquid side of a shot: when it starts and stops dripping, and how much has reached the
 * cup at any moment. Everything is a closed-form function of the shot's parameters, so ground
 * truth is exact rather than estimated.
 *
 * The model follows the spec's "Shot segmentation and derived metrics":
 * - `pump_on` at the shot's start. Nothing drips during pre-infusion.
 * - `first_drip` after `preInfusionMs`. From there to `pump_off` the flow follows the profile.
 * - `pump_off` after `extractionMs`. The flow is continuous there and then decays
 *   exponentially with `tailTauMs` ("Tail handling"), so the tail delivers exactly
 *   ẇ(pump_off)·τ more: the spec's w_final formula holds by construction.
 * - `yieldG` is everything that eventually arrives ("Yield = w(settled)"). The flow is scaled
 *   to deliver it.
 */

/** A point of a flow profile: `[fraction of the extraction, relative flow]`. */
export type FlowKnot = readonly [fraction: number, level: number];

export interface ShotParams {
  /** Coffee in the basket, g. The physics doesn't use it; ground truth carries it for ratios. */
  readonly doseG: number;
  /** All the liquid that eventually arrives, g: the spec's yield, w(settled). */
  readonly yieldG: number;
  /** `pump_on` → `first_drip`, ms. */
  readonly preInfusionMs: number;
  /** `first_drip` → `pump_off`, ms. */
  readonly extractionMs: number;
  /** Time constant of the exponential drain after `pump_off`, ms. */
  readonly tailTauMs: number;
  /**
   * The flow's shape from `first_drip` to `pump_off`, as points joined by straight lines and
   * held after the last one. Only the shape matters, because the flow is scaled to deliver
   * `yieldG`. The first point must be at fraction 0.
   */
  readonly flowProfile: readonly FlowKnot[];
}

/** From nothing to full flow over the first 8% of the extraction, then rising by a quarter. */
export const DEFAULT_FLOW_PROFILE: readonly FlowKnot[] = [
  [0, 0],
  [0.08, 1],
  [1, 1.25],
];

/** A typical 1:2 shot on the spec's machine: 18 g in, 38 g out, about 28 s pump time. */
export const DEFAULT_SHOT_PARAMS: ShotParams = {
  doseG: 18,
  yieldG: 38,
  preInfusionMs: 6000,
  extractionMs: 22_000,
  tailTauMs: 1500,
  flowProfile: DEFAULT_FLOW_PROFILE,
};

/** A shot placed on the session timeline, with its liquid as a function of time. */
export class ShotModel {
  readonly params: ShotParams;
  readonly pumpOnMs: number;
  readonly firstDripMs: number;
  readonly pumpOffMs: number;
  /** g/s per unit of profile level. */
  readonly flowScaleGps: number;
  /** ẇ(pump_off), g/s. */
  readonly flowAtPumpOffGps: number;
  /** Liquid delivered by `pump_off` as a continuous stream, g. */
  readonly liquidAtPumpOffG: number;
  /** Liquid delivered after `pump_off` as a continuous stream: ẇ(pump_off)·τ, g. */
  readonly tailMassG: number;
  readonly #fractions: readonly number[];
  readonly #levels: readonly number[];
  /** The profile's area from fraction 0 to each point. */
  readonly #areas: readonly number[];

  /** @throws RangeError on invalid parameters. */
  constructor(pumpOnMs: number, params: ShotParams) {
    validateShot(pumpOnMs, params);
    this.params = params;
    this.pumpOnMs = pumpOnMs;
    this.firstDripMs = pumpOnMs + params.preInfusionMs;
    this.pumpOffMs = this.firstDripMs + params.extractionMs;
    this.#fractions = params.flowProfile.map(([fraction]) => fraction);
    this.#levels = params.flowProfile.map(([, level]) => level);
    const areas = [0];
    for (let i = 1; i < this.#fractions.length; i++) {
      const width = this.#fractions[i] - this.#fractions[i - 1];
      areas.push(areas[i - 1] + (width * (this.#levels[i - 1] + this.#levels[i])) / 2);
    }
    this.#areas = areas;

    const extractionS = params.extractionMs / 1000;
    const tauS = params.tailTauMs / 1000;
    const endLevel = this.#level(1);
    const perUnitFlow = extractionS * this.#area(1) + endLevel * tauS;
    if (!(perUnitFlow > 0)) {
      throw new RangeError('shot: the flow profile delivers nothing; give it a positive level');
    }
    this.flowScaleGps = params.yieldG / perUnitFlow;
    this.flowAtPumpOffGps = this.flowScaleGps * endLevel;
    this.liquidAtPumpOffG = this.flowScaleGps * extractionS * this.#area(1);
    this.tailMassG = this.flowAtPumpOffGps * tauS;
  }

  /** Flow into the cup at `tMs` as a continuous stream, g/s. */
  flowAt(tMs: number): number {
    if (tMs < this.firstDripMs) return 0;
    if (tMs <= this.pumpOffMs) {
      return this.flowScaleGps * this.#level((tMs - this.firstDripMs) / this.params.extractionMs);
    }
    return this.flowAtPumpOffGps * Math.exp(-(tMs - this.pumpOffMs) / this.params.tailTauMs);
  }

  /** Liquid delivered by `tMs` as a continuous stream, g. */
  liquidAt(tMs: number): number {
    if (tMs <= this.firstDripMs) return 0;
    if (tMs <= this.pumpOffMs) {
      const fraction = (tMs - this.firstDripMs) / this.params.extractionMs;
      return this.flowScaleGps * (this.params.extractionMs / 1000) * this.#area(fraction);
    }
    const drained = 1 - Math.exp(-(tMs - this.pumpOffMs) / this.params.tailTauMs);
    return this.liquidAtPumpOffG + this.tailMassG * drained;
  }

  /** The profile level at a fraction of the extraction, held after the last point. */
  #level(fraction: number): number {
    const i = this.#segment(fraction);
    if (i === this.#fractions.length - 1) return this.#levels[i];
    const t = (fraction - this.#fractions[i]) / (this.#fractions[i + 1] - this.#fractions[i]);
    return this.#levels[i] + t * (this.#levels[i + 1] - this.#levels[i]);
  }

  /** The profile's area from fraction 0 to `fraction`. */
  #area(fraction: number): number {
    const i = this.#segment(fraction);
    return (
      this.#areas[i] +
      ((fraction - this.#fractions[i]) * (this.#levels[i] + this.#level(fraction))) / 2
    );
  }

  /** The index of the last point at or before `fraction`. */
  #segment(fraction: number): number {
    let i = 0;
    while (i + 1 < this.#fractions.length && this.#fractions[i + 1] <= fraction) i++;
    return i;
  }
}

/**
 * Liquid delivered by `tMs` in whole drops of `dropG` (0: a continuous stream). The first drop
 * lands at `first_drip`, and another each time the stream has delivered `dropG` more, so the
 * amount in the cup is at most one drop ahead of the stream.
 */
export function deliveredG(shot: ShotModel, tMs: number, dropG: number): number {
  const liquid = shot.liquidAt(tMs);
  if (dropG === 0 || liquid <= 0) return liquid;
  return dropG * Math.ceil(liquid / dropG);
}

/**
 * The tail is treated as over after this many time constants: the remaining e^-50 of the tail
 * mass is far below a double's precision on the delivered total, so the total has stopped
 * changing.
 */
export const TAIL_HORIZON_TAUS = 50;

/** Everything the shot will deliver, in whole drops: its yield as the scale will show it. */
export function finalDeliveredG(shot: ShotModel, dropG: number): number {
  return deliveredG(shot, tailHorizonMs(shot), dropG);
}

/**
 * The first time at or after `pump_off` when the delivered liquid is within `toleranceG` of its
 * final value: the spec's `settled`, "mean stops moving".
 */
export function settledAtMs(shot: ShotModel, dropG: number, toleranceG: number): number {
  const target = finalDeliveredG(shot, dropG) - toleranceG;
  let lo = shot.pumpOffMs;
  if (deliveredG(shot, lo, dropG) >= target) return lo;
  let hi = tailHorizonMs(shot);
  // The delivered amount never decreases, so bisect on time; 0.01 ms is plenty.
  while (hi - lo > 0.01) {
    const mid = (lo + hi) / 2;
    if (deliveredG(shot, mid, dropG) >= target) hi = mid;
    else lo = mid;
  }
  return hi;
}

function tailHorizonMs(shot: ShotModel): number {
  return shot.pumpOffMs + TAIL_HORIZON_TAUS * shot.params.tailTauMs;
}

function validateShot(pumpOnMs: number, p: ShotParams): void {
  const check = (name: string, value: number, ok: boolean): void => {
    if (!Number.isFinite(value) || !ok) {
      throw new RangeError(`shot: ${name} ${value} is out of range`);
    }
  };
  check('start time', pumpOnMs, pumpOnMs >= 0);
  check('doseG', p.doseG, p.doseG >= 0);
  check('yieldG', p.yieldG, p.yieldG > 0);
  check('preInfusionMs', p.preInfusionMs, p.preInfusionMs >= 0);
  check('extractionMs', p.extractionMs, p.extractionMs > 0);
  check('tailTauMs', p.tailTauMs, p.tailTauMs > 0);
  const profile = p.flowProfile;
  if (profile.length === 0) {
    throw new RangeError('shot: flowProfile needs at least one point');
  }
  profile.forEach(([fraction, level], i) => {
    check(`flowProfile[${i}] fraction`, fraction, fraction >= 0 && fraction <= 1);
    check(`flowProfile[${i}] level`, level, level >= 0);
    if (i === 0 && fraction !== 0) {
      throw new RangeError('shot: flowProfile must start at fraction 0');
    }
    if (i > 0 && fraction <= profile[i - 1][0]) {
      throw new RangeError('shot: flowProfile fractions must increase');
    }
  });
}
