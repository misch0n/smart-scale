/**
 * Every parameter of the simulated scale and BLE link, with its default. Shot parameters are in
 * `shot.ts`.
 *
 * The defaults are provisional (D-013): plausible guesses until the hardware tests (A1, A2, A9,
 * A11, A13) and the U1.1 recordings replace them in T1.16. Behaviour the docs don't settle is
 * listed in D-021, which says what the simulator assumes for each unknown.
 */

import { CHARACTERISTIC_NAMES, type CharacteristicName } from '../model';
import { GRAM_UNIT_BYTES, U16_MAX } from '../protocol';

/** The scale: how it samples, how noisy it is, and its state at the start of the session. */
export interface ScaleParams {
  /**
   * Nominal interval between weight frames, in ms of the scale's own clock. The spec expects
   * roughly 10–20 Hz (hardware test A1).
   */
  readonly samplePeriodMs: number;
  /**
   * Each sample instant moves by up to ± this many ms, uniformly. The timer field stamps the
   * actual instant. Must be under half the period, so samples stay in order.
   */
  readonly sampleJitterMs: number;
  /**
   * How much faster the scale's clock runs than the phone's, in parts per million. It stretches
   * both the sample interval and the timer field. Negative means slower.
   */
  readonly clockDriftPpm: number;
  /** Weight resolution in g (hardware test A11). The frame itself carries 0.01 g. */
  readonly resolutionG: number;
  /** σ of the white noise on every weight sample, in g (A11). */
  readonly noiseSigmaG: number;
  /**
   * σ of the extra noise while the pump runs, in g: pump vibration, which moves the variance
   * and not the mean (spec "Shot segmentation"). 0 means vibration doesn't survive into the
   * weight signal, the spec's fallback case (hardware test A2).
   */
  readonly vibrationSigmaG: number;
  /**
   * Time constant of a vessel settling after it's put down or lifted, in ms. The scale shows a
   * placement as an exponential approach to the new mass, not an instant step.
   */
  readonly settleTauMs: number;
  /**
   * Mass of one drop in g. Liquid lands in whole drops: the first at first_drip, then one each
   * time the stream has delivered another `dropG`, so late tail drips arrive one by one. 0 makes
   * the flow continuous.
   */
  readonly dropG: number;
  /** ms from a command write to its effect on the scale. */
  readonly commandLatencyMs: number;
  /**
   * Whether the scale's flow smoothing is on when the session starts. The recorder turns it off
   * at connect (spec parsing rule 5). Off by default, which is the state that rule leaves, so
   * analysis scenarios needn't send the command.
   */
  readonly initialSmoothing: boolean;
  /**
   * Time constant of the scale's smoothing filter while it's on, in ms. Assumed to filter the
   * weight as well as the scale's flow figure (D-021): the spec turns it off because it would
   * bias the tail fit, which reads only the weight.
   */
  readonly smoothingTauMs: number;
  /** The scale's own flow figure is the weight change over this window, in ms. */
  readonly flowWindowMs: number;
  /** Unit byte of every weight frame (A9). Set another value to test the refusal path (D-005). */
  readonly unitByte: number;
  readonly batteryPct: number;
  /** Buzzer gear at the start; `setBuzzer` changes it. */
  readonly buzzerGear: number;
  /**
   * Auto-off setting in minutes, reported in the standby field; `setAutoOff` changes it. The
   * scale never counts down or switches itself off here (A6 is open): script a `power-off`.
   */
  readonly autoOffMin: number;
  /**
   * Where the scale sends a `03 0D` event frame when its timer starts or stops, or null for
   * nowhere. The Mini's doc has no such frame and the Ultra's doesn't say which characteristic
   * carries it (protocol-notes, finding 8), so it's off by default.
   */
  readonly timerEvents: CharacteristicName | null;
  /**
   * After the scale switches off, ms until the phone gives up on the link (the BLE supervision
   * timeout). Frames that would arrive later are lost.
   */
  readonly supervisionTimeoutMs: number;
}

export const DEFAULT_SCALE_PARAMS: ScaleParams = {
  samplePeriodMs: 100,
  sampleJitterMs: 1,
  clockDriftPpm: 300,
  resolutionG: 0.01,
  noiseSigmaG: 0.015,
  vibrationSigmaG: 0.1,
  settleTauMs: 100,
  dropG: 0.05,
  commandLatencyMs: 40,
  initialSmoothing: false,
  smoothingTauMs: 500,
  flowWindowMs: 1000,
  unitByte: GRAM_UNIT_BYTES[0],
  batteryPct: 90,
  buzzerGear: 2,
  autoOffMin: 5,
  timerEvents: null,
  supervisionTimeoutMs: 2000,
};

/**
 * The BLE link and the receiving browser: when each frame arrives, and whether it arrives
 * intact. Frames arrive in the order the scale sent them, as BLE notifications do.
 */
export interface LinkParams {
  /** Fixed delay from a sample to the earliest moment it can reach the app, in ms. */
  readonly minLatencyMs: number;
  /**
   * BLE connection interval in ms: a frame waits for the next connection event, so arrivals
   * fall on a grid. 0 turns the grid off.
   */
  readonly connectionIntervalMs: number;
  /** Mean of an extra, exponentially distributed delay per frame (OS and browser), in ms. */
  readonly jitterMeanMs: number;
  /**
   * Chance per frame that the receiver stalls, holding every frame until the stall ends and
   * then delivering them together: a burst.
   */
  readonly stallProbability: number;
  /** Shortest stall, in ms. */
  readonly stallMinMs: number;
  /** Longest stall, in ms. */
  readonly stallMaxMs: number;
  /** Chance per frame that it never arrives. */
  readonly dropProbability: number;
  /** Chance per frame that one bit flips, which the checksum catches. */
  readonly corruptProbability: number;
  /** Chance per frame that it arrives cut short. */
  readonly truncateProbability: number;
}

