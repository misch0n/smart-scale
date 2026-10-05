/**
 * The live pipeline's parameters, with their defaults (T1.17). They tune a display: nothing they
 * decide is stored, and the analysis has its own (hard rule 3). Values that depend on real shots
 * are provisional until more of them are recorded (D-029): each names its hardware test.
 */

import { MIN_CONTAINER_G } from '../model';

export interface LiveParams {
  /** The weight's EMA: its time constant, ms (T1.17: about 0.3–0.5 s). */
  readonly emaTauMs: number;
  /** Flow: the slope of the weight over this much of the latest readings, ms (about 1 s). */
  readonly flowSpanMs: number;
  /** Flow: the readings since the last jump must span at least this, ms, or there is none. */
  readonly flowMinSpanMs: number;
  /** Flow: and number at least this many. */
  readonly flowMinFrames: number;
  /** Stability: the window, ms (spec "Tare arming": 0.5 s). */
  readonly stableSpanMs: number;
  /**
   * Stability: the largest range of readings a stable window may show, g. The spec's 0.05 g,
   * widened to the scale's step: 0.1 g readings that flicker between neighbours span one (A11),
   * as in the analysis.
   */
  readonly stableToleranceG: number;
  /** Stability: the window must hold at least this many readings (five at 10 Hz). */
  readonly stableMinFrames: number;
  /**
   * Jumps: readings that differ by more than this, plus `maxFlowGps` times the time between
   * them, are a jump no pour explains: a vessel put on or lifted, a knock, the scale moved or
   * lifted (A2: no vibration; the analysis's `jumpG`).
   */
  readonly jumpG: number;
  /** Jumps: faster than an espresso flows, g/s (real shots, at most 5.5 g/s; D-048). */
  readonly maxFlowGps: number;
  /** A disturbance lasts until no reading has jumped for this long, ms. */
  readonly quietMs: number;
  /**
   * A tare's step and a first drip must stand this many σ of the readings' noise clear of it, as
   * well as their own minimum: the real scale's readings hold still (A11), but a scale or machine
   * whose pump shakes the readings would otherwise fake both.
   */
  readonly noiseSigmas: number;
  /**
   * Tares: the app's tare lands within this long of being asked for or sent, ms (A5: one frame
   * to 0.18 s after the command is logged).
   */
  readonly tareWindowMs: number;
  /** Tares: and the reading lands within this of 0, g: a step's flicker (A11). */
  readonly tareZeroG: number;
  /** A stable rise of at least this is a vessel put on, g (the analysis's `minVesselG`). */
  readonly cupMinG: number;
  /**
   * What is on the scale (`VesselMonitor`, T2.4): with nothing on, a stable rise of at least
   * this is a vessel put on, g: the least a container may weigh (`MIN_CONTAINER_G`).
   */
  readonly vesselMinG: number;
  /**
   * A vessel's mass settles for this long after it is put on, ms: the scale's own smoothing
   * brings the reading up over a second or two (the simulator's 109.8 g for 110 g), and later
   * stable levels this close to it (`vesselSettleG`) are the vessel still settling.
   */
  readonly vesselSettleMs: number;
  /** A later stable level within this of the vessel's is it settling, not contents, g. */
  readonly vesselSettleG: number;
  /**
   * After a shot, a vessel put back within this of the level it was lifted from is the same
   * cup: no tare, the shot stays (spec v2: a lift is a pause), g.
   */
  readonly cupBackG: number;
  /**
   * First drip: two readings running at least this above the level before them, g. Hardware
   * session 2's first drops landed as lumps of 0.2 g.
   */
  readonly dripG: number;
  /**
   * First drip: none this soon after the pump start, ms. Water fills the group and the puck
   * first (hardware session 2: 3.3 and 3.7 s), and a pump that shook the readings would fake
   * one while the noise estimate catches up with it.
   */
  readonly minPreInfusionMs: number;
  /**
   * First drip: a tap with none this long after it wasn't the pump starting a shot, ms (the
   * analysis's `manualStartS`): the view goes back to waiting, quietly (D-049).
   */
  readonly maxPreInfusionMs: number;
  /**
   * Tail: none before this much has poured, g. A slow start comes in drops, and the reading can
   * hold still between them (hardware session 2, shot B: 0.6 s at 1 g).
   */
  readonly minPourG: number;
  /** Tail: the pour must have flowed at least this fast before it can end, g/s. */
  readonly minPourFlowGps: number;
  /** Tail: it starts once the flow falls below this share of the pour's fastest. */
  readonly tailFlowRatio: number;
  /** Tail: it was a dip, not the end, if the flow comes back above this share. */
  readonly resumeFlowRatio: number;
  /** Tail: when the pour ended is fitted to this much of the latest readings, ms. */
  readonly pourEndSpanMs: number;
  /** Past the target by more than this, the display warns (spec v2 "Live display": 1.0 g). */
  readonly overMarginG: number;
  /** The graph keeps at most this many points: five minutes at 10 Hz. */
  readonly maxSeriesPoints: number;
}

