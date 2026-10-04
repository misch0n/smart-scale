/**
 * Automatic export (T1.20, D-026, D-027, D-030): every closed recording, with its shots, goes to
 * a private GitHub repo with no taps, once the user has set one up on the device. Without
 * settings it does nothing at all: no network, no nagging.
 *
 * A pass scans storage and the ledger for closed recordings whose file the destination lacks,
 * or whose shots changed since the upload, then uploads them one at a time, oldest first:
 *
 * - **What and where.** The file is `exportRecording`'s, in the unchanged export format, at
 *   `<prefix>YYYY/MM/<file name>` (`recordingArchivePath`). The ledger keeps the path, so a
 *   recording's file stays where it was first put.
 * - **Compare before replacing.** A new file is created without a version, which GitHub
 *   refuses when the path holds a file already (a new device, wiped storage). That file, a held
 *   one, or one another device changed since (a conflict) is read and compared first
 *   (`compareWithRemote`): equal files aren't written, and a file holding records this device
 *   lacks is kept ("held"). Nothing is ever deleted.
 * - **Failures.** Network errors, 5xx, rate limits and anything unforeseen wait and retry, with
 *   backoff, on `online`, when the page is shown again, or at the next app start. A refused
 *   token, a missing repo or a public one stops until the settings are saved again or Retry is
 *   pressed. A file the destination refuses (too large) is held, and the others go on.
 * - **Triggers.** Startup (which covers recordings recovery ended and older ones), a recording
 *   ending or being imported (`recordingsChanged`), and shots changing (`shotsChanged`,
 *   debounced). Only closed recordings are uploaded (D-026), and not the simulator's.
 *
 * The token stays in the device-local store and inside the sink. Status messages pass through
 * `redact`, so no message shows it.
 */

import { recordingArchivePath } from '../../core/export';
import type { AppInfo, Id, Recording, Shot } from '../../core/model';
import type {
  LocalRepository,
  RawRepository,
  RecordingRepository,
  ShotRepository,
  Timers,
} from '../../storage';
import { Emitter, type Unsubscribe } from '../../transport/emitter';
import { exportRecording, type ExportFile } from '../export';
import { browserPageVisibility, type PageVisibility } from '../page-lifecycle';
import { compareWithRemote } from './compare';
import { GitHubSink } from './github';
import {
  readLedger,
  readLedgerEntry,
  shotsDigest,
  writeLedgerEntry,
  type LedgerEntry,
} from './ledger';
import {
  destinationKey,
  isConfigured,
  loadSettings,
  settingsFromDraft,
  settingsView,
  storeSettings,
  SettingsError,
  type AutoExportSettings,
  type AutoExportSettingsView,
  type ConfiguredSettings,
  type SettingsDraft,
} from './settings';
import { BackupError, redact, STOPPING_KINDS, type BackupSink, type SinkCheck } from './sink';

/**
 * The least time between two writes, ms. GitHub asks for a second between mutating requests;
 * its secondary limits allow 80 a minute and 500 an hour, beyond which it says how long to wait.
 */
export const WRITE_INTERVAL_MS = 1000;

/** How long shots must stay unchanged before their recording is uploaded again, ms. */
export const SHOTS_DEBOUNCE_MS = 10_000;

/** Waits before each retry after a failure that may pass, ms; the last one repeats. */
export const RETRY_DELAYS_MS: readonly number[] = [60_000, 120_000, 300_000, 900_000, 1_800_000];

/** How many times one file is compared and written again after conflicts, before waiting. */
export const MAX_CONFLICT_ROUNDS = 3;

export type AutoExportState =
  /** Not set up: no owner, repo or token. Nothing is uploaded. */
  | 'off'
  /** Set up, and nothing is waiting, as far as the last pass knows. */
  | 'idle'
  /** Checking the repo, or uploading. */
  | 'working'
  /** A failure that may pass: retried at `retryAtEpochMs`, when online, or at the next start. */
  | 'waiting'
  /** A failure only the user can fix (`lastError`): stopped until saved again or retried. */
  | 'stopped';

/** A recording whose file at the destination was left alone. */
export interface HeldRecording {
  readonly id: Id;
  readonly path: string;
  readonly reason: string;
}

