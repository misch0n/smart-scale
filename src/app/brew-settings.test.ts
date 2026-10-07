import { describe, expect, it } from 'vitest';
import {
  createEntity,
  emptyEntityLists,
  NO_MAINTENANCE,
  SEED_IDS,
  SEEDS,
  updateEntity,
  type EntityLists,
  type JsonValue,
} from '../core/model';
import {
  BrewPreferences,
  clampDose,
  defaultTagNames,
  resolveBrewSettings,
  SETTING_KEYS,
  tagName,
  type SettingsStore,
} from './brew-settings';
import { Entities } from './entities';
import { MemoryEntityStore } from './fake-entities';

const NOW = Date.UTC(2026, 9, 6, 7, 0);

/** A `kv` store in memory, which can be told to fail. */
class MemoryStore implements SettingsStore {
  readonly values = new Map<string, JsonValue>();
  failReads = false;
  failWrites = false;

  get(key: string): Promise<JsonValue | undefined> {
    if (this.failReads) return Promise.reject(new Error('read failed'));
    return Promise.resolve(this.values.get(key));
  }

  set(key: string, value: JsonValue): Promise<void> {
    if (this.failWrites) return Promise.reject(new Error('disk full'));
    this.values.set(key, value);
    return Promise.resolve();
  }
}

const removed = <T extends { readonly removedAtEpochMs: number | null }>(entity: T): T => ({
  ...entity,
  removedAtEpochMs: NOW,
});

const SECOND_MACHINE = createEntity(
  'machines',
  {
    name: 'Lelit Bianca',
    pressureBar: 9,
    baskets: [
      { id: '01a1095c-3400-7aaa-8000-000000000001', name: null, sizeG: 18 },
      { id: '01a1095c-3400-7aaa-8000-000000000002', name: 'Single', sizeG: 9 },
    ],
    descale: NO_MAINTENANCE,
    backflush: NO_MAINTENANCE,
  },
  NOW,
);

const PACK = createEntity(
  'packs',
  {
    brand: 'Local roaster',
    name: 'Ethiopia Guji · Natural',
    weightG: 250,
    roastDate: '2026-09-22',
    openDate: '2026-09-26',
    flavours: [],
    finishedDate: null,
    buyAgain: null,
  },
  NOW,
);

