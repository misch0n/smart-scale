import { describe, expect, it } from 'vitest';
import {
  NO_MAINTENANCE,
  SchemaError,
  SEED_IDS,
  SEEDS,
  type EntityChanges,
  type EntityFields,
} from '../core/model';
import { freshIndexedDB } from '../storage/fake-idb';
import { openStorage } from '../storage';
import { Entities } from './entities';
import { MemoryEntityStore } from './fake-entities';

const NOW = Date.UTC(2026, 9, 6, 7, 0);
const epochNow = () => NOW;

const PACK: EntityFields<'packs'> = {
  brand: 'Local roaster',
  name: 'Kenya Nyeri · Washed',
  weightG: 250,
  roastDate: '2026-09-30',
  openDate: null,
  flavours: ['Blackcurrant'],
  finishedDate: null,
  buyAgain: null,
};

describe('Entities', () => {
  it('loads every entity, and lists the ones not removed', async () => {
    const store = new MemoryEntityStore({
      ...SEEDS,
      tags: SEEDS.tags.map((tag) =>
        tag.id === SEED_IDS.rdt ? { ...tag, removedAtEpochMs: NOW } : tag,
      ),
    });
    const entities = await Entities.load(store, { epochNow });
    expect(entities.value).toEqual(store.lists);
    expect(entities.listed('tags').map((tag) => tag.name)).not.toContain('RDT');
    expect(entities.get('tags', SEED_IDS.rdt)?.removedAtEpochMs).toBe(NOW);
    expect(entities.get('machines', SEED_IDS.rdt)).toBeNull();
    expect(entities.loadError).toBeNull();
  });

  it('gives the seeds when storage can’t be read, and says why', async () => {
    const store = new MemoryEntityStore();
    store.failReads = true;
    const entities = await Entities.load(store, { epochNow });
    expect(entities.value).toEqual(SEEDS);
    expect(entities.loadError).toBe('read failed');
  });

  it('adds an entity at once, in id order, and stores it behind', async () => {
    const store = new MemoryEntityStore();
    const entities = await Entities.load(store, { epochNow });
    const changes: number[] = [];
    const stored: number[] = [];
    entities.onChange((value) => changes.push(value.packs.length));
    entities.onStored(() => stored.push(1));
    const pack = entities.add('packs', PACK);
    expect(pack).toMatchObject({ ...PACK, createdAtEpochMs: NOW, removedAtEpochMs: null });
    expect(entities.listed('packs')).toEqual([pack]);
    expect(changes).toEqual([1]);
    expect(stored).toEqual([]);
    await entities.whenStored();
    expect(store.lists.packs).toEqual([pack]);
    expect(stored).toEqual([1]);
  });

  it('refuses a malformed entity, adding nothing', async () => {
    const entities = await Entities.load(new MemoryEntityStore(), { epochNow });
    expect(() => entities.add('packs', { ...PACK, roastDate: 'yesterday' })).toThrow(SchemaError);
    expect(entities.value.packs).toEqual([]);
  });

  it('updates an entity at once, and stores the change behind', async () => {
    const store = new MemoryEntityStore();
    const entities = await Entities.load(store, { epochNow });
    const care = { lastDoneDate: '2026-10-06', reminderDays: 30 };
    const oro = entities.update('grinders', SEED_IDS.oro, { currentSetting: 6.2, care });
    expect(oro).toEqual({
      ...SEEDS.grinders[0],
      currentSetting: 6.2,
      care,
      updatedAtEpochMs: NOW,
    });
    expect(entities.get('grinders', SEED_IDS.oro)).toEqual(oro);
    await entities.whenStored();
    expect(store.lists.grinders[0]).toEqual(oro);
    expect(entities.update('grinders', SEED_IDS.gaggia, { currentSetting: 1 })).toBeNull();
  });

  it('computes a change from the entity as it is now, so quick steps all count', async () => {
    const store = new MemoryEntityStore();
    const entities = await Entities.load(store, { epochNow });
    const step = (oro: { readonly currentSetting: number | null }) => ({
      currentSetting: (oro.currentSetting ?? 5) + 0.1,
    });
    entities.update('grinders', SEED_IDS.oro, step);
    const twice = entities.update('grinders', SEED_IDS.oro, step);
    expect(twice?.currentSetting).toBeCloseTo(5.2);
    await entities.whenStored();
    expect(store.lists.grinders[0]).toEqual(twice);
  });

  it('removes and restores, keeping the entity', async () => {
    const entities = await Entities.load(new MemoryEntityStore(), { epochNow });
    entities.update('machines', SEED_IDS.gaggia, { removedAtEpochMs: NOW });
    expect(entities.listed('machines')).toEqual([]);
    expect(entities.value.machines).toHaveLength(1);
    entities.update('machines', SEED_IDS.gaggia, { removedAtEpochMs: null });
    expect(entities.listed('machines')).toHaveLength(1);
  });

  it('refuses a change updateEntity refuses, changing nothing', async () => {
    const entities = await Entities.load(new MemoryEntityStore(), { epochNow });
    const changes = { currentSetting: 22.5, settingKind: 'clicks' } as const;
    expect(() => entities.update('grinders', SEED_IDS.oro, changes)).toThrow(SchemaError);
    const identity = { id: SEED_IDS.c40 } as unknown as EntityChanges<'grinders'>;
    expect(() => entities.update('grinders', SEED_IDS.oro, identity)).toThrow(TypeError);
    expect(entities.value).toEqual(SEEDS);
  });

  it('keeps a change it couldn’t store for the session, and says why, until one is stored', async () => {
    const store = new MemoryEntityStore();
    const entities = await Entities.load(store, { epochNow });
    store.failWrites = true;
    const pack = entities.add('packs', PACK);
    await entities.whenStored();
    expect(entities.writeError).toBe('disk full');
    expect(entities.listed('packs')).toEqual([pack]);
    store.failWrites = false;
    entities.update('recipes', SEED_IDS.lungo, { coffeeRatio: 2.5 });
    await entities.whenStored();
    expect(entities.writeError).toBeNull();
  });

  it('reads them again after an import, once its own writes are done', async () => {
    const store = new MemoryEntityStore();
    const entities = await Entities.load(store, { epochNow });
    entities.update('recipes', SEED_IDS.lungo, { coffeeRatio: 2.5 });
    const imported = { ...SEEDS.machines[0], name: 'Gaggia', updatedAtEpochMs: NOW + 1 };
    // What an import stored behind its back.
    store.lists = { ...store.lists, machines: [imported] };
    await entities.reload();
    expect(entities.get('machines', SEED_IDS.gaggia)).toEqual(imported);
    expect(entities.get('recipes', SEED_IDS.lungo)?.coffeeRatio).toBe(2.5);

    store.failReads = true;
    await entities.reload();
    expect(entities.loadError).toBe('read failed');
    expect(entities.get('machines', SEED_IDS.gaggia)).toEqual(imported);
  });

  it('works on IndexedDB through the repository', async () => {
    freshIndexedDB();
    const storage = await openStorage();
    const entities = await Entities.load(storage.entities, { epochNow });
    expect(entities.value).toEqual(SEEDS);
    const machine = entities.add('machines', {
      name: 'Second machine',
      pressureBar: null,
      baskets: [],
      descale: NO_MAINTENANCE,
      backflush: NO_MAINTENANCE,
    });
    entities.update('machines', machine.id, { pressureBar: 9 });
    await entities.whenStored();
    expect(await storage.entities.get('machines', machine.id)).toEqual(
      entities.get('machines', machine.id),
    );
    expect((await Entities.load(storage.entities)).value).toEqual(entities.value);
    storage.close();
  });
});
