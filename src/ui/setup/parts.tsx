// Pieces the Setup boards share (T2.9): the page with its back link and the tab bar, a text field
// that stores once it is left, a date field, a stepper row, the notice when a change couldn't be
// stored, and keeping a screen in step with the entities and the settings.

import { useState } from 'preact/hooks';
import type { AppServices } from '../../app/startup';
import { StepButton } from '../brew/parts';
import type { Mock } from '../route';
import { TabBar } from '../TabBar';
import { useLiveUpdates } from '../use-live-updates';
import './setup.css';

/** Re-renders on every change of the entities or the brew's settings. */
export function useSetupUpdates(services: AppServices): void {
  useLiveUpdates(
    (notify) => {
      const offs = [services.entities.onChange(notify), services.brew.preferences.onChange(notify)];
      return () => offs.forEach((off) => off());
    },
    [services],
    50,
  );
}

/** A Setup screen: the back link, the title with an action beside it, and the tab bar. */
export function SetupPage({
  title,
  back,
  action,
  mock,
  services,
  testId,
  children,
}: {
  title: string;
  /** Where the back link goes, and what it says; none on Setup itself. */
  back: { readonly href: string; readonly label: string } | null;
  action?: preact.ComponentChildren;
  mock: Mock;
  services: AppServices;
  testId: string;
  children: preact.ComponentChildren;
}) {
  const error = services.brew.preferences.writeError;
  return (
    <>
      <main class="setup" data-testid={testId}>
        {back !== null && (
          <a class="back" href={back.href} style={{ alignSelf: 'flex-start' }}>
            ‹ {back.label}
          </a>
        )}
        <div class="setup-top">
          <h1 class="ttl">{title}</h1>
          {action}
        </div>
        {error !== null && (
          <p class="card notice warn" role="alert" data-testid="setup-error">
            A change couldn't be stored: {error}. It stays for now; the next change tries again.
          </p>
        )}
        {services.entities.loadError !== null && (
          <p class="card notice warn" role="alert">
            Your setup couldn't be read, so the defaults stand in: {services.entities.loadError}
          </p>
        )}
        {children}
      </main>
      <TabBar current="setup" mock={mock} />
    </>
  );
}

/**
 * What a field shows: `value`, or what has been typed since `value` last changed. A new `value`
 * from outside replaces what is typed. Worked out as it renders rather than copied in an effect:
 * an effect runs after the paint, up to 100 ms after a field appears, and would put the old value
 * back over what was typed in the meantime.
 */
export function useDraft(value: string): [string, (text: string) => void] {
  const [edit, setEdit] = useState<{ readonly from: string; readonly text: string } | null>(null);
  const draft = edit !== null && edit.from === value ? edit.text : value;
  return [draft, (text) => setEdit({ from: value, text })];
}

/**
 * A labelled text field. It keeps what is typed, and stores it with `onCommit` once the field is
 * left (or Enter): one change a field, not one a key. A new `value` from outside replaces it.
 */
export function TextField({
  id,
  label,
  value,
  onCommit,
  placeholder,
  note,
  inputMode,
  unit,
  live = false,
}: {
  id: string;
  label: string;
  value: string;
  onCommit: (text: string) => void;
  placeholder?: string;
  /** Beside the label, muted: `required`, `optional`. */
  note?: string;
  inputMode?: 'text' | 'decimal' | 'numeric';
  /** After the value, inside the field: `g`. */
  unit?: string;
  /** Commits with every key: for a form that isn't stored yet, whose button needs the text. */
  live?: boolean;
}) {
  const [draft, setDraft] = useDraft(value);
  const input = (
    <input
      class="input"
      id={id}
      type="text"
      inputMode={inputMode}
      value={draft}
      placeholder={placeholder}
      style={unit === undefined ? undefined : { paddingRight: '32px' }}
      onInput={(event) => {
        setDraft(event.currentTarget.value);
        // As typed, spaces too: trimming each key would eat the space before the next word.
        if (live) onCommit(event.currentTarget.value);
      }}
      onChange={(event) => {
        const text = event.currentTarget.value.trim();
        if (!live && text !== value) onCommit(text);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
  return (
    <div class="field">
      <span class="field-label">
        <label class="lbl" for={id}>
          {label}
        </label>
        {note !== undefined && <span class="muted field-note">{note}</span>}
      </span>
      {unit === undefined ? (
        input
      ) : (
        <div class="field-unit">
          {input}
          <span class="unit">{unit}</span>
        </div>
      )}
    </div>
  );
}

/** A labelled date field, `YYYY-MM-DD`: the phone's date picker. Clearing it gives null. */
export function DateField({
  id,
  label,
  value,
  onCommit,
  note,
  required = false,
}: {
  id: string;
  label: string;
  value: string | null;
  onCommit: (date: string | null) => void;
  note?: string;
  required?: boolean;
}) {
  return (
    <div class="field">
      <span class="field-label">
        <label class="lbl" for={id}>
          {label}
        </label>
        {note !== undefined && <span class="muted field-note">{note}</span>}
      </span>
      <input
        class="input"
        id={id}
        type="date"
        value={value ?? ''}
        required={required}
        aria-required={required}
        onChange={(event) => {
          const date = event.currentTarget.value;
          onCommit(/^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null);
        }}
      />
    </div>
  );
}

/** A stepper with its value: − and + step (hold to repeat). A value not set reads "Not set". */
export function Stepper({
  label,
  value,
  unit,
  onStep,
  testId,
}: {
  /** What the buttons change, for their labels: `pressure`. */
  label: string;
  value: string | null;
  unit?: string;
  onStep: (steps: number) => void;
  testId?: string;
}) {
  return (
    <div class="stepper" role="group" aria-label={label}>
      <StepButton label={`Decrease ${label}`} onStep={() => onStep(-1)}>
        −
      </StepButton>
      <span class={value === null ? 'muted stepper-unset' : 'num'} data-testid={testId}>
        {value ?? 'Not set'}
        {unit !== undefined && value !== null && (
          <span class="unit" style={{ fontSize: '13px' }}>
            {` ${unit}`}
          </span>
        )}
      </span>
      <StepButton label={`Increase ${label}`} onStep={() => onStep(1)}>
        +
      </StepButton>
    </div>
  );
}

/** A row of a Setup list: a title, a muted line under it, and the chevron. */
export function LinkRow({
  href,
  title,
  detail,
  testId,
}: {
  href: string;
  title: string;
  detail: preact.ComponentChildren;
  testId?: string;
}) {
  return (
    <a class="row setup-row" href={href} data-testid={testId}>
      <span class="setup-row-text">
        <span style={{ fontWeight: 600 }}>{title}</span>
        <span class="muted setup-row-detail">{detail}</span>
      </span>
      <span class="chev" aria-hidden="true">
        ›
      </span>
    </a>
  );
}
