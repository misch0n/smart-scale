import { describe, expect, it } from 'vitest';
import { byId, normaliseEntity } from './entities';
import { idTimestampMs, isId } from './ids';
import { legacyTagId, recipeIdFromLegacySetting, tagsFromLegacySetting } from './legacy-settings';
import { isPristineSeed, SEED_EPOCH_MS, SEED_IDS, SEEDS } from './seeds';

/** T1.18's default list, as `BrewPreferences` stored it once a tag was added. */
const T1_18_DEFAULTS = [
  { name: 'WDT', isDefault: true },
  { name: 'Puck screen', isDefault: true },
  { name: 'RDT', isDefault: false },
  { name: 'Paper filter', isDefault: false },
  { name: 'Warm-up < 15 min', isDefault: false },
  { name: 'New basket', isDefault: false },
  { name: 'Experiment', isDefault: false },
];

describe('tagsFromLegacySetting', () => {
  it('turns T1.18’s list into the seeds, and an added tag into a tag after them', () => {
    const tags = tagsFromLegacySetting([
      ...T1_18_DEFAULTS,
      { name: 'Bottomless', isDefault: false },
    ]);
    expect(tags.slice(0, 7)).toEqual(SEEDS.tags);
    expect(tags.slice(0, 7).every(isPristineSeed)).toBe(true);
    const added = tags[7];
    expect(added).toEqual({
      id: legacyTagId('Bottomless'),
      createdAtEpochMs: SEED_EPOCH_MS,
      updatedAtEpochMs: SEED_EPOCH_MS,
      removedAtEpochMs: null,
      name: 'Bottomless',
      group: null,
      isDefault: false,
    });
    expect(normaliseEntity('tags', added)).toStrictEqual(added);
    expect([...tags].sort(byId)).toEqual(tags);
  });

  it('gives the same tags for the same list, every time', () => {
    const list = [{ name: 'Bottomless', isDefault: false }, ...T1_18_DEFAULTS];
    expect(tagsFromLegacySetting(list)).toEqual(tagsFromLegacySetting(structuredClone(list)));
  });

  it('keeps a seed’s id for its name in any case, with what the list says', () => {
    const [wdt] = tagsFromLegacySetting([{ name: 'wdt', isDefault: false }]);
    expect(wdt).toMatchObject({ id: SEED_IDS.wdt, name: 'wdt', isDefault: false });
    expect(isPristineSeed(wdt)).toBe(false);
  });

  it('reads leniently, as T1.18 did', () => {
    const tags = tagsFromLegacySetting([
      { name: '  WDT ', isDefault: true },
      { name: 'wdt', isDefault: false },
      { name: '', isDefault: true },
      { isDefault: true },
      'RDT',
      null,
      [{ name: 'Nested' }],
      { name: 'Paper   filter', isDefault: 'yes' },
    ]);
    expect(tags.map((tag) => [tag.name, tag.isDefault])).toEqual([
      ['WDT', true],
      ['Paper filter', false],
    ]);
    for (const value of [undefined, null, 'WDT', { name: 'WDT' }, 3]) {
      expect(tagsFromLegacySetting(value)).toEqual([]);
    }
  });
});

describe('legacyTagId', () => {
  it('is a UUIDv7 a millisecond after the seeds, the same for a name in any case', () => {
    const id = legacyTagId('Bottomless');
    expect(isId(id)).toBe(true);
    expect(idTimestampMs(id)).toBe(SEED_EPOCH_MS + 1);
    expect(legacyTagId('BOTTOMLESS')).toBe(id);
    expect(id > SEED_IDS.experiment).toBe(true);
  });

  it('differs between names', () => {
    const names = ['A', 'B', 'AB', 'BA', 'Bottomless', 'Bottomless ', 'Spouted', 'Ü', '☕', ''];
    const ids = names.map(legacyTagId);
    expect(new Set(ids).size).toBe(names.length);
    expect(ids.every(isId)).toBe(true);
  });

  it('is frozen: the migrations converted with these', () => {
    expect(legacyTagId('Bottomless')).toBe('01a1095c-3401-7415-a2b7-7b219b28dbd1');
    expect(legacyTagId('Spouted')).toBe(legacyTagId('spouted'));
  });
});

describe('recipeIdFromLegacySetting', () => {
  it('finds the prefilled recipe by its name, in any case', () => {
    expect(recipeIdFromLegacySetting('Cappuccino')).toBe(SEED_IDS.cappuccino);
    expect(recipeIdFromLegacySetting('flat WHITE')).toBe(SEED_IDS.flatWhite);
  });

  it('is null for anything else', () => {
    for (const value of ['Mocha', '', null, undefined, 2, { name: 'Espresso' }]) {
      expect(recipeIdFromLegacySetting(value)).toBeNull();
    }
  });
});
