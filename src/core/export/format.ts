/**
 * The export format, version 3. docs/export-format.md is the normative description, and D-025
 * explains the choices. The export is the durable artifact, and IndexedDB is a cache of it
 * (spec "Storage and export"), so the format is versioned and old files keep importing
 * (CLAUDE.md hard rule 7).
 *
 * In model terms an export holds:
 * - raw: recordings, each with its frames and events, verbatim;
 * - metadata: shots (discarded ones too) and, in a full export, the settings.
 *
 * Derived data isn't exported: it is recomputable from raw (spec "Layers").
 */

import type { AppEvent, AppInfo, JsonValue, RawFrame, Recording, Shot } from '../model';

/** The `format` field of every export, which tells an export from any other JSON file. */
export const EXPORT_FORMAT = 'smart-scale-export';

/**
 * Upgrades a parsed export document by one format version, before it is validated. It gets the
 * document as parsed from JSON, untrusted, and returns it in the next version's shape.
 * `parseExport` keeps track of the version number itself.
 */
export type ExportMigration = (
  document: Readonly<Record<string, unknown>>,
) => Readonly<Record<string, unknown>>;

/**
 * Every change to the format, in order: `EXPORT_MIGRATIONS[n - 1]` turns a version n document
 * into version n + 1, and the current version is one more than the number of migrations. Never
 * edit or remove one, because old files must keep importing. Add one per format change.
 */
export const EXPORT_MIGRATIONS: readonly ExportMigration[] = [
  // 1 → 2 (T1.24, D-050): frames may come from the microphone (`mic`, its sound levels), and
  // the events `sound-started`, `sound-input` and `sound-stopped` exist. A version 1 file holds
  // none of them, so it is already a valid version 2 file.
  (document) => document,
  // 2 → 3 (T1.18, D-068): shots carry a snapshot of their context and the phases' results. The
  // new fields are nullable, so an older shot reads them as null; its `beanBagId` is renamed
  // `packId`, the coffee pack's id (D-053).
  (document) => {
    const shots: unknown = document.shots;
    if (!Array.isArray(shots)) return document;
    const items: readonly unknown[] = shots;
    return { ...document, shots: items.map(renameBeanBagId) };
  },
];

/** A version 2 shot's `beanBagId` as `packId`; anything else as it is, for validation to judge. */
function renameBeanBagId(shot: unknown): unknown {
  if (typeof shot !== 'object' || shot === null || Array.isArray(shot)) return shot;
  if (!Object.hasOwn(shot, 'beanBagId')) return shot;
  const { beanBagId, ...rest } = shot as Readonly<Record<string, unknown>>;
  return Object.hasOwn(rest, 'packId') ? rest : { ...rest, packId: beanBagId };
}

/** The version this build writes, and the newest it reads. */
export const FORMAT_VERSION = EXPORT_MIGRATIONS.length + 1;

/**
 * One recording and its raw records: the shape `storage.raw.read()` returns, and the
 * simulator's `RawSession`.
 */
export interface ExportedRecording {
  readonly recording: Recording;
  /** In seq order. Each belongs to `recording`. */
  readonly frames: readonly RawFrame[];
  /** In seq order. Each belongs to `recording`. */
  readonly events: readonly AppEvent[];
}

/** Settings: the `kv` store's entries, JSON values by key. */
export type ExportSettings = Readonly<Record<string, JsonValue>>;

/** What an export holds. `serialiseExport` writes one, and `parseExport` reads one. */
export interface ExportBundle {
  /** When the file was written, epoch ms. */
  readonly exportedAtEpochMs: number;
  /** The build that wrote the file. Each recording names the build that captured it. */
  readonly app: AppInfo;
  /** Raw: recordings with their frames and events, oldest first. Ids are unique. */
  readonly recordings: readonly ExportedRecording[];
  /**
   * Metadata: shots, discarded ones too. Each names its recording, which may be in the file or
   * only in storage. Ids are unique.
   */
  readonly shots: readonly Shot[];
  /** The settings, or null when the file doesn't carry them (a one-recording export). */
  readonly settings: ExportSettings | null;
}

export type ExportFormatErrorCode =
  /** The file isn't JSON. */
  | 'not-json'
  /** JSON, but not a smart-scale export: it has no `"format": "smart-scale-export"`. */
  | 'not-an-export'
  /** An export in a newer format version than this build reads. Reloading gets a newer build. */
  | 'newer-version'
  /** An export, but malformed. The message names the place, like `recordings[0].frames[12][3]`. */
  | 'invalid';

/** Why a file couldn't be read as an export. */
export class ExportFormatError extends Error {
  readonly code: ExportFormatErrorCode;

  constructor(code: ExportFormatErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ExportFormatError';
    this.code = code;
  }
}
