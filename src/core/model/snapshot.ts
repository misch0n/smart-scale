/**
 * A shot's snapshot of the entities its brew used (spec v2 "What every shot records", D-053,
 * D-068): their ids next to their values at brew time, so editing an entity later never
 * rewrites the shot. The phases' results and the cup's container come from the phases (T2.4–
 * T2.11), and the dose from the extraction screen until then (D-067).
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
