import { describe, expect, it } from 'vitest';
import { byId, ENTITY_KINDS, isListed, normaliseEntity, updateEntity } from './entities';
import { idTimestampMs, isId } from './ids';
import {
  DEFAULT_RECIPE_ID,
  isPristineSeed,
  isSeedId,
  SEED_EPOCH_MS,
  SEED_IDS,
  SEEDS,
} from './seeds';

describe('the seed ids', () => {
  const ids = Object.values(SEED_IDS);

  it('are UUIDv7s at the seeds’ time, all different, sorting in the list’s order', () => {
    for (const id of ids) {
      expect(isId(id), id).toBe(true);
      expect(idTimestampMs(id), id).toBe(SEED_EPOCH_MS);
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });

  it('are each used once, by a seed or the seeded basket', () => {
    const used = [
      ...ENTITY_KINDS.flatMap((kind) => SEEDS[kind].map((entity) => entity.id)),
      ...SEEDS.machines.flatMap((machine) => machine.baskets.map((basket) => basket.id)),
    ];
    expect(used.sort()).toEqual([...ids].sort());
  });
});

describe('the seeds', () => {
  it('are the spec’s target hardware, its recipes and T1.18’s tags', () => {
    expect(SEEDS.machines.map((m) => [m.name, m.pressureBar, m.baskets])).toEqual([
      ['Gaggia Classic Pro', 6, [{ id: SEED_IDS.lm17, name: 'LM 17 g', sizeG: 17 }]],
    ]);
    expect(SEEDS.grinders.map((g) => `${g.brand} ${g.model} (${g.settingKind})`)).toEqual([
      'Eureka ORO Mignon Single Dose Pro (stepless)',
      'Comandante C40 MK4 Red Clix (clicks)',
    ]);
    expect(SEEDS.recipes.map((r) => `${r.name} 1:${r.coffeeRatio}+${r.milkRatio}`)).toEqual([
      'Ristretto 1:1.5+null',
      'Espresso 1:2+null',
      'Lungo 1:3+null',
      'Cortado 1:2+1',
      'Cappuccino 1:2+3',
      'Flat white 1:2+4',
      'Latte 1:2+6',
    ]);
    expect(SEEDS.tags.map((t) => `${t.name}${t.isDefault ? ' (on)' : ''}`)).toEqual([
      'WDT (on)',
      'Puck screen (on)',
      'RDT',
      'Paper filter',
      'Warm-up < 15 min',
      'New basket',
      'Experiment',
    ]);
    expect(SEEDS.packs).toEqual([]);
    expect(SEEDS.containers).toEqual([]);
    expect(SEEDS.recipes.find((r) => r.id === DEFAULT_RECIPE_ID)?.name).toBe('Espresso');
  });

  it('are complete, listed, at the seeds’ time, and in id order', () => {
    for (const kind of ENTITY_KINDS) {
      for (const entity of SEEDS[kind]) {
        expect(normaliseEntity(kind, entity)).toStrictEqual(entity);
        expect(isListed(entity)).toBe(true);
        expect(entity.createdAtEpochMs).toBe(SEED_EPOCH_MS);
        expect(entity.updatedAtEpochMs).toBe(SEED_EPOCH_MS);
      }
      expect([...SEEDS[kind]].sort(byId)).toEqual(SEEDS[kind]);
    }
    expect(SEEDS.grinders.every((grinder) => grinder.currentSetting === null)).toBe(true);
  });
});

describe('isPristineSeed', () => {
  const espresso = SEEDS.recipes[1];

  it('holds for a seed as seeded, read back from JSON too', () => {
    expect(isPristineSeed(espresso)).toBe(true);
    const stored = normaliseEntity('recipes', JSON.parse(JSON.stringify(espresso)));
    expect(isPristineSeed(stored)).toBe(true);
    expect(isSeedId(espresso.id)).toBe(true);
  });

  it('fails for a seed someone changed, even back to its values, or removed', () => {
    const edited = updateEntity('recipes', espresso, { coffeeRatio: 2.2 }, SEED_EPOCH_MS + 1);
    expect(isPristineSeed(edited)).toBe(false);
    const back = updateEntity('recipes', edited, { coffeeRatio: 2 }, SEED_EPOCH_MS + 2);
    expect(isPristineSeed(back)).toBe(false);
    const removed = updateEntity('recipes', espresso, { removedAtEpochMs: 5 }, SEED_EPOCH_MS);
    expect(isPristineSeed(removed)).toBe(false);
  });

  it('fails for an entity that isn’t a seed', () => {
    const other = { ...espresso, id: '01a1095c-3400-7fff-8000-000000000000' };
    expect(isPristineSeed(other)).toBe(false);
    expect(isSeedId(other.id)).toBe(false);
  });
});
