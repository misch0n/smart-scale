/**
 * App startup (T1.8): before anything connects, open storage, ask the browser to keep it
 * (hardware test B6), and end the recordings a closed or crashed tab left open (D-024). Then
 * make the links to the scale and the screen wake lock, which live as long as the app, and
 * start automatic export (T1.20), which uploads the closed recordings not uploaded yet, the ones
 * recovery just ended included, if the user has set it up. The analysis runner (T1.14) is made
 * here too; nothing runs it until a screen asks. Last, the brew flow's settings are loaded, and
 * the brew flows are made, one per link on first use (T1.18).
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
import { ScaleLinks, type ScaleLinksOptions } from './links';
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
  readonly links?: Pick<ScaleLinksOptions, 'makeTransport' | 'recorder' | 'visibility'>;
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
  /** The brew flow of each link, and the settings they share (T1.18). */
  readonly brew: BrewFlows;
}

/**
 * Starts the app's services.
 *
 * @throws StorageError from `openStorage`: `unavailable` (no IndexedDB, or it refused), or
 *   `newer-version` (a newer build has upgraded the database: reload).
 */
export async function startApp(options: StartAppOptions): Promise<AppServices> {
  const storage = await openStorage(options.storage);
  const [persistence, recovery] = await Promise.all([
    requestPersistence(options.storageManager),
    recoverUncleanRecordings(storage, options.recovery).then(
      (result) => ({ result, error: null }),
      (error: unknown) => ({ result: null, error: errorText(error) }),
    ),
  ]);
  const wakeLock = options.wakeLock ?? new ScreenWakeLock();
  const links = new ScaleLinks({
    ...options.links,
    storage,
    app: options.app,
    userAgent: options.userAgent,
    wakeLock,
  });
  const autoExport = new AutoExport({ ...options.autoExport, storage, app: options.app });
  // A recording stored, or stored and ended: the closed ones go out.
  links.onRecordingsChanged(() => autoExport.recordingsChanged());
  await autoExport.start();
  // A post-hoc shot belongs in its recording's file: upload it again.
  const analysis = new AnalysisRunner({ storage, onShotsCreated: () => autoExport.shotsChanged() });
  const brew = new BrewFlows({
    shots: storage.shots,
    analysis,
    preferences: await BrewPreferences.load(storage.kv),
    onShotsChanged: () => autoExport.shotsChanged(),
    wakeLock,
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
    brew,
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
