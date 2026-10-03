/**
 * The write batcher for the recorder (T1.6). It stores one recording as it is recorded: the
 * recording row at once, then its frames and events in batches, so IndexedDB sees about one
 * transaction a second rather than one per notification (D-023).
 *
 * - A batch is written about a second after its first record, or as soon as 20 records wait.
 *   `flush()` writes everything appended so far and resolves once it is stored.
 * - Writes run one at a time, in order. A write takes every record waiting when it starts, so
 *   what is stored is always everything appended up to some point: no gaps.
 * - A failed write puts its records back, ahead of any that arrived meanwhile, and the next
 *   write retries them about a second later. Nothing is dropped however long storage fails;
 *   the records wait in memory.
 * - The raw repository splits a batch across chunks, so a chunk filling mid-batch loses
 *   nothing.
 */

import {
  normaliseAppEvent,
  normaliseRawFrame,
  normaliseRecording,
  type AppEvent,
  type RawFrame,
  type Recording,
} from '../core/model';
import type { RawRepository } from './raw';
import type { RecordingRepository } from './recordings';

/** Timers, injected so tests can run on virtual time. `ManualClock` (src/transport) fits. */
export interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

type GlobalTimerId = ReturnType<typeof globalThis.setTimeout>;

const GLOBAL_TIMERS: Timers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as GlobalTimerId),
};

export const DEFAULT_MAX_DELAY_MS = 1000;
export const DEFAULT_MAX_RECORDS = 20;

export interface RecordingWriterOptions {
  /** How long a record may wait before a write starts, ms. Default 1000. */
  readonly maxDelayMs?: number;
  /** How many waiting records start a write at once. Default 20. */
  readonly maxRecords?: number;
  /** Default: the global `setTimeout` and `clearTimeout`. */
  readonly timers?: Timers;
  /** Called with each failed write's error. Its records stay queued for the next write. */
  readonly onError?: (error: Error) => void;
}

/** What the writer needs from storage (`AppStorage` has it). */
export interface RecordingWriterStorage {
  readonly recordings: Pick<RecordingRepository, 'create'>;
  readonly raw: Pick<RawRepository, 'append'>;
}

export class RecordingWriter {
  /** The recording being written. The writer stores it with its first write. */
  readonly recording: Recording;
  readonly #storage: RecordingWriterStorage;
  readonly #maxDelayMs: number;
  readonly #maxRecords: number;
  readonly #timers: Timers;
  readonly #onError: ((error: Error) => void) | undefined;

  /** Records waiting for a write, each list in seq order. */
  #frames: RawFrame[] = [];
  #events: AppEvent[] = [];
  /** How many records the running write holds. */
  #inFlight = 0;
  #written = 0;
  #lastSeq = -1;
  #created = false;
  #lastError: Error | null = null;
  #timerArmed = false;
  #timerId: unknown = undefined;
  /** A write that hasn't started yet. When it starts, it takes every record waiting. */
  #queued: Promise<void> | null = null;
  /** Settles when the last write requested so far has settled. */
  #chain: Promise<void> = Promise.resolve();

