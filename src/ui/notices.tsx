// The notices Home and the brew flow show above their content: the recorder's warnings and the
// backup reminder (D-031). Also the scale's mode warning (T1.25): its text, and its notice on
// the brew screen; Home shows it in its scale card. The probe has its own, in its plain layout.

import type { AutoExport } from '../app/auto-export';
import type { RecorderState, RecorderWarning } from '../app/recorder';
import type { ScaleModeCheck } from '../app/scale-mode';
import { wantAutoExportSettings } from './AutoExportPanel';
import { autoExportReminder } from './auto-export-text';
import { setupHash, type Mock } from './route';
import { useLiveUpdates } from './use-live-updates';

const WARNING_TEXT: Record<Exclude<RecorderWarning, 'storage-failing'>, string> = {
  'unit-not-grams':
    "The scale isn't weighing in grams, so its weights are refused. Set it to grams.",
  'failing-frames': 'Most of what the scale sends is garbled: the readings may be wrong.',
  'smoothing-not-off':
    "The scale's smoothing isn't confirmed off, so the drain after the pump can't be timed.",
};

/** What the recorder warns of: storing failing, or what the scale sends. */
export function RecorderWarnings({
  state,
}: {
  state: Pick<RecorderState, 'warnings' | 'storageError'>;
}) {
  return (
    <>
      {state.warnings.map((warning) => (
        <div key={warning} class="card notice warn" role="alert" data-testid="warning">
          {warning === 'storage-failing'
            ? `Storing is failing: ${state.storageError ?? 'unknown error'}. The records wait in memory; closing the page now would lose them.`
            : WARNING_TEXT[warning]}
        </div>
      ))}
    </>
  );
}

/**
 * The reminder, on every open, that recordings aren't backed up off the phone (D-031). Its
 * button opens the automatic export settings, in Setup (T2.9).
 */
export function BackupNotice({ autoExport, mock }: { autoExport: AutoExport; mock: Mock }) {
  useLiveUpdates((notify) => autoExport.onChange(notify), [autoExport]);
  const reminder = autoExportReminder(autoExport.status, autoExport.settings);
  if (reminder === null) return null;
  return (
    <div class="card notice caution" data-testid="backup-reminder">
      <span>{reminder.text}</span>
      <a
        class="btn2"
        href={setupHash({ section: 'backup' }, mock)}
        onClick={() => wantAutoExportSettings()}
      >
        {reminder.action}
      </a>
    </div>
  );
}

/**
 * What the scale-mode check warns of (T1.25, D-057): the scale isn't in its timer mode, the one
 * the app keeps its timer in step with (D-038). Only the user can switch it, on the scale. The
 * check sees the switch within about 5 s, and the warning goes (D-073).
 */
export const MODE_WARNING = "The scale isn't in its timer mode: switch it on the scale.";

/** The mode warning on the brew screen, a caution beside its other notices. */
export function ScaleModeNotice({ mode }: { mode: ScaleModeCheck }) {
  useLiveUpdates((notify) => mode.onChange(notify), [mode]);
  if (mode.state.verdict !== 'not-timer') return null;
  return (
    <div class="card notice caution" role="status" data-testid="mode-warning">
      {MODE_WARNING} Until then the scale's own timer won't follow the shot; the app times it
      anyway.
    </div>
  );
}
