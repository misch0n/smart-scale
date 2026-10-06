/**
 * What sits on the platform, as a noise-free mass in grams: at most one vessel with its
 * contents, liquid that landed with no vessel there, the transients of putting down, lifting
 * and bumping, a press on the tare button, and scale accessories under it all (a mat, which
 * stays, T2.17). Liquid lands in whatever is on the platform at
 * that moment, so a cup lifted during the tail leaves the later drips on the bare platform, as
 * on the real scale.
 *
 * Time only moves forward: every call takes a time no earlier than the last one.
 */

import type { BumpEvent, ButtonPress } from './script';
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
  /** Each press on the tare button, and when it was let go (`release`), or null. */
  readonly #presses: { readonly press: ButtonPress; releasedMs: number | null }[];
  readonly #settleTauMs: number;
  readonly #dropG: number;
  #vessel: Vessel | null = null;
  /** The scale accessories put on, each settling in as a vessel does. */
  readonly #mats: { readonly placedG: number; readonly placedAtMs: number }[] = [];
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
    presses: readonly ButtonPress[] = [],
  ) {
    this.#shots = shots;
    this.#bumps = bumps;
    this.#presses = presses.map((press) => ({ press, releasedMs: null }));
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
    for (const mat of this.#mats) mass += mat.placedG * this.#settled(tMs - mat.placedAtMs);
    for (const lift of this.#lifts) mass += lift.forceG * (1 - this.#settled(tMs - lift.atMs));
    for (const bump of this.#bumps) {
      const into = tMs - bump.atMs;
      if (into >= 0 && into < bump.durationMs) {
        mass += bump.peakG * Math.sin((Math.PI * into) / bump.durationMs);
      }
    }
    for (const { press, releasedMs } of this.#presses) {
      if (tMs >= press.fromMs && (releasedMs === null || tMs < releasedMs)) mass += press.pressG;
    }
    return mass;
  }

  /** The scale takes a tare at `tMs`: every press on its button let go by then stops weighing. */
  release(tMs: number): void {
    this.#advance(tMs);
    for (const entry of this.#presses) {
      if (entry.releasedMs === null && entry.press.atMs <= tMs) entry.releasedMs = tMs;
    }
  }

  /** A vessel of `massG` holding `contentsG` is put on the empty platform. */
  place(tMs: number, massG: number, contentsG: number): void {
    this.#advance(tMs);
    if (this.#vessel) throw new Error(`WeighingPlatform: a vessel is already on at ${tMs} ms`);
    this.#vessel = { placedG: massG + contentsG, placedAtMs: tMs, liquidG: 0 };
  }

  /** A scale accessory of `massG` goes on, under any vessel to come, and stays. */
  placeMat(tMs: number, massG: number): void {
    this.#advance(tMs);
    if (this.#vessel) throw new Error(`WeighingPlatform: a vessel is on at ${tMs} ms`);
    this.#mats.push({ placedG: massG, placedAtMs: tMs });
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
