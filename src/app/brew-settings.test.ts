import { describe, expect, it } from 'vitest';
import type { JsonValue } from '../core/model';
import {
  BrewPreferences,
  clampDose,
  DEFAULT_BREW_SETTINGS,
  DEFAULT_RECIPES,
  DEFAULT_TAGS,
  defaultTagNames,
  readBrewSettings,
  SETTING_KEYS,
  tagName,
  type SettingsStore,
} from './brew-settings';

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

describe('the defaults', () => {
  it('are spec v2’s recipes, Espresso, 18 g and the design’s tags with two on', () => {
    expect(DEFAULT_RECIPES.map((r) => `${r.name} 1:${r.coffeeRatio}+${r.milkRatio}`)).toEqual([
      'Ristretto 1:1.5+null',
      'Espresso 1:2+null',
      'Lungo 1:3+null',
      'Cortado 1:2+1',
      'Cappuccino 1:2+3',
      'Flat white 1:2+4',
      'Latte 1:2+6',
    ]);
    expect(DEFAULT_BREW_SETTINGS.recipe.name).toBe('Espresso');
    expect(DEFAULT_BREW_SETTINGS.doseG).toBe(18);
    expect(defaultTagNames(DEFAULT_TAGS)).toEqual(['WDT', 'Puck screen']);
    expect(DEFAULT_TAGS).toHaveLength(7);
  });
});

describe('readBrewSettings', () => {
  it('reads what was stored', () => {
    const settings = readBrewSettings({
      recipe: 'Cappuccino',
      doseG: 16.9,
      tags: [
        { name: 'RDT', isDefault: true },
        { name: 'Paper filter', isDefault: false },
      ],
    });
    expect(settings.recipe).toEqual({ name: 'Cappuccino', coffeeRatio: 2, milkRatio: 3 });
    expect(settings.doseG).toBe(16.9);
    expect(settings.tags).toEqual([
      { name: 'RDT', isDefault: true },
      { name: 'Paper filter', isDefault: false },
    ]);
  });

  it('reads anything missing or malformed as its default', () => {
    expect(readBrewSettings({ recipe: undefined, doseG: undefined, tags: undefined })).toEqual(
      DEFAULT_BREW_SETTINGS,
    );
    expect(readBrewSettings({ recipe: 'Mocha', doseG: '18', tags: 'WDT' })).toEqual(
      DEFAULT_BREW_SETTINGS,
    );
  });

  it('keeps the dose within its limits, in tenths', () => {
    expect(readBrewSettings({ recipe: null, doseG: 17.04, tags: null }).doseG).toBe(17);
    expect(readBrewSettings({ recipe: null, doseG: 300, tags: null }).doseG).toBe(30);
    expect(clampDose(-1)).toBe(5);
    expect(clampDose(Number.NaN)).toBe(18);
  });

  it('drops malformed and repeated tags, and keeps an empty list empty', () => {
    const settings = readBrewSettings({
      recipe: null,
      doseG: null,
      tags: [
        { name: '  WDT ', isDefault: true },
        { name: 'wdt', isDefault: false },
        { name: '', isDefault: true },
        { isDefault: true },
        'RDT',
        null,
        { name: 'Paper filter', isDefault: 'yes' },
      ],
    });
    expect(settings.tags).toEqual([
      { name: 'WDT', isDefault: true },
      { name: 'Paper filter', isDefault: false },
    ]);
    expect(readBrewSettings({ recipe: null, doseG: null, tags: [] }).tags).toEqual([]);
  });
});

describe('tagName', () => {
  it('trims, single-spaces and caps a name', () => {
    expect(tagName('  Warm-up   < 15 min ')).toBe('Warm-up < 15 min');
    expect(tagName(' \t ')).toBe('');
    expect(tagName('x'.repeat(60))).toHaveLength(40);
  });
});

describe('BrewPreferences', () => {
  it('loads the defaults from an empty store, and from one that fails', async () => {
    const store = new MemoryStore();
    expect((await BrewPreferences.load(store)).value).toEqual(DEFAULT_BREW_SETTINGS);
    store.failReads = true;
    expect((await BrewPreferences.load(store)).value).toEqual(DEFAULT_BREW_SETTINGS);
  });

  it('applies a change at once and stores it, so the next load has it', async () => {
    const store = new MemoryStore();
    const preferences = await BrewPreferences.load(store);
    const seen: string[] = [];
    preferences.onChange((settings) => seen.push(`${settings.recipe.name} ${settings.doseG}`));
    preferences.setRecipe('Cappuccino');
    preferences.setDoseG(16.94);
    preferences.setRecipe('Mocha'); // not a recipe: nothing
    preferences.setDoseG(16.9); // unchanged: nothing
    expect(seen).toEqual(['Cappuccino 18', 'Cappuccino 16.9']);
    await preferences.whenStored();
    expect(store.values.get(SETTING_KEYS.recipe)).toBe('Cappuccino');
    expect(store.values.get(SETTING_KEYS.doseG)).toBe(16.9);
    const again = await BrewPreferences.load(store);
    expect(again.value.recipe.name).toBe('Cappuccino');
    expect(again.value.doseG).toBe(16.9);
  });

  it('adds a tag once, off by default, and stores the whole list', async () => {
    const store = new MemoryStore();
    const preferences = await BrewPreferences.load(store);
    expect(preferences.addTag('  Bottomless ')).toBe('Bottomless');
    expect(preferences.addTag('wdt')).toBe('WDT');
    expect(preferences.addTag('   ')).toBeNull();
    expect(preferences.value.tags.at(-1)).toEqual({ name: 'Bottomless', isDefault: false });
    expect(preferences.value.tags).toHaveLength(8);
    await preferences.whenStored();
    const stored = store.values.get(SETTING_KEYS.tags) as { name: string }[];
    expect(stored.map((tag) => tag.name)).toEqual([
      ...DEFAULT_TAGS.map((tag) => tag.name),
      'Bottomless',
    ]);
    expect((await BrewPreferences.load(store)).value.tags).toEqual(preferences.value.tags);
  });

  it('keeps a change it couldn’t store for the session, and says why', async () => {
    const store = new MemoryStore();
    const preferences = await BrewPreferences.load(store);
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
  });
});
