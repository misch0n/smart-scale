/**
 * The recorder (T1.6). It stores every notification from connect to disconnect, verbatim, and
 * the app's own events on the same timeline (spec "Data model and storage", D-004). It decides
 * nothing about shots: segmentation is analysis's job, after the fact.
 *
 * It follows the transport's status (D-020, D-024):
 * - `connected` starts a recording. The recording is stored at once (`RecordingWriter`), its
 *   timeline opens with the `connected` and `characteristic-properties` events, and
 *   `flowSmoothingOff` goes to the scale (spec parsing rule 5). The weight frames' smoothing
 *   byte confirms it (`smoothing-confirmed`). Without a confirmation within about 2 s it is sent
 *   once more, and after another 2 s `smoothing-not-confirmed` is logged and shown as a warning:
 *   the tail fit depends on smoothing being off.
 * - Every notification becomes a frame, whatever it holds. Frames that fail to decode are
 *   stored too, and counted for the failure alarm (protocol-notes, finding 6).
 * - The microphone's sound levels, when the probe records them (T1.24, D-049), come in through
 *   `recordSound` as `mic` frames on the same timeline, stamped as they arrive. They aren't
 *   decoded here, counted in frames/s, or passed to `onFrame`, which carries the scale's frames.
 * - `disconnected` ends it: the `disconnected` event closes the timeline, every record is
 *   stored, then the recording is ended with the transport's reason. A recording the app never
 *   ended (the tab was closed or crashed) is ended as `unclean` at the next startup by
 *   `recoverUncleanRecordings` (recovery.ts). While recording, the recorder holds the
 *   recording's Web Lock, so that recovery in another tab leaves it alone.
 *
 * Time: `tMs` is the transport's clock (`now()`, which also stamps `tArrival`) minus its reading
 * at `connected`, so frames and events share one timeline (ARCHITECTURE "Timebase").
 *
 * Observable, for the UI: `state` with live stats and warnings, `onChange`, `onFrame` (every
 * frame with its decoding, for the live pipeline and the probe) and `onEvent`. Live values are
 * display-only: nothing computed here is stored (CLAUDE.md hard rule 3).
 */

import {
  CHARACTERISTIC_NAMES,
  commandEventData,
  createRecording,
  epochMsAt,
  RecordingSequence,
  type AppEvent,
  type AppEventDataMap,
  type AppEventOf,
  type AppEventType,
  type AppInfo,
  type DisconnectReason,
  type JsonValue,
  type RawFrame,
  type Recording,
} from '../core/model';
import {
  decodeFrame,
  flowSmoothingOff,
  RollingFailureCounter,
  type DecodedFrame,
  type ScaleCommand,
  type WeightFrame,
} from '../core/protocol';
import {
  RecordingWriter,
  StorageError,
  type RawRepository,
  type RecordingRepository,
  type RecordingWriterOptions,
  type Timers,
} from '../storage';
import { Emitter, type Unsubscribe } from '../transport/emitter';
import type { ConnectionInfo, ScaleNotification, ScaleTransport } from '../transport/types';
import { browserPageLifecycle, type PageLifecycle } from './page-lifecycle';
import { holdRecordingLock, systemLocks, type LockManagerLike } from './recording-locks';

/** How long to wait for a weight frame showing smoothing off after each attempt, ms. */
export const SMOOTHING_TIMEOUT_MS = 2000;
/** How many times `flowSmoothingOff` is sent: at connect, and one retry. */
export const SMOOTHING_ATTEMPTS = 2;
/** The `reason` of the smoothing commands the recorder sends itself. */
export const SMOOTHING_REASONS = { first: 'connect', retry: 'smoothing-retry' } as const;
/** frames/s counts the frames that arrived within this window, ms. */
export const RATE_WINDOW_MS = 2000;
/** How often the state is emitted while recording even without frames, so frames/s can fall, ms. */
export const STATE_TICK_MS = 1000;
/** The pause between attempts to store an ended recording's records, or its end, ms. */
export const FINISH_RETRY_MS = 1000;

