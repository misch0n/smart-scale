// A maintenance date (T2.10; boards Setup-Machine and Setup-Grinders; spec v2 "Maintenance"):
// its name and, when it is due or coming up, a badge; beside the name its reminder (T2.32,
// D-104), a tap to set how many days after the last it comes due; when it was last done and when
// next; "Done today", which stamps today. A tap on the dates opens the day it was last done, to
// change (for what was done before the app, Q26). And the reminder's row, on Home (board Main)
// and under Setup's "Needs attention" (board Setup).

import { useState } from 'preact/hooks';
import {
  maintenanceStatus,
  type Maintenance,
  type MaintenanceItem,
  type MaintenanceKind,
} from '../../core/model';
import { BellIcon } from '../icons';
import { setupHash, type Mock } from '../route';
import {
  dateLabel,
  MAINTENANCE_LABEL,
  maintenanceBadge,
  reminderEvery,
  steppedReminder,
} from './format';
import { DateField, Stepper } from './parts';

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
  const status = maintenanceStatus(maintenance, today);
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
        {/* The reminder beside the type (T2.32, D-104): from the day it was last done. */}
        <button
          type="button"
          class={reminderDays === null ? 'maint-remind muted' : 'maint-remind'}
          aria-expanded={open === 'reminder'}
          onClick={() => toggle('reminder')}
          data-testid="maint-remind"
        >
          <BellIcon size={16} />
          {reminderDays === null ? 'Set reminder' : reminderEvery(reminderDays)}
        </button>
      </div>
      <div class="maint-line">
        <button
          type="button"
          class="maint-dates"
          aria-expanded={open === 'dates'}
          onClick={() => toggle('dates')}
          data-testid="maint-dates"
        >
          {lastDoneDate !== null ? (
            <span>Last {dateLabel(lastDoneDate, today)}</span>
          ) : (
            <span>Not logged</span>
          )}
          {status.state !== 'none' && (
            <span class="muted" data-testid="maint-next">
              Next {dateLabel(status.dueDate, today)}
            </span>
          )}
        </button>
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
          <div class="setup-line-flat">
            <span class="setup-line-text">
              <span class="lbl">Remind after</span>
              <span class="muted setup-small">
                {lastDoneDate === null
                  ? 'Counts from the day it is done'
                  : `Counts from the last, ${dateLabel(lastDoneDate, today)}`}
                {reminderDays !== null && (
                  <>
                    {' · '}
                    <button
                      type="button"
                      class="link setup-inline"
                      onClick={() => onChange(() => ({ reminderDays: null }))}
                    >
                      Clear
                    </button>
                  </>
                )}
              </span>
            </span>
            <Stepper
              label={`${label.toLowerCase()} reminder`}
              value={reminderDays === null ? null : String(reminderDays)}
              unit="days"
              onStep={(steps) =>
                onChange((current) => ({
                  reminderDays: steppedReminder(current.reminderDays, steps),
                }))
              }
              testId="maint-reminder"
            />
          </div>
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
