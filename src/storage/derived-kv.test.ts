import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SchemaError, type JsonValue } from '../core/model';
import { freshIndexedDB } from './fake-idb';
import { openStorage, type AppStorage, type DerivedEntry } from './index';

const REC = '01923456-789a-7000-8000-000000000001';
const OTHER = '01923456-789a-7000-8000-000000000002';
const NOW = Date.UTC(2026, 9, 3, 8);

function entry(overrides: Partial<DerivedEntry> = {}): DerivedEntry {
  return {
    recordingId: REC,
    analysisVersion: 1,
    computedAtEpochMs: NOW,
    result: { segments: [{ markers: { pump_on: 12.5, first_drip: null } }] },
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

describe('derived', () => {
  it('stores an entry by recording and analysis version', async () => {
    const v1 = entry();
    const v2 = entry({ analysisVersion: 2, result: { segments: [] } });
    await storage.derived.put(v1);
    await storage.derived.put(v2);
    expect(await storage.derived.get(REC, 1)).toEqual(v1);
    expect(await storage.derived.get(REC, 2)).toEqual(v2);
    expect(await storage.derived.get(REC, 3)).toBeNull();
    expect(await storage.derived.get(OTHER, 1)).toBeNull();
  });

  it('replaces an entry for the same recording and version', async () => {
    await storage.derived.put(entry());
    const again = entry({ computedAtEpochMs: NOW + 1000, result: null });
    await storage.derived.put(again);
    expect(await storage.derived.get(REC, 1)).toEqual(again);
  });

  it('clears every entry', async () => {
    await storage.derived.put(entry());
    await storage.derived.put(entry({ recordingId: OTHER }));
    await storage.derived.clearAll();
    expect(await storage.derived.get(REC, 1)).toBeNull();
    expect(await storage.derived.get(OTHER, 1)).toBeNull();
  });

  it("refuses a result that JSON (and so the export) can't carry", async () => {
    const bad = entry({ result: { tau: Number.NaN } as unknown as JsonValue });
    await expect(storage.derived.put(bad)).rejects.toThrow(SchemaError);
    const fractional = entry({ analysisVersion: 1.5 });
    await expect(storage.derived.put(fractional)).rejects.toThrow(SchemaError);
  });
});

describe('kv', () => {
  it('returns undefined for a key with no value', async () => {
    expect(await storage.kv.get('lastDoseG')).toBeUndefined();
  });

  it.each<[string, JsonValue]>([
    ['a number', 18.2],
    ['null', null],
    ['a string', 'Comandante'],
    ['an object', { visible: { doseG: true, tags: false }, order: ['direction', 'tags'] }],
  ])('stores %s and reads it back', async (_, value) => {
    await storage.kv.set('key', value);
    expect(await storage.kv.get('key')).toEqual(value);
  });

  it('replaces a value', async () => {
    await storage.kv.set('lastRatio', 2);
    await storage.kv.set('lastRatio', 2.2);
    expect(await storage.kv.get('lastRatio')).toBe(2.2);
  });

  it('stores a copy: changing the value afterwards changes nothing stored', async () => {
    const value = { tags: ['wdt'] };
    await storage.kv.set('draft', value);
    value.tags.push('later');
    expect(await storage.kv.get('draft')).toEqual({ tags: ['wdt'] });
  });

  it('lists every entry in key order', async () => {
    expect(await storage.kv.entries()).toEqual([]);
    await storage.kv.set('b.ratio', 2);
    await storage.kv.set('a.fields', { visible: ['dose'] });
    await storage.kv.set('c.bag', null);
    expect(await storage.kv.entries()).toEqual([
      ['a.fields', { visible: ['dose'] }],
      ['b.ratio', 2],
      ['c.bag', null],
    ]);
  });

  it("refuses a value that isn't JSON", async () => {
    await expect(storage.kv.set('bad', Number.NaN)).rejects.toThrow(SchemaError);
    await expect(
      storage.kv.set('bad', { when: new Date() } as unknown as JsonValue),
    ).rejects.toThrow(SchemaError);
    expect(await storage.kv.get('bad')).toBeUndefined();
  });
});
