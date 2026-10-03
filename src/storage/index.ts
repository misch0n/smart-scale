/**
 * IndexedDB storage (ARCHITECTURE "Storage", D-023): one repository per kind of record, and the
 * recorder's write batcher. Raw (recordings, frames, events) can only be added and read.
 * Every record read back goes through the model's normalisers, so old records gain new fields
 * as null (D-018). IndexedDB is a cache of the export, which is the durable artifact (spec
 * "Storage and export").
 */

import { Connection } from './db';
import { derivedRepository, type DerivedRepository } from './derived';
import { keyValueRepository, type KeyValueRepository } from './kv';
import { DEFAULT_FRAMES_PER_CHUNK, rawRepository, type RawRepository } from './raw';
import { recordingRepository, type RecordingRepository } from './recordings';
import { shotRepository, type ShotRepository } from './shots';

export { DB_NAME, DB_VERSION } from './db';
export type { DerivedEntry, DerivedRepository } from './derived';
export { StorageError, type StorageErrorCode } from './errors';
export type { KeyValueRepository } from './kv';
export { requestPersistence, type PersistenceStatus, type StorageManagerLike } from './persistence';
export {
  DEFAULT_FRAMES_PER_CHUNK,
  type LastRawRecords,
  type RawBatch,
  type RawRecording,
  type RawRepository,
} from './raw';
export {
  DEFAULT_MAX_DELAY_MS,
  DEFAULT_MAX_RECORDS,
  RecordingWriter,
  type RecordingWriterOptions,
  type RecordingWriterStorage,
  type Timers,
} from './recording-writer';
export type { RecordingRepository } from './recordings';
export type { ShotRepository } from './shots';

/** The app's storage. Only these repositories reach the database. */
export interface AppStorage {
  readonly recordings: RecordingRepository;
  readonly raw: RawRepository;
  readonly shots: ShotRepository;
  readonly derived: DerivedRepository;
  readonly kv: KeyValueRepository;
  /** Closes the database. Every later call fails with `closed`. */
  close(): void;
}

export interface StorageOptions {
  /** The database's name. Default `DB_NAME`. */
  readonly name?: string;
  /** The most frames one stored chunk holds. Default `DEFAULT_FRAMES_PER_CHUNK`. */
  readonly framesPerChunk?: number;
  /**
   * Called when opening has to wait for another tab to close an older version of the
   * database, which only a suspended tab fails to do. Ask the user to close the app's other
   * tabs.
   */
  readonly onBlocked?: () => void;
}

/**
 * Opens the database, creating or upgrading it as needed.
 *
 * @throws StorageError `unavailable` (no IndexedDB, or it refused), or `newer-version` (a
 *   newer build upgraded the database: reload).
 */
export async function openStorage(options: StorageOptions = {}): Promise<AppStorage> {
  const connection = new Connection({ name: options.name, onBlocked: options.onBlocked });
  const storage: AppStorage = {
    recordings: recordingRepository(connection),
    raw: rawRepository(connection, options.framesPerChunk ?? DEFAULT_FRAMES_PER_CHUNK),
    shots: shotRepository(connection),
    derived: derivedRepository(connection),
    kv: keyValueRepository(connection),
    close: () => connection.close(),
  };
  await connection.open();
  return storage;
}
