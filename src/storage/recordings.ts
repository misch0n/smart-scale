/**
 * Recordings: one row per BLE connection (raw layer). A row is created once and ended once,
 * and nothing else ever changes it, so there is no update and no delete (CLAUDE.md hard rule
 * 1).
 */

import {
  endRecording,
  normaliseRecording,
  type Id,
  type Recording,
  type RecordingEndReason,
} from '../core/model';
import type { Connection } from './db';
import { StorageError } from './errors';

export interface RecordingRepository {
  /**
   * Stores a new recording, open or (from an import) already ended.
   *
   * @throws StorageError `exists` if a recording with its id is stored.
   */
  create(recording: Recording): Promise<void>;
  /**
   * Ends an open recording (`endRecording`) and returns it as stored.
   *
   * @throws StorageError `not-found`, or `already-ended`: a recording ends once.
   */
  end(id: Id, endedAtEpochMs: number, reason: RecordingEndReason): Promise<Recording>;
  /** The recording, or null if it isn't stored. */
  get(id: Id): Promise<Recording | null>;
  /** Every recording, oldest first (ids sort by creation time, D-017). */
  list(): Promise<readonly Recording[]>;
  /**
   * The recordings that haven't ended, oldest first. At startup, these are the ones the app
   * stopped without ending (T1.6 ends them as `unclean`), unless another tab is still
   * recording one.
   */
  listOpen(): Promise<readonly Recording[]>;
}

export function recordingRepository(connection: Connection): RecordingRepository {
  const readAll = (): Promise<Recording[]> =>
    connection.run(['recordings'], 'readonly', 'Listing recordings', async (tx) => {
      const values = await tx.store.getAll();
      return values.map((value, i) => normaliseRecording(value, `recordings[${i}]`));
    });

  return {
    async create(recording) {
      const record = normaliseRecording(recording);
      await connection.run(['recordings'], 'readwrite', `Creating recording ${record.id}`, (tx) =>
        Promise.all([tx.store.add(record), tx.done]),
      );
    },

    end(id, endedAtEpochMs, reason) {
      const doing = `Ending recording ${id}`;
      return connection.run(['recordings'], 'readwrite', doing, async (tx) => {
        const stored = await tx.store.get(id);
        if (stored === undefined) {
          throw new StorageError('not-found', `${doing}: no such recording`);
        }
        const recording = normaliseRecording(stored);
        if (recording.endedAtEpochMs !== null || recording.endReason !== null) {
          throw new StorageError(
            'already-ended',
            `${doing}: it ended at ${recording.endedAtEpochMs} (${recording.endReason})`,
          );
        }
        const ended = endRecording(recording, endedAtEpochMs, reason);
        await Promise.all([tx.store.put(ended), tx.done]);
        return ended;
      });
    },

    get(id) {
      return connection.run(['recordings'], 'readonly', `Reading recording ${id}`, async (tx) => {
        const value = await tx.store.get(id);
        return value === undefined ? null : normaliseRecording(value);
      });
    },

    list: readAll,

    async listOpen() {
      const recordings = await readAll();
      return recordings.filter((recording) => recording.endedAtEpochMs === null);
    },
  };
}
