import type { AutoExportSettingsView, AutoExportStatus } from '../app/auto-export';

// The automatic export's status in words (T1.20), for the probe's panel, and the reminder at
// the top of the page (D-031).

/** The reminder at the top of the page, and its button's label. */
export interface AutoExportReminder {
  readonly text: string;
  readonly action: string;
}

/**
 * What to remind the user of each time the page opens: that recordings aren't backed up off the
 * phone because automatic export is off or has stopped. Null while it runs, or waits to retry
 * on its own.
 */
export function autoExportReminder(
  status: AutoExportStatus,
  settings: AutoExportSettingsView | null,
): AutoExportReminder | null {
  switch (status.state) {
    case 'off':
      return {
        text:
          settings === null
            ? "Recordings aren't backed up off this phone: set up automatic export, or use Export all."
            : "Recordings aren't backed up off this phone: automatic export has no token.",
        action: 'Set it up',
      };
    case 'stopped':
      return {
        text: `Recordings aren't backed up off this phone: automatic export has stopped. ${sentence(status.lastError)}`,
        action: 'Check the settings',
      };
    default:
      return null;
  }
}

/** A few sentences saying whether recordings are backed up, and what stands in the way. */
export function describeAutoExport(
  status: AutoExportStatus,
  settings: AutoExportSettingsView | null,
  formatTime: (epochMs: number) => string,
): string {
  const repo = settings === null ? '' : `${settings.owner}/${settings.repo}`;
  const last =
    status.lastExportEpochMs === null
      ? 'Nothing exported yet.'
      : `Last export ${formatTime(status.lastExportEpochMs)}.`;
  const toGo = toGoText(status);
  switch (status.state) {
    case 'off':
      return settings === null
        ? 'Off. Set up a private GitHub repo below, and each recording is backed up there once it ends. Manual export works either way.'
        : `Off: there is no token for ${repo}. Enter one below.`;
    case 'idle':
      return toGo === '' ? `On: ${repo}. Up to date. ${last}` : `On: ${repo}.${toGo} ${last}`;
    case 'working':
      return `Exporting to ${repo}…${toGo} ${last}`;
    case 'waiting': {
      const at =
        status.retryAtEpochMs === null ? 'later' : `at ${formatTime(status.retryAtEpochMs)}`;
      return `Waiting to try again ${at}, or once the phone is back online. ${sentence(status.lastError)}${toGo}`;
    }
    case 'stopped':
      return `Stopped. ${sentence(status.lastError)}${toGo}`;
  }
}

/**
 * What waits to be uploaded, as " 2 recordings and your setup to go.", or '' when nothing does.
 * The setup is the entities' file (T2.1): machine, grinders, recipes, packs, containers, tags.
 */
function toGoText(status: AutoExportStatus): string {
  const parts = [
    status.pending === null || status.pending === 0 ? null : count(status.pending),
    status.entitiesPending ? 'your setup' : null,
  ].filter((part) => part !== null);
  if (parts.length === 0) return '';
  const text = parts.join(' and ');
  return ` ${text.charAt(0).toUpperCase()}${text.slice(1)} to go.`;
}

/** An error message as a sentence, with a full stop if it has none. */
function sentence(message: string | null): string {
  if (message === null) return 'It failed.';
  return /[.!?…]$/.test(message) ? message : `${message}.`;
}

function count(recordings: number): string {
  return recordings === 1 ? '1 recording' : `${recordings} recordings`;
}
