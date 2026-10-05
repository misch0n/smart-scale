/**
 * The live weight signal (T1.17): each trusted reading of the scale, made into what a display
 * can use. It is causal: every value depends only on the readings so far, as they arrive.
 *
 * - **The zero across the app's tares.** A tare the app asked for or sent shows as the reading
 *   landing on 0 in one frame (A5: a frame to 0.18 s after the command is logged). The zero
 *   takes that step, so `grossG` doesn't move. A tare that never shows (the scale in another
 *   mode, D-038) leaves the zero as it was: the display keeps its own offset rather than assume
 *   the scale zeroed.
 * - **Jumps.** A change between readings that no pour explains (a vessel put on or lifted, a
 *   knock, the scale moved off centre or lifted for the surf: hardware session 2) disturbs the
 *   signal until `quietMs` pass without one. Meanwhile the smoothed weight holds its last value
 *   and the flow leaves the disturbed readings out; afterwards both start afresh from the
 *   readings.
 * - **The smoothed weight:** an EMA (spec "Signal processing": a short EMA for a glanceable
 *   number), plus the lag an EMA has on a steady pour, so it shows a pour where it is rather
 *   than about 0.35 s behind: remaining-to-target reads 0 at the target.
 * - **The flow:** the least-squares slope of the weight over the last `flowSpanMs` of
 *   undisturbed readings, in g/s, or null without enough of them.
 * - **Stability:** the spec's test ("Tare arming"): no range of readings above the tolerance
 *   across `stableSpanMs`. The analysis applies the same rule to its own grid; the two share no
 *   state (hard rule 3).
 *
 * Times are ms on the recording's timeline (the frames' `tMs`, arrival). Display-only, like
 * everything in src/core/live: nothing here is stored.
 */

import { fitLine, mad, MAD_TO_SIGMA } from '../signal';
import { resolveLiveParams, type LiveParams } from './params';

/** One reading, as the live signal sees it. */
export interface LiveSample {
  /** Arrival, ms on the recording's timeline. */
  readonly tMs: number;
  /** The scale's reading, g. */
  readonly readingG: number;
  /** The reading plus what the app's tares took away: it doesn't move at a tare, g. */
  readonly grossG: number;
  /** `grossG` smoothed, held through a disturbance, g. */
  readonly smoothG: number;
  /** The slope of the latest undisturbed readings, g/s; null without enough of them. */
  readonly flowGps: number | null;
  /**
   * The readings' noise, σ, g; null without a slope. It is 0 on the real scale, whose readings
   * hold still (A11); a pump that shook the readings would raise it (A2).
   */
  readonly noiseG: number | null;
  /** The latest `stableSpanMs` of readings lie within the tolerance. */
  readonly stable: boolean;
  /** The mean of those readings, g (on the `grossG` scale). */
  readonly meanG: number;
  /** `meanG` while `stable`, else null, g. */
  readonly levelG: number | null;
  /** This reading jumped from the one before. */
  readonly jump: boolean;
  /** A reading jumped within the last `quietMs`, this one included. */
  readonly disturbed: boolean;
  /** How far the zero moved at this reading, for a tare of the app's that landed here, g. */
  readonly tareG: number | null;
}

/** What became of the last tare the app asked for or sent. */
export type TareOutcome = 'expected' | 'seen' | 'not-seen';

/**
 * A tenth the scale sends a hundredth short (35.09 for 35.1, D-058) still counts as that tenth
 * in the stability test, g.
 */
const SHORT_TENTH_G = 0.01;
/** Float noise in sums of hundredths, g. */
const EPSILON_G = 1e-6;

interface Reading {
  readonly tMs: number;
  readonly readingG: number;
  readonly grossG: number;
}

export class LiveWeight {
  readonly params: LiveParams;
  /** Readings within the longer of the flow and stability spans, oldest first. */
  #recent: Reading[] = [];
  #last: LiveSample | null = null;
  #zeroG = 0;
  /**
   * The last tare asked for or sent: until when its step may land, the reading it should step
   * from (null before any reading), and what became of it.
   */
  #tare: { untilMs: number; fromG: number | null; outcome: TareOutcome } | null = null;
  #lastJumpMs: number | null = null;
  #ema: number | null = null;
  /** How far, ms, the EMA trails a steady pour: grams behind = flow × this. */
  #lagMs = 0;
  /** The smoothed weight holds until the disturbance ends. */
  #holding = false;