  /**
   * Starts writing `recording`, which must not be stored yet: the first write creates it,
   * straight away.
   *
   * @throws SchemaError on a malformed recording; RangeError on a bad option.
   */
  constructor(
    storage: RecordingWriterStorage,
    recording: Recording,
    options: RecordingWriterOptions = {},
  ) {
    this.recording = normaliseRecording(recording);
    this.#storage = storage;
    this.#maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
    this.#maxRecords = options.maxRecords ?? DEFAULT_MAX_RECORDS;
    this.#timers = options.timers ?? GLOBAL_TIMERS;
    this.#onError = options.onError;
    if (!(this.#maxDelayMs >= 0)) {
      throw new RangeError(`RecordingWriter: maxDelayMs ${this.#maxDelayMs}`);
    }
    if (!Number.isSafeInteger(this.#maxRecords) || this.#maxRecords < 1) {
      throw new RangeError(`RecordingWriter: maxRecords ${this.#maxRecords}`);
    }
    // Store the recording now, so it exists, and is listed, before its first batch is due.
    this.#requestWrite().catch(ignore);
  }

  /**
   * Queues a frame. It must belong to this recording and come after everything appended so
   * far, frames and events alike.
   *
   * @throws TypeError, RangeError or SchemaError if it doesn't, or is malformed. A refused
   *   frame is not queued, so it can't block the writes behind it.
   */
  appendFrame(frame: RawFrame): void {
    const record = normaliseRawFrame(frame);
    this.#accept(record);
    this.#frames.push(record);
    this.#afterAppend();
  }

  /** Queues an app event, under the same rules as `appendFrame`. */
  appendEvent(event: AppEvent): void {
    const record = normaliseAppEvent(event);
    this.#accept(record);
    this.#events.push(record);
    this.#afterAppend();
  }

  /**
   * Writes everything appended so far. Resolves once it is all stored. Rejects if that write
   * fails: the records then stay queued, and later writes keep retrying them.
   */
  flush(): Promise<void> {
    return this.#requestWrite();
  }

  /** Resolves, never rejects, once the writes started or queued so far have settled. */
  whenIdle(): Promise<void> {
    return this.#chain;
  }

  /** Records appended but not stored yet: waiting, or in the running write. */
  get pendingCount(): number {
    return this.#waitingCount + this.#inFlight;
  }

  /** Records stored so far. */
  get writtenCount(): number {
    return this.#written;
  }

  /** The last write's error, or null once a write has succeeded since. */
  get lastError(): Error | null {
    return this.#lastError;
  }

  get #waitingCount(): number {
    return this.#frames.length + this.#events.length;
  }

  #accept(record: RawFrame | AppEvent): void {
    if (record.recordingId !== this.recording.id) {
      throw new TypeError(
        `RecordingWriter: a record of recording ${record.recordingId}, not ${this.recording.id}`,
      );
    }
    if (record.seq <= this.#lastSeq) {
      throw new RangeError(
        `RecordingWriter: seq ${record.seq} after seq ${this.#lastSeq}; seq must increase`,
      );
    }
    this.#lastSeq = record.seq;
  }

  #afterAppend(): void {
    // After a failure only the timer starts writes, so a storage that keeps failing is retried
    // about once a second, not once per record.
    if (this.#waitingCount >= this.#maxRecords && this.#lastError === null) {
      this.#requestWrite().catch(ignore);
    } else {
      this.#armTimer();
    }
  }

  #armTimer(): void {
    if (this.#timerArmed || this.#queued !== null || this.#waitingCount === 0) return;
    this.#timerArmed = true;
    this.#timerId = this.#timers.setTimeout(() => {
      this.#timerArmed = false;
      this.#requestWrite().catch(ignore);
    }, this.#maxDelayMs);
  }

  #clearTimer(): void {
    if (!this.#timerArmed) return;
    this.#timerArmed = false;
    this.#timers.clearTimeout(this.#timerId);
  }

  #requestWrite(): Promise<void> {
    if (this.#queued !== null) return this.#queued;
    const write = this.#chain.then(() => this.#write());
    this.#queued = write;
    this.#chain = write.then(ignore, ignore);
    return write;
  }

  async #write(): Promise<void> {
    this.#queued = null;
    this.#clearTimer();
    const frames = this.#frames;
    const events = this.#events;
    this.#frames = [];
    this.#events = [];
    this.#inFlight = frames.length + events.length;
    let failed = false;
    try {
      if (!this.#created) {
        await this.#storage.recordings.create(this.recording);
        this.#created = true;
      }
      if (frames.length + events.length > 0) {
        await this.#storage.raw.append(this.recording.id, { frames, events });
      }
      this.#written += frames.length + events.length;
      this.#lastError = null;
    } catch (error) {
      failed = true;
      // Back in front of whatever arrived meanwhile: the next write retries them, in order.
      this.#frames = frames.concat(this.#frames);
      this.#events = events.concat(this.#events);
      const reported = error instanceof Error ? error : new Error(String(error));
      this.#lastError = reported;
      this.#report(reported);
      throw reported;
    } finally {
      this.#inFlight = 0;
      if (!failed && this.#waitingCount >= this.#maxRecords) this.#requestWrite().catch(ignore);
      else this.#armTimer();
    }
  }

  #report(error: Error): void {
    try {
      this.#onError?.(error);
    } catch (listenerError) {
      // A listener's bug mustn't stop the writer; it still surfaces.
      queueMicrotask(() => {
        throw listenerError;
      });
    }
  }
}

function ignore(): void {}
