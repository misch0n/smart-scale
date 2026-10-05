/**
 * Containers by their mass (spec v2 "Brew phases", "Containers"; T2.4, T2.9): the scale
 * recognises a container by its empty mass.
 *
 * - **Clashes:** two that weigh the same are a conflict the user must resolve, and two within
 *   3 g get a warning they can dismiss, since a wet container weighs more. The scale reads
 *   tenths (D-037), so "the same" is within half a tenth.
 * - **Matching** (`matchContainer`): what a vessel put on weighed, against the containers. It
 *   may read a little light (the scale's steps) or up to 3 g heavy (wet). The nearest wins when
 *   it is clearly the nearest; anything else is for the user to pick. Shared by the live
 *   display (`src/app/live-vessel.ts`) and the analysis's labels, which never share state.
 */

import { isListed, type Container } from './entities';

/** Containers closer than this weigh the same, g: the scale can't tell them apart. */
export const SAME_MASS_G = 0.05;

/** Containers closer than this may be mistaken, g: a wet one weighs more. */
export const NEAR_MASS_G = 3;

/**
 * The least a container may weigh, g: lighter, the scale can't tell it from a hand resting on
 * the platform. Setup refuses to learn one, and the live display doesn't look for one.
 */
export const MIN_CONTAINER_G = 3;

/**
 * A container put on may read this much below its learned mass and still be it, g: the scale's
 * 0.1 g steps and its zero, which hardly moves (D-037).
 */
export const MATCH_BELOW_G = 0.3; // PROVISIONAL(U1.1: K2)

/** And this much above: a wet container weighs more (the band of the "within 3 g" warning). */
export const MATCH_ABOVE_G = NEAR_MASS_G;

/**
 * Of two containers a reading could be, the nearer wins only when it is nearer by more than
 * this, g: a step and a half of the scale's. Closer than that, the user picks.
 */
export const CLEARLY_NEARER_G = 0.15;

/** What a vessel put on is, by its mass. */
export type ContainerMatch =
  /** The one container it is: the only one it could be, or clearly the nearest. */
  | { readonly kind: 'known'; readonly container: Container }
  /** Two or more it could be, none clearly nearer: the user picks. Nearest first. */
  | { readonly kind: 'ambiguous'; readonly candidates: readonly Container[] }
  /** No container weighs about that. */
  | { readonly kind: 'unknown' };

/**
 * Which listed container weighs about `massG`: those within `MATCH_BELOW_G` below and
 * `MATCH_ABOVE_G` above their learned mass, the nearest first; the nearest is the one when no
 * other is within `CLEARLY_NEARER_G` of its distance.
 */
export function matchContainer(massG: number, containers: readonly Container[]): ContainerMatch {
  const near = containers
    .filter(isListed)
    .map((container) => ({ container, offG: massG - container.emptyMassG }))
    .filter(({ offG }) => offG >= -MATCH_BELOW_G - 1e-9 && offG <= MATCH_ABOVE_G + 1e-9)
    .sort(
      (x, y) => Math.abs(x.offG) - Math.abs(y.offG) || (x.container.id < y.container.id ? -1 : 1),
    );
  if (near.length === 0) return { kind: 'unknown' };
  const nearest = Math.abs(near[0].offG);
  const close = near.filter(({ offG }) => Math.abs(offG) - nearest <= CLEARLY_NEARER_G + 1e-9);
  return close.length === 1
    ? { kind: 'known', container: close[0].container }
    : { kind: 'ambiguous', candidates: close.map(({ container }) => container) };
}

/** Two listed containers too close in mass. */
export interface ContainerClash {
  /** The lighter of the two (by id when they weigh the same). */
  readonly a: Container;
  readonly b: Container;
  /** `b`'s mass less `a`'s, g, rounded to tenths. */
  readonly gapG: number;
  /** `same`: a conflict to resolve; `near`: a warning. */
  readonly kind: 'same' | 'near';
  /** A `near` warning the user dismissed, with either container's; never for `same`. */
  readonly dismissed: boolean;
}

/** Every pair of listed containers too close in mass, the closest first. */
export function containerClashes(containers: readonly Container[]): ContainerClash[] {
  const listed = containers
    .filter(isListed)
    .sort((x, y) => x.emptyMassG - y.emptyMassG || (x.id < y.id ? -1 : 1));
  const clashes: ContainerClash[] = [];
  for (let i = 0; i < listed.length; i++) {
    for (let j = i + 1; j < listed.length; j++) {
      const a = listed[i];
      const b = listed[j];
      const gap = b.emptyMassG - a.emptyMassG;
      if (gap >= NEAR_MASS_G) break;
      const kind = gap < SAME_MASS_G ? 'same' : 'near';
      clashes.push({
        a,
        b,
        gapG: Math.round(gap * 10) / 10,
        kind,
        dismissed:
          kind === 'near' &&
          (a.dismissedWarningIds.includes(b.id) || b.dismissedWarningIds.includes(a.id)),
      });
    }
  }
  return clashes.sort((x, y) => x.gapG - y.gapG);
}

/** The clashes the user still has to see: conflicts, and warnings not dismissed. */
export function openClashes(containers: readonly Container[]): ContainerClash[] {
  return containerClashes(containers).filter((clash) => !clash.dismissed);
}
