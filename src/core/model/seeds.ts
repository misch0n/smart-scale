/**
 * The entities a new database starts with (T2.1, D-074): the spec's target hardware (spec v2
 * "Scope and platform": a Gaggia Classic Pro with a 6-bar OPV and a 17 g La Marzocco basket, the
 * ORO Mignon and the Comandante C40), spec v2's prefilled recipes, and the tags T1.18 offered
 * (D-067). The user edits, removes and adds to them in Setup (T2.9).
 *
 * Seeds have fixed ids and times, so an untouched seed is the same record on every device and in
 * every export: an import or a restore finds it equal and adds no second Espresso, and a seed the
 * user never changed gives way to the file's version (`isPristineSeed`, `importBundle`).
 *
 * **Frozen.** Database migration 3 (`src/storage/db.ts`) and export migration 3 → 4
 * (`src/core/export/format.ts`) seed and convert from these, and migrations never change. A new
 * seed comes with a new migration, in a list of its own.
 */

import {
  createEntity,
  NO_MAINTENANCE,
  type EntityKind,
  type EntityLists,
  type EntityOf,
  type NewEntity,
  type Tag,
} from './entities';
import type { Id } from './ids';

/**
 * The seeds' creation and change time, 2026-10-05T00:00:00Z: when the list was written. Every
 * seed id carries it too.
 */
export const SEED_EPOCH_MS = Date.UTC(2026, 9, 5);

/**
 * The seeds' ids: UUIDv7s at `SEED_EPOCH_MS` (`01a1095c-3400`), counting up in the list's
 * order, so they sort as listed, with `5eed` in the random part to be told apart by eye.
 */
export const SEED_IDS = {
  gaggia: '01a1095c-3400-7000-8000-5eed00000000',
  lm17: '01a1095c-3400-7001-8000-5eed00000001',
  oro: '01a1095c-3400-7002-8000-5eed00000002',
  c40: '01a1095c-3400-7003-8000-5eed00000003',
  ristretto: '01a1095c-3400-7004-8000-5eed00000004',
  espresso: '01a1095c-3400-7005-8000-5eed00000005',
  lungo: '01a1095c-3400-7006-8000-5eed00000006',
  cortado: '01a1095c-3400-7007-8000-5eed00000007',
  cappuccino: '01a1095c-3400-7008-8000-5eed00000008',
  flatWhite: '01a1095c-3400-7009-8000-5eed00000009',
  latte: '01a1095c-3400-700a-8000-5eed0000000a',
  wdt: '01a1095c-3400-700b-8000-5eed0000000b',
  puckScreen: '01a1095c-3400-700c-8000-5eed0000000c',
  rdt: '01a1095c-3400-700d-8000-5eed0000000d',
  paperFilter: '01a1095c-3400-700e-8000-5eed0000000e',
  warmUp: '01a1095c-3400-700f-8000-5eed0000000f',
  newBasket: '01a1095c-3400-7010-8000-5eed00000010',
  experiment: '01a1095c-3400-7011-8000-5eed00000011',
} as const satisfies Record<string, Id>;

function seed<K extends EntityKind>(kind: K, input: NewEntity<K>): EntityOf<K> {
  return createEntity(kind, input, SEED_EPOCH_MS);
}

function recipe(id: Id, name: string, coffeeRatio: number, milkRatio: number | null) {
  return seed('recipes', { id, name, coffeeRatio, milkRatio });
}

function tag(id: Id, name: string, isDefault: boolean): Tag {
  return seed('tags', { id, name, group: null, isDefault });
}

/** The seeds, by kind, each list in id order. */
export const SEEDS: EntityLists = {
  machines: [
    seed('machines', {
      id: SEED_IDS.gaggia,
      name: 'Gaggia Classic Pro',
      pressureBar: 6,
      baskets: [{ id: SEED_IDS.lm17, name: 'LM 17 g', sizeG: 17 }],
      descale: NO_MAINTENANCE,
      backflush: NO_MAINTENANCE,
    }),
  ],
  grinders: [
    seed('grinders', {
      id: SEED_IDS.oro,
      brand: 'Eureka',
      model: 'ORO Mignon Single Dose Pro',
      settingKind: 'stepless',
      currentSetting: null,
      settingStep: null,
      care: NO_MAINTENANCE,
    }),
    seed('grinders', {
      id: SEED_IDS.c40,
      brand: 'Comandante',
      model: 'C40 MK4 Red Clix',
      settingKind: 'clicks',
      currentSetting: null,
      settingStep: null,
      care: NO_MAINTENANCE,
    }),
  ],
  // Spec v2 "Recipes": the prefilled list, milk to espresso.
  recipes: [
    recipe(SEED_IDS.ristretto, 'Ristretto', 1.5, null),
    recipe(SEED_IDS.espresso, 'Espresso', 2, null),
    recipe(SEED_IDS.lungo, 'Lungo', 3, null),
    recipe(SEED_IDS.cortado, 'Cortado', 2, 1),
    recipe(SEED_IDS.cappuccino, 'Cappuccino', 2, 3),
    recipe(SEED_IDS.flatWhite, 'Flat white', 2, 4),
    recipe(SEED_IDS.latte, 'Latte', 2, 6),
  ],
  packs: [],
  containers: [],
  // The design's list, WDT and Puck screen on by default (D-067).
  tags: [
    tag(SEED_IDS.wdt, 'WDT', true),
    tag(SEED_IDS.puckScreen, 'Puck screen', true),
    tag(SEED_IDS.rdt, 'RDT', false),
    tag(SEED_IDS.paperFilter, 'Paper filter', false),
    tag(SEED_IDS.warmUp, 'Warm-up < 15 min', false),
    tag(SEED_IDS.newBasket, 'New basket', false),
    tag(SEED_IDS.experiment, 'Experiment', false),
  ],
};

const SEED_BY_ID: ReadonlyMap<Id, string> = new Map(
  Object.values(SEEDS).flatMap((list: readonly { readonly id: Id }[]) =>
    list.map((entity) => [entity.id, JSON.stringify(entity)] as const),
  ),
);

/** Whether the id is a seed's. */
export function isSeedId(id: Id): boolean {
  return SEED_BY_ID.has(id);
}

/**
 * Whether the entity is a seed exactly as seeded: nobody changed it. Such an entity holds no
 * choice of the user's, so an import replaces it with the file's version whatever the policy
 * (`importBundle`): a restore onto a new database then brings back the user's edits.
 */
export function isPristineSeed(entity: { readonly id: Id }): boolean {
  const seeded = SEED_BY_ID.get(entity.id);
  // Both are normalised, with their keys in schema order, so equal entities give equal JSON.
  return seeded !== undefined && seeded === JSON.stringify(entity);
}

/** The prefilled recipe a brew uses before any was picked (D-067). */
export const DEFAULT_RECIPE_ID: Id = SEED_IDS.espresso;
