/**
 * Containers that could be mistaken for each other (spec v2 "Brew phases", "Containers"; T2.4,
 * T2.9): the scale recognises a container by its empty mass, so two that weigh the same are a
 * conflict the user must resolve, and two within 3 g get a warning they can dismiss, since a wet
 * container weighs more. The scale reads tenths (D-037), so "the same" is within half a tenth.
 */

import { isListed, type Container } from './entities';

/** Containers closer than this weigh the same, g: the scale can't tell them apart. */
export const SAME_MASS_G = 0.05;

/** Containers closer than this may be mistaken, g: a wet one weighs more. */
export const NEAR_MASS_G = 3;

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
