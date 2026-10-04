/**
 * Comparing a recording's file with the one the destination already holds at its path (T1.20,
 * D-027): after storage was wiped, on a new device, or when another tab or device wrote it
 * first. The rules: never replace a file with one that holds fewer records, never replace one
 * this build can't read (a newer format, say), and never write when the files already agree.
 */

import { parseExport, serialiseExport, type ExportBundle } from '../../core/export';
import type { Shot } from '../../core/model';

export type RemoteVerdict =
  /** The destination's file holds the same records: nothing to write. */
  | { readonly kind: 'same' }
  /** This device's file holds every record the destination's does, and more or newer ones. */
  | { readonly kind: 'replace' }
  /** The destination's file holds something this device's lacks, or can't be read: leave it. */
  | { readonly kind: 'keep'; readonly reason: string };

/** The longest parse error a reason quotes. */
const MAX_QUOTED = 160;

/**
 * Compares `local`, a one-recording export (`exportRecording`), with `remoteText`, the file at
 * the recording's path. Files that differ only in when and by which build they were written
 * are the same.
 */
export function compareWithRemote(local: ExportBundle, remoteText: string): RemoteVerdict {
  const [mine] = local.recordings;
  if (local.recordings.length !== 1 || mine === undefined) {
    throw new RangeError('compareWithRemote: the local file must hold exactly one recording');
  }
  const id = mine.recording.id;
  let remote: ExportBundle;
  try {
    remote = parseExport(remoteText).bundle;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const quoted = message.length > MAX_QUOTED ? `${message.slice(0, MAX_QUOTED)}…` : message;
    return keep(`the repo's file isn't an export this build can read (${quoted})`);
  }
  const theirs = remote.recordings.find((entry) => entry.recording.id === id);
  if (theirs === undefined) return keep("the repo's file at this path holds another recording");
  const settings = remote.settings === null ? 0 : Object.keys(remote.settings).length;
  if (
    remote.recordings.length > 1 ||
    remote.shots.some((shot) => shot.recordingId !== id) ||
    settings > 0
  ) {
    return keep("the repo's file holds more than this recording");
  }
  if (neutral(local) === neutral(remote)) return { kind: 'same' };

  const mineShots = new Set(local.shots.map((shot) => shot.id));
  const lacking = [
    count(theirs.frames.length - mine.frames.length, 'frame'),
    count(theirs.events.length - mine.events.length, 'event'),
    count(remote.shots.filter((shot) => !mineShots.has(shot.id)).length, 'shot'),
  ].filter((part) => part !== null);
  if (lacking.length > 0) {
    return keep(`the repo's copy has ${lacking.join(', ')} that this device lacks`);
  }
  return { kind: 'replace' };
}

function keep(reason: string): RemoteVerdict {
  return { kind: 'keep', reason };
}

/** `n` things, if more than none. */
function count(n: number, thing: string): string | null {
  if (n <= 0) return null;
  return `${n} more ${thing}${n === 1 ? '' : 's'}`;
}

/** The file's records, without when and by which build it was written. */
function neutral(bundle: ExportBundle): string {
  const shots = [...bundle.shots].sort(byId);
  return serialiseExport({
    ...bundle,
    exportedAtEpochMs: 0,
    app: { commit: '', buildTime: '' },
    shots,
    settings: null,
  });
}

function byId(a: Shot, b: Shot): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