/** What the recorder needs from storage (`AppStorage` has it). */
export interface RecorderStorage {
  readonly recordings: Pick<RecordingRepository, 'create' | 'end'>;
  readonly raw: Pick<RawRepository, 'append'>;
}

export interface RecorderOptions {
  readonly transport: ScaleTransport;
  readonly storage: RecorderStorage;
  /** The build that is recording: `BUILD_INFO` (src/platform). */
  readonly app: AppInfo;
  /** `navigator.userAgent`: it tells beacio from Bluefy (D-016). */
  readonly userAgent: string | null;
  /** The wall clock, for `startedAtEpochMs`. Default `Date.now`. */
  readonly epochNow?: () => number;
  /**
   * Timers for the smoothing check, the state tick, the writer and retries. Default the global
   * ones; tests pass the transport's `ManualClock`. They run on the scheduler's clock, so with
   * the mock at `speed` N the 2 s smoothing timeout lasts 2·N s of the mock's time.
   */
  readonly timers?: Timers;
  /** The Web Locks API. Default `systemLocks()`; null for none. */
  readonly locks?: LockManagerLike | null;
  /** Default `browserPageLifecycle`. */
  readonly page?: PageLifecycle;
  /** Batching for each recording's `RecordingWriter`. Default its defaults. */
  readonly writer?: Pick<RecordingWriterOptions, 'maxDelayMs' | 'maxRecords'>;
}

export type SmoothingStatus =
  /** `flowSmoothingOff` is sent; no weight frame has shown smoothing off yet. */
  | 'checking'
  /** A weight frame showed smoothing off (`smoothing-confirmed`). */
  | 'confirmed'
  /** No weight frame showed it off after every attempt (`smoothing-not-confirmed`). */
  | 'not-confirmed';

export interface SmoothingState {
  readonly status: SmoothingStatus;
  /** How many times `flowSmoothingOff` has been sent, failed writes included. */
  readonly attempts: number;
  /** The latest weight frame's smoothing byte (`0` off, `1` on), or null before one arrived. */
  readonly byte: number | null;
}

/** Live stats of the recording in progress, for display only. */
export interface RecorderStats {
  /** Frames recorded, from both characteristics, decodable or not. */
  readonly frames: number;
  /** Frames that arrived in the last 2 s, per second (or since connect, in the first 2 s). */
  readonly framesPerSecond: number;
  /** FF11 frames that failed to decode (checksum or length) since connect. */
  readonly failedFrames: number;
  /** How many of the last 50 FF11 frames failed (`RollingFailureCounter`). */
  readonly recentFailures: number;
  /** More than half of the last 50 FF11 frames failed. */
  readonly failureAlarm: boolean;
  /** The latest weight frame and when it arrived, or null before one arrived. */
  readonly lastWeight: { readonly tMs: number; readonly frame: WeightFrame } | null;
  /** Whether the latest weight frame's unit byte means grams (D-005); null before one arrived. */
  readonly unitOk: boolean | null;
  readonly smoothing: SmoothingState;
  /** The microphone's sound-level frames recorded since connect (T1.24). */
  readonly soundFrames: number;
}

export type RecorderWarning =
  /**
   * Smoothing isn't known to be off: still on after every attempt, never seen because no weight
   * frame arrived, or back on since it was confirmed. The tail fit can't be trusted.
   */
  | 'smoothing-not-off'
  /** More than half of the last 50 FF11 frames failed to decode. */
  | 'failing-frames'
  /** The latest weight frame's unit isn't grams: its weight is refused (D-005). */
  | 'unit-not-grams'
  /**
   * Storing is failing. The records wait in memory and are retried, but closing the page now
   * would lose them.
   */
  | 'storage-failing';

export interface RecorderState {
  /** The recording in progress, or null when not connected. */
  readonly recording: Recording | null;
  /** The live stats of the recording in progress, or null. */
  readonly stats: RecorderStats | null;
  /** Records not stored yet, in the recording in progress and those still finishing. */
  readonly unsaved: number;
  /** Recordings that have disconnected but aren't stored and ended yet. */
  readonly finishing: number;
  /** The latest storage error while storage is failing, else null. */
  readonly storageError: string | null;
  readonly warnings: readonly RecorderWarning[];
}

