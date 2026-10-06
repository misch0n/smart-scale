/**
 * When the app tares the scale beyond each cup's own tare (T2.20; the user's rule, Q33, D-094):
 * "tare the scale at the beginning of each phase, if there is no weight or only negative weight
 * there", and wherever it helps. The scale's own display is the user's reference while pouring,
 * so it should show what the app shows.
 *
 * - **Nothing on the scale** (no vessel: a scale accessory is part of the platform) and a steady
 *   reading that isn't 0: a cup lifted off a scale tared with it reads negative; a mat the scale
 *   wasn't zeroed with reads its weight. Tared, the next container goes on from 0.
 * - **An empty vessel that reads its own weight:** one put on while no screen could tare it, as
 *   with Home showing (session 4).
 *
 * Never while the weight moves, and never for a vessel holding what the phase weighs (beans
 * poured into it, the bean cup back with its grounds): the scale shows that, as the app does.
 * When to look is the caller's: at a phase's start, as the brew screen opens, in Setup.
 */

/** What the scale and the vessel on it are doing, as the tare rule sees them. */
export interface TareCheck {
  /** The scale's latest trusted reading, g; null before one. */
  readonly readingG: number | null;
  /** The latest readings hold still. */
  readonly stable: boolean;
  /** A vessel is on the scale. */
  readonly vesselOn: boolean;
  /** What the vessel on holds for the open phase, g: poured in, or carried back in it. */
  readonly holdsG: number;
}

/** Less than this in the vessel is nothing in it, g (the phases' `minResultG`). */
export const HOLDS_NOTHING_G = 0.3;

/** Whether the scale wants a tare now: see the module's rules. `zeroG`: a reading this near 0 is 0. */
export function wantsTare(check: TareCheck, zeroG: number): boolean {
  const { readingG, stable, vesselOn, holdsG } = check;
  if (readingG === null || !stable || Math.abs(readingG) <= zeroG) return false;
  return !vesselOn || holdsG < HOLDS_NOTHING_G;
}
