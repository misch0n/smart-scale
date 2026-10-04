/**
 * Every parameter of the simulated scale and BLE link, with its default. Shot parameters are in
 * `shot.ts`.
 *
 * Hardware session 1 (D-037) measured the sampling, the resolution, the noise at rest, the
 * timer, the scale's modes and the link; those defaults cite it (S1). The rest are still
 * guesses (D-013), marked `PROVISIONAL(U1.1: <test>)` with the hardware test that will settle
 * them (D-029). D-021 lists what the simulator assumes where the docs and the tests are silent.
 */

import { GRAM_UNIT_BYTES, U16_MAX } from '../protocol';

/**
 * The scale's modes (D-037), chosen on the scale itself; it doesn't report its mode.
 * - `timer`: weight and time. The app's commands start, stop and reset the timer. The mode the
 *   app uses (D-038), and the default.
 * - `automatic`: it tares as a cup goes on and times its own run from the first liquid,
 *   announcing it with `03 0D` frames on FF12. It ignores the app's timer commands but `05`.
 * - `flow-rate`: weight and flow, no timer.
 */
export const SCALE_MODES = ['timer', 'automatic', 'flow-rate'] as const;
export type ScaleMode = (typeof SCALE_MODES)[number];

/** The scale: how it samples, how noisy it is, and its state at the start of the session. */
export interface ScaleParams {
  /**
   * Interval between weight frames, in ms of the scale's own clock. It is also the timer's tick:
   * the timer adds one interval per sample while it runs (S1).
   */
  readonly samplePeriodMs: number;
  /**
   * Each sample instant moves by up to ± this many ms, uniformly. The timer doesn't see it: it
   * counts samples. Must be under half the period, so samples stay in order.
   */
  readonly sampleJitterMs: number;
  /**
   * How much faster the scale's clock runs than the phone's, in parts per million. It stretches
   * the sample interval, and so the timer's ticks. Negative means slower.
   */
  readonly clockDriftPpm: number;
  /** Weight resolution in g (hardware test A11). The frame itself carries 0.01 g. */
  readonly resolutionG: number;
  /**
   * σ of the white noise on every weight sample, in g, before the scale rounds it to
   * `resolutionG` (A11).
   */
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
  /**
   * ms from a command write to the scale acting on it. A tare then takes one more sample
   * (D-021).
   */
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
  /**
   * The scale's own flow figure is the change over this window, in ms, of the weight before
   * rounding: so it moves at rest while the reading holds still, as on the real scale (S1).
   */
  readonly flowWindowMs: number;
  /** Unit byte of every weight frame (A9). Set another value to test the refusal path (D-005). */
  readonly unitByte: number;
  readonly batteryPct: number;
  /** Buzzer gear at the start; `setBuzzer` changes it. */
  readonly buzzerGear: number;
  /**
   * Auto-off setting in minutes, reported in the standby field; `setAutoOff` changes it. The
   * field doesn't count down (S1), and the scale never switches itself off here (A6 is open):
   * script a `power-off`.
   */
  readonly autoOffMin: number;
  /** The mode set on the scale for the whole session (`SCALE_MODES`). */
  readonly mode: ScaleMode;
  /**
   * After the scale switches off, ms until the phone gives up on the link (the BLE supervision
   * timeout). Frames that would arrive later are lost.
   */
  readonly supervisionTimeoutMs: number;
}

/** Hardware session 1 is "S1" (D-037). */
export const DEFAULT_SCALE_PARAMS: ScaleParams = {
  // S1: a frame every 100.70 ms of the phone's clock, and the timer moves 100 ms per frame:
  // 100 ms ticks of a clock 0.69% slow (the timeline fitted −6,937 ppm).
  samplePeriodMs: 100,
  sampleJitterMs: 1, // Can't be told from the link's jitter.
  clockDriftPpm: -6940,
  resolutionG: 0.1, // S1 (A11).
  // S1: the reading held still for 92 s at rest, while the scale's own flow figure, which sees
  // the weight before rounding, moved with σ 0.018 g/s: about the change over a second of a
  // weight with σ 0.012 g.
  noiseSigmaG: 0.012,
  vibrationSigmaG: 0.1, // PROVISIONAL(U1.1: A2)
  settleTauMs: 100, // PROVISIONAL(U1.1: C2)
  dropG: 0.05, // PROVISIONAL(U1.1: C3)
  commandLatencyMs: 40, // PROVISIONAL(U1.1: A5)
  initialSmoothing: false,
  smoothingTauMs: 500, // PROVISIONAL(U1.1: A13)
  flowWindowMs: 1000, // The real formula is unknown; its σ at rest comes out as S1's.
  unitByte: GRAM_UNIT_BYTES[0],
  batteryPct: 90,
  buzzerGear: 2,
  autoOffMin: 5,
  mode: 'timer', // D-038.
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
  /**
   * Chance that a frame due at a connection event doesn't get through and waits for the next
   * one, as after a radio error the link layer retransmits. It can miss several in a row.
   * Below 1; no effect without the grid.
   */
  readonly retransmitProbability: number;
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

/**
 * S1: arrival gaps of 90, 120 and 150 ms, each within about a millisecond, and frames late on
 * the timer's line by a median of 16 ms (p95 33 ms, p99 60 ms). Nothing lost or damaged in
 * 338 s, and no stall but the microphone's.
 */
export const DEFAULT_LINK_PARAMS: LinkParams = {
  minLatencyMs: 15, // No recording can show it (ARCHITECTURE "Timebase").
  connectionIntervalMs: 30, // S1.
  retransmitProbability: 0.05, // S1: one frame in twenty a connection event late.
  jitterMeanMs: 1, // S1.
  stallProbability: 0, // S1.
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
  if (!SCALE_MODES.includes(p.mode)) {
    throw new RangeError(`${fn}: mode must be one of ${SCALE_MODES.join(', ')}`);
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
  probability(fn, 'retransmitProbability', p.retransmitProbability);
  if (p.retransmitProbability === 1) {
    throw new RangeError(`${fn}: retransmitProbability must be below 1`);
  }
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
