/**
 * The IndexedDB database: its stores, the migrations that build them, and the connection the
 * repositories share (ARCHITECTURE "Storage", D-023).
 */

import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
  type StoreNames,
} from 'idb';
import type { Id } from '../core/model';
import { errorName, StorageError, toStorageError } from './errors';

export const DB_NAME = 'smart-scale';

/**
 * The stores. Every value is `unknown` on purpose: whatever comes out of IndexedDB goes through
 * a normaliser before anything uses it (D-018), and these types make the compiler insist.
 */
export interface SmartScaleDb extends DBSchema {
  /** `Recording` by id. Raw: created once, then ended once. */
  recordings: { key: Id; value: unknown };
  /** A recording's frames, in chunks keyed by the first frame's seq. Raw: add-only. */
  frameChunks: { key: [Id, number]; value: unknown };
  /** `AppEvent` by `[recordingId, seq]`. Raw: add-only. */
  events: { key: [Id, number]; value: unknown };
  /** `Shot` by id. User metadata: edited, and discarded rather than deleted (D-019). */
  shots: { key: Id; value: unknown; indexes: { byRecording: [Id, number] } };
  /** Analysis results by `[recordingId, analysisVersion]`. Disposable. */
  derived: { key: [Id, number]; value: unknown };
  /** Settings and last-used values: JSON, by a string key. Exported as settings (D-025). */
  kv: { key: string; value: unknown };
  /**
   * Device-local values: JSON, by a string key. Never exported or imported (D-030): the
   * automatic export's token and ledger (T1.20), a remembered scale (T1.21).
   */
  local: { key: string; value: unknown };
}

export type StoreName = StoreNames<SmartScaleDb>;
export type Database = IDBPDatabase<SmartScaleDb>;
export type Transaction<
  Names extends readonly StoreName[],
  Mode extends IDBTransactionMode,
> = IDBPTransaction<SmartScaleDb, Names, Mode>;

/** Takes the database up one version, inside the upgrade transaction. */
export type Migration = (
  db: Database,
  tx: IDBPTransaction<SmartScaleDb, StoreName[], 'versionchange'>,
) => void;

/**
 * Every schema version in order: `MIGRATIONS[n]` upgrades version n to n + 1, and the
 * database's version is the number of migrations. Never edit or remove one, because a phone
 * may hold a database at any version. Add one per change: Phase 2 adds the entity stores
 * (T2.1). A migration that changes how existing records are stored must convert them too.
 */
export const MIGRATIONS: readonly Migration[] = [
  // Version 1 (T1.5): the initial stores.
  (db) => {
    db.createObjectStore('recordings', { keyPath: 'id' });
    db.createObjectStore('frameChunks', { keyPath: ['recordingId', 'firstSeq'] });
    db.createObjectStore('events', { keyPath: ['recordingId', 'seq'] });
    db.createObjectStore('shots', { keyPath: 'id' }).createIndex('byRecording', [
      'recordingId',
      'anchorTMs',
    ]);
    db.createObjectStore('derived', { keyPath: ['recordingId', 'analysisVersion'] });
    db.createObjectStore('kv');
  },
  // Version 2 (T1.20): device-local values, kept apart from `kv` so that no export carries them.
  (db) => {
    db.createObjectStore('local');
  },
];

export const DB_VERSION = MIGRATIONS.length;

/** Every `[recordingId, n]` key of one recording, for any number `n`, in order of `n`. */
export function recordingKeyRange(recordingId: Id): IDBKeyRange {
  return IDBKeyRange.bound([recordingId, -Infinity], [recordingId, Infinity]);
}

/**
 * Errors after which a connection may be dead: Safari has been known to lose its connection
 * to the IndexedDB server, after which every transaction fails until the page opens a new one.
 */
const CONNECTION_LOST = new Set(['InvalidStateError', 'UnknownError']);

export interface ConnectionOptions {
  /** Default `DB_NAME`. */
  readonly name?: string;
  /** Default `MIGRATIONS`. Tests pass their own to exercise an upgrade. */
  readonly migrations?: readonly Migration[];
  /**
   * Called when opening has to wait for another tab to close an older version of the
   * database. Builds from T1.5 on close theirs when asked, but a suspended tab can't: then the
   * user has to close it.
   */
  readonly onBlocked?: () => void;
}

/**
 * The connection the repositories share (D-023). It opens the database on first use, and
 * opens it again after the browser closes it. When another tab upgrades the database, it
 * closes its connection so the upgrade can go ahead; reopening then fails with
 * `newer-version`.
 */
