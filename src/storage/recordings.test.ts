import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createIdGenerator,
  createRecording,
  endRecording,
  SchemaError,
  type NewRecording,
  type Recording,
} from '../core/model';
import { freshIndexedDB, openDirect } from './fake-idb';
import { openStorage, StorageError, type AppStorage } from './index';

const START = Date.UTC(2026, 9, 3, 7, 30);
let nextIdMs = START;
const newId = createIdGenerator({ now: () => nextIdMs++ });

function recording(overrides: Partial<NewRecording> = {}): Recording {
  return createRecording({
    id: newId(),
    startedAtEpochMs: START,
    device: { name: 'BOOKOO_MINI', id: 'opaque-id' },
    transport: 'web-bluetooth',
    app: { commit: 'abc1234', buildTime: '2026-10-03T07:00:00.000Z' },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)',
    ...overrides,
  });
}

let storage: AppStorage;

beforeEach(async () => {
  freshIndexedDB();
  storage = await openStorage();
});

afterEach(() => {
  storage.close();
});

describe('recordings', () => {
  it('stores a recording with every field, and reads it back', async () => {
    const open = recording({ device: { name: null, id: null }, userAgent: null });
    await storage.recordings.create(open);
    const read = await storage.recordings.get(open.id);
    expect(read).toEqual(open);
    expect(Object.keys(read!)).toEqual(Object.keys(open));
  });

  it('stores an ended recording too, as an import does', async () => {
    const ended = endRecording(recording(), START + 60_000, 'device');
    await storage.recordings.create(ended);
    expect(await storage.recordings.get(ended.id)).toEqual(ended);
  });

  it('refuses a second recording with the same id', async () => {
    const first = recording();
    await storage.recordings.create(first);
    const again = storage.recordings.create({ ...first, transport: 'mock' });
    await expect(again).rejects.toThrow(StorageError);
    await expect(again).rejects.toMatchObject({ code: 'exists' });
    expect(await storage.recordings.get(first.id)).toEqual(first);
  });

  it('refuses a malformed recording without storing it', async () => {
    const bad = { ...recording(), startedAtEpochMs: Number.NaN };
    await expect(storage.recordings.create(bad)).rejects.toThrow(SchemaError);
    expect(await storage.recordings.list()).toEqual([]);
  });

  it("returns null for a recording that isn't stored", async () => {
    expect(await storage.recordings.get(newId())).toBeNull();
  });

  describe('end', () => {
    it('ends an open recording once, and stores it ended', async () => {
      const open = recording();
      await storage.recordings.create(open);
      const ended = await storage.recordings.end(open.id, START + 90_000, 'user');
      expect(ended).toEqual({ ...open, endedAtEpochMs: START + 90_000, endReason: 'user' });
      expect(await storage.recordings.get(open.id)).toEqual(ended);
    });

    it('refuses to end a recording again, and keeps the first end', async () => {
      const open = recording();
      await storage.recordings.create(open);
      const ended = await storage.recordings.end(open.id, START + 1000, 'device');
      const again = storage.recordings.end(open.id, START + 2000, 'unclean');
      await expect(again).rejects.toThrow(StorageError);
      await expect(again).rejects.toMatchObject({ code: 'already-ended' });
      expect(await storage.recordings.get(open.id)).toEqual(ended);
    });

    it("refuses to end a recording that isn't stored", async () => {
      await expect(storage.recordings.end(newId(), START, 'user')).rejects.toMatchObject({
        code: 'not-found',
      });
    });

    it('refuses a malformed end time, and leaves the recording open', async () => {
      const open = recording();
      await storage.recordings.create(open);
      await expect(storage.recordings.end(open.id, Number.NaN, 'user')).rejects.toThrow(
        SchemaError,
      );
      expect(await storage.recordings.get(open.id)).toEqual(open);
    });
  });

  describe('listing', () => {
    it('lists every recording, oldest first', async () => {
      const recordings = [recording(), recording(), recording()];
      // Stored out of order: the list follows the ids, which follow creation time.
      for (const r of [recordings[2], recordings[0], recordings[1]]) {
        await storage.recordings.create(r);
      }
      expect(await storage.recordings.list()).toEqual(recordings);
    });

    it('lists the open recordings: those an unclean stop left behind', async () => {
      const [a, b, c, d] = [recording(), recording(), recording(), recording()];
      for (const r of [a, b, c, d]) await storage.recordings.create(r);
      await storage.recordings.end(b.id, START + 5000, 'user');
      await storage.recordings.end(d.id, START + 5000, 'device');
      expect(await storage.recordings.listOpen()).toEqual([a, c]);

      const recovered = await storage.recordings.end(a.id, START + 4000, 'unclean');
      expect(recovered.endReason).toBe('unclean');
      expect(await storage.recordings.listOpen()).toEqual([c]);
    });

    it('lists nothing in an empty database', async () => {
      expect(await storage.recordings.list()).toEqual([]);
      expect(await storage.recordings.listOpen()).toEqual([]);
    });
  });

  describe('reading stored records', () => {
    async function plant(value: unknown): Promise<void> {
      const db = await openDirect();
      await db.put('recordings', value);
      db.close();
    }

    it("fills fields an older build didn't store with null, and drops unknown ones", async () => {
      const old: Record<string, unknown> = { ...recording(), retiredField: 1 };
      delete old.userAgent;
      delete old.endReason;
      await plant(old);
      const read = await storage.recordings.get(old.id as string);
      const expected: Record<string, unknown> = { ...old, endReason: null, userAgent: null };
      delete expected.retiredField;
      expect(read).toEqual(expected);
      expect(await storage.recordings.listOpen()).toEqual([read]);
    });

    it('fails loudly on a malformed stored record', async () => {
      const bad = { ...recording(), transport: 'carrier-pigeon' };
      await plant(bad);
      await expect(storage.recordings.get(bad.id)).rejects.toThrow(SchemaError);
      await expect(storage.recordings.list()).rejects.toThrow(/transport/);
    });
  });
});
