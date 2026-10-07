import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { JsonValue } from '../core/model';
import { freshIndexedDB } from '../storage/fake-idb';
import { openStorage, type AppStorage } from '../storage';
import { SCALE_NAME_MAX, SCALE_NAMES_KEY, ScaleNames } from './scale-names';

let storage: AppStorage;

beforeEach(async () => {
  freshIndexedDB();
  storage = await openStorage();
});

afterEach(() => {
  storage.close();
});

const BOOKOO = 'BOOKOO_SC 1c2d';

describe('ScaleNames (T2.30)', () => {
  it('keeps the name of each scale in the settings, across a restart', async () => {
    const names = await ScaleNames.load(storage.kv);
    expect(names.nameOf(BOOKOO)).toBeNull();
    expect(names.label(BOOKOO, 'Scale')).toBe(BOOKOO);
    let changes = 0;
    names.onChange(() => changes++);

    names.rename(BOOKOO, '  Themis  ');
    expect(names.nameOf(BOOKOO)).toBe('Themis');
    expect(names.label(BOOKOO, 'Scale')).toBe('Themis');
    expect(changes).toBe(1);
    names.rename(BOOKOO, 'Themis');
    expect(changes).toBe(1);
    await names.whenStored();
    expect(await storage.kv.get(SCALE_NAMES_KEY)).toEqual({ [BOOKOO]: 'Themis' });

    const again = await ScaleNames.load(storage.kv);
    expect(again.nameOf(BOOKOO)).toBe('Themis');
    expect(again.nameOf('BOOKOO_SC 9999')).toBeNull();
  });

  it('goes back to the scale’s own name when the name is blank or the same', async () => {
    const names = await ScaleNames.load(storage.kv);
    names.rename(BOOKOO, 'Themis');
    names.rename(BOOKOO, '   ');
    expect(names.nameOf(BOOKOO)).toBeNull();
    names.rename(BOOKOO, 'Themis');
    names.rename(BOOKOO, BOOKOO);
    expect(names.nameOf(BOOKOO)).toBeNull();
    await names.whenStored();
    expect(await storage.kv.get(SCALE_NAMES_KEY)).toEqual({});
  });

  it('names a scale with no name of its own, and keeps a name short', async () => {
    const names = await ScaleNames.load(storage.kv);
    expect(names.label(null, 'Scale')).toBe('Scale');
    names.rename(null, 'x'.repeat(100));
    expect(names.label(null, 'Scale')).toBe('x'.repeat(SCALE_NAME_MAX));
  });

  it('reads the names again after an import', async () => {
    const names = await ScaleNames.load(storage.kv);
    await storage.kv.set(SCALE_NAMES_KEY, { [BOOKOO]: 'Imported' });
    let changes = 0;
    names.onChange(() => changes++);
    await names.reload();
    expect(names.nameOf(BOOKOO)).toBe('Imported');
    expect(changes).toBe(1);
  });

  it('names for the session when it can’t be stored or read, and says why', async () => {
    const broken = {
      get: (): Promise<JsonValue | undefined> => Promise.reject(new Error('gone')),
      set: (): Promise<void> => Promise.reject(new Error('full')),
    };
    const names = await ScaleNames.load(broken);
    names.rename(BOOKOO, 'Themis');
    await names.whenStored();
    expect(names.nameOf(BOOKOO)).toBe('Themis');
    expect(names.writeError).toBe('full');
  });

  it('takes a malformed value as no names, and skips blank ones', async () => {
    await storage.kv.set(SCALE_NAMES_KEY, ['Themis']);
    expect((await ScaleNames.load(storage.kv)).nameOf(BOOKOO)).toBeNull();
    await storage.kv.set(SCALE_NAMES_KEY, { [BOOKOO]: 7, other: ' ', mine: 'Mine' });
    const names = await ScaleNames.load(storage.kv);
    expect(names.nameOf(BOOKOO)).toBeNull();
    expect(names.nameOf('other')).toBeNull();
    expect(names.nameOf('mine')).toBe('Mine');
  });
});
