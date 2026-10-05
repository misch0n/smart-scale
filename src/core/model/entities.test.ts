import { describe, expect, it } from 'vitest';
import {
  byId,
  createEntity,
  emptyEntityLists,
  ENTITY_KINDS,
  ENTITY_NAMES,
  grinderName,
  isListed,
  NO_MAINTENANCE,
  normaliseEntity,
  packName,
  sameEntityIdentity,
  updateEntity,
  type EntityChanges,
  type Grinder,
  type Machine,
  type NewEntity,
} from './entities';
import { isId } from './ids';
import { SchemaError } from './schema';

const NOW = Date.UTC(2026, 9, 6, 7, 0);
const BASKET = '01a1095c-3400-7001-8000-000000000001';

const NEW_MACHINE: NewEntity<'machines'> = {
  name: 'Gaggia Classic Pro',
  pressureBar: 6,
  baskets: [{ id: BASKET, name: 'LM 17 g', sizeG: 17 }],
  descale: NO_MAINTENANCE,
  backflush: { lastDoneDate: '2026-09-23', reminderDays: 14 },
};

const NEW_GRINDER: NewEntity<'grinders'> = {
  brand: 'Comandante',
  model: 'C40 MK4 Red Clix',
  settingKind: 'clicks',
  currentSetting: 22,
  care: NO_MAINTENANCE,
};

describe('createEntity', () => {
  it('gives a new entity an id, its times and no tombstone', () => {
    const machine = createEntity('machines', NEW_MACHINE, NOW);
    expect(isId(machine.id)).toBe(true);
    expect(machine).toEqual({
      id: machine.id,
      createdAtEpochMs: NOW,
      updatedAtEpochMs: NOW,
      removedAtEpochMs: null,
      ...NEW_MACHINE,
    });
  });

  it('keeps an id it is given', () => {
    const id = '01a1095c-3400-7abc-8000-000000000042';
    expect(createEntity('grinders', { ...NEW_GRINDER, id }, NOW).id).toBe(id);
  });

  it('refuses a malformed entity, naming the place', () => {
    const bad = { ...NEW_MACHINE, baskets: [{ id: BASKET, name: null, sizeG: '17' }] };
    expect(() => createEntity('machines', bad as unknown as NewEntity<'machines'>, NOW)).toThrow(
      'machine.baskets[0].sizeG:',
    );
  });
});

describe('normaliseEntity', () => {
  it('names each kind in its paths', () => {
    for (const kind of ENTITY_KINDS) {
      expect(() => normaliseEntity(kind, {})).toThrow(`${ENTITY_NAMES[kind]}.id:`);
    }
    expect(() => normaliseEntity('packs', {}, 'entities.packs[3]')).toThrow(
      'entities.packs[3].id:',
    );
  });

  it('takes a decimal stepless setting and whole clicks, and refuses fractional clicks', () => {
    const clicks = createEntity('grinders', NEW_GRINDER, NOW);
    expect(normaliseEntity('grinders', clicks).currentSetting).toBe(22);
    const stepless = { ...clicks, settingKind: 'stepless', currentSetting: 6.25 };
    expect(normaliseEntity('grinders', stepless).currentSetting).toBe(6.25);
    expect(() => normaliseEntity('grinders', { ...clicks, currentSetting: 22.5 })).toThrow(
      'grinder.currentSetting: expected a whole number of clicks',
    );
    expect(normaliseEntity('grinders', { ...clicks, currentSetting: null }).currentSetting).toBe(
      null,
    );
  });

  it('checks dates as YYYY-MM-DD, and reminders as whole days', () => {
    const machine = createEntity('machines', NEW_MACHINE, NOW);
    expect(() =>
      normaliseEntity('machines', { ...machine, descale: { lastDoneDate: '1 Aug' } }),
    ).toThrow('machine.descale.lastDoneDate: expected a date as YYYY-MM-DD');
    expect(() =>
      normaliseEntity('machines', { ...machine, backflush: { reminderDays: 1.5 } }),
    ).toThrow('machine.backflush.reminderDays: expected an integer ≥ 0');
  });

  it('refuses an unknown container role and a pack without its roast date', () => {
    const container = createEntity(
      'containers',
      { name: 'Dosing cup', emptyMassG: 41, roles: ['bean', 'grind'], dismissedWarningIds: [] },
      NOW,
    );
    expect(() => normaliseEntity('containers', { ...container, roles: ['portafilter'] })).toThrow(
      'container.roles[0]: expected one of "bean", "grind", "cup", "milk"',
    );
    const pack = createEntity(
      'packs',
      {
        brand: null,
        name: 'Kenya Nyeri',
        weightG: null,
        roastDate: '2026-09-30',
        openDate: null,
        flavours: [],
        finishedDate: null,
        buyAgain: null,
      },
      NOW,
    );
    expect(() => normaliseEntity('packs', { ...pack, roastDate: null })).toThrow(
      'pack.roastDate: expected a date as YYYY-MM-DD, got null',
    );
  });
});

