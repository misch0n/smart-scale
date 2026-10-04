/**
 * Where automatic exports go (T1.20, D-027): a narrow interface, as `ScaleTransport` is for BLE.
 * Today's destination is a private GitHub repo (`github.ts`). D-027 says "for now", so a later
 * one (iCloud through CloudKit, or the share sheet) implements this interface and the queue
 * (`auto-export.ts`) stays as it is.
 *
 * A sink stores text files at paths, and can read them back with a version, so that the queue
 * never replaces a file it hasn't compared (D-030). Every failure is a `BackupError`, whose kind
 * tells the queue whether to retry, to stop until the settings change, or to leave that one
 * file alone.
 */

/** A file as the destination holds it. */
export interface RemoteFile {
  /** The file's content. */
  readonly text: string;
  /** The destination's version of it, which `write` needs to replace it. GitHub: the blob sha. */
  readonly version: string;
}

/** What `check` found: the destination is ready. */
export interface SinkCheck {
  /** For the user, like `someone/smart-scale-data (private), branch main`. */
  readonly description: string;
}

export interface BackupSink {
  /**
   * Checks that the destination is reachable with these credentials and is private, without
   * changing anything.
   *
   * @throws BackupError
   */
  check(): Promise<SinkCheck>;
  /**
   * The file at `path`, or null if there is none.
   *
   * @throws BackupError
   */
  read(path: string): Promise<RemoteFile | null>;
  /**
   * Writes `text` to `path` and returns the file's new version. `replacing` is the version of
   * the file it replaces, from `read` or an earlier `write`, or null to create a new file.
   * `note` says what changed, in a line: GitHub's commit message.
   *
   * @throws BackupError `conflict` if the file isn't at that version (or exists, for null).
   */
  write(path: string, text: string, replacing: string | null, note: string): Promise<string>;
}

export type BackupErrorKind =
  /** The request failed or timed out on the way. It may pass: retry later. */
  | 'network'
  /** The destination failed (a 5xx). It may pass: retry later. */
  | 'unavailable'
  /** Too many requests: retry after `retryAfterMs`, if it is known. */
  | 'rate-limited'
  /** The credentials were refused: the token is wrong, expired or revoked. Stop. */
  | 'unauthorized'
  /** The credentials don't allow this, or the destination is read-only. Stop. */
  | 'forbidden'
  /** The destination doesn't exist, or the credentials can't see it. Stop. */
  | 'not-found'
  /** The destination isn't private, so writing would publish the recordings. Stop. */
  | 'not-private'
  /** The file isn't at the version given (another device or tab wrote it): read it again. */
  | 'conflict'
  /** This file can't be written or read as it is (too large, say). Leave it, go on with others. */
  | 'rejected'
  /** The destination answered with something this build doesn't understand. Retry later. */
  | 'unexpected';

/** Retrying later may help. */
export const RETRYABLE_KINDS: ReadonlySet<BackupErrorKind> = new Set([
  'network',
  'unavailable',
  'rate-limited',
  'unexpected',
]);

/** Only the user can fix it, in the settings or on the destination. */
export const STOPPING_KINDS: ReadonlySet<BackupErrorKind> = new Set([
  'unauthorized',
  'forbidden',
  'not-found',
  'not-private',
]);

export class BackupError extends Error {
  readonly kind: BackupErrorKind;
  /** For `rate-limited`: how long the destination asked to wait, ms; null if it didn't say. */
  readonly retryAfterMs: number | null;

  constructor(
    kind: BackupErrorKind,
    message: string,
    options: { readonly retryAfterMs?: number | null; readonly cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'BackupError';
    this.kind = kind;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}

/**
 * `text` with every occurrence of `secret` replaced, so that no message can carry a token
 * (D-027). Secrets shorter than 4 characters aren't replaced: they would match everywhere,
 * and no real token is that short.
 */
export function redact(text: string, secret: string | null): string {
  if (secret === null || secret.length < 4) return text;
  return text.split(secret).join('[token]');
}