/** A frame as recorded, with its decoding. */
export interface RecordedFrame {
  readonly frame: RawFrame;
  readonly decoded: DecodedFrame;
}

export class Recorder {
  readonly #transport: ScaleTransport;
  readonly #storage: RecorderStorage;
  readonly #app: AppInfo;
  readonly #userAgent: string | null;
  readonly #epochNow: () => number;
  readonly #timers: Timers;
  readonly #locks: LockManagerLike | null;
  readonly #writerOptions: Pick<RecordingWriterOptions, 'maxDelayMs' | 'maxRecords'>;
  readonly #changes = new Emitter<RecorderState>();
  readonly #frames = new Emitter<RecordedFrame>();
  readonly #events = new Emitter<AppEvent>();
  /** The recording in progress. */
  #active: Session | null = null;
  /** Every recording not yet stored and ended, the one in progress included. */
  readonly #sessions = new Set<Session>();

  /**
   * Starts following the transport. Create one per transport, before connecting, and keep it
   * for the app's lifetime: it can't be detached, and two on one transport would record every
   * connection twice. Screens subscribe to it and unsubscribe instead.
   *
   * @throws Error if the transport is already connected, since the recording would miss the
   *   start of the connection.
   */
  constructor(options: RecorderOptions) {
    if (options.transport.status.state === 'connected') {
      throw new Error('Recorder: the transport is already connected; create the recorder first');
    }
    this.#transport = options.transport;
    this.#storage = options.storage;
    this.#app = options.app;
    this.#userAgent = options.userAgent;
    this.#epochNow = options.epochNow ?? Date.now;
    this.#timers = options.timers ?? GLOBAL_TIMERS;
    this.#locks = options.locks === undefined ? systemLocks() : options.locks;
    this.#writerOptions = options.writer ?? {};
    this.#transport.onStatus((status) => {
      if (status.state === 'connected') this.#begin(status.connection);
      else if (status.state === 'disconnected') this.#end(status.reason, status.message);
    });
    this.#transport.onNotification((notification) => this.#record(notification));
    (options.page ?? browserPageLifecycle).onHidden(() => this.#flushQuietly());
  }

  /** The current state, computed now. */
  get state(): RecorderState {
    const active = this.#active;
    let unsaved = 0;
    let finishing = 0;
    let storageError: string | null = null;
    for (const session of this.#sessions) {
      unsaved += session.writer.pendingCount;
      if (!session.open) finishing++;
      storageError ??= session.writer.lastError?.message ?? session.endError;
    }
    const stats = active === null ? null : this.#stats(active);
    const warnings: RecorderWarning[] = [];
    if (stats !== null) {
      const { status, byte } = stats.smoothing;
      if (status === 'not-confirmed' || (status === 'confirmed' && byte !== 0)) {
        warnings.push('smoothing-not-off');
      }
      if (stats.failureAlarm) warnings.push('failing-frames');
      if (stats.unitOk === false) warnings.push('unit-not-grams');
    }
    if (storageError !== null) warnings.push('storage-failing');
    return {
      recording: active?.recording ?? null,
      stats,
      unsaved,
      finishing,
      storageError,
      warnings,
    };
  }

  /** The recording in progress, or null: `state.recording`, without computing the rest. */
  get recording(): Recording | null {
    return this.#active?.recording ?? null;
  }

  /** Calls `listener` with the new state after every change, and every second while recording. */
  onChange(listener: (state: RecorderState) => void): Unsubscribe {
    return this.#changes.on(listener);
  }

  /** Calls `listener` with every frame, once it is queued for storage. */
  onFrame(listener: (frame: RecordedFrame) => void): Unsubscribe {
    return this.#frames.on(listener);
  }

  /** Calls `listener` with every app event, once it is queued for storage. */
  onEvent(listener: (event: AppEvent) => void): Unsubscribe {
    return this.#events.on(listener);
  }

  /**
   * Sends a whitelisted command and logs it: `command-sent` once it is written, or
   * `command-failed` with the error. If the recording ends before the write settles, nothing is
   * logged, because `disconnected` is a recording's last event.
   *
   * @throws TransportError as `ScaleTransport.send()` does: `not-connected` when no recording is
   *   in progress.
   */
  sendCommand(command: ScaleCommand, reason: string | null = null): Promise<void> {
    return this.#send(this.#active, command, reason);
  }

  /**
   * Logs a user action, like a button press, on the recording's timeline.
   *
   * @returns the event, or null when no recording is in progress.
   * @throws SchemaError if `detail` isn't JSON.
   */
  logUiAction(action: string, detail: JsonValue = null): AppEventOf<'ui-action'> | null {
    return this.#logFromApp('ui-action', { action, detail });
  }

  /**
   * Puts a label on the recording's timeline, like `pump-on` (`ANNOTATION_LABELS`).
   *
   * @returns the event, or null when no recording is in progress.
   */
  annotate(label: string, text: string | null = null): AppEventOf<'annotation'> | null {
    return this.#logFromApp('annotation', { label, text });
  }

  /**
   * Records one reading of the microphone's sound levels as a `mic` frame, stamped now on the
   * recording's timeline (T1.24, D-049). `bytes` is what `encodeSoundFrame` (src/core/sound)
   * makes. It doesn't call `onChange` listeners, 20 times a second: `stats.soundFrames` shows
   * at the next change, and the sound capture reports its readings itself.
   *
   * @returns the frame, or null when no recording is in progress or the frame can't be made.
   */
  recordSound(bytes: Uint8Array): RawFrame | null {
    const session = this.#active;
    if (session === null) return null;
    let frame: RawFrame;
    try {
      frame = session.sequence.frame(this.#tMs(session), 'mic', bytes);
    } catch (error) {
      this.#log(session, 'error', {
        message: `A sound reading couldn't be recorded: ${errorText(error)}`,
        context: 'recorder',
      });
      this.#emitChange();
      return null;
    }
    session.writer.appendFrame(frame);
    session.soundFrames++;
    return frame;
  }

  /**
   * Logs that the microphone's sound levels start, or continue, in the recording in progress.
   *
   * @returns the event, or null when no recording is in progress.
   */
  logSoundStarted(data: AppEventDataMap['sound-started']): AppEventOf<'sound-started'> | null {
    return this.#logFromApp('sound-started', data);
  }

  /**
   * Logs that the microphone's input changed state: the levels pause or resume.
   *
   * @returns the event, or null when no recording is in progress.
   */
  logSoundInput(data: AppEventDataMap['sound-input']): AppEventOf<'sound-input'> | null {
    return this.#logFromApp('sound-input', data);
  }

  /**
   * Logs that the microphone's sound levels stopped.
   *
   * @returns the event, or null when no recording is in progress.
   */
  logSoundStopped(data: AppEventDataMap['sound-stopped']): AppEventOf<'sound-stopped'> | null {
    return this.#logFromApp('sound-stopped', data);
  }

  /**
   * Stores every record appended so far, in every recording not yet finished. Rejects if a
   * write fails; the records stay queued and are retried.
   */
  async flush(): Promise<void> {
    await Promise.all([...this.#sessions].map((session) => session.writer.flush()));
  }

  /** Resolves once every recording that has disconnected so far is stored and ended. */
  async whenIdle(): Promise<void> {
    await Promise.all([...this.#sessions].map((session) => session.finished));
  }

  #begin(connection: ConnectionInfo): void {
    // The transport never reports connected twice in a row (D-020); if it did, the first
    // recording ends here rather than being left open.
    if (this.#active !== null) this.#end('error', 'The transport reported connected again');
    const startMs = this.#transport.now();
    const recording = createRecording({
      startedAtEpochMs: this.#epochNow(),
      device: connection.device,
      transport: this.#transport.kind,
      app: this.#app,
      userAgent: this.#userAgent,
    });
    // Before the recording is stored, so no other tab can see it open and unlocked.
    const releaseLock = holdRecordingLock(this.#locks, recording.id);
    const session = new Session(
      recording,
      startMs,
      releaseLock,
      (self) =>
        new RecordingWriter(this.#storage, recording, {
          ...this.#writerOptions,
          timers: this.#timers,
          onError: (error) => this.#onStorageError(self, error),
        }),
    );
    this.#active = session;
    this.#sessions.add(session);
    const { device, properties } = connection;
    this.#log(session, 'connected', { deviceName: device.name, deviceId: device.id });
    for (const characteristic of CHARACTERISTIC_NAMES) {
      this.#log(session, 'characteristic-properties', {
        characteristic,
        properties: properties[characteristic],
      });
    }
    this.#sendSmoothingOff(session);
    this.#tick(session);
    this.#emitChange();
  }

  #end(reason: DisconnectReason | null, message: string | null): void {
    const session = this.#active;
    if (session === null) return; // nothing recording: a failed connect, or a second report
    this.#active = null;
    session.clearTimers(this.#timers);
    const tMs = this.#tMs(session);
    const endReason = reason ?? 'error';
    this.#log(session, 'disconnected', { reason: endReason, message }, tMs);
    session.open = false;
    session.finished = this.#finish(session, epochMsAt(session.recording, tMs), endReason);
    this.#emitChange();
  }

  /** Stores every record, then ends the recording. Retries until both succeed; never rejects. */
  async #finish(session: Session, endedAtEpochMs: number, reason: DisconnectReason): Promise<void> {
    try {
      // Every record first, so an ended recording is a complete one. A failure is reported
      // through the writer's onError; the records stay queued.
      for (;;) {
        try {
          await session.writer.flush();
          break;
        } catch {
          await this.#sleep(FINISH_RETRY_MS);
        }
      }
      for (;;) {
        try {
          await this.#storage.recordings.end(session.recording.id, endedAtEpochMs, reason);
          return;
        } catch (error) {
          // Ended elsewhere: only another tab's recovery, where there are no Web Locks.
          if (error instanceof StorageError && error.code === 'already-ended') return;
          // A StorageError's message already says what was being done, and to which recording.
          session.endError = errorText(error);
          this.#emitChange();
          await this.#sleep(FINISH_RETRY_MS);
        }
      }
    } finally {
      session.releaseLock();
      this.#sessions.delete(session);
      this.#emitChange();
    }
  }

  #record(notification: ScaleNotification): void {
    const session = this.#active;
    if (session === null) return; // none arrive outside a connection (D-020)
    let frame: RawFrame;
    try {
      frame = session.sequence.frame(
        notification.tArrival - session.startMs,
        notification.source,
        notification.bytes,
      );
    } catch (error) {
      // Only a transport bug gets here, such as a NaN arrival time. Say so on the timeline.
      this.#log(session, 'error', {
        message: `A ${notification.source} notification couldn't be recorded: ${errorText(error)}`,
        context: 'recorder',
      });
      this.#emitChange();
      return;
    }
    session.writer.appendFrame(frame);
    const decoded = decodeFrame(frame.bytes);
    session.stats.add(frame, decoded);
    if (decoded.kind === 'weight') this.#checkSmoothing(session, frame, decoded);
    // Listeners get bytes of their own: the queued frame's bytes are what gets stored, and a
    // listener that changed them would change raw.
    if (this.#frames.listenerCount > 0) {
      this.#frames.emit({ frame: { ...frame, bytes: frame.bytes.slice() }, decoded });
    }
    this.#emitChange();
  }

  #checkSmoothing(session: Session, frame: RawFrame, weight: WeightFrame): void {
    const smoothing = session.smoothing;
    smoothing.byte = weight.flowSmoothing;
    if (weight.flowSmoothing !== 0 || smoothing.status === 'confirmed') return;
    // Confirmed late, after `smoothing-not-confirmed`, is logged too: the timeline then shows
    // when smoothing did go off.
    smoothing.status = 'confirmed';
    session.clearSmoothingTimer(this.#timers);
    this.#log(session, 'smoothing-confirmed', { attempts: smoothing.attempts }, frame.tMs);
  }

  #sendSmoothingOff(session: Session): void {
    const smoothing = session.smoothing;
    smoothing.attempts++;
    const reason = smoothing.attempts === 1 ? SMOOTHING_REASONS.first : SMOOTHING_REASONS.retry;
    // The wait starts once the write has settled: a Web Bluetooth write waits for the
    // subscriptions first, and frames can't show the change before the scale has the command.
    const wait = (): void => {
      if (!session.open || smoothing.status !== 'checking') return;
      session.smoothingTimer = this.#timers.setTimeout(
        () => this.#onSmoothingTimeout(session),
        SMOOTHING_TIMEOUT_MS,
      );
    };
    void this.#send(session, flowSmoothingOff(), reason).then(wait, wait);
  }

  #onSmoothingTimeout(session: Session): void {
    session.smoothingTimer = null;
    const smoothing = session.smoothing;
    if (!session.open || smoothing.status !== 'checking') return;
    if (smoothing.attempts < SMOOTHING_ATTEMPTS) {
      this.#sendSmoothingOff(session);
    } else {
      smoothing.status = 'not-confirmed';
      this.#log(session, 'smoothing-not-confirmed', {
        attempts: smoothing.attempts,
        smoothingByte: smoothing.byte,
      });
    }
    this.#emitChange();
  }

  async #send(session: Session | null, command: ScaleCommand, reason: string | null) {
    try {
      await this.#transport.send(command);
    } catch (error) {
      if (session?.open) {
        this.#log(session, 'command-failed', {
          ...commandEventData(command, reason),
          error: errorText(error),
        });
        this.#emitChange();
      }
      throw error;
    }
    if (session?.open) {
      this.#log(session, 'command-sent', commandEventData(command, reason));
      this.#emitChange();
    }
  }

  #logFromApp<
    K extends 'ui-action' | 'annotation' | 'sound-started' | 'sound-input' | 'sound-stopped',
  >(type: K, data: AppEventDataMap[K]): AppEventOf<K> | null {
    const session = this.#active;
    if (session === null) return null;
    const event = this.#log(session, type, data);
    this.#emitChange();
    return event;
  }

  /** Appends an event to the recording's timeline: at `tMs`, or now. */
  #log<K extends AppEventType>(
    session: Session,
    type: K,
    data: AppEventDataMap[K],
    tMs = this.#tMs(session),
  ): AppEventOf<K> {
    const event = session.sequence.event(tMs, type, data);
    // An `AppEventOf<K>` is an `AppEvent` for every K, which TypeScript can't see for a generic K.
    const appEvent = event as AppEvent;
    session.writer.appendEvent(appEvent);
    this.#events.emit(appEvent);
    return event;
  }

  #onStorageError(session: Session, error: Error): void {
    // Once per run of failures: a write that has stored records since starts a new run. Each
    // retry fails about once a second, and an event per retry would bury the timeline.
    if (session.open && session.errorLoggedAt !== session.writer.writtenCount) {
      session.errorLoggedAt = session.writer.writtenCount;
      this.#log(session, 'error', { message: error.message, context: 'storage' });
    }
    this.#emitChange();
  }

  #flushQuietly(): void {
    // A failure is reported through the writer's onError.
    for (const session of this.#sessions) session.writer.flush().catch(() => {});
  }

  #tick(session: Session): void {
    session.tickTimer = this.#timers.setTimeout(() => {
      session.tickTimer = null;
      if (!session.open) return;
      this.#tick(session);
      this.#emitChange();
    }, STATE_TICK_MS);
  }

  #stats(session: Session): RecorderStats {
    const { stats } = session;
    const lastWeight = stats.lastWeight;
    return {
      frames: stats.frames,
      framesPerSecond: stats.framesPerSecond(this.#tMs(session)),
      failedFrames: stats.failedFrames,
      recentFailures: stats.failures.failures,
      failureAlarm: stats.failures.alarm,
      lastWeight,
      unitOk: lastWeight === null ? null : lastWeight.frame.unitOk,
      smoothing: { ...session.smoothing },
      soundFrames: session.soundFrames,
    };
  }

  #tMs(session: Session): number {
    return this.#transport.now() - session.startMs;
  }

  #sleep(ms: number): Promise<void> {
    return new Promise((resolve) => this.#timers.setTimeout(() => resolve(), ms));
  }

  #emitChange(): void {
    if (this.#changes.listenerCount > 0) this.#changes.emit(this.state);
  }
}

