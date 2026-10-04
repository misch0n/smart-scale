import type { AutoExportSettingsView, AutoExportStatus } from '../app/auto-export';

// The automatic export's status in words (T1.20), for the probe's panel.

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
  const toGo =
    status.pending === null || status.pending === 0 ? '' : ` ${count(status.pending)} to go.`;
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

/** An error message as a sentence, with a full stop if it has none. */
function sentence(message: string | null): string {
  if (message === null) return 'It failed.';
  return /[.!?…]$/.test(message) ? message : `${message}.`;
}

function count(recordings: number): string {
  return recordings === 1 ? '1 recording' : `${recordings} recordings`;
}
