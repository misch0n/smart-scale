import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SchemaError, type JsonValue } from '../core/model';
import { freshIndexedDB } from './fake-idb';
import { openStorage, type AppStorage } from './index';

let storage: AppStorage;

beforeEach(async () => {
  freshIndexedDB();
  storage = await openStorage();
});

afterEach(() => {
  storage.close();
});

describe('local', () => {
  it('returns undefined for a key with no value', async () => {
    expect(await storage.local.get('autoExport.settings')).toBeUndefined();
  });

  it.each<[string, JsonValue]>([
    ['a string', 'github_pat_secret'],
    ['null', null],
    ['an object', { owner: 'someone', repo: 'data', branch: null }],
  ])('stores %s and reads it back', async (_, value) => {
    await storage.local.set('key', value);
    expect(await storage.local.get('key')).toEqual(value);
  });

  it('replaces a value, and deletes one', async () => {
    await storage.local.set('key', 1);
    await storage.local.set('key', 2);
    expect(await storage.local.get('key')).toBe(2);
    await storage.local.delete('key');
    expect(await storage.local.get('key')).toBeUndefined();
    await storage.local.delete('key'); // deleting nothing is fine
  });

  it('lists the keys with a prefix, in key order', async () => {
    await storage.local.set('ledger.b', 2);
    await storage.local.set('ledger.a', 1);
    await storage.local.set('ledger', 0);
    await storage.local.set('ledgers', 'no');
    await storage.local.set('other', 'no');
    expect(await storage.local.entries('ledger.')).toEqual([
      ['ledger.a', 1],
      ['ledger.b', 2],
    ]);
    expect(await storage.local.entries('nothing.')).toEqual([]);
  });

  it("refuses a value that isn't JSON", async () => {
    await expect(storage.local.set('key', Number.NaN)).rejects.toThrow(SchemaError);
  });

  it('is a store of its own: settings (kv) never see it', async () => {
    await storage.local.set('token', 'github_pat_secret');
    await storage.kv.set('lastDoseG', 18);
    expect(await storage.kv.entries()).toEqual([['lastDoseG', 18]]);
    expect(await storage.kv.get('token')).toBeUndefined();
    expect(await storage.local.get('lastDoseG')).toBeUndefined();
  });
});
