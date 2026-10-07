import { describe, expect, it } from 'vitest';
import { createEntity, NO_MAINTENANCE, updateEntity } from './entities';
import { SEED_IDS, SEEDS } from './seeds';
import { createShot } from './shot';
import { packAgeAt, shotSnapshot } from './snapshot';

const NOW = Date.UTC(2026, 9, 6, 7, 12);
const REC = '01923456-789a-7000-8000-000000000001';

const machine = updateEntity(
  'machines',
  SEEDS.machines[0],
  {
    descale: { lastDoneDate: '2026-08-01', reminderDays: 60 },
    backflush: { lastDoneDate: '2026-09-23', reminderDays: null },
  },
  NOW,
);
const grinder = updateEntity(
  'grinders',
  SEEDS.grinders[0],
  { currentSetting: 6.2, care: { lastDoneDate: '2026-09-10', reminderDays: 30 } },
  NOW,
);
const pack = createEntity(
  'packs',
  {
    brand: 'Local roaster',
    name: 'Ethiopia Guji · Natural',
    weightG: 250,
    roastDate: '2026-09-22',
    openDate: '2026-09-26',
    flavours: ['Blueberry', 'Jasmine'],
    finishedDate: null,
    buyAgain: null,
  },
  NOW,
);
const cappuccino = SEEDS.recipes[4];

describe('shotSnapshot', () => {
  it('takes the ids and the values at brew time', () => {
    expect(
      shotSnapshot({ recipe: cappuccino, machine, basket: machine.baskets[0], grinder, pack }),
    ).toEqual({
      targetRatio: 2,
      recipeId: SEED_IDS.cappuccino,
      recipeName: 'Cappuccino',
      milkRatio: 3,
      machineId: SEED_IDS.gaggia,
      machineName: 'Gaggia Classic Pro',
      pressureBar: 6,
      basketId: SEED_IDS.lm17,
      basketSizeG: 17,
      grinderId: SEED_IDS.oro,
      grinderName: 'Eureka ORO Mignon Single Dose Pro',
      grindSetting: { kind: 'stepless', value: 6.2 },
      packId: pack.id,
      packName: 'Local roaster · Ethiopia Guji · Natural',
      packRoastDate: '2026-09-22',
      packOpenDate: '2026-09-26',
      lastDescaleDate: '2026-08-01',
      lastBackflushDate: '2026-09-23',
      lastGrinderCareDate: '2026-09-10',
    });
  });

  it('is null for whatever the context lacks, and for a setting not set yet', () => {
    const snapshot = shotSnapshot({
      recipe: null,
      machine: null,
      basket: null,
      grinder: SEEDS.grinders[1],
      pack: null,
    });
    expect(snapshot.grinderName).toBe('Comandante C40 MK4 Red Clix');
    expect(snapshot.grindSetting).toBeNull();
    const rest = { ...snapshot, grinderId: null, grinderName: null };
    expect(Object.values(rest).every((value) => value === null)).toBe(true);
  });

  it('makes a valid shot', () => {
    const grinderInClicks = createEntity(
      'grinders',
      {
        brand: 'Comandante',
        model: 'C40',
        settingKind: 'clicks',
        currentSetting: 22,
        settingStep: null,
        care: NO_MAINTENANCE,
      },
      NOW,
    );
    const shot = createShot(
      {
        recordingId: REC,
        anchorTMs: 30_000,
        source: 'live',
        ...shotSnapshot({
          recipe: cappuccino,
          machine,
          basket: machine.baskets[0],
          grinder: grinderInClicks,
          pack,
        }),
      },
      NOW,
    );
    expect(shot.grindSetting).toEqual({ kind: 'clicks', value: 22 });
    expect(shot.packId).toBe(pack.id);
  });
});

describe('packAgeAt', () => {
  it('counts the days off roast and open on the day the shot was pulled, in local time', () => {
    const shot = { packRoastDate: '2026-09-22', packOpenDate: '2026-09-26' };
    // 23:30 UTC on 4 October is 5 October in UTC+2.
    const at = Date.UTC(2026, 9, 4, 23, 30);
    expect(packAgeAt(shot, at, 0)).toEqual({ daysOffRoast: 12, daysOpen: 8 });
    expect(packAgeAt(shot, at, -120)).toEqual({ daysOffRoast: 13, daysOpen: 9 });
    expect(packAgeAt({ packRoastDate: null, packOpenDate: null }, at, 0)).toEqual({
      daysOffRoast: null,
      daysOpen: null,
    });
  });
});
