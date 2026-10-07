import { describe, expect, it } from 'vitest';
import {
  createEntity,
  maintenanceStatus,
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
  maintenanceBadge,
  reminderEvery,
  steppedReminder,
  packGroups,
  packsSummary,
  packSubtitle,
  packTitle,
  recipeRatios,
  recipesSummary,
  settingLabel,
  steppedSetting,
  grindStep,
  GRIND_STEP_OPTIONS,
  shotCount,
  STEPS,
  stepped,
  tagShotCounts,
  tagsSummary,
  todayDate,
  toggledRole,
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

  it("move a grinder's setting by its step, from where it is (T2.28)", () => {
    const oro = { settingKind: 'stepless', settingStep: 0.05, currentSetting: 6 } as const;
    expect(grindStep(oro)).toBe(0.05);
    expect(steppedSetting(oro, 1)).toBe(6.05);
    expect(steppedSetting({ ...oro, currentSetting: 6.05 }, -3)).toBe(5.9);
    // Not snapped to the step's grid: 6.05 goes up a tenth to 6.15.
    expect(steppedSetting({ ...oro, settingStep: 0.1, currentSetting: 6.05 }, 1)).toBe(6.15);
    // No step of its own: the kind's.
    expect(grindStep({ ...oro, settingStep: null })).toBe(0.1);
    expect(steppedSetting({ ...oro, settingStep: null }, 1)).toBe(6.1);
    // Clicks step one click, whatever is stored.
    const c40 = { settingKind: 'clicks', settingStep: 0.05, currentSetting: 22 } as const;
    expect(grindStep(c40)).toBe(1);
    expect(steppedSetting(c40, -1)).toBe(21);
    // Unset, the kind's start; within the limits.
    expect(steppedSetting({ ...oro, currentSetting: null }, 1)).toBe(STEPS.stepless.start);
    expect(steppedSetting({ ...oro, currentSetting: 0.02 }, -1)).toBe(0);
    expect(steppedSetting({ ...c40, currentSetting: 100 }, 1)).toBe(100);
    expect(GRIND_STEP_OPTIONS).toContain(0.05);
  });

  it('write settings, pressures and ratios', () => {
    expect(settingLabel('stepless', 6.25)).toBe('6.25');
    expect(settingLabel('stepless', 6.05)).toBe('6.05');
    expect(settingLabel('stepless', 6.2)).toBe('6.2');
    expect(settingLabel('stepless', 6)).toBe('6.0');
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

describe('maintenance', () => {
  const status = (lastDoneDate: string | null, reminderDays: number | null) =>
    maintenanceStatus({ lastDoneDate, reminderDays }, TODAY);

  it('badges what is due or coming up as the boards do', () => {
    expect(maintenanceBadge(status('2026-07-31', 61))).toEqual({
      text: '4 days overdue',
      tone: 'warn',
    });
    expect(maintenanceBadge(status('2026-09-03', 30))).toEqual({
      text: '1 day overdue',
      tone: 'warn',
    });
    expect(maintenanceBadge(status('2026-09-04', 30))).toEqual({ text: 'due today', tone: 'warn' });
    expect(maintenanceBadge(status('2026-09-23', 14))).toEqual({
      text: 'in 3 days',
      tone: 'caution',
    });
    expect(maintenanceBadge(status('2026-09-21', 14))).toEqual({
      text: 'tomorrow',
      tone: 'caution',
    });
    expect(maintenanceBadge(status('2026-09-30', 30))).toBeNull();
    expect(maintenanceBadge(status(null, 30))).toBeNull();
  });

  it('writes the reminder', () => {
    expect(reminderEvery(60)).toBe('Every 60 days');
    expect(reminderEvery(1)).toBe('Every day');
  });

  it('steps the reminder through its intervals', () => {
    expect(steppedReminder(null, 1)).toBe(30);
    expect(steppedReminder(null, -1)).toBe(30);
    expect(steppedReminder(30, 1)).toBe(45);
    expect(steppedReminder(30, -2)).toBe(14);
    expect(steppedReminder(7, -1)).toBe(7);
    expect(steppedReminder(365, 1)).toBe(365);
    // Off the list, from an import: to the next one that way.
    expect(steppedReminder(50, 1)).toBe(60);
    expect(steppedReminder(50, -1)).toBe(45);
    expect(steppedReminder(400, -1)).toBe(365);
    expect(steppedReminder(3, 1)).toBe(7);
  });
});

describe('toggledRole', () => {
  it('switches a role, keeping their order: one container can have several', () => {
    expect(toggledRole(['cup'], 'bean')).toEqual(['bean', 'cup']);
    expect(toggledRole(['bean', 'cup'], 'bean')).toEqual(['cup']);
  });

  it('keeps a scale accessory to itself (T2.17)', () => {
    expect(toggledRole(['bean', 'grind'], 'accessory')).toEqual(['accessory']);
    expect(toggledRole(['accessory'], 'cup')).toEqual(['cup']);
    expect(toggledRole(['accessory'], 'accessory')).toEqual([]);
  });
});