export const DEFAULT_LINK_PARAMS: LinkParams = {
  minLatencyMs: 15,
  connectionIntervalMs: 30,
  jitterMeanMs: 8,
  stallProbability: 0.003,
  stallMinMs: 100,
  stallMaxMs: 400,
  dropProbability: 0,
  corruptProbability: 0,
  truncateProbability: 0,
};

/**
 * The defaults with `overrides` applied (an `undefined` value keeps the default), validated.
 *
 * @throws RangeError on an out-of-range value.
 */
export function resolveScaleParams(overrides: Partial<ScaleParams> = {}): ScaleParams {
  const p = withDefaults(DEFAULT_SCALE_PARAMS, overrides);
  const fn = 'scale params';
  positive(fn, 'samplePeriodMs', p.samplePeriodMs);
  nonNegative(fn, 'sampleJitterMs', p.sampleJitterMs);
  if (p.sampleJitterMs >= p.samplePeriodMs / 2) {
    throw new RangeError(`${fn}: sampleJitterMs must be under half of samplePeriodMs`);
  }
  finite(fn, 'clockDriftPpm', p.clockDriftPpm);
  if (Math.abs(p.clockDriftPpm) > 100_000) {
    throw new RangeError(`${fn}: clockDriftPpm ${p.clockDriftPpm} is beyond ±10%`);
  }
  positive(fn, 'resolutionG', p.resolutionG);
  nonNegative(fn, 'noiseSigmaG', p.noiseSigmaG);
  nonNegative(fn, 'vibrationSigmaG', p.vibrationSigmaG);
  nonNegative(fn, 'settleTauMs', p.settleTauMs);
  nonNegative(fn, 'dropG', p.dropG);
  nonNegative(fn, 'commandLatencyMs', p.commandLatencyMs);
  if (typeof p.initialSmoothing !== 'boolean') {
    throw new RangeError(`${fn}: initialSmoothing must be a boolean`);
  }
  positive(fn, 'smoothingTauMs', p.smoothingTauMs);
  positive(fn, 'flowWindowMs', p.flowWindowMs);
  byte(fn, 'unitByte', p.unitByte);
  byte(fn, 'batteryPct', p.batteryPct);
  byte(fn, 'buzzerGear', p.buzzerGear);
  nonNegative(fn, 'autoOffMin', p.autoOffMin);
  if (Math.round(p.autoOffMin * 10) > U16_MAX) {
    throw new RangeError(`${fn}: autoOffMin ${p.autoOffMin} doesn't fit the standby field`);
  }
  if (p.timerEvents !== null && !CHARACTERISTIC_NAMES.includes(p.timerEvents)) {
    throw new RangeError(`${fn}: timerEvents must be null, 'ff11' or 'ff12'`);
  }
  nonNegative(fn, 'supervisionTimeoutMs', p.supervisionTimeoutMs);
  return p;
}

/**
 * The defaults with `overrides` applied (an `undefined` value keeps the default), validated.
 *
 * @throws RangeError on an out-of-range value.
 */
export function resolveLinkParams(overrides: Partial<LinkParams> = {}): LinkParams {
  const p = withDefaults(DEFAULT_LINK_PARAMS, overrides);
  const fn = 'link params';
  nonNegative(fn, 'minLatencyMs', p.minLatencyMs);
  nonNegative(fn, 'connectionIntervalMs', p.connectionIntervalMs);
  nonNegative(fn, 'jitterMeanMs', p.jitterMeanMs);
  probability(fn, 'stallProbability', p.stallProbability);
  nonNegative(fn, 'stallMinMs', p.stallMinMs);
  nonNegative(fn, 'stallMaxMs', p.stallMaxMs);
  if (p.stallMaxMs < p.stallMinMs) {
    throw new RangeError(`${fn}: stallMaxMs is below stallMinMs`);
  }
  probability(fn, 'dropProbability', p.dropProbability);
  probability(fn, 'corruptProbability', p.corruptProbability);
  probability(fn, 'truncateProbability', p.truncateProbability);
  if (p.corruptProbability + p.truncateProbability > 1) {
    throw new RangeError(`${fn}: corruptProbability + truncateProbability is above 1`);
  }
  return p;
}

function withDefaults<T extends object>(defaults: T, overrides: Partial<T>): T {
  const result = { ...defaults };
  for (const key of Object.keys(overrides) as (keyof T)[]) {
    if (!Object.hasOwn(defaults, key)) {
      throw new RangeError(`unknown simulator parameter ${String(key)}`);
    }
    const value = overrides[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function finite(fn: string, name: string, value: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`${fn}: ${name} ${value} is not a finite number`);
  }
}

function nonNegative(fn: string, name: string, value: number): void {
  finite(fn, name, value);
  if (value < 0) throw new RangeError(`${fn}: ${name} ${value} is negative`);
}

function positive(fn: string, name: string, value: number): void {
  finite(fn, name, value);
  if (value <= 0) throw new RangeError(`${fn}: ${name} ${value} is not positive`);
}

function probability(fn: string, name: string, value: number): void {
  finite(fn, name, value);
  if (value < 0 || value > 1) throw new RangeError(`${fn}: ${name} ${value} is not in 0–1`);
}

function byte(fn: string, name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`${fn}: ${name} ${value} is not a byte`);
  }
}