/** One recording, from `connected` until it is stored and ended. */
class Session {
  readonly recording: Recording;
  /** The transport's clock at `connected`: tMs 0. */
  readonly startMs: number;
  readonly sequence: RecordingSequence;
  readonly writer: RecordingWriter;
  readonly releaseLock: () => void;
  readonly stats = new FrameStats();
  readonly smoothing: { status: SmoothingStatus; attempts: number; byte: number | null } = {
    status: 'checking',
    attempts: 0,
    byte: null,
  };
  /** False once `disconnected` is logged: nothing more goes on the timeline. */
  open = true;
  smoothingTimer: unknown = null;
  tickTimer: unknown = null;
  /** `writer.writtenCount` when a storage error was last logged; -1 before. */
  errorLoggedAt = -1;
  /** Why ending the recording failed, while it keeps failing. */
  endError: string | null = null;
  /** The `mic` frames recorded so far. */
  soundFrames = 0;
  /** Settles once the recording is stored and ended. Resolved while it is in progress. */
  finished: Promise<void> = Promise.resolve();

  /** `makeWriter` gets the session, for its writer's error listener. */
  constructor(
    recording: Recording,
    startMs: number,
    releaseLock: () => void,
    makeWriter: (session: Session) => RecordingWriter,
  ) {
    this.recording = recording;
    this.startMs = startMs;
    this.releaseLock = releaseLock;
    this.sequence = new RecordingSequence(recording.id);
    this.writer = makeWriter(this);
  }

