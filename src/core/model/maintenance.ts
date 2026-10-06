/**
 * When maintenance comes due (spec v2 "Maintenance"; T2.10, D-083). Each date lives on what it
 * maintains (D-074): the machine's descale and backflush, each grinder's care, with an optional
 * reminder interval. It is due once the interval has run from the day it was last done, and
 * coming up in the week before. Never logged, or with no interval, it raises nothing.
 *
 * Pure: today's date comes in, as `YYYY-MM-DD` (`dates.ts`).
 */

import { addDays, daysBetween } from './dates';
import { isListed, type Grinder, type Machine, type Maintenance } from './entities';
import type { Id } from './ids';

/** A reminder is coming up this many days before it is due: Setup shows it, Home waits. */
export const SOON_DAYS = 7;

/** The maintenance dates: the machine's descale and backflush, a grinder's care. */
export const MAINTENANCE_KINDS = ['descale', 'backflush', 'care'] as const;
export type MaintenanceKind = (typeof MAINTENANCE_KINDS)[number];

/** Where a maintenance date stands on a day. */
export type MaintenanceStatus =
  /** No reminder: never logged, or no interval. */
  | { readonly state: 'none' }
  | {
      /** `due` on the day and after, `soon` within `SOON_DAYS` of it, `later` before that. */
      readonly state: 'due' | 'soon' | 'later';
      /** The day it comes due. */
      readonly dueDate: string;
      /** Days until then: 0 on the day, negative when overdue. */
      readonly daysLeft: number;
    };

export function maintenanceStatus(maintenance: Maintenance, today: string): MaintenanceStatus {
  const { lastDoneDate, reminderDays } = maintenance;
  if (lastDoneDate === null || reminderDays === null) return { state: 'none' };
  const dueDate = addDays(lastDoneDate, reminderDays);
  const daysLeft = daysBetween(today, dueDate);
  const state = daysLeft <= 0 ? 'due' : daysLeft <= SOON_DAYS ? 'soon' : 'later';
  return { state, dueDate, daysLeft };
}

/** A maintenance date of a listed machine or grinder, and where it stands. */
export interface MaintenanceItem {
  readonly kind: MaintenanceKind;
  /** What it maintains. */
  readonly owner:
    | { readonly entity: 'machines'; readonly id: Id; readonly name: string }
    | { readonly entity: 'grinders'; readonly id: Id; readonly name: string };
  readonly maintenance: Maintenance;
  readonly status: MaintenanceStatus;
}

/** Every maintenance date of the listed machines, then the listed grinders, in list order. */
export function maintenanceItems(
  machines: readonly Machine[],
  grinders: readonly Grinder[],
  today: string,
): MaintenanceItem[] {
  const item = (
    kind: MaintenanceKind,
    owner: MaintenanceItem['owner'],
    maintenance: Maintenance,
  ): MaintenanceItem => ({
    kind,
    owner,
    maintenance,
    status: maintenanceStatus(maintenance, today),
  });
  return [
    ...machines.filter(isListed).flatMap((machine) => {
      const owner = { entity: 'machines', id: machine.id, name: machine.name } as const;
      return [item('descale', owner, machine.descale), item('backflush', owner, machine.backflush)];
    }),
    ...grinders
      .filter(isListed)
      .map((grinder) =>
        item(
          'care',
          { entity: 'grinders', id: grinder.id, name: grinder.model || grinder.brand },
          grinder.care,
        ),
      ),
  ];
}

/**
 * The reminders among `items`: those due, and with `soon` those coming up too; the most pressing
 * first (the fewest days left), else in the items' order.
 */
export function maintenanceReminders(
  items: readonly MaintenanceItem[],
  { soon }: { readonly soon: boolean },
): MaintenanceItem[] {
  const shown = items.filter(
    ({ status }) => status.state === 'due' || (soon && status.state === 'soon'),
  );
  return shown
    .map((item, index) => ({ item, index }))
    .sort((a, b) => daysLeft(a.item) - daysLeft(b.item) || a.index - b.index)
    .map(({ item }) => item);
}

/** The item that comes due next: the fewest days left among those with a reminder. */
export function nextMaintenance(items: readonly MaintenanceItem[]): MaintenanceItem | null {
  let next: MaintenanceItem | null = null;
  for (const item of items) {
    if (item.status.state !== 'none' && (next === null || daysLeft(item) < daysLeft(next))) {
      next = item;
    }
  }
  return next;
}

function daysLeft({ status }: MaintenanceItem): number {
  return status.state === 'none' ? Infinity : status.daysLeft;
}
