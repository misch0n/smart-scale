// The notices Home and the brew flow show above their content: the recorder's warnings, and the
// backup reminder (D-031). The probe has its own, in its plain layout.

import type { AutoExport } from '../app/auto-export';
import type { RecorderState, RecorderWarning } from '../app/recorder';
import { wantAutoExportSettings } from './AutoExportPanel';
import { autoExportReminder } from './auto-export-text';
import { probeHash, type Mock } from './route';
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
 * button opens the automatic export settings, which are on the probe until the Setup screens
 * (T2.9, D-072).
 */
export function BackupNotice({ autoExport, mock }: { autoExport: AutoExport; mock: Mock }) {
  useLiveUpdates((notify) => autoExport.onChange(notify), [autoExport]);
  const reminder = autoExportReminder(autoExport.status, autoExport.settings);
  if (reminder === null) return null;
  return (
    <div class="card notice caution" data-testid="backup-reminder">
      <span>{reminder.text}</span>
      <a class="btn2" href={probeHash(mock)} onClick={() => wantAutoExportSettings()}>
        {reminder.action}
      </a>
    </div>
  );
}
