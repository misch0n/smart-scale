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

/** A full export's name: the export time and `all`. */
export function allExportFileName(exportedAtEpochMs: number, offsetMinutes: number): string {
  return exportFileName(exportedAtEpochMs, offsetMinutes, 'all');
}

function exportFileName(epochMs: number, offsetMinutes: number, label: string): string {
  // The local wall-clock time, read with the UTC getters.
  const local = new Date(epochMs - offsetMinutes * 60_000);
  if (!Number.isFinite(offsetMinutes) || Number.isNaN(local.getTime())) {
    throw new RangeError(`exportFileName: no date for ${epochMs} at offset ${offsetMinutes}`);
  }
  const two = (n: number): string => String(n).padStart(2, '0');
  const date = `${String(local.getUTCFullYear()).padStart(4, '0')}-${two(local.getUTCMonth() + 1)}-${two(local.getUTCDate())}`;
  const time = `${two(local.getUTCHours())}${two(local.getUTCMinutes())}${two(local.getUTCSeconds())}`;
  return `smart-scale_${date}_${time}_${label}.json`;
}