export interface AutoExportStatus {
  readonly state: AutoExportState;
  /** Closed recordings still to upload, as of the last scan; null before the first one. */
  readonly pending: number | null;
  /** Recordings whose destination file differs and was kept. */
  readonly held: readonly HeldRecording[];
  /** When a file was last uploaded or confirmed at this destination, from this device. */
  readonly lastExportEpochMs: number | null;
  /** The last failure, until a pass succeeds. Never holds the token. */
  readonly lastError: string | null;
  /** When the next retry is due, while `waiting`. */
  readonly retryAtEpochMs: number | null;
}

/** What automatic export needs from storage (`AppStorage` has it). */
export interface AutoExportStorage {
  readonly recordings: Pick<RecordingRepository, 'list'>;
  readonly raw: Pick<RawRepository, 'read'>;
  readonly shots: Pick<ShotRepository, 'list' | 'listForRecording'>;
  readonly local: LocalRepository;
}

export interface AutoExportOptions {
  readonly storage: AutoExportStorage;
  /** The build writing the files: `BUILD_INFO` (src/platform). */
  readonly app: AppInfo;
  /** Makes the destination for the settings. Default: a `GitHubSink` on the global `fetch`. */
  readonly makeSink?: (settings: ConfiguredSettings) => BackupSink;
  /** Default: the global timers. */
  readonly timers?: Timers;
  /** The wall clock. Default `Date.now`. */
  readonly epochNow?: () => number;
  /** For the file's name and folder: as `Date.prototype.getTimezoneOffset`. Default the runtime's. */
  readonly timeZoneOffset?: (epochMs: number) => number;
  /** Calls `listener` when the browser is back online. Default: the window's `online` event. */
  readonly onOnline?: (listener: () => void) => Unsubscribe;
  /** Default `browserPageVisibility`. */
  readonly visibility?: PageVisibility;
  /** Default `WRITE_INTERVAL_MS`. */
  readonly writeIntervalMs?: number;
  /** Default `SHOTS_DEBOUNCE_MS`. */
  readonly shotsDebounceMs?: number;
}

const GLOBAL_TIMERS: Timers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof globalThis.setTimeout>),
};

const browserOnline = (listener: () => void): Unsubscribe => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('online', listener);
  return () => window.removeEventListener('online', listener);
};

const INITIAL_STATUS: AutoExportStatus = {
  state: 'off',
  pending: null,
  held: [],
  lastExportEpochMs: null,
  lastError: null,
  retryAtEpochMs: null,
};

/** What a pass found to do. */
interface Scan {
  readonly pending: readonly Recording[];
  readonly held: readonly HeldRecording[];
  readonly lastExportEpochMs: number | null;
}

export class AutoExport {
  readonly #storage: AutoExportStorage;
  readonly #app: AppInfo;
  readonly #makeSink: (settings: ConfiguredSettings) => BackupSink;
  readonly #timers: Timers;
  readonly #epochNow: () => number;
  readonly #timeZoneOffset: (epochMs: number) => number;
  readonly #onOnline: (listener: () => void) => Unsubscribe;
  readonly #visibility: PageVisibility;
  readonly #writeIntervalMs: number;
  readonly #shotsDebounceMs: number;
  readonly #changed = new Emitter<void>();

  #settings: AutoExportSettings | null = null;
  #status: AutoExportStatus = INITIAL_STATUS;
  /** Bumped whenever the settings change: a pass for older settings stops. */
  #generation = 0;
  #stopped = false;
  #attempt = 0;
  #retryTimer: unknown = null;
  /** After a rate limit: no request before this time. */
  #notBeforeEpochMs = 0;
  #debounceTimer: unknown = null;
  #lastWriteEpochMs = Number.NEGATIVE_INFINITY;
  #running: Promise<void> | null = null;
  #again = false;
  #started = false;
  #disposed = false;
  readonly #unsubscribes: Unsubscribe[] = [];

  constructor(options: AutoExportOptions) {
    this.#storage = options.storage;
    this.#app = options.app;
    this.#timers = options.timers ?? GLOBAL_TIMERS;
    this.#epochNow = options.epochNow ?? Date.now;
    this.#makeSink =
      options.makeSink ??
      ((settings) =>
        new GitHubSink({
          owner: settings.owner,
          repo: settings.repo,
          branch: settings.branch,
          token: settings.token,
          timers: this.#timers,
          epochNow: this.#epochNow,
        }));
    this.#timeZoneOffset =
      options.timeZoneOffset ?? ((epochMs) => new Date(epochMs).getTimezoneOffset());
    this.#onOnline = options.onOnline ?? browserOnline;
    this.#visibility = options.visibility ?? browserPageVisibility;
    this.#writeIntervalMs = options.writeIntervalMs ?? WRITE_INTERVAL_MS;
    this.#shotsDebounceMs = options.shotsDebounceMs ?? SHOTS_DEBOUNCE_MS;
  }

