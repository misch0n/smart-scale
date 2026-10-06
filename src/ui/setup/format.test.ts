import { describe, expect, it } from 'vitest';
import {
  createEntity,
  maintenanceItems,
  maintenanceStatus,
  NO_MAINTENANCE,
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
  maintenanceSummary,
  reminderText,
  steppedReminder,
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
    expect(reminderText(60)).toBe('Reminder every 60 days');
    expect(reminderText(1)).toBe('Reminder every day');
    expect(reminderText(null)).toBe('No reminder');
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

  it('sums up what comes due next for Setup’s row', () => {
    const machine = (descale = NO_MAINTENANCE, backflush = NO_MAINTENANCE) =>
      createEntity(
        'machines',
        { name: 'Gaggia', pressureBar: null, baskets: [], descale, backflush },
        NOW,
      );
    const summary = (descale = NO_MAINTENANCE, backflush = NO_MAINTENANCE) =>
      maintenanceSummary(maintenanceItems([machine(descale, backflush)], [], TODAY));
    expect(summary({ lastDoneDate: '2026-07-31', reminderDays: 61 })).toEqual({
      text: 'Descale overdue',
      tone: 'warn',
    });
    expect(summary({ lastDoneDate: '2026-09-04', reminderDays: 30 })).toEqual({
      text: 'Descale due today',
      tone: 'warn',
    });
    expect(
      summary(
        { lastDoneDate: TODAY, reminderDays: 60 },
        { lastDoneDate: '2026-09-23', reminderDays: 14 },
      ),
    ).toEqual({ text: 'Backflush in 3 days', tone: 'caution' });
    expect(summary({ lastDoneDate: TODAY, reminderDays: 60 })).toEqual({
      text: 'Descale in 60 days',
      tone: null,
    });
    expect(summary({ lastDoneDate: TODAY, reminderDays: null })).toEqual({
      text: 'No reminders',
      tone: null,
    });
  });
});
