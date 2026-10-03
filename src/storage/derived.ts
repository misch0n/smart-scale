/**
 * The derived cache: analysis results by recording and `ANALYSIS_VERSION` (spec "Layers").
 * Everything here can be recomputed from raw, so entries are overwritten and cleared freely.
 * T1.14 defines the result's shape and checks it when it reads one back.
 */

import { field, type Id, type JsonValue, type ObjectSchema } from '../core/model';
import type { Connection } from './db';

export interface DerivedEntry {
  readonly recordingId: Id;
  /** The `ANALYSIS_VERSION` that computed it (T1.14). With the recording id, the key. */
  readonly analysisVersion: number;
  readonly computedAtEpochMs: number;
  /** The analysis output, JSON-native like the export. */
  readonly result: JsonValue;
}

export interface DerivedRepository {
  /** Stores an entry, replacing any with the same recording and version. */
  put(entry: DerivedEntry): Promise<void>;
  /** The entry, or null if there is none for that recording and version. */
  get(recordingId: Id, analysisVersion: number): Promise<DerivedEntry | null>;
  /** Deletes every entry: they are all recomputable. */
  clearAll(): Promise<void>;
}

const DERIVED_ENTRY_SCHEMA: ObjectSchema<DerivedEntry> = {
  recordingId: field.id,
  analysisVersion: field.nonNegativeInteger,
  computedAtEpochMs: field.number,
  result: field.json,
};

const parseDerivedEntry = field.object(DERIVED_ENTRY_SCHEMA);

export function derivedRepository(connection: Connection): DerivedRepository {
  return {
    async put(entry) {
      const record = parseDerivedEntry(entry, 'derived');
      const doing = `Storing analysis ${record.analysisVersion} of recording ${record.recordingId}`;
      await connection.run(['derived'], 'readwrite', doing, (tx) =>
        Promise.all([tx.store.put(record), tx.done]),
      );
    },

    get(recordingId, analysisVersion) {
      const doing = `Reading analysis ${analysisVersion} of recording ${recordingId}`;
      return connection.run(['derived'], 'readonly', doing, async (tx) => {
        const value = await tx.store.get([recordingId, analysisVersion]);
        return value === undefined ? null : parseDerivedEntry(value, 'derived');
      });
    },

    async clearAll() {
      await connection.run(['derived'], 'readwrite', 'Clearing the analysis cache', (tx) =>
        Promise.all([tx.store.clear(), tx.done]),
      );
    },
  };
}
