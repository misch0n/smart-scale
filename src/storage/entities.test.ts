import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createEntity,
  createIdGenerator,
  NO_MAINTENANCE,
  SchemaError,
  SEEDS,
  type CoffeePack,
  type EntityChanges,
} from '../core/model';
import { freshIndexedDB, openDirect } from './fake-idb';
import { openStorage, type AppStorage } from './index';

const NOW = Date.UTC(2026, 9, 6, 7, 0);
let nextIdMs = NOW;
const newId = createIdGenerator({ now: () => nextIdMs++ });

function pack(overrides: Partial<CoffeePack> = {}): CoffeePack {
  return {
    ...createEntity(
      'packs',
      {
        id: newId(),
        brand: 'Local roaster',
        name: 'Ethiopia Guji · Natural',
        weightG: 250,
        roastDate: '2026-09-22',
        openDate: null,
        flavours: ['Blueberry'],
        finishedDate: null,
        buyAgain: null,
      },
      NOW,
    ),
    ...overrides,
  };
}

let storage: AppStorage;

beforeEach(async () => {
  freshIndexedDB();
  storage = await openStorage();
});

afterEach(() => {
  storage.close();
});

describe('entities', () => {
  it('stores an entity with every field, and reads it back', async () => {
    const guji = pack();
    await storage.entities.create('packs', guji);
    const read = await storage.entities.get('packs', guji.id);
    expect(read).toEqual(guji);
    expect(Object.keys(read!)).toEqual(Object.keys(guji));
  });

  it('keeps each kind in its own store', async () => {
    const guji = pack();
    await storage.entities.create('packs', guji);
    expect(await storage.entities.get('tags', guji.id)).toBeNull();
    expect(await storage.entities.get('packs', SEEDS.tags[0].id)).toBeNull();
  });

  it('refuses a second entity with the same id, and a malformed one', async () => {
    const guji = pack();
    await storage.entities.create('packs', guji);
    await expect(storage.entities.create('packs', pack({ id: guji.id }))).rejects.toMatchObject({
      code: 'exists',
    });
    const bad = pack({ roastDate: 'last week' });
    await expect(storage.entities.create('packs', bad)).rejects.toThrow(SchemaError);
    expect(await storage.entities.get('packs', bad.id)).toBeNull();
  });

  it('lists a kind in id order, removed ones too', async () => {
    const [a, b, c] = [pack(), pack(), pack({ removedAtEpochMs: NOW + 1 })];
    for (const entity of [c, a, b]) await storage.entities.create('packs', entity);
    expect(await storage.entities.list('packs')).toEqual([a, b, c]);
  });

  it('reads every kind at once', async () => {
    const guji = pack();
    await storage.entities.create('packs', guji);
    expect(await storage.entities.all()).toEqual({ ...SEEDS, packs: [guji] });
  });

  it('fills in what an older record lacks, as null', async () => {
    const guji = pack();
    const db = await openDirect();
    const planted: Record<string, unknown> = { ...guji };
    delete planted.brand;
    delete planted.openDate;
    await db.put('packs', planted);
    db.close();
    expect(await storage.entities.get('packs', guji.id)).toEqual({
      ...guji,
      brand: null,
      openDate: null,
    });
  });

  describe('update', () => {
    it('applies the changes, stamps the time and stores the result', async () => {
      const oro = SEEDS.grinders[0];
      const updated = await storage.entities.update(
        'grinders',
        oro.id,
        { currentSetting: 6.2, care: { lastDoneDate: '2026-10-06', reminderDays: 30 } },
        NOW + 5000,
      );
      expect(updated).toEqual({
        ...oro,
        currentSetting: 6.2,
        care: { lastDoneDate: '2026-10-06', reminderDays: 30 },
        updatedAtEpochMs: NOW + 5000,
      });
      expect(await storage.entities.get('grinders', oro.id)).toEqual(updated);
    });

    it('removes with a tombstone and restores, keeping the entity', async () => {
      const rdt = SEEDS.tags[2];
      const removed = await storage.entities.update('tags', rdt.id, { removedAtEpochMs: NOW }, NOW);
      expect(removed.removedAtEpochMs).toBe(NOW);
      expect(await storage.entities.list('tags')).toHaveLength(SEEDS.tags.length);
      const restored = await storage.entities.update(
        'tags',
        rdt.id,
        { removedAtEpochMs: null },
        NOW + 1,
      );
      expect(restored).toEqual({ ...rdt, updatedAtEpochMs: NOW + 1 });
    });

    it('refuses what updateEntity refuses, and stores nothing', async () => {
      const oro = SEEDS.grinders[0];
      const changes = { createdAtEpochMs: 1 } as unknown as EntityChanges<'grinders'>;
      await expect(storage.entities.update('grinders', oro.id, changes, NOW)).rejects.toThrow(
        TypeError,
      );
      await expect(
        storage.entities.update('grinders', oro.id, { currentSetting: Number.NaN }, NOW),
      ).rejects.toThrow(SchemaError);
      expect(await storage.entities.get('grinders', oro.id)).toEqual(oro);
    });

    it('says when there is no such entity', async () => {
      await expect(
        storage.entities.update('machines', newId(), { pressureBar: 9 }, NOW),
      ).rejects.toMatchObject({ code: 'not-found' });
    });
  });

  describe('replace', () => {
    it('stores the given entity as it is, its times included', async () => {
      const gaggia = SEEDS.machines[0];
      const file = {
        ...gaggia,
        pressureBar: 9,
        baskets: [...gaggia.baskets, { id: newId(), name: null, sizeG: 9 }],
        descale: NO_MAINTENANCE,
        updatedAtEpochMs: NOW - 1000,
      };
      expect(await storage.entities.replace('machines', file)).toEqual(file);
      expect(await storage.entities.get('machines', gaggia.id)).toEqual(file);
    });

    it('refuses another identity, or one that isn’t stored', async () => {
      const espresso = SEEDS.recipes[1];
      await expect(
        storage.entities.replace('recipes', { ...espresso, createdAtEpochMs: NOW }),
      ).rejects.toThrow(TypeError);
      await expect(
        storage.entities.replace('recipes', { ...espresso, id: newId() }),
      ).rejects.toMatchObject({ code: 'not-found' });
      expect(await storage.entities.get('recipes', espresso.id)).toEqual(espresso);
    });
  });
});