describe('resolveBrewSettings', () => {
  it('is Espresso, 18 g, the seeded machine, basket and grinder, and no pack, at first', () => {
    const settings = resolveBrewSettings(SEEDS, {});
    expect(settings.recipe.name).toBe('Espresso');
    expect(settings.recipes).toEqual(SEEDS.recipes);
    expect(settings.doseG).toBe(18);
    expect(settings.tags).toEqual(SEEDS.tags);
    expect(defaultTagNames(settings.tags)).toEqual(['WDT', 'Puck screen']);
    expect(settings.machine?.name).toBe('Gaggia Classic Pro');
    expect(settings.basket).toEqual({ id: SEED_IDS.lm17, name: 'LM 17 g', sizeG: 17 });
    expect(settings.grinder?.model).toBe('ORO Mignon Single Dose Pro');
    expect(settings.pack).toBeNull();
  });

  it('uses what was last used', () => {
    const entities: EntityLists = {
      ...SEEDS,
      machines: [...SEEDS.machines, SECOND_MACHINE],
      packs: [PACK],
    };
    const settings = resolveBrewSettings(entities, {
      recipeId: SEED_IDS.cappuccino,
      doseG: 16.9,
      machineId: SECOND_MACHINE.id,
      basketId: SECOND_MACHINE.baskets[1].id,
      grinderId: SEED_IDS.c40,
      packId: PACK.id,
    });
    expect(settings.recipe).toEqual(SEEDS.recipes[4]);
    expect(settings.doseG).toBe(16.9);
    expect(settings.machine).toEqual(SECOND_MACHINE);
    expect(settings.basket).toEqual(SECOND_MACHINE.baskets[1]);
    expect(settings.grinder).toEqual(SEEDS.grinders[1]);
    expect(settings.pack).toEqual(PACK);
  });

  it('falls back when the last used is gone, removed, or another machine’s basket', () => {
    const entities: EntityLists = {
      ...SEEDS,
      recipes: SEEDS.recipes.map((recipe) =>
        recipe.id === SEED_IDS.cappuccino ? removed(recipe) : recipe,
      ),
      machines: [...SEEDS.machines, removed(SECOND_MACHINE)],
      grinders: [removed(SEEDS.grinders[0]), SEEDS.grinders[1]],
      packs: [{ ...PACK, finishedDate: '2026-10-05' }],
      tags: SEEDS.tags.map((tag) => (tag.id === SEED_IDS.rdt ? removed(tag) : tag)),
    };
    const settings = resolveBrewSettings(entities, {
      recipeId: SEED_IDS.cappuccino,
      machineId: SECOND_MACHINE.id,
      basketId: SECOND_MACHINE.baskets[0].id,
      grinderId: SEED_IDS.oro,
      packId: PACK.id,
    });
    expect(settings.recipe.name).toBe('Espresso');
    expect(settings.recipes).toHaveLength(6);
    expect(settings.machine?.id).toBe(SEED_IDS.gaggia);
    expect(settings.basket?.id).toBe(SEED_IDS.lm17);
    expect(settings.grinder?.id).toBe(SEED_IDS.c40);
    // A finished pack: the next one is unknown until picked.
    expect(settings.pack).toBeNull();
    expect(settings.tags.map((tag) => tag.name)).not.toContain('RDT');
  });

  it('keeps a recipe when every one is gone, and has no equipment when none is listed', () => {
    const settings = resolveBrewSettings(emptyEntityLists(), { recipeId: 'Mocha', doseG: '18' });
    expect(settings.recipe).toEqual(SEEDS.recipes[1]);
    expect(settings.recipes).toEqual([]);
    expect(settings.doseG).toBe(18);
    expect([settings.machine, settings.basket, settings.grinder, settings.pack]).toEqual([
      null,
      null,
      null,
      null,
    ]);
    const noBaskets = { ...SEEDS.machines[0], baskets: [] };
    expect(resolveBrewSettings({ ...SEEDS, machines: [noBaskets] }, {}).basket).toBeNull();
  });

  it('takes the first listed recipe once Espresso is gone', () => {
    const recipes = SEEDS.recipes.filter((recipe) => recipe.id !== SEED_IDS.espresso);
    expect(resolveBrewSettings({ ...SEEDS, recipes }, {}).recipe.name).toBe('Ristretto');
  });

  it('keeps the dose within its limits, in tenths', () => {
    expect(resolveBrewSettings(SEEDS, { doseG: 17.04 }).doseG).toBe(17);
    expect(resolveBrewSettings(SEEDS, { doseG: 300 }).doseG).toBe(30);
    expect(clampDose(-1)).toBe(5);
    expect(clampDose(Number.NaN)).toBe(18);
  });
});

describe('tagName', () => {
  it('trims, single-spaces and caps a name', () => {
    expect(tagName('  Warm-up   < 15 min ')).toBe('Warm-up < 15 min');
    expect(tagName(' \t ')).toBe('');
    expect(tagName('x'.repeat(60))).toHaveLength(40);
  });
});

async function load(
  store = new MemoryStore(),
  entityStore = new MemoryEntityStore(),
): Promise<{
  preferences: BrewPreferences;
  store: MemoryStore;
  entities: Entities;
  entityStore: MemoryEntityStore;
}> {
  const entities = await Entities.load(entityStore, { epochNow: () => NOW });
  return { preferences: await BrewPreferences.load(store, entities), store, entities, entityStore };
}

