/**
 * A shot's snapshot of the entities its brew used (spec v2 "What every shot records", D-053,
 * D-068): their ids next to their values at brew time, so editing an entity later never
 * rewrites the shot. The cup's container and the phases' states come from the phases (T2.4,
 * T2.5); their weights and the dose are the analysis's (D-079).
 */

import {
  grinderName,
  packName,
  type Basket,
  type CoffeePack,
  type Grinder,
  type Machine,
  type Recipe,
} from './entities';
import { daysBetween, localDate } from './dates';
import type { ShotMetadata } from './shot';

/** The entities a brew uses: each the last used, or null when there is none. */
export interface BrewContext {
  readonly recipe: Recipe | null;
  readonly machine: Machine | null;
  /** One of the machine's baskets. */
  readonly basket: Basket | null;
  readonly grinder: Grinder | null;
  readonly pack: CoffeePack | null;
}

/** The fields of a shot that its snapshot sets. */
export type ShotSnapshot = Pick<
  ShotMetadata,
  | 'targetRatio'
  | 'recipeId'
  | 'recipeName'
  | 'milkRatio'
  | 'machineId'
  | 'machineName'
  | 'pressureBar'
  | 'basketId'
  | 'basketSizeG'
  | 'grinderId'
  | 'grinderName'
  | 'grindSetting'
  | 'packId'
  | 'packName'
  | 'packRoastDate'
  | 'packOpenDate'
  | 'lastDescaleDate'
  | 'lastBackflushDate'
  | 'lastGrinderCareDate'
>;

/** The snapshot of a brew in this context. What the context lacks is null. */
export function shotSnapshot(context: BrewContext): ShotSnapshot {
  const { recipe, machine, basket, grinder, pack } = context;
  return {
    targetRatio: recipe?.coffeeRatio ?? null,
    recipeId: recipe?.id ?? null,
    recipeName: recipe?.name ?? null,
    milkRatio: recipe?.milkRatio ?? null,
    machineId: machine?.id ?? null,
    machineName: machine?.name ?? null,
    pressureBar: machine?.pressureBar ?? null,
    basketId: basket?.id ?? null,
    basketSizeG: basket?.sizeG ?? null,
    grinderId: grinder?.id ?? null,
    grinderName: grinder === null ? null : grinderName(grinder),
    grindSetting:
      grinder === null || grinder.currentSetting === null
        ? null
        : { kind: grinder.settingKind, value: grinder.currentSetting },
    packId: pack?.id ?? null,
    packName: pack === null ? null : packName(pack),
    packRoastDate: pack?.roastDate ?? null,
    packOpenDate: pack?.openDate ?? null,
    lastDescaleDate: machine?.descale.lastDoneDate ?? null,
    lastBackflushDate: machine?.backflush.lastDoneDate ?? null,
    lastGrinderCareDate: grinder?.care.lastDoneDate ?? null,
  };
}

/** How old a shot's coffee was, in days; null where its snapshot has no date. */
export interface PackAge {
  readonly daysOffRoast: number | null;
  readonly daysOpen: number | null;
}

/**
 * Days off roast and days open on the day a shot was pulled (T2.2), from its snapshot's pack
 * dates: derived, never stored (D-068), recorded rather than shown (D-056), for later analysis.
 * `offsetMinutes` is the time zone then, as `Date.getTimezoneOffset()` gives it (-120 for UTC+2).
 */
export function packAgeAt(
  shot: Pick<ShotMetadata, 'packRoastDate' | 'packOpenDate'>,
  atEpochMs: number,
  offsetMinutes: number,
): PackAge {
  const day = localDate(atEpochMs, offsetMinutes);
  return {
    daysOffRoast: shot.packRoastDate === null ? null : daysBetween(shot.packRoastDate, day),
    daysOpen: shot.packOpenDate === null ? null : daysBetween(shot.packOpenDate, day),
  };
}
