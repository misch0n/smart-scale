import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIdGenerator, createShot, SchemaError, type NewShot, type Shot } from '../core/model';
import { freshIndexedDB, openDirect } from './fake-idb';
import { openStorage, StorageError, type AppStorage } from './index';

const START = Date.UTC(2026, 9, 3, 7, 30);
let nextIdMs = START;
const newId = createIdGenerator({ now: () => nextIdMs++ });
const REC_A = newId();
const REC_B = newId();

function shot(overrides: Partial<NewShot> = {}, nowEpochMs = START): Shot {
  return createShot(
    { id: newId(), recordingId: REC_A, anchorTMs: 60_000, source: 'live', ...overrides },
    nowEpochMs,
  );
}

let storage: AppStorage;

beforeEach(async () => {
  freshIndexedDB();
  storage = await openStorage();
});

afterEach(() => {
  storage.close();
});

describe('shots', () => {
  it('stores a shot with every field, and reads it back', async () => {
    const graded = shot({ direction: 'sour', tags: [], doseG: 18, targetRatio: 2 });
    await storage.shots.create(graded);
    const read = await storage.shots.get(graded.id);
    expect(read).toEqual(graded);
    expect(Object.keys(read!)).toEqual(Object.keys(graded));
    expect(read!.tags).toEqual([]); // none given, which isn't the same as null
    expect(read!.channelled).toBeNull();
  });

  it('refuses a second shot with the same id', async () => {
    const first = shot();
    await storage.shots.create(first);
    await expect(storage.shots.create(shot({ id: first.id }))).rejects.toMatchObject({
      code: 'exists',
    });
  });

  it("returns null for a shot that isn't stored", async () => {
    expect(await storage.shots.get(newId())).toBeNull();
  });

  describe('update', () => {
    it('applies the changes, stamps the time and stores the result', async () => {
      const original = shot();
      await storage.shots.create(original);
      const updated = await storage.shots.update(
        original.id,
        { direction: 'bitter', channelled: true, tags: ['wdt'] },
        START + 5000,
      );
      expect(updated).toEqual({
        ...original,
        direction: 'bitter',
        channelled: true,
        tags: ['wdt'],
        updatedAtEpochMs: START + 5000,
      });
      expect(await storage.shots.get(original.id)).toEqual(updated);
    });

    it('refuses to change what identifies the shot, and stores nothing', async () => {
      const original = shot();
      await storage.shots.create(original);
      const changes = { anchorTMs: 1 } as unknown as Parameters<AppStorage['shots']['update']>[1];
      await expect(storage.shots.update(original.id, changes, START + 1)).rejects.toThrow(
        TypeError,
      );
      await expect(
        storage.shots.update(original.id, { doseG: Number.NaN }, START + 1),
      ).rejects.toThrow(SchemaError);
      expect(await storage.shots.get(original.id)).toEqual(original);
    });

    it("refuses a shot that isn't stored", async () => {
      const update = storage.shots.update(newId(), { doseG: 18 }, START);
      await expect(update).rejects.toThrow(StorageError);
      await expect(update).rejects.toMatchObject({ code: 'not-found' });
    });
  });

  describe('discard', () => {
    it('leaves a tombstone instead of deleting, and keeps the first discard time', async () => {
      const original = shot();
      await storage.shots.create(original);
      const discarded = await storage.shots.discard(original.id, START + 1000);
      expect(discarded).toEqual({
        ...original,
        discardedAtEpochMs: START + 1000,
        updatedAtEpochMs: START + 1000,
      });
      expect(await storage.shots.discard(original.id, START + 9000)).toEqual(discarded);
      expect(await storage.shots.get(original.id)).toEqual(discarded);
      expect(await storage.shots.listForRecording(REC_A)).toEqual([discarded]);
    });

    it('is undone by clearing the tombstone', async () => {
      const original = shot();
      await storage.shots.create(original);
      await storage.shots.discard(original.id, START + 1000);
      const restored = await storage.shots.update(
        original.id,
        { discardedAtEpochMs: null },
        START + 2000,
      );
      expect(restored.discardedAtEpochMs).toBeNull();
    });

    it("refuses a shot that isn't stored", async () => {
      await expect(storage.shots.discard(newId(), START)).rejects.toMatchObject({
        code: 'not-found',
      });
    });
  });

  describe('listing', () => {
    it("lists a recording's shots by anchor time, discarded ones too", async () => {
      const late = shot({ anchorTMs: 120_000 });
      const early = shot({ anchorTMs: 30_000, source: 'manual' });
      const elsewhere = shot({ recordingId: REC_B, anchorTMs: 10_000 });
      const ghost = shot({ anchorTMs: 90_000, source: 'post-hoc', discardedAtEpochMs: START });
      for (const s of [late, early, elsewhere, ghost]) await storage.shots.create(s);

      expect(await storage.shots.listForRecording(REC_A)).toEqual([early, ghost, late]);
      expect(await storage.shots.listForRecording(REC_B)).toEqual([elsewhere]);
      expect(await storage.shots.listForRecording(newId())).toEqual([]);
    });

    it('lists every shot by recording, then by anchor time', async () => {
      const b1 = shot({ recordingId: REC_B, anchorTMs: 5000 });
      const a2 = shot({ anchorTMs: 70_000 });
      const a1 = shot({ anchorTMs: 7000 });
      for (const s of [b1, a2, a1]) await storage.shots.create(s);
      expect(await storage.shots.list()).toEqual([a1, a2, b1]);
    });

    it("fills fields an older build didn't store with null", async () => {
      const old: Record<string, unknown> = { ...shot() };
      delete old.beansWeighedG;
      delete old.containerId;
      const db = await openDirect();
      await db.put('shots', old);
      db.close();
      const [read] = await storage.shots.list();
      expect(read).toEqual({ ...old, beansWeighedG: null, containerId: null });
    });
  });
});
