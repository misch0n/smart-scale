import { describe, expect, it } from 'vitest';
import {
  createEntity,
  SEEDS,
  updateEntity,
  type CoffeePack,
  type Container,
} from '../../core/model';
import {
  containersSummary,
  dateLabel,
  daysOffRoast,
  editorRatio,
  grindersSummary,
  machineSummary,
  packGroups,
  packsSummary,
  packSubtitle,
  packTitle,
  recipeRatios,
  recipesSummary,
  settingLabel,
  shotCount,
  STEPS,
  stepped,
  tagShotCounts,
  tagsSummary,
  todayDate,
} from './format';

const NOW = Date.UTC(2026, 9, 4, 7, 0);
const TODAY = '2026-10-04';

function pack(name: string, dates: Partial<CoffeePack> = {}): CoffeePack {
  return {
    ...createEntity(
      'packs',
      {
        brand: 'Local roaster',
        name,
        weightG: 250,
        roastDate: '2026-09-22',
        openDate: null,
        flavours: [],
        finishedDate: null,
        buyAgain: null,
      },
      NOW,
    ),
    ...dates,
  };
}

function container(name: string, emptyMassG: number): Container {
  return createEntity(
    'containers',
    { name, emptyMassG, roles: ['cup'], dismissedWarningIds: [] },
    NOW,
  );
}

describe('dates', () => {
  it('write a day and month, with the year when it isn’t this one', () => {
    expect(dateLabel('2026-09-22', TODAY)).toBe('22 Sep');
    expect(dateLabel('2025-12-01', TODAY)).toBe('1 Dec 2025');
    expect(todayDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('count days off roast', () => {
    expect(daysOffRoast({ roastDate: '2026-09-22' }, TODAY)).toBe(12);
  });
});

describe('steppers', () => {
  it('step on the grid, within the limits, and start from a value when none is set', () => {
    expect(stepped(6, 1, STEPS.pressureBar)).toBe(6.5);
    expect(stepped(15, 1, STEPS.pressureBar)).toBe(15);
    expect(stepped(null, 1, STEPS.pressureBar)).toBe(9);
    expect(stepped(null, -1, STEPS.pressureBar)).toBe(9);
    expect(stepped(6.2, 1, STEPS.stepless)).toBe(6.3);
    expect(stepped(2.0000001, -1, STEPS.coffeeRatio)).toBe(1.9);
    expect(stepped(1, -1, STEPS.coffeeRatio)).toBe(1);
    expect(stepped(22, -1, STEPS.clicks)).toBe(21);
  });

  it('write settings, pressures and ratios', () => {
    expect(settingLabel('stepless', 6.25)).toBe('6.3');
    expect(settingLabel('clicks', 22)).toBe('22');
    expect(settingLabel('clicks', null)).toBe('–');
    expect(recipeRatios({ coffeeRatio: 2, milkRatio: 3 })).toBe('1:2 + milk 1:3');
    expect(recipeRatios({ coffeeRatio: 1.5, milkRatio: null })).toBe('1:1.5');
    expect(editorRatio(2)).toBe('1:2.0');
  });
});

describe('packs', () => {
  it('split the name into a title and the rest, with the brand', () => {
    const guji = pack('Ethiopia Guji · Natural');
    expect(packTitle(guji)).toBe('Ethiopia Guji');
    expect(packSubtitle(guji)).toBe('Natural · Local roaster');
    expect(packSubtitle({ name: 'Kenya Nyeri', brand: null })).toBeNull();
    expect(packTitle({ name: '' })).toBe('Unnamed pack');
  });

  it('group as the board does: open, unopened, finished, removed left out', () => {
    const open = pack('Open', { openDate: '2026-09-26' });
    const opened = pack('Opened later', { openDate: '2026-10-01' });
    const unopened = pack('Unopened', { roastDate: '2026-09-30' });
    const older = pack('Older unopened', { roastDate: '2026-09-01' });
    const finished = pack('Finished', { openDate: '2026-09-01', finishedDate: '2026-09-25' });
    const removed = pack('Removed', { removedAtEpochMs: NOW });
    const groups = packGroups([open, unopened, finished, removed, opened, older]);
    expect(groups.open).toEqual([opened, open]);
    expect(groups.unopened).toEqual([older, unopened]);
    expect(groups.finished).toEqual([finished]);
    expect(packsSummary([open, unopened], null, TODAY)).toBe('Open · day 12 · 1 unopened');
    // The pack in use, unopened still, isn't counted among the others.
    expect(packsSummary([open, unopened], unopened, TODAY)).toMatch(/ · day \d+$/);
    expect(packsSummary([], null, TODAY)).toBe('None yet');
  });
});

describe('the list’s summaries', () => {
  it('say the machine, the grinder in use, the recipes and the tags', () => {
    expect(machineSummary(SEEDS.machines[0])).toBe('Gaggia Classic Pro · 6.0 bar · 1 basket');
    expect(machineSummary({ ...SEEDS.machines[0], pressureBar: null, baskets: [] })).toBe(
      'Gaggia Classic Pro · 0 baskets',
    );
    expect(machineSummary(null)).toBe('None');
    const oro = updateEntity('grinders', SEEDS.grinders[0], { currentSetting: 6.2 }, NOW);
    expect(grindersSummary(oro)).toBe('ORO Mignon Single Dose Pro (default) · 6.2');
    expect(grindersSummary(SEEDS.grinders[1])).toBe('C40 MK4 Red Clix (default)');
    expect(recipesSummary(SEEDS.recipes, SEEDS.recipes[4])).toBe('7 · last: Cappuccino');
    expect(tagsSummary(SEEDS.tags)).toBe('7 · 2 default');
    expect(tagsSummary(SEEDS.tags, true)).toBe('7 tags · 2 default');
  });

  it('count containers and their warnings', () => {
    expect(containersSummary([])).toEqual({ count: 'None yet', warnings: null });
    const jug = container('Milk jug', 181.4);
    const tumbler = container('Glass tumbler', 182);
    expect(containersSummary([jug, tumbler, container('Cup', 112.6)])).toEqual({
      count: '3',
      warnings: '1 warning',
    });
  });

  it('count the shots of each tag, in any case, once a shot', () => {
    const counts = tagShotCounts([
      { tags: ['WDT', 'Puck screen'] },
      { tags: ['wdt', 'WDT'] },
      { tags: null },
      { tags: [] },
    ]);
    expect(counts.get('wdt')).toBe(2);
    expect(counts.get('puck screen')).toBe(1);
    expect(shotCount(1)).toBe('1 shot');
    expect(shotCount(0)).toBe('0 shots');
  });
});
