/**
 * Comparing a recording's file with the one the destination already holds at its path (T1.20,
 * D-027): after storage was wiped, on a new device, or when another tab or device wrote it
 * first. The rules: never replace a file with one that holds fewer records, never replace one
 * this build can't read (a newer format, say), and never write when the files already agree.
 */

import { parseExport, serialiseExport, type ExportBundle } from '../../core/export';
import { byId as entityById, ENTITY_KINDS, type EntityLists, type Shot } from '../../core/model';

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
  const entities = remote.entities;
  if (
    remote.recordings.length > 1 ||
    remote.shots.some((shot) => shot.recordingId !== id) ||
    settings > 0 ||
    (entities !== null && ENTITY_KINDS.some((kind) => entities[kind].length > 0))
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

/**
 * Compares `local`, the entities file (`exportEntities`), with `remoteText`, the file at its path
 * (T2.1, D-076). The rules, as for a recording's file: never replace a file holding an entity
 * this device lacks, or a newer version of one (another device's edit, by `updatedAtEpochMs`),
 * nor one this build can't read; and never write when the files agree. Importing the repo's
 * file merges what it holds, after which this device's file wins.
 */
export function compareEntitiesWithRemote(local: ExportBundle, remoteText: string): RemoteVerdict {
  const mine = local.entities;
  if (mine === null || local.recordings.length > 0 || local.shots.length > 0) {
    throw new RangeError('compareEntitiesWithRemote: the local file must hold the entities alone');
  }
  let remote: ExportBundle;
  try {
    remote = parseExport(remoteText).bundle;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const quoted = message.length > MAX_QUOTED ? `${message.slice(0, MAX_QUOTED)}…` : message;
    return keep(`the repo's file isn't an export this build can read (${quoted})`);
  }
  const settings = remote.settings === null ? 0 : Object.keys(remote.settings).length;
  if (remote.recordings.length > 0 || remote.shots.length > 0 || settings > 0) {
    return keep("the repo's file holds more than the entities");
  }
  const theirs = remote.entities;
  if (theirs === null) return keep("the repo's file at this path holds no entities");
  if (neutralEntities(mine) === neutralEntities(theirs)) return { kind: 'same' };

  let lacking = 0;
  let newer = 0;
  for (const kind of ENTITY_KINDS) {
    const ours = new Map<string, number>(
      mine[kind].map((entity) => [entity.id, entity.updatedAtEpochMs]),
    );
    for (const entity of theirs[kind]) {
      const updated = ours.get(entity.id);
      if (updated === undefined) lacking++;
      else if (updated < entity.updatedAtEpochMs) newer++;
    }
  }
  const parts = [
    lacking > 0 ? `${lacking} more ${lacking === 1 ? 'entity' : 'entities'}` : null,
    newer > 0 ? `${newer} newer ${newer === 1 ? 'version' : 'versions'}` : null,
  ].filter((part) => part !== null);
  if (parts.length > 0) {
    return keep(`the repo's copy has ${parts.join(', ')} that this device lacks`);
  }
  return { kind: 'replace' };
}

/** The entities as JSON, each kind's list in id order. */
function neutralEntities(entities: EntityLists): string {
  return JSON.stringify(
    Object.fromEntries(ENTITY_KINDS.map((kind) => [kind, [...entities[kind]].sort(entityById)])),
  );
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
    entities: null,
    settings: null,
  });
}

function byId(a: Shot, b: Shot): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