  /** @throws RangeError on an invalid parameter. */
  constructor(params: Partial<LiveParams> = {}) {
    this.params = resolveLiveParams(params);
  }

  /** The latest sample; null before the first reading. */
  get last(): LiveSample | null {
    return this.#last;
  }

  /** What the app's tares have taken away so far: `grossG − readingG`, g. */
  get zeroG(): number {
    return this.#zeroG;
  }

  /** What became of the last tare asked for or sent; null before any. */
  get tareOutcome(): TareOutcome | null {
    return this.#tare?.outcome ?? null;
  }

  /**
   * The app has asked for a tare, or sent one (`01` or `07`), at `tMs`. Within `tareWindowMs`,
   * a reading that lands on 0 in one step from the level the scale read then is that tare, not
   * a change on the platform: the zero takes the step.
   */
  expectTare(tMs: number): void {
    // The level of the latest half second, unless a jump makes it meaningless.
    const last = this.#last;
    const fromG = last === null ? null : (last.disturbed ? last.grossG : last.meanG) - this.#zeroG;
    this.#tare = { untilMs: tMs + this.params.tareWindowMs, fromG, outcome: 'expected' };
  }

  /** Forgets every reading and tare, as for a new recording. */
  reset(): void {
    this.#recent = [];
    this.#last = null;
    this.#zeroG = 0;
    this.#tare = null;
    this.#lastJumpMs = null;
    this.#ema = null;
    this.#lagMs = 0;
    this.#holding = false;
  }

  /**
   * Adds a trusted reading (`hasTrustedWeight`), in arrival order. A time earlier than the last
   * one's is taken as the last one's (a transport delivers in order, D-020).
   */
  add(arrivalMs: number, readingG: number): LiveSample {
    const p = this.params;
    const previous = this.#last;
    const tMs = previous === null ? arrivalMs : Math.max(arrivalMs, previous.tMs);

    const tareG = this.#tareAt(tMs, readingG, previous);
    if (tareG !== null) this.#zeroG += tareG;
    const grossG = readingG + this.#zeroG;

    const dtMs = previous === null ? 0 : tMs - previous.tMs;
    const jump =
      previous !== null &&
      Math.abs(grossG - previous.grossG) > p.jumpG + (p.maxFlowGps * dtMs) / 1000 + EPSILON_G;
    if (jump) this.#lastJumpMs = tMs;
    const disturbed = this.#lastJumpMs !== null && tMs - this.#lastJumpMs < p.quietMs;

    this.#recent.push({ tMs, readingG, grossG });
    const keepFromMs = tMs - Math.max(p.flowSpanMs, p.stableSpanMs);
    let drop = 0;
    while (drop < this.#recent.length && this.#recent[drop].tMs <= keepFromMs) drop++;
    if (drop > 0) this.#recent.splice(0, drop);

    const { stable, meanG } = this.#stability(tMs);
    const { flowGps, noiseG } = this.#flow(tMs);
    const smoothG = this.#smooth(grossG, dtMs, jump, disturbed, flowGps, previous);

    const sample: LiveSample = {
      tMs,
      readingG,
      grossG,
      smoothG,
      flowGps,
      noiseG,
      stable,
      meanG,
      levelG: stable ? meanG : null,
      jump,
      disturbed,
      tareG,
    };
    this.#last = sample;
    return sample;
  }

  /**
   * The least a change must be to stand out of the noise: `leastG`, or `noiseSigmas` times the
   * noise of `sample`'s readings, whichever is more, g.
   */
  clearOfNoiseG(leastG: number, sample: LiveSample | null): number {
    return Math.max(leastG, this.params.noiseSigmas * (sample?.noiseG ?? 0));
  }

  /**
   * The zero's step if the app's expected tare lands on this reading: in one step clear of the
   * noise, from the level the scale read when the tare was asked for, to 0. A tare asked for at
   * about 0 (the cup already tared, as at the Tare + start tap) has nothing to show, so nothing
   * is looked for: the pump starting to shake the readings then can't pass for it.
   */
  #tareAt(tMs: number, readingG: number, previous: LiveSample | null): number | null {
    const tare = this.#tare;
    if (tare === null || tare.outcome !== 'expected') return null;
    if (tMs > tare.untilMs) {
      tare.outcome = 'not-seen';
      return null;
    }
    const zeroG = this.clearOfNoiseG(this.params.tareZeroG, previous) + EPSILON_G;
    if (tare.fromG !== null && Math.abs(tare.fromG) <= zeroG) {
      tare.outcome = 'seen';
      return null;
    }
    if (
      previous === null ||
      (tare.fromG !== null && Math.abs(previous.readingG - tare.fromG) > zeroG) ||
      Math.abs(readingG) > zeroG ||
      Math.abs(previous.readingG - readingG) <= zeroG
    ) {
      return null;
    }
    tare.outcome = 'seen';
    return previous.readingG - readingG;
  }