  clearSmoothingTimer(timers: Timers): void {
    if (this.smoothingTimer !== null) timers.clearTimeout(this.smoothingTimer);
    this.smoothingTimer = null;
  }

  clearTimers(timers: Timers): void {
    this.clearSmoothingTimer(timers);
    if (this.tickTimer !== null) timers.clearTimeout(this.tickTimer);
    this.tickTimer = null;
  }
}

/** Frame counts, frames/s, the failure counter and the latest weight frame. */
class FrameStats {
  frames = 0;
  failedFrames = 0;
  readonly failures = new RollingFailureCounter();
  lastWeight: { readonly tMs: number; readonly frame: WeightFrame } | null = null;
  /** Arrival times of the latest frames, oldest first: those within the rate window. */
  #arrivals: number[] = [];

  add(frame: RawFrame, decoded: DecodedFrame): void {
    this.frames++;
    this.#arrivals.push(frame.tMs);
    this.#prune(frame.tMs);
    // The alarm watches the weight characteristic, where every frame should decode.
    if (frame.source === 'ff11') {
      const failed = decoded.kind === 'invalid';
      this.failures.record(failed);
      if (failed) this.failedFrames++;
    }
    if (decoded.kind === 'weight') this.lastWeight = { tMs: frame.tMs, frame: decoded };
  }

  /** Frames per second over the window ending at `nowTMs`, or since tMs 0 early on. */
  framesPerSecond(nowTMs: number): number {
    this.#prune(nowTMs);
    const spanMs = Math.min(RATE_WINDOW_MS, nowTMs);
    return spanMs > 0 ? (this.#arrivals.length * 1000) / spanMs : 0;
  }

  #prune(nowTMs: number): void {
    const from = nowTMs - RATE_WINDOW_MS;
    let stale = 0;
    while (stale < this.#arrivals.length && this.#arrivals[stale] <= from) stale++;
    if (stale > 0) this.#arrivals.splice(0, stale);
  }
}

type GlobalTimerId = ReturnType<typeof globalThis.setTimeout>;

const GLOBAL_TIMERS: Timers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as GlobalTimerId),
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