export class Connection {
  readonly name: string;
  readonly #migrations: readonly Migration[];
  readonly #onBlocked: (() => void) | undefined;
  #opening: Promise<Database> | null = null;
  #db: Database | null = null;
  #closed = false;

  constructor(options: ConnectionOptions = {}) {
    this.name = options.name ?? DB_NAME;
    this.#migrations = options.migrations ?? MIGRATIONS;
    this.#onBlocked = options.onBlocked;
    if (this.#migrations.length === 0) throw new RangeError('Connection: no migrations');
  }

  /**
   * The open database, opened (and created or upgraded) if need be.
   *
   * @throws StorageError `unavailable`, `newer-version` or `closed`.
   */
  open(): Promise<Database> {
    if (this.#closed) {
      return Promise.reject(new StorageError('closed', `Database ${this.name} has been closed`));
    }
    this.#opening ??= this.#openNew();
    return this.#opening;
  }

  /**
   * Runs `body` in a new transaction on `stores` and returns its result. If `body` throws, the
   * transaction is aborted, so none of its writes are kept.
   *
   * `body` must make its first request before it awaits anything, and await nothing but this
   * transaction's requests and `tx.done`: awaiting anything else lets the transaction commit
   * early. Errors from IndexedDB come out as `StorageError` with `doing` in the message.
   */
  async run<const Names extends readonly StoreName[], Mode extends IDBTransactionMode, T>(
    stores: Names,
    mode: Mode,
    doing: string,
    body: (tx: Transaction<Names, Mode>) => Promise<T>,
  ): Promise<T> {
    let db = await this.open();
    let tx: Transaction<Names, Mode>;
    try {
      tx = db.transaction(stores, mode);
    } catch (error) {
      if (errorName(error) !== 'InvalidStateError') throw toStorageError(error, doing);
      // The browser closed the connection and its close event hasn't arrived yet.
      this.#forget(db);
      db = await this.open();
      try {
        tx = db.transaction(stores, mode);
      } catch (retryError) {
        throw toStorageError(retryError, doing);
      }
    }
    // An aborted transaction rejects `done`; nothing may be left unhandled.
    tx.done.catch(() => {});
    try {
      return await body(tx);
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // It has already finished.
      }
      const name = errorName(error);
      if (name !== null && CONNECTION_LOST.has(name)) this.#forget(db);
      throw toStorageError(error, doing);
    }
  }

  /** Closes the database. Every later call fails with `closed`. */
  close(): void {
    this.#closed = true;
    this.#db?.close();
    this.#db = null;
    this.#opening = null;
  }

  #openNew(): Promise<Database> {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(
        new StorageError('unavailable', 'IndexedDB is not available in this browser'),
      );
    }
    const migrations = this.#migrations;
    // The connection's events can only fire once it is open, by which time this is set.
    let opened: Database | null = null;
    const forgetOpened = (): void => {
      if (opened !== null) this.#forget(opened);
    };
    let request: Promise<Database>;
    try {
      request = openDB<SmartScaleDb>(this.name, migrations.length, {
        upgrade(db, oldVersion, _newVersion, tx) {
          for (let version = oldVersion; version < migrations.length; version++) {
            migrations[version](db, tx);
          }
        },
        blocked: () => this.#onBlocked?.(),
        // Another tab is upgrading or deleting the database: close, so that it can.
        blocking: forgetOpened,
        // The browser closed the connection: the next call opens a new one.
        terminated: forgetOpened,
      });
    } catch (error) {
      // Some browsers refuse at once, in private browsing for example.
      request = Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    const opening = request.then(
      (db) => {
        opened = db;
        if (this.#opening === opening) this.#db = db;
        else db.close(); // close() was called while it opened
        return db;
      },
      (error: unknown) => {
        if (this.#opening === opening) this.#opening = null; // try again next time
        throw openError(this.name, error);
      },
    );
    return opening;
  }

  /** Drops a connection that is closed or dead, so the next call opens a new one. */
  #forget(db: Database): void {
    if (this.#db !== db) return;
    this.#db = null;
    this.#opening = null;
    db.close();
  }
}

function openError(name: string, error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  if (errorName(error) === 'VersionError') {
    return new StorageError(
      'newer-version',
      `Database ${name} was upgraded by a newer build of the app. Reload the page to get it.`,
      { cause: error },
    );
  }
  const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return new StorageError('unavailable', `Opening database ${name}: ${reason}`, { cause: error });
}
