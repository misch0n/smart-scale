/**
 * App startup (T1.8): before anything connects, open storage, ask the browser to keep it
 * (hardware test B6), and end the recordings a closed or crashed tab left open (D-024). Then
 * make the links to the scale, which remember the real scale on the device and reconnect to it
 * (T1.21), and the screen wake lock, which live as long as the app, and
 * start automatic export (T1.20), which uploads the closed recordings not uploaded yet, the ones
 * recovery just ended included, if the user has set it up. The analysis runner (T1.14) is made
 * here too; nothing runs it until a screen asks. The entities (T2.1) and the brew flow's settings
 * are loaded, and the brew flows are made, one per link on first use (T1.18), and the history
 * (T1.19), which analyses each recording that ends from now on. The switch for sound levels
 * with every brew is read (T2.18).
 */

import type { AppInfo } from '../core/model';
import { ScreenWakeLock } from '../platform/wake-lock';
import {
  openStorage,
  requestPersistence,
  type AppStorage,
  type PersistenceStatus,
  type StorageManagerLike,
  type StorageOptions,
} from '../storage';
import { AnalysisRunner } from './analysis-runner';
import { AutoExport, type AutoExportOptions } from './auto-export';
import { BrewFlows } from './brew-flow';
import { BrewPreferences } from './brew-settings';
import { BrewSound } from './brew-sound';
import { Entities } from './entities';
import { History } from './history';
import { ScaleLinks, type ScaleLinksOptions } from './links';
import { NudgeDismissal } from './nudge';
import { recoverUncleanRecordings, type RecoveryOptions, type RecoveryResult } from './recovery';

export interface StartAppOptions {
  /** The build: `BUILD_INFO` (src/platform). */
  readonly app: AppInfo;
  /** `navigator.userAgent`. */
  readonly userAgent: string | null;
  /** For `openStorage`, including `onBlocked`. */
  readonly storage?: StorageOptions;
  /** Default `navigator.storage`. */
  readonly storageManager?: StorageManagerLike;
  readonly recovery?: RecoveryOptions;
  /** Default: a `ScreenWakeLock` on the browser's API. */
  readonly wakeLock?: ScreenWakeLock;
  /** Passed on to `ScaleLinks`, for tests. */
  readonly links?: Pick<
    ScaleLinksOptions,
    'makeTransport' | 'recorder' | 'connector' | 'visibility'
  >;
  /** Passed on to `AutoExport`, for tests. */
  readonly autoExport?: Omit<AutoExportOptions, 'storage' | 'app'>;
}

/** What the app runs on, made once at startup. */
export interface AppServices {
  readonly storage: AppStorage;
  /** The answer to the persistence request, for the probe to show (B6). */
  readonly persistence: PersistenceStatus;
  /** What startup recovery did; null if it couldn't run (`recoveryError`). */
  readonly recovery: RecoveryResult | null;
  /** Why recovery couldn't list the open recordings; null if it ran. */
  readonly recoveryError: string | null;
  readonly links: ScaleLinks;
  readonly wakeLock: ScreenWakeLock;
  /** Uploads closed recordings to a private GitHub repo, once set up on the device (T1.20). */
  readonly autoExport: AutoExport;
  /** Analyses recordings through the derived cache, and adds post-hoc shots (T1.14). */
  readonly analysis: AnalysisRunner;
  /** The machines, grinders, recipes, coffee packs, containers and tags, in memory (T2.1). */
  readonly entities: Entities;
  /** The brew flow of each link, and the settings they share (T1.18). */
  readonly brew: BrewFlows;
  /** The listed shots, their segments and their grades (T1.19). */
  readonly history: History;
  /** The taste nudge the user dismissed, on this device (T2.12). */
  readonly nudge: NudgeDismissal;
  /** Sound levels with every brew, from the brew screen's taps, unless switched off (T2.18). */
  readonly brewSound: BrewSound;
}

/**
 * Starts the app's services.
 *
 * @throws StorageError from `openStorage`: `unavailable` (no IndexedDB, or it refused), or
 *   `newer-version` (a newer build has upgraded the database: reload).
 */
export async function startApp(options: StartAppOptions): Promise<AppServices> {
  const storage = await openStorage(options.storage);
  const [persistence, recovery, entities] = await Promise.all([
    requestPersistence(options.storageManager),
    recoverUncleanRecordings(storage, options.recovery).then(
      (result) => ({ result, error: null }),
      (error: unknown) => ({ result: null, error: errorText(error) }),
    ),
    Entities.load(storage.entities),
  ]);
  const [preferences, nudge] = await Promise.all([
    BrewPreferences.load(storage.kv, entities),
    NudgeDismissal.load(storage.local),
  ]);
  const wakeLock = options.wakeLock ?? new ScreenWakeLock();
  const links = new ScaleLinks({
    containers: () => entities.listed('containers'),
    ...options.links,
    storage,
    local: storage.local,
    app: options.app,
    userAgent: options.userAgent,
    wakeLock,
  });
  const brewSound = await BrewSound.load(storage.local, links.sound);
  const autoExport = new AutoExport({ ...options.autoExport, storage, app: options.app });
  // The entities go to their own file (T2.1): upload it again once they change.
  entities.onStored(() => autoExport.entitiesChanged());
  // A post-hoc shot belongs in its recording's file: upload it again.
  const analysis = new AnalysisRunner({
    storage,
    onShotsCreated: () => autoExport.shotsChanged(),
    containers: () => entities.listed('containers'),
  });
  const history = new History({
    storage,
    analysis,
    preferences,
    onShotsChanged: () => autoExport.shotsChanged(),
  });
  // A recording stored, or stored and ended: an ended one gets its post-hoc shots first, so its
  // file carries them from its first upload; then the closed ones go out.
  links.onRecordingsChanged(() => {
    void history.recordingsChanged().then(() => autoExport.recordingsChanged());
  });
  await autoExport.start();
  const brew = new BrewFlows({
    shots: storage.shots,
    analysis,
    preferences,
    containers: () => entities.listed('containers'),
    onShotsChanged: () => {
      autoExport.shotsChanged();
      history.shotsChanged();
    },
  });
  return {
    storage,
    persistence,
    recovery: recovery.result,
    recoveryError: recovery.error,
    links,
    wakeLock,
    autoExport,
    analysis,
    entities,
    brew,
    history,
    nudge,
    brewSound,
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
