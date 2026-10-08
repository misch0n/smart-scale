// A maintenance date (T2.10; boards Setup-Machine and Setup-Grinders; spec v2 "Maintenance"):
// its name and, when it is due or coming up, a badge; beside the name its reminder (T2.32,
// D-104): the kind's default interval until the user picks another next date (T2.33, D-106);
// when it was last done and when next, each a tap to change (the last for what was done before
// the app, Q26); "Done today", which stamps today. And the reminder's row, on Home (board Main)
// and under Setup's "Needs attention" (board Setup).

import { useState } from 'preact/hooks';
import {
  daysBetween,
  DEFAULT_REMINDER_DAYS,
  maintenanceStatus,
  reminderDaysOf,
  type Maintenance,
  type MaintenanceItem,
  type MaintenanceKind,
} from '../../core/model';
import { BellIcon } from '../icons';
import { setupHash, type Mock } from '../route';
import { dateLabel, MAINTENANCE_LABEL, maintenanceBadge, reminderEvery } from './format';
import { DateField } from './parts';

export function MaintenanceBlock({
  id,
  kind,
  maintenance,
  today,
  onChange,
}: {
  /** Unique on the page, for the fields' ids. */
  id: string;
  kind: MaintenanceKind;
  maintenance: Maintenance;
  today: string;
  /** Changes the date as it is when it applies: two quick taps both count. */
  onChange: (change: (current: Maintenance) => Partial<Maintenance>) => void;
}) {
  const [open, setOpen] = useState<'dates' | 'reminder' | null>(null);
  const toggle = (part: 'dates' | 'reminder') => setOpen(open === part ? null : part);
  const label = MAINTENANCE_LABEL[kind];
  const { lastDoneDate, reminderDays } = maintenance;
  const days = reminderDaysOf(maintenance, kind);
  const custom = reminderDays !== null && reminderDays !== DEFAULT_REMINDER_DAYS[kind];
  const status = maintenanceStatus(maintenance, kind, today);
  const badge = maintenanceBadge(status);
  return (
    <div class="maint" data-testid={`maint-${kind}`}>
      <div class="maint-head">
        <span class="maint-name">
          <span style={{ fontWeight: 600 }}>{label}</span>
          {badge !== null && (
            <span class={`badge ${badge.tone}`} data-testid="maint-badge">
              {badge.text}
            </span>
          )}
        </span>
        {/* The reminder beside the type (T2.32): the kind's default until set (T2.33, D-106). */}
        <button
          type="button"
          class="maint-remind"
          aria-expanded={open === 'reminder'}
          onClick={() => toggle('reminder')}
          data-testid="maint-remind"
        >
          <BellIcon size={16} />
          {reminderEvery(days)}
          {!custom && <span class="muted"> · default</span>}
        </button>
      </div>
      <div class="maint-line">
        <span class="maint-dates">
          <button
            type="button"
            class="maint-date"
            aria-expanded={open === 'dates'}
            onClick={() => toggle('dates')}
            data-testid="maint-dates"
          >
            {lastDoneDate !== null ? `Last ${dateLabel(lastDoneDate, today)}` : 'Not logged'}
          </button>
          {status.state !== 'none' && (
            <button
              type="button"
              class="maint-date muted"
              aria-expanded={open === 'reminder'}
              onClick={() => toggle('reminder')}
              data-testid="maint-next"
            >
              Next {dateLabel(status.dueDate, today)}
            </button>
          )}
        </span>
        <button
          type="button"
          class="btn2"
          style={{ flex: '0 0 auto' }}
          disabled={lastDoneDate === today}
          onClick={() => onChange(() => ({ lastDoneDate: today }))}
          data-testid="maint-done"
        >
          Done today
        </button>
      </div>
      {open === 'dates' && (
        <div class="maint-edit">
          <DateField
            id={`${id}-last`}
            label="Last done"
            value={lastDoneDate}
            // A day still to come can't have been done.
            onCommit={(date) => {
              if (date === null || date <= today) onChange(() => ({ lastDoneDate: date }));
            }}
          />
        </div>
      )}
      {open === 'reminder' && (
        <div class="maint-edit" data-testid="maint-reminder-edit">
          {status.state === 'none' ? (
            <p class="muted setup-small maint-note">
              Every {days} days from the day it is done. Log the last time first to pick another
              date.
            </p>
          ) : (
            <DateField
              id={`${id}-next`}
              label="Next"
              note={`every ${days} days from the last`}
              value={status.dueDate}
              // A custom date sets the interval from the last: it holds after the next "Done".
              onCommit={(date) => {
                if (date === null || lastDoneDate === null || date <= lastDoneDate) return;
                onChange(() => ({ reminderDays: daysBetween(lastDoneDate, date) }));
              }}
            />
          )}
          {custom && (
            <button
              type="button"
              class="link setup-inline maint-default"
              onClick={() => onChange(() => ({ reminderDays: null }))}
              data-testid="maint-default"
            >
              Back to the default: every {DEFAULT_REMINDER_DAYS[kind]} days
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A reminder's row: the date's name, what it maintains when `named`, and its badge; it opens
 * the machine's or the grinders' screen.
 */
export function MaintenanceRow({
  item,
  named,
  mock,
}: {
  item: MaintenanceItem;
  named: boolean;
  mock: Mock;
}) {
  const badge = maintenanceBadge(item.status);
  const section = item.owner.entity === 'machines' ? 'machine' : 'grinders';
  return (
    <a class="row" href={setupHash({ section }, mock)} data-testid="maint-row">
      <span class="maint-row-text">
        {MAINTENANCE_LABEL[item.kind]}
        {named && item.owner.name !== '' && <span class="muted"> · {item.owner.name}</span>}
      </span>
      <span class="setup-row-end">
        {badge !== null && <span class={`badge ${badge.tone}`}>{badge.text}</span>}
        <span class="chev" aria-hidden="true">
          ›
        </span>
      </span>
    </a>
  );
}