  #stability(tMs: number): { stable: boolean; meanG: number } {
    const p = this.params;
    const fromMs = tMs - p.stableSpanMs;
    let count = 0;
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    for (let i = this.#recent.length - 1; i >= 0 && this.#recent[i].tMs > fromMs; i--) {
      const g = this.#recent[i].grossG;
      count++;
      sum += g;
      if (g < min) min = g;
      if (g > max) max = g;
    }
    const stable =
      count >= p.stableMinFrames && max - min <= p.stableToleranceG + SHORT_TENTH_G + EPSILON_G;
    return { stable, meanG: sum / count };
  }

  /**
   * The slope of the readings since the last jump, within the flow span, g/s, and their noise:
   * σ from the median absolute deviation of the steps between readings, which neither a steady
   * pour nor a single step (a drop landing) moves, g.
   */
  #flow(tMs: number): { flowGps: number | null; noiseG: number | null } {
    const p = this.params;
    const fromMs = Math.max(tMs - p.flowSpanMs, this.#lastJumpMs ?? -Infinity);
    const readings = this.#recent.filter((reading) => reading.tMs > fromMs);
    const count = readings.length;
    if (count < p.flowMinFrames || readings[count - 1].tMs - readings[0].tMs < p.flowMinSpanMs) {
      return { flowGps: null, noiseG: null };
    }
    const fit = fitLine(
      readings.map((reading) => reading.tMs / 1000),
      readings.map((reading) => reading.grossG),
    );
    const steps = readings.slice(1).map((reading, i) => reading.grossG - readings[i].grossG);
    return {
      flowGps: fit.slope,
      noiseG: steps.length >= 3 ? (MAD_TO_SIGMA * mad(steps)) / Math.SQRT2 : null,
    };
  }

  /**
   * The EMA, plus how far it trails the pour: on a ramp of slope s, an EMA seeded on the ramp
   * trails it by s × lag, where lag starts at 0 and follows lag ← (1 − α)(lag + dt), the EMA's
   * own recursion (α = 1 − e^(−dt/τ)); it settles near τ − dt/2. Through a disturbance it holds;
   * once that ends, it starts again from the reading.
   */
  #smooth(
    grossG: number,
    dtMs: number,
    jump: boolean,
    disturbed: boolean,
    flowGps: number | null,
    previous: LiveSample | null,
  ): number {
    if (jump) this.#holding = true;
    if (this.#holding && disturbed && previous !== null) return previous.smoothG;
    if (this.#holding || this.#ema === null) {
      this.#holding = false;
      this.#ema = grossG;
      this.#lagMs = 0;
    } else {
      const keep = Math.exp(-dtMs / this.params.emaTauMs);
      this.#ema += (1 - keep) * (grossG - this.#ema);
      this.#lagMs = keep * (this.#lagMs + dtMs);
    }
    return this.#ema + ((flowGps ?? 0) * this.#lagMs) / 1000;
  }
}
