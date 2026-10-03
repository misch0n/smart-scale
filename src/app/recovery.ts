/**
 * Startup recovery (T1.6, D-024). A recording the app never ended, because the tab was closed
 * or crashed while connected, is ended as `unclean` at the time of its last stored record. Its
 * records stay as they are: nothing is appended, so the timeline ends where the data does,
 * without a `disconnected` event.
 *
 * Another tab may be recording one of the open recordings right now. Its recorder holds that
 * recording's Web Lock (recording-locks.ts), so recovery ends only recordings whose lock it can
 * take, and holds the lock while it does. Without Web Locks, it ends only recordings that stored
 * nothing in the last minute: a recording in progress stores a batch about every second.
 */

import { epochMsAt, type Id, type Recording } from '../core/model';
import {
  StorageError,
  type LastRawRecords,
  type RawRepository,
  type RecordingRepository,
} from '../storage';
import { ifRecordingLockFree, systemLocks, type LockManagerLike } from './recording-locks';

/** Without Web Locks, a recording that stored a record this recently may be in progress, ms. */
export const RECENT_WITHOUT_LOCKS_MS = 60_000;

/** What recovery needs from storage (`AppStorage` has it). */
export interface RecoveryStorage {
  readonly recordings: Pick<RecordingRepository, 'listOpen' | 'end'>;
  readonly raw: Pick<RawRepository, 'last'>;
}

export interface RecoveryOptions {
  /** The Web Locks API. Default `systemLocks()`; null for none. */
  readonly locks?: LockManagerLike | null;
  /** The wall clock, for the rule without Web Locks. Default `Date.now`. */
  readonly epochNow?: () => number;
}

export interface RecoveryResult {
  /** The recordings ended as `unclean`, as stored. */
  readonly ended: readonly Recording[];
  /**
   * Open recordings left alone: another tab is recording them (or, without Web Locks, may be),
   * or another tab ended them first.
   */
  readonly skipped: readonly Id[];
  /** Recordings that couldn't be ended. They stay open, and the next startup tries again. */
  readonly failed: readonly { readonly id: Id; readonly error: Error }[];
}

/**
 * Ends every open recording that no tab is recording as `unclean`. Call it at startup, before
 * the first connect.
 *
 * @throws StorageError if the open recordings can't be listed.
 */
export async function recoverUncleanRecordings(
  storage: RecoveryStorage,
  options: RecoveryOptions = {},
): Promise<RecoveryResult> {
  const locks = options.locks === undefined ? systemLocks() : options.locks;
  const epochNow = options.epochNow ?? Date.now;
  const ended: Recording[] = [];
  const skipped: Id[] = [];
  const failed: { readonly id: Id; readonly error: Error }[] = [];
  for (const recording of await storage.recordings.listOpen()) {
    try {
      const result =
        locks === null
          ? await endIfQuiet(storage, recording, epochNow())
          : await endIfUnlocked(storage, recording, locks);
      if (result === null) skipped.push(recording.id);
      else ended.push(result);
    } catch (error) {
      if (error instanceof StorageError && error.code === 'already-ended') {
        skipped.push(recording.id);
      } else {
        failed.push({ id: recording.id, error: asError(error) });
      }
    }
  }
  return { ended, skipped, failed };
}

/** Ends the recording unless a tab holds its lock: null if one does. */
async function endIfUnlocked(
  storage: RecoveryStorage,
  recording: Recording,
  locks: LockManagerLike,
): Promise<Recording | null> {
  const run = await ifRecordingLockFree(locks, recording.id, async () => {
    const last = await storage.raw.last(recording.id);
    return storage.recordings.end(recording.id, lastRecordEpochMs(recording, last), 'unclean');
  });
  return run.ran ? run.value : null;
}

/** Ends the recording unless it stored a record recently: null if it did. */
async function endIfQuiet(
  storage: RecoveryStorage,
  recording: Recording,
  nowEpochMs: number,
): Promise<Recording | null> {
  const endedAt = lastRecordEpochMs(recording, await storage.raw.last(recording.id));
  if (nowEpochMs - endedAt < RECENT_WITHOUT_LOCKS_MS) return null;
  return storage.recordings.end(recording.id, endedAt, 'unclean');
}

/** When the last stored record arrived, as wall-clock ms: the start if there is none. */
function lastRecordEpochMs(recording: Recording, last: LastRawRecords): number {
  return epochMsAt(recording, Math.max(0, last.frame?.tMs ?? 0, last.event?.tMs ?? 0));
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
