import { describe, expect, it } from 'vitest';
import { createEntity, NO_MAINTENANCE, type Grinder, type Machine } from './entities';
import {
  maintenanceItems,
  maintenanceReminders,
  maintenanceStatus,
  nextMaintenance,
  SOON_DAYS,
} from './maintenance';

const NOW = Date.UTC(2026, 9, 5, 7, 0);
const TODAY = '2026-10-05';

function machine(descale = NO_MAINTENANCE, backflush = NO_MAINTENANCE): Machine {
  return createEntity(
    'machines',
    { name: 'Gaggia Classic Pro', pressureBar: null, baskets: [], descale, backflush },
    NOW,
  );
}

function grinder(model: string, care = NO_MAINTENANCE): Grinder {
  return createEntity(
    'grinders',
    {
      brand: 'Eureka',
      model,
      settingKind: 'stepless',
      currentSetting: null,
      settingStep: null,
      care,
    },
    NOW,
  );
}

describe('maintenanceStatus', () => {
  it('is due once the interval has run from the day it was last done', () => {
    // The board's descale: last 1 Aug, every 60 days, so due 30 Sep: 5 days overdue on 5 Oct.
    expect(maintenanceStatus({ lastDoneDate: '2026-08-01', reminderDays: 60 }, TODAY)).toEqual({
      state: 'due',
      dueDate: '2026-09-30',
      daysLeft: -5,
    });
    expect(maintenanceStatus({ lastDoneDate: '2026-09-21', reminderDays: 14 }, TODAY)).toEqual({
      state: 'due',
      dueDate: TODAY,
      daysLeft: 0,
    });
  });

  it('is coming up in the week before, and later before that', () => {
    // The board's backflush: last 23 Sep, every 14 days: due 7 Oct, in 2 days.
    expect(maintenanceStatus({ lastDoneDate: '2026-09-23', reminderDays: 14 }, TODAY)).toEqual({
      state: 'soon',
      dueDate: '2026-10-07',
      daysLeft: 2,
    });
    expect(
      maintenanceStatus({ lastDoneDate: '2026-09-28', reminderDays: SOON_DAYS + 7 }, TODAY),
    ).toMatchObject({ state: 'soon', daysLeft: SOON_DAYS });
    expect(
      maintenanceStatus({ lastDoneDate: '2026-09-29', reminderDays: SOON_DAYS + 7 }, TODAY),
    ).toMatchObject({ state: 'later', daysLeft: SOON_DAYS + 1 });
  });

  it('raises nothing never logged, or without an interval', () => {
    expect(maintenanceStatus({ lastDoneDate: null, reminderDays: 30 }, TODAY)).toEqual({
      state: 'none',
    });
    expect(maintenanceStatus({ lastDoneDate: '2026-01-01', reminderDays: null }, TODAY)).toEqual({
      state: 'none',
    });
  });

  it('counts across months and years', () => {
    expect(
      maintenanceStatus({ lastDoneDate: '2025-12-20', reminderDays: 30 }, '2026-01-18'),
    ).toMatchObject({ state: 'soon', dueDate: '2026-01-19', daysLeft: 1 });
  });
});

describe('maintenanceItems and the reminders', () => {
  const gaggia = machine(
    { lastDoneDate: '2026-08-01', reminderDays: 60 },
    { lastDoneDate: '2026-09-23', reminderDays: 14 },
  );
  const oro = grinder('ORO Mignon', { lastDoneDate: '2026-09-10', reminderDays: 30 });
  const c40 = grinder('C40');
  const removed = { ...grinder('Old'), removedAtEpochMs: NOW };
  const items = maintenanceItems([gaggia], [oro, c40, removed], TODAY);

  it('lists the listed machines’ descale and backflush, then each listed grinder’s care', () => {
    expect(items.map(({ kind, owner }) => `${kind} ${owner.name}`)).toEqual([
      'descale Gaggia Classic Pro',
      'backflush Gaggia Classic Pro',
      'care ORO Mignon',
      'care C40',
    ]);
    expect(items[2].owner).toEqual({ entity: 'grinders', id: oro.id, name: 'ORO Mignon' });
  });

  it('reminds of what is due, and with soon of what comes up, the most pressing first', () => {
    expect(maintenanceReminders(items, { soon: false }).map(({ kind }) => kind)).toEqual([
      'descale',
    ]);
    // Care: 10 Sep + 30 days is 10 Oct, in 5 days; the backflush in 2.
    expect(maintenanceReminders(items, { soon: true }).map(({ kind }) => kind)).toEqual([
      'descale',
      'backflush',
      'care',
    ]);
  });

  it('finds the next one due, among those with a reminder', () => {
    expect(nextMaintenance(items)?.kind).toBe('descale');
    const later = maintenanceItems(
      [machine({ lastDoneDate: TODAY, reminderDays: 60 }, NO_MAINTENANCE)],
      [grinder('ORO', { lastDoneDate: TODAY, reminderDays: 30 })],
      TODAY,
    );
    expect(nextMaintenance(later)?.kind).toBe('care');
    expect(nextMaintenance(maintenanceItems([machine()], [c40], TODAY))).toBeNull();
  });
});