describe('BrewPreferences', () => {
  it('loads the defaults from an empty store, and from one that fails', async () => {
    expect((await load()).preferences.value).toEqual(resolveBrewSettings(SEEDS, {}));
    const failing = new MemoryStore();
    failing.failReads = true;
    expect((await load(failing)).preferences.value).toEqual(resolveBrewSettings(SEEDS, {}));
  });

  it('applies a change at once and stores it, so the next load has it', async () => {
    const { preferences, store, entityStore } = await load();
    const seen: string[] = [];
    preferences.onChange((settings) => seen.push(`${settings.recipe.name} ${settings.doseG}`));
    preferences.setRecipe(SEED_IDS.cappuccino);
    preferences.setDoseG(16.94);
    preferences.setRecipe('01a1095c-3400-7fff-8000-000000000000'); // no such recipe: nothing
    preferences.setDoseG(16.9); // unchanged: nothing
    expect(seen).toEqual(['Cappuccino 18', 'Cappuccino 16.9']);
    await preferences.whenStored();
    expect(store.values.get(SETTING_KEYS.recipeId)).toBe(SEED_IDS.cappuccino);
    expect(store.values.get(SETTING_KEYS.doseG)).toBe(16.9);
    const again = (await load(store, entityStore)).preferences;
    expect(again.value.recipe.name).toBe('Cappuccino');
    expect(again.value.doseG).toBe(16.9);
  });

  it('keeps the reference shot, and clears it (T3.7)', async () => {
    const { preferences, store, entityStore } = await load();
    expect(preferences.value.referenceShotId).toBeNull();
    let changes = 0;
    preferences.onChange(() => changes++);
    preferences.setReference('shot-1');
    preferences.setReference('shot-1'); // the same: nothing
    expect(preferences.value.referenceShotId).toBe('shot-1');
    expect(changes).toBe(1);
    await preferences.whenStored();
    expect(store.values.get(SETTING_KEYS.referenceShotId)).toBe('shot-1');
    expect((await load(store, entityStore)).preferences.value.referenceShotId).toBe('shot-1');
    preferences.setReference(null);
    await preferences.whenStored();
    expect((await load(store, entityStore)).preferences.value.referenceShotId).toBeNull();
    // Anything but an id reads as none.
    expect(resolveBrewSettings(SEEDS, { referenceShotId: 7 }).referenceShotId).toBeNull();
  });

  it('adds a tag once, off by default, as an entity', async () => {
    const { preferences, entityStore } = await load();
    expect(preferences.addTag('  Bottomless ')).toBe('Bottomless');
    expect(preferences.addTag('wdt')).toBe('WDT');
    expect(preferences.addTag('bottomless')).toBe('Bottomless');
    expect(preferences.addTag('   ')).toBeNull();
    expect(preferences.value.tags.at(-1)).toMatchObject({
      name: 'Bottomless',
      group: null,
      isDefault: false,
      createdAtEpochMs: NOW,
    });
    expect(preferences.value.tags).toHaveLength(8);
    await preferences.whenStored();
    expect(entityStore.writes).toHaveLength(1);
    expect(entityStore.lists.tags).toEqual(preferences.value.tags);
  });

  it('lists a removed tag again rather than adding a second, off by default', async () => {
    const wdt = removed(SEEDS.tags[0]);
    const entityStore = new MemoryEntityStore({ ...SEEDS, tags: [wdt, ...SEEDS.tags.slice(1)] });
    const { preferences } = await load(new MemoryStore(), entityStore);
    expect(preferences.value.tags.map((tag) => tag.name)).not.toContain('WDT');
    expect(preferences.addTag('WDT')).toBe('WDT');
    expect(preferences.value.tags[0]).toEqual({
      ...SEEDS.tags[0],
      isDefault: false,
      updatedAtEpochMs: NOW,
    });
    await preferences.whenStored();
    expect(entityStore.writes).toEqual([`update tags ${SEED_IDS.wdt}`]);
  });

  it('follows the entities as they change', async () => {
    const { preferences, entities } = await load();
    entities.update('grinders', SEED_IDS.oro, { currentSetting: 6.2 });
    expect(preferences.value.grinder?.currentSetting).toBe(6.2);
    entities.update('recipes', SEED_IDS.espresso, { coffeeRatio: 2.2 });
    expect(preferences.value.recipe.coffeeRatio).toBe(2.2);
  });

  it('keeps a change it couldn’t store for the session, and says why', async () => {
    const { preferences, store, entityStore } = await load();
    store.failWrites = true;
    preferences.setDoseG(17);
    await preferences.whenStored();
    expect(preferences.value.doseG).toBe(17);
    expect(preferences.writeError).toBe('disk full');
    store.failWrites = false;
    preferences.setDoseG(17.5);
    await preferences.whenStored();
    expect(preferences.writeError).toBeNull();
    expect(store.values.get(SETTING_KEYS.doseG)).toBe(17.5);

    entityStore.failWrites = true;
    preferences.addTag('Bottomless');
    await preferences.whenStored();
    expect(preferences.writeError).toBe('disk full');
    expect(preferences.value.tags.at(-1)?.name).toBe('Bottomless');
  });

  it('makes a machine, basket, grinder or pack the one in use, and stores each by id', async () => {
    const entityStore = new MemoryEntityStore({
      ...SEEDS,
      machines: [...SEEDS.machines, SECOND_MACHINE],
      packs: [
        PACK,
        { ...PACK, id: '01a1095c-3400-7bbb-8000-000000000001', finishedDate: '2026-10-01' },
      ],
    });
    const { preferences, store } = await load(new MemoryStore(), entityStore);
    preferences.setGrinder(SEED_IDS.c40);
    preferences.setMachine(SECOND_MACHINE.id);
    // Another machine's basket isn't this one's: nothing.
    preferences.setBasket(SEED_IDS.lm17);
    preferences.setBasket(SECOND_MACHINE.baskets[1].id);
    preferences.setPack(PACK.id);
    expect(preferences.value).toMatchObject({
      grinder: { id: SEED_IDS.c40 },
      machine: { id: SECOND_MACHINE.id },
      basket: SECOND_MACHINE.baskets[1],
      pack: { id: PACK.id },
    });
    // Neither a finished pack nor an unknown id: nothing.
    preferences.setPack('01a1095c-3400-7bbb-8000-000000000001');
    preferences.setGrinder('01a1095c-3400-7fff-8000-000000000000');
    expect(preferences.value.pack?.id).toBe(PACK.id);
    expect(preferences.value.grinder?.id).toBe(SEED_IDS.c40);
    await preferences.whenStored();
    expect(Object.fromEntries(store.values)).toEqual({
      [SETTING_KEYS.grinderId]: SEED_IDS.c40,
      [SETTING_KEYS.machineId]: SECOND_MACHINE.id,
      [SETTING_KEYS.basketId]: SECOND_MACHINE.baskets[1].id,
      [SETTING_KEYS.packId]: PACK.id,
    });
    preferences.setPack(null);
    expect(preferences.value.pack).toBeNull();
    // Back to the first machine: its basket, as the last used basket isn't one of its.
    preferences.setMachine(SEED_IDS.gaggia);
    expect(preferences.value.basket?.id).toBe(SEED_IDS.lm17);
  });

  it('reads the settings and the entities again on reload: after an import', async () => {
    const { preferences, store, entityStore } = await load();
    store.values.set(SETTING_KEYS.recipeId, SEED_IDS.latte);
    entityStore.lists = {
      ...SEEDS,
      recipes: SEEDS.recipes.map((recipe) =>
        recipe.id === SEED_IDS.latte
          ? updateEntity('recipes', recipe, { milkRatio: 5 }, NOW)
          : recipe,
      ),
    };
    const seen: number[] = [];
    preferences.onChange((settings) => seen.push(settings.recipe.milkRatio ?? 0));
    await preferences.reload();
    expect(preferences.value.recipe).toMatchObject({ name: 'Latte', milkRatio: 5 });
    expect(seen.at(-1)).toBe(5);
  });
});