export const DEFAULT_LIVE_PARAMS: LiveParams = {
  emaTauMs: 400,
  flowSpanMs: 1000,
  flowMinSpanMs: 400,
  flowMinFrames: 4,
  stableSpanMs: 500,
  stableToleranceG: 0.1,
  stableMinFrames: 4,
  jumpG: 1,
  maxFlowGps: 5,
  quietMs: 500,
  noiseSigmas: 4,
  tareWindowMs: 1000,
  tareZeroG: 0.15,
  cupMinG: 20,
  vesselMinG: MIN_CONTAINER_G,
  vesselSettleMs: 3000, // PROVISIONAL(U1.1: K1)
  vesselSettleG: 0.5, // PROVISIONAL(U1.1: K1)
  cupBackG: 2, // PROVISIONAL(U1.1: C3)
  dripG: 0.15, // PROVISIONAL(U1.1: C3)
  minPreInfusionMs: 1000,
  maxPreInfusionMs: 15_000, // PROVISIONAL(U1.1: C3)
  minPourG: 5, // PROVISIONAL(U1.1: C3)
  minPourFlowGps: 0.5, // PROVISIONAL(U1.1: C3)
  tailFlowRatio: 0.25, // PROVISIONAL(U1.1: C3)
  resumeFlowRatio: 0.5, // PROVISIONAL(U1.1: C3)
  pourEndSpanMs: 2000,
  overMarginG: 1,
  maxSeriesPoints: 3000,
};

/** Parameters that may be 0: warn at any excess; a first drip at once. */
const ZERO_ALLOWED: ReadonlySet<string> = new Set(['overMarginG', 'minPreInfusionMs']);
/** Parameters that count readings or points. */
const COUNTS: ReadonlySet<string> = new Set([
  'flowMinFrames',
  'stableMinFrames',
  'maxSeriesPoints',
]);

/**
 * The defaults with `overrides` applied (an `undefined` value keeps the default), validated.
 *
 * @throws RangeError on an unknown name; a value that isn't a finite number above 0 (at least 0
 *   for `overMarginG` and `minPreInfusionMs`); a count that isn't a whole number (at least 2
 *   flow readings, for a slope); or tail shares that aren't 0 < tail < resume ≤ 1.
 */
export function resolveLiveParams(overrides: Partial<LiveParams> = {}): LiveParams {
  const params: Record<string, number> = { ...DEFAULT_LIVE_PARAMS };
  for (const [name, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(DEFAULT_LIVE_PARAMS, name)) {
      throw new RangeError(`live params: unknown parameter ${name}`);
    }
    if (value !== undefined) params[name] = value;
  }
  for (const [name, value] of Object.entries(params)) {
    const zeroAllowed = ZERO_ALLOWED.has(name);
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0 ||
      (value === 0 && !zeroAllowed)
    ) {
      throw new RangeError(
        `live params: ${name} ${value} is not a finite number ${zeroAllowed ? 'at least 0' : 'above 0'}`,
      );
    }
    if (COUNTS.has(name) && !Number.isInteger(value)) {
      throw new RangeError(`live params: ${name} ${value} is not a whole number`);
    }
  }
  const p = params as unknown as LiveParams;
  if (p.flowMinFrames < 2) {
    throw new RangeError(`live params: flowMinFrames ${p.flowMinFrames} is fewer than 2`);
  }
  if (!(p.tailFlowRatio < p.resumeFlowRatio && p.resumeFlowRatio <= 1)) {
    throw new RangeError(
      `live params: tailFlowRatio ${p.tailFlowRatio} and resumeFlowRatio ${p.resumeFlowRatio} ` +
        'are not 0 < tail < resume ≤ 1',
    );
  }
  return p;
}
