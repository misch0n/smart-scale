/**
 * What sits on the platform, as a noise-free mass in grams: at most one vessel with its
 * contents, liquid that landed with no vessel there, and the transients of putting down,
 * lifting and bumping. Liquid lands in whatever is on the platform at that moment, so a cup
 * lifted during the tail leaves the later drips on the bare platform, as on the real scale.
 *
 * Time only moves forward: every call takes a time no earlier than the last one.
 */

import type { BumpEvent } from './script';
import { deliveredG, type ShotModel } from './shot';

interface Vessel {
  /** The vessel and what it held when put down, g. The scale shows it settling in. */
  readonly placedG: number;
  readonly placedAtMs: number;
  /** Liquid that has landed in it since, g. */
  liquidG: number;
}

/** A vessel's force fading from the scale after it was lifted. */
interface Lift {
  readonly forceG: number;
  readonly atMs: number;
}

/** A transient is dropped once it has decayed for this many time constants. */
const TRANSIENT_HORIZON_TAUS = 50;

export class WeighingPlatform {
  readonly #shots: readonly ShotModel[];
  readonly #bumps: readonly BumpEvent[];
  readonly #settleTauMs: number;
  readonly #dropG: number;
  #vessel: Vessel | null = null;
  /** The vessel lifted last, everything it held included, for `cup-back`. */
  #liftedG: number | null = null;
  #lifts: Lift[] = [];
  /** Liquid that landed with no vessel on the platform, g. */
  #spillG = 0;
  #nowMs = 0;
  /** All liquid delivered by `#nowMs`, g. */
  #deliveredG = 0;

  constructor(
    shots: readonly ShotModel[],
    bumps: readonly BumpEvent[],
    settleTauMs: number,
    dropG: number,
  ) {
    this.#shots = shots;
    this.#bumps = bumps;
    this.#settleTauMs = settleTauMs;
    this.#dropG = dropG;
  }

  /** Whether a vessel is on the platform. */
  get hasVessel(): boolean {
    return this.#vessel !== null;
  }

  /** The noise-free mass on the platform at `tMs`, g. */
  grossG(tMs: number): number {
    this.#advance(tMs);
    let mass = this.#spillG;
    const vessel = this.#vessel;
    if (vessel) mass += vessel.placedG * this.#settled(tMs - vessel.placedAtMs) + vessel.liquidG;
    for (const lift of this.#lifts) mass += lift.forceG * (1 - this.#settled(tMs - lift.atMs));
    for (const bump of this.#bumps) {
      const into = tMs - bump.atMs;
      if (into >= 0 && into < bump.durationMs) {
        mass += bump.peakG * Math.sin((Math.PI * into) / bump.durationMs);
      }
    }
    return mass;
  }

  /** A vessel of `massG` holding `contentsG` is put on the empty platform. */
  place(tMs: number, massG: number, contentsG: number): void {
    this.#advance(tMs);
    if (this.#vessel) throw new Error(`WeighingPlatform: a vessel is already on at ${tMs} ms`);
    this.#vessel = { placedG: massG + contentsG, placedAtMs: tMs, liquidG: 0 };
  }

  /** The vessel is lifted off with everything in it. */
  lift(tMs: number): void {
    this.#advance(tMs);
    const vessel = this.#vessel;
    if (!vessel) throw new Error(`WeighingPlatform: no vessel to lift at ${tMs} ms`);
    const forceG = vessel.placedG * this.#settled(tMs - vessel.placedAtMs) + vessel.liquidG;
    this.#lifts.push({ forceG, atMs: tMs });
    this.#liftedG = vessel.placedG + vessel.liquidG;
    this.#vessel = null;
  }

  /** The vessel lifted last goes back on, holding what it held. */
  placeBack(tMs: number): void {
    if (this.#liftedG === null)
      throw new Error(`WeighingPlatform: nothing to put back at ${tMs} ms`);
    this.place(tMs, this.#liftedG, 0);
    this.#liftedG = null;
  }

  /** Routes the liquid delivered since the last call to whatever is on the platform. */
  #advance(tMs: number): void {
    if (tMs < this.#nowMs) {
      throw new RangeError(`WeighingPlatform: time went back from ${this.#nowMs} to ${tMs} ms`);
    }
    let delivered = 0;
    for (const shot of this.#shots) delivered += deliveredG(shot, tMs, this.#dropG);
    const landed = delivered - this.#deliveredG;
    if (this.#vessel) this.#vessel.liquidG += landed;
    else this.#spillG += landed;
    this.#deliveredG = delivered;
    this.#nowMs = tMs;
    this.#lifts = this.#lifts.filter(
      (lift) => tMs - lift.atMs < TRANSIENT_HORIZON_TAUS * this.#settleTauMs,
    );
  }

  /** How far a vessel put down `elapsedMs` ago has settled in: 0 at first, then towards 1. */
  #settled(elapsedMs: number): number {
    if (this.#settleTauMs === 0) return 1;
    return 1 - Math.exp(-elapsedMs / this.#settleTauMs);
  }
}
