/**
 * Export file names: `smart-scale_YYYY-MM-DD_HHMMSS_<label>.json`, in local time, so they sort by
 * time and read naturally in the Files app. The label is a recording's `shortId`, the last 8 hex
 * digits of its id (its first 8 are timestamp bits, D-017), or `all` for a full export.
 *
 * Core can't know the time zone, so callers pass its offset: `offsetMinutes` is what
 * `new Date(epochMs).getTimezoneOffset()` returns for that time, the minutes from local time to
 * UTC (−120 in Central European Summer Time).
 */

import { shortId, type Recording } from '../model';

/** A one-recording export's name: the recording's start time and its `shortId`. */
export function recordingExportFileName(recording: Recording, offsetMinutes: number): string {
  return exportFileName(recording.startedAtEpochMs, offsetMinutes, shortId(recording.id));
}

/**
 * Where a one-recording export goes in an archive of them, such as the automatic export's repo
 * (T1.20): `YYYY/MM/<recordingExportFileName>`, by the recording's local start, so that the
 * files spread over a folder a month and sort by time.
 */
export function recordingArchivePath(recording: Recording, offsetMinutes: number): string {
  const local = localTime(recording.startedAtEpochMs, offsetMinutes);
  const name = recordingExportFileName(recording, offsetMinutes);
  return `${local.year}/${local.month}/${name}`;
}

/** A full export's name: the export time and `all`. */
export function allExportFileName(exportedAtEpochMs: number, offsetMinutes: number): string {
  return exportFileName(exportedAtEpochMs, offsetMinutes, 'all');
}

function exportFileName(epochMs: number, offsetMinutes: number, label: string): string {
  const local = localTime(epochMs, offsetMinutes);
  const date = `${local.year}-${local.month}-${local.day}`;
  const time = `${local.hours}${local.minutes}${local.seconds}`;
  return `smart-scale_${date}_${time}_${label}.json`;
}

/** The local wall-clock time's fields, zero-padded: a 4-digit year, the others 2 digits. */
function localTime(epochMs: number, offsetMinutes: number) {
  // Read with the UTC getters.
  const local = new Date(epochMs - offsetMinutes * 60_000);
  if (!Number.isFinite(offsetMinutes) || Number.isNaN(local.getTime())) {
    throw new RangeError(`exportFileName: no date for ${epochMs} at offset ${offsetMinutes}`);
  }
  const two = (n: number): string => String(n).padStart(2, '0');
  return {
    year: String(local.getUTCFullYear()).padStart(4, '0'),
    month: two(local.getUTCMonth() + 1),
    day: two(local.getUTCDate()),
    hours: two(local.getUTCHours()),
    minutes: two(local.getUTCMinutes()),
    seconds: two(local.getUTCSeconds()),
  };
}
