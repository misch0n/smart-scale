/**
 * Automatic export to a private GitHub repo (T1.20, D-027, D-030): `AutoExport` is the queue,
 * `BackupSink` the destination's narrow interface, and `GitHubSink` today's destination.
 */

export {
  AutoExport,
  MAX_CONFLICT_ROUNDS,
  RETRY_DELAYS_MS,
  SHOTS_DEBOUNCE_MS,
  WRITE_INTERVAL_MS,
  type AutoExportOptions,
  type AutoExportState,
  type AutoExportStatus,
  type AutoExportStorage,
  type HeldRecording,
} from './auto-export';
export { compareWithRemote, type RemoteVerdict } from './compare';
export { GitHubSink, REQUEST_TIMEOUT_MS, type FetchLike, type GitHubSinkOptions } from './github';
export { LEDGER_PREFIX, type LedgerEntry } from './ledger';
export {
  DEFAULT_PATH_PREFIX,
  SETTINGS_KEY,
  SettingsError,
  type AutoExportSettings,
  type AutoExportSettingsView,
  type SettingsDraft,
} from './settings';
export {
  BackupError,
  type BackupErrorKind,
  type BackupSink,
  type RemoteFile,
  type SinkCheck,
} from './sink';