  /**
   * Loads the settings and starts the first pass, which uploads whatever closed recording is
   * waiting. Call it once storage is open and startup recovery has run. Never rejects: a
   * failure shows in the status.
   */
  async start(): Promise<void> {
    if (this.#started || this.#disposed) return;
    this.#started = true;
    this.#unsubscribes.push(
      this.#onOnline(() => this.#wake()),
      this.#visibility.onChange((state) => {
        if (state === 'visible') this.#wake();
      }),
    );
    try {
      this.#settings = await loadSettings(this.#storage.local);
    } catch (error) {
      this.#update({ state: 'stopped', lastError: errorText(error) });
      this.#stopped = true;
      return;
    }
    this.#update({ state: isConfigured(this.#settings) ? 'idle' : 'off' });
    this.#kick();
  }

  get status(): AutoExportStatus {
    return this.#status;
  }

  /** The settings without the token, or null if none are saved. */
  get settings(): AutoExportSettingsView | null {
    return this.#settings === null ? null : settingsView(this.#settings);
  }

  /** Calls `listener` after every change of `status` or `settings`. */
  onChange(listener: () => void): Unsubscribe {
    return this.#changed.on(listener);
  }

  /**
   * Checks and saves the settings, then starts again: the repo is checked, and whatever is
   * waiting is uploaded. A stop is lifted.
   *
   * @throws SettingsError for a field to fix; StorageError if storing fails.
   */
  async save(draft: SettingsDraft): Promise<void> {
    const settings = settingsFromDraft(draft, this.#settings?.token ?? null);
    await storeSettings(this.#storage.local, settings);
    this.#settings = settings;
    this.#generation++;
    this.#stopped = false;
    this.#attempt = 0;
    this.#notBeforeEpochMs = 0;
    this.#clearRetry();
    this.#update({
      state: isConfigured(settings) ? 'idle' : 'off',
      pending: null,
      held: [],
      lastExportEpochMs: null,
      lastError: null,
      retryAtEpochMs: null,
    });
    this.#kick();
  }

  /**
   * Checks the draft's settings, or the saved ones, against the destination, without saving or
   * uploading anything. A draft without a token uses the saved one.
   *
   * @throws SettingsError for a field to fix; BackupError for what the check found.
   */
  async test(draft?: SettingsDraft): Promise<SinkCheck> {
    const settings =
      draft === undefined
        ? this.#settings
        : settingsFromDraft(draft, this.#settings?.token ?? null);
    if (!isConfigured(settings)) {
      throw new SettingsError('token', 'Enter the owner, the repo and a token first.');
    }
    try {
      return await this.#makeSink(settings).check();
    } catch (error) {
      if (error instanceof BackupError) throw error;
      throw new Error(redact(errorText(error), settings.token), { cause: error });
    }
  }

  /** Stored recordings changed: one ended, or an import added some. Scans now. */
  recordingsChanged(): void {
    this.#kick();
  }

  /**
   * A recording's shots changed (a grade added after the shot, say). Scans once they have been
   * left alone for `SHOTS_DEBOUNCE_MS`, so a run of edits makes one upload.
   */
  shotsChanged(): void {
    if (this.#disposed) return;
    if (this.#debounceTimer !== null) this.#timers.clearTimeout(this.#debounceTimer);
    this.#debounceTimer = this.#timers.setTimeout(() => {
      this.#debounceTimer = null;
      this.#kick();
    }, this.#shotsDebounceMs);
  }

  /**
   * Tries again now, after a stop or while waiting. A rate limit's wait still applies: its
   * retry stays scheduled.
   */
  retry(): void {
    this.#stopped = false;
    this.#attempt = 0;
    if (this.#epochNow() >= this.#notBeforeEpochMs) this.#clearRetry();
    this.#kick();
  }

  /** Resolves once no pass is running. */
  async whenIdle(): Promise<void> {
    while (this.#running !== null) await this.#running;
  }

  /** Stops timers and listeners. A pass in progress stops at its next step. */
  dispose(): void {
    this.#disposed = true;
    this.#clearRetry();
    if (this.#debounceTimer !== null) this.#timers.clearTimeout(this.#debounceTimer);
    this.#debounceTimer = null;
    for (const unsubscribe of this.#unsubscribes.splice(0)) unsubscribe();
  }

  /** Back online, or the page is shown again: a waiting retry runs now. */
  #wake(): void {
    if (this.#status.state === 'waiting') this.#kick();
  }

  /** Runs a pass now, or right after the one running. */
  #kick(): void {
    if (!this.#started || this.#disposed) return;
    if (this.#running !== null) {
      this.#again = true;
      return;
    }
    const running = (async () => {
      do {
        this.#again = false;
        await this.#pass();
      } while (this.#again && !this.#disposed);
    })();
    this.#running = running.finally(() => {
      this.#running = null;
    });
  }

  async #pass(): Promise<void> {
    const settings = this.#settings;
    if (!isConfigured(settings)) {
      // Stopped without settings: the stored ones couldn't be read, which the status says.
      if (!this.#stopped) {
        this.#update({ state: 'off', pending: null, held: [], retryAtEpochMs: null });
      }
      return;
    }
    const generation = this.#generation;
    const destination = destinationKey(settings);
    try {
      const scan = await this.#scan(destination);
      if (generation !== this.#generation) return; // newer settings: their pass takes over
      this.#update({
        pending: scan.pending.length,
        held: scan.held,
        lastExportEpochMs: scan.lastExportEpochMs,
      });
      if (this.#stopped || this.#epochNow() < this.#notBeforeEpochMs) return;
      this.#clearRetry();
      if (scan.pending.length === 0) {
        this.#succeeded();
        return;
      }
      this.#update({ state: 'working', retryAtEpochMs: null });
      const sink = this.#makeSink(settings);
      // Every pass with work checks first: a repo made public since must stop the uploads.
      await sink.check();
      const held = new Map(scan.held.map((recording) => [recording.id, recording]));
      let pending = scan.pending.length;
      for (const recording of scan.pending) {
        if (generation !== this.#generation || this.#disposed) return;
        const entry = await this.#exportOne(sink, settings, destination, recording);
        pending--;
        if (entry.state === 'held') {
          held.set(recording.id, {
            id: recording.id,
            path: entry.path,
            reason: entry.reason ?? '',
          });
        } else {
          held.delete(recording.id);
        }
        this.#update({
          pending,
          held: [...held.values()],
          lastExportEpochMs:
            entry.state === 'synced'
              ? Math.max(entry.atEpochMs, this.#status.lastExportEpochMs ?? 0)
              : this.#status.lastExportEpochMs,
        });
      }
      this.#succeeded();
    } catch (error) {
      if (generation === this.#generation && !this.#disposed) this.#failed(error, settings);
    }
  }

  /** The closed recordings to upload, the held ones, and the last export time. */
  async #scan(destination: string): Promise<Scan> {
    const [recordings, shots, ledger] = await Promise.all([
      this.#storage.recordings.list(),
      this.#storage.shots.list(),
      readLedger(this.#storage.local),
    ]);
    const shotsByRecording = new Map<Id, Shot[]>();
    for (const shot of shots) {
      const list = shotsByRecording.get(shot.recordingId);
      if (list) list.push(shot);
      else shotsByRecording.set(shot.recordingId, [shot]);
    }
    let lastExportEpochMs: number | null = null;
    for (const entry of ledger.values()) {
      if (entry.destination === destination && entry.state === 'synced') {
        lastExportEpochMs = Math.max(lastExportEpochMs ?? entry.atEpochMs, entry.atEpochMs);
      }
    }
    const pending: Recording[] = [];
    const held: HeldRecording[] = [];
    for (const recording of recordings) {
      // Open recordings wait until they end (D-026); the simulator's aren't shot history.
      if (recording.endedAtEpochMs === null || recording.transport === 'mock') continue;
      const entry = ledger.get(recording.id);
      if (entry === undefined || entry.destination !== destination) {
        pending.push(recording);
      } else if (
        (await shotsDigest(shotsByRecording.get(recording.id) ?? [])) !== entry.shotsDigest
      ) {
        pending.push(recording); // its shots changed since
      } else if (entry.state === 'held') {
        held.push({ id: recording.id, path: entry.path, reason: entry.reason ?? '' });
      }
    }
    return { pending, held, lastExportEpochMs };
  }

  /**
   * Uploads one recording's file and returns its new ledger entry. A file the ledger doesn't
   * know is created without a version, which the destination refuses (a conflict) if the path
   * holds a file already: only then is that file read and compared. A held file is compared
   * first, and so is any file after a conflict. So no file is replaced without comparing, or
   * without the version the ledger saw.
   */
  async #exportOne(
    sink: BackupSink,
    settings: ConfiguredSettings,
    destination: string,
    recording: Recording,
  ): Promise<LedgerEntry> {
    const file = await exportRecording(this.#storage, recording.id, {
      app: this.#app,
      epochNow: this.#epochNow,
      timeZoneOffset: this.#timeZoneOffset,
    });
    const digest = await shotsDigest(file.bundle.shots);
    const stored = await readLedgerEntry(this.#storage.local, recording.id);
    const known = stored !== null && stored.destination === destination ? stored : null;
    const path =
      known?.path ??
      settings.pathPrefix +
        recordingArchivePath(recording, this.#timeZoneOffset(recording.startedAtEpochMs));
    const entry = (state: LedgerEntry['state'], version: string | null, reason: string | null) =>
      this.#record(recording.id, {
        state,
        destination,
        path,
        shotsDigest: digest,
        version,
        atEpochMs: this.#epochNow(),
        reason,
      });

    // Only a synced entry vouches for the destination's copy and knows its version.
    let replacing = known?.state === 'synced' ? known.version : null;
    let compare = known?.state === 'held';
    for (let round = 1; ; round++) {
      try {
        if (compare) {
          const remote = await sink.read(path);
          replacing = remote?.version ?? null;
          if (remote !== null) {
            const verdict = compareWithRemote(file.bundle, remote.text);
            if (verdict.kind === 'same') return await entry('synced', remote.version, null);
            if (verdict.kind === 'keep') {
              return await entry(
                'held',
                remote.version,
                `Kept the repo's file: ${verdict.reason}.`,
              );
            }
          }
        }
        const version = await this.#write(sink, path, file, replacing);
        return await entry('synced', version, null);
      } catch (error) {
        if (!(error instanceof BackupError)) throw error;
        if (error.kind === 'rejected') return await entry('held', null, error.message);
        if (error.kind !== 'conflict' || round >= MAX_CONFLICT_ROUNDS) throw error;
        compare = true; // another device or tab wrote it: compare again
      }
    }
  }

  /** Writes a file, at most one write per `writeIntervalMs`. */
  async #write(
    sink: BackupSink,
    path: string,
    file: ExportFile,
    replacing: string | null,
  ): Promise<string> {
    const wait = this.#lastWriteEpochMs + this.#writeIntervalMs - this.#epochNow();
    if (wait > 0) await new Promise<void>((resolve) => this.#timers.setTimeout(resolve, wait));
    const name = path.slice(path.lastIndexOf('/') + 1);
    try {
      return await sink.write(
        path,
        file.text,
        replacing,
        `${replacing ? 'Update' : 'Add'} ${name}`,
      );
    } finally {
      this.#lastWriteEpochMs = this.#epochNow();
    }
  }

  async #record(recordingId: Id, entry: LedgerEntry): Promise<LedgerEntry> {
    await writeLedgerEntry(this.#storage.local, recordingId, entry);
    return entry;
  }

  #succeeded(): void {
    this.#attempt = 0;
    this.#update({ state: 'idle', lastError: null, retryAtEpochMs: null });
  }

  #failed(error: unknown, settings: ConfiguredSettings): void {
    const message = redact(errorText(error), settings.token);
    if (error instanceof BackupError && STOPPING_KINDS.has(error.kind)) {
      this.#stopped = true;
      this.#update({ state: 'stopped', lastError: message, retryAtEpochMs: null });
      return;
    }
    // Anything else may pass: the network, GitHub, a rate limit, storage, or a bug.
    const backoff = RETRY_DELAYS_MS[Math.min(this.#attempt, RETRY_DELAYS_MS.length - 1)];
    this.#attempt++;
    const asked = error instanceof BackupError ? (error.retryAfterMs ?? 0) : 0;
    const delay = Math.max(backoff, asked);
    const retryAt = this.#epochNow() + delay;
    if (error instanceof BackupError && error.kind === 'rate-limited') {
      this.#notBeforeEpochMs = retryAt;
    }
    this.#clearRetry();
    this.#retryTimer = this.#timers.setTimeout(() => {
      this.#retryTimer = null;
      this.#kick();
    }, delay);
    this.#update({ state: 'waiting', lastError: message, retryAtEpochMs: retryAt });
  }

  #clearRetry(): void {
    if (this.#retryTimer !== null) this.#timers.clearTimeout(this.#retryTimer);
    this.#retryTimer = null;
  }

  #update(changes: Partial<AutoExportStatus>): void {
    this.#status = { ...this.#status, ...changes };
    this.#changed.emit();
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