describe('updateEntity', () => {
  const grinder = createEntity('grinders', NEW_GRINDER, NOW);

  it('applies changes and moves updatedAtEpochMs only', () => {
    const changed = updateEntity('grinders', grinder, { currentSetting: 21 }, NOW + 5000);
    expect(changed).toEqual({ ...grinder, currentSetting: 21, updatedAtEpochMs: NOW + 5000 });
    expect(grinder.currentSetting).toBe(22);
  });

  it('skips undefined changes and clears fields set to null', () => {
    const changed = updateEntity(
      'grinders',
      grinder,
      { currentSetting: null, model: undefined },
      NOW + 1,
    );
    expect(changed.currentSetting).toBeNull();
    expect(changed.model).toBe(grinder.model);
  });

  it('removes an entity with a tombstone, and restores it', () => {
    const removed = updateEntity('grinders', grinder, { removedAtEpochMs: NOW + 9 }, NOW + 9);
    expect(isListed(removed)).toBe(false);
    expect(removed.removedAtEpochMs).toBe(NOW + 9);
    expect(isListed(updateEntity('grinders', removed, { removedAtEpochMs: null }, NOW + 10))).toBe(
      true,
    );
  });

  it.each(['id', 'createdAtEpochMs', 'updatedAtEpochMs'])('refuses to change %s', (key) => {
    const changes = { [key]: 1 } as unknown as EntityChanges<'grinders'>;
    expect(() => updateEntity('grinders', grinder, changes, NOW + 1)).toThrow(TypeError);
  });

  it('refuses a malformed value', () => {
    const changes = { settingKind: 'turns' } as unknown as EntityChanges<'grinders'>;
    expect(() => updateEntity('grinders', grinder, changes, NOW + 1)).toThrow(SchemaError);
  });
});

describe('identity and order', () => {
  it('is the id and the creation time', () => {
    const a = createEntity('machines', NEW_MACHINE, NOW);
    const edited: Machine = { ...a, name: 'Gaggia', updatedAtEpochMs: NOW + 1 };
    expect(sameEntityIdentity(a, edited)).toBe(true);
    expect(sameEntityIdentity(a, { ...a, createdAtEpochMs: NOW - 1 })).toBe(false);
    expect(sameEntityIdentity(a, createEntity('machines', NEW_MACHINE, NOW))).toBe(false);
  });

  it('sorts by id, which is creation order', () => {
    const first = createEntity('grinders', NEW_GRINDER, NOW);
    const second = createEntity('grinders', NEW_GRINDER, NOW);
    expect([second, first].sort(byId)).toEqual([first, second]);
  });

  it('has an empty list for every kind', () => {
    expect(Object.keys(emptyEntityLists())).toEqual(ENTITY_KINDS);
  });
});

describe('names in a shot', () => {
  it('joins a grinder’s brand and model', () => {
    expect(grinderName({ brand: 'Eureka', model: 'ORO Mignon Single Dose Pro' })).toBe(
      'Eureka ORO Mignon Single Dose Pro',
    );
    expect(grinderName({ brand: '', model: 'Hand grinder' } satisfies Partial<Grinder>)).toBe(
      'Hand grinder',
    );
  });

  it('joins a pack’s brand and name, without a missing brand', () => {
    expect(packName({ brand: 'Local roaster', name: 'Ethiopia Guji · Natural' })).toBe(
      'Local roaster · Ethiopia Guji · Natural',
    );
    expect(packName({ brand: null, name: 'Kenya Nyeri' })).toBe('Kenya Nyeri');
  });
});
