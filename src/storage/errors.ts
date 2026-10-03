/**
 * Storage failures. IndexedDB errors come out of the repositories as `StorageError`, with a
 * code the app can act on and the browser's error as `cause`. Programming errors (a
 * `SchemaError` from a malformed record, a `TypeError` from a bad argument) pass through as
 * they are.
 */

export type StorageErrorCode =
  /** IndexedDB is missing, or the browser refused to open the database. */
  | 'unavailable'
  /**
   * A newer build of the app has upgraded the database, so this one can't use it. Reloading the
   * page loads the newer build.
   */
  | 'newer-version'
  /** The storage was closed with `close()`. */
  | 'closed'
  /** A record with that key is already stored. New records are written once. */
  | 'exists'
  /** The record to change, or the recording to append to, isn't stored. */
  | 'not-found'
  /** The recording has already ended. */
  | 'already-ended'
  /** Raw records must come after everything stored for their recording: `seq` only grows. */
  | 'out-of-order'
  /** The browser has no more space for this site. */
  | 'quota'
  /** Anything else. `cause` holds the browser's error. */
  | 'failed';

export class StorageError extends Error {
  readonly code: StorageErrorCode;

  constructor(code: StorageErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'StorageError';
    this.code = code;
  }
}

/** `error.name` when it has one, like `ConstraintError` for a `DOMException`. */
export function errorName(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('name' in error)) return null;
  return typeof error.name === 'string' ? error.name : null;
}

const CODES: Readonly<Record<string, StorageErrorCode>> = {
  ConstraintError: 'exists',
  QuotaExceededError: 'quota',
  VersionError: 'newer-version',
};

/**
 * An error from IndexedDB (a `DOMException`) as a `StorageError` whose message says what was
 * being done. Anything else is returned unchanged.
 */
export function toStorageError(error: unknown, doing: string): unknown {
  if (!(error instanceof DOMException)) return error;
  const code = CODES[error.name] ?? 'failed';
  return new StorageError(code, `${doing}: ${error.name}: ${error.message}`, { cause: error });
}
