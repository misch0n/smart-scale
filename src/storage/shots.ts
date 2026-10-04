/**
 * Shots: user metadata anchored in a recording (D-007, D-019). They are edited freely, and
 * deleting one sets its `discardedAtEpochMs` tombstone instead of removing it, so a discarded
 * shot keeps claiming its segment and re-analysis doesn't bring it back. That is why there is
 * no hard delete.
 */

import {
  normaliseShot,
  sameShotIdentity,
  updateShot,
  type Id,
  type Shot,
  type ShotMetadata,
} from '../core/model';
import { recordingKeyRange, type Connection } from './db';
import { StorageError } from './errors';

export interface ShotRepository {
  /** @throws StorageError `exists` if a shot with its id is stored. */
  create(shot: Shot): Promise<void>;
  /** The shot, or null if it isn't stored. */
  get(id: Id): Promise<Shot | null>;
  /**
   * Applies `changes` with `updateShot` and returns the shot as stored.
   *
   * @throws StorageError `not-found`; TypeError or SchemaError on a change `updateShot`
   *   refuses.
   */
  update(id: Id, changes: Partial<ShotMetadata>, nowEpochMs: number): Promise<Shot>;
  /**
   * Deletes a shot by setting its tombstone (D-019) and returns it. A discarded shot keeps its
   * first discard time. `update` with `discardedAtEpochMs: null` restores it.
   *
   * @throws StorageError `not-found`.
   */
  discard(id: Id, nowEpochMs: number): Promise<Shot>;
  /**
   * Stores `shot`, as it is, in place of the stored shot with its id, and returns it: an import
   * that replaces metadata (T1.7). Its metadata and `updatedAtEpochMs` may differ from the
   * stored shot's, but not its identity: recording, anchor, source and creation time (D-019).
   *
   * @throws StorageError `not-found`; TypeError if the identity differs; SchemaError on a
   *   malformed shot.
   */
  replace(shot: Shot): Promise<Shot>;
  /** The recording's shots, discarded ones too, in anchor-time order. */
  listForRecording(recordingId: Id): Promise<readonly Shot[]>;
  /** Every shot, discarded ones too, by recording (oldest first), then by anchor time. */
  list(): Promise<readonly Shot[]>;
}

export function shotRepository(connection: Connection): ShotRepository {
  /** Reads a shot, changes it with `change` and stores it, in one transaction. */
  const modify = (id: Id, doing: string, change: (shot: Shot) => Shot | null): Promise<Shot> =>
    connection.run(['shots'], 'readwrite', doing, async (tx) => {
      const stored = await tx.store.get(id);
      if (stored === undefined) throw new StorageError('not-found', `${doing}: no such shot`);
      const shot = normaliseShot(stored);
      const next = change(shot);
      if (next === null) return shot;
      await Promise.all([tx.store.put(next), tx.done]);
      return next;
    });

  const readIndex = (range: IDBKeyRange | null, doing: string): Promise<Shot[]> =>
    connection.run(['shots'], 'readonly', doing, async (tx) => {
      const values = await tx.store.index('byRecording').getAll(range);
      return values.map((value, i) => normaliseShot(value, `shots[${i}]`));
    });

  return {
    async create(shot) {
      const record = normaliseShot(shot);
      await connection.run(['shots'], 'readwrite', `Creating shot ${record.id}`, (tx) =>
        Promise.all([tx.store.add(record), tx.done]),
      );
    },

    get(id) {
      return connection.run(['shots'], 'readonly', `Reading shot ${id}`, async (tx) => {
        const value = await tx.store.get(id);
        return value === undefined ? null : normaliseShot(value);
      });
    },

    update(id, changes, nowEpochMs) {
      return modify(id, `Updating shot ${id}`, (shot) => updateShot(shot, changes, nowEpochMs));
    },

    discard(id, nowEpochMs) {
      return modify(id, `Discarding shot ${id}`, (shot) =>
        shot.discardedAtEpochMs === null
          ? updateShot(shot, { discardedAtEpochMs: nowEpochMs }, nowEpochMs)
          : null,
      );
    },

    async replace(shot) {
      const record = normaliseShot(shot);
      return await modify(record.id, `Replacing shot ${record.id}`, (stored) => {
        if (!sameShotIdentity(stored, record)) {
          throw new TypeError(
            `replace: shot ${record.id} has another recording, anchor, source or creation time than the stored one (D-019)`,
          );
        }
        return record;
      });
    },

    listForRecording(recordingId) {
      return readIndex(recordingKeyRange(recordingId), `Listing shots of recording ${recordingId}`);
    },

    list() {
      return readIndex(null, 'Listing shots');
    },
  };
}
