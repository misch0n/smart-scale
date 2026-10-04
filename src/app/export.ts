/**
 * Manual export and import (T1.7; D-025). Export reads one recording, or everything, from
 * storage and writes the export format (`src/core/export`, docs/export-format.md). Import merges
 * a file into storage:
 *
 * - **Raw is never replaced.** A recording that is already stored is skipped, whatever the file
 *   holds for it, so importing a file twice changes nothing the second time. A new recording is
 *   stored whole, in one transaction (`raw.addRecording`), so a failed import leaves nothing
 *   behind and can simply be run again.
 * - **An open recording** (exported while recording) is stored ended as `unclean`, at its last
 *   record, as startup recovery would end it (D-024). Nobody is recording it here.
 * - **Metadata that is already stored is kept**, unless the caller asks for the file's: shots
 *   and settings. A shot is replaced only if it is the same shot, with the same recording,
 *   anchor, source and creation time (D-019).
 *
 * Derived data isn't exported: it is recomputed from raw (spec "Layers").
 */

import {
  allExportFileName,
  recordingExportFileName,
  serialiseExport,
  type ExportBundle,
  type ExportedRecording,
} from '../core/export';
import { type AppInfo, type Id, type JsonValue, type Shot, sameShotIdentity } from '../core/model';
import {
  StorageError,
  type KeyValueRepository,
  type RawRepository,
  type RecordingRepository,
  type ShotRepository,
} from '../storage';
import { uncleanEndEpochMs } from './recovery';

/** The media type of an export file. */
export const EXPORT_MEDIA_TYPE = 'application/json';

/** What a one-recording export needs from storage (`AppStorage` has it). */
export interface RecordingExportStorage {
  readonly raw: Pick<RawRepository, 'read'>;
  readonly shots: Pick<ShotRepository, 'listForRecording'>;
}

/** What export needs from storage (`AppStorage` has it). */
export interface ExportStorage extends RecordingExportStorage {
  readonly recordings: Pick<RecordingRepository, 'list'>;
  readonly shots: Pick<ShotRepository, 'listForRecording' | 'list'>;
  readonly kv: Pick<KeyValueRepository, 'entries'>;
}

export interface ExportOptions {
  /** The build writing the file: `BUILD_INFO` (src/platform). */
  readonly app: AppInfo;
  /** The wall clock. Default `Date.now`. */
  readonly epochNow?: () => number;
  /**
   * The local time zone's offset at a time, for the file name, as
   * `Date.prototype.getTimezoneOffset` gives it. Default the runtime's.
   */
  readonly timeZoneOffset?: (epochMs: number) => number;
}

/** What an export file holds, for the UI. */
export interface ExportSummary {
  readonly recordings: number;
  readonly frames: number;
  readonly events: number;
  readonly shots: number;
  /** How many settings, or null when the file carries none (a one-recording export). */
  readonly settings: number | null;
}

/** An export, ready to save or share. */
export interface ExportFile {
  /** `smart-scale_YYYY-MM-DD_HHMMSS_<id8>.json`, or `…_all.json`, in local time. */
  readonly fileName: string;
  /** The file's content. */
  readonly text: string;
  readonly summary: ExportSummary;
  /** What the file holds, in model terms: automatic export compares it (T1.20). */
  readonly bundle: ExportBundle;
}

/**
 * Exports one recording: its raw records and its shots, discarded ones too, without the
 * settings. A recording in progress is exported as far as it is stored, so flush its recorder
 * first (`recorder.flush()`).
 *
 * @throws StorageError `not-found` if the recording isn't stored, or another code if reading
 *   fails.
 */
export async function exportRecording(
  storage: RecordingExportStorage,
  recordingId: Id,
  options: ExportOptions,
): Promise<ExportFile> {
  const raw = await storage.raw.read(recordingId);
  if (raw === null) {
    throw new StorageError('not-found', `Exporting recording ${recordingId}: no such recording`);
  }
  const shots = await storage.shots.listForRecording(recordingId);
  const bundle = makeBundle(options, [raw], shots, null);
  const offset = timeZoneOffset(options)(raw.recording.startedAtEpochMs);
  return toFile(bundle, recordingExportFileName(raw.recording, offset));
}

/**
 * Exports everything: every recording with its raw records, every shot (discarded ones too)
 * and every setting.
 *
 * @throws StorageError if reading fails.
 */
export async function exportAll(
  storage: ExportStorage,
  options: ExportOptions,
): Promise<ExportFile> {
  const recordings: ExportedRecording[] = [];
  for (const recording of await storage.recordings.list()) {
    // Each recording is read in its own transaction, so a large history isn't held in one.
    const raw = await storage.raw.read(recording.id);
    if (raw !== null) recordings.push(raw);
  }
  const shots = await storage.shots.list();
  const settings = Object.fromEntries(await storage.kv.entries());
  const bundle = makeBundle(options, recordings, shots, settings);
  const offset = timeZoneOffset(options)(bundle.exportedAtEpochMs);
  return toFile(bundle, allExportFileName(bundle.exportedAtEpochMs, offset));
}

/** Counts what a bundle holds. */
export function summariseBundle(bundle: ExportBundle): ExportSummary {
  let frames = 0;
  let events = 0;
  for (const entry of bundle.recordings) {
    frames += entry.frames.length;
    events += entry.events.length;
  }
  return {
    recordings: bundle.recordings.length,
    frames,
    events,
    shots: bundle.shots.length,
    settings: bundle.settings === null ? null : Object.keys(bundle.settings).length,
  };
}

function makeBundle(
  options: ExportOptions,
  recordings: readonly ExportedRecording[],
  shots: readonly Shot[],
  settings: Readonly<Record<string, JsonValue>> | null,
): ExportBundle {
  const exportedAtEpochMs = (options.epochNow ?? Date.now)();
  return { exportedAtEpochMs, app: options.app, recordings, shots, settings };
}

function toFile(bundle: ExportBundle, fileName: string): ExportFile {
  return { fileName, text: serialiseExport(bundle), summary: summariseBundle(bundle), bundle };
}

function timeZoneOffset(options: ExportOptions): (epochMs: number) => number {
  return options.timeZoneOffset ?? ((epochMs) => new Date(epochMs).getTimezoneOffset());
}

/** What import needs from storage (`AppStorage` has it). */
export interface ImportStorage {
  readonly recordings: Pick<RecordingRepository, 'get'>;
  readonly raw: Pick<RawRepository, 'addRecording' | 'last'>;
  readonly shots: Pick<ShotRepository, 'get' | 'create' | 'replace'>;
  readonly kv: Pick<KeyValueRepository, 'get' | 'set'>;
}

/** What to do with a shot or setting that is already stored and differs from the file's. */
export type MetadataPolicy =
  /** Keep the stored one. The default. */
  | 'keep'
  /** Replace it with the file's. */
  | 'replace';

export interface ImportOptions {
  /** Default `keep`. Raw is never replaced, whatever this says. */
  readonly metadata?: MetadataPolicy;
}

/** What happened to one recording in the file. */
export interface RecordingImport {
  readonly id: Id;
  /** `imported`: stored from the file. `skipped`: it was already stored, and is left as it was. */
  readonly outcome: 'imported' | 'skipped';
  /** Imported, but open in the file (exported while recording): stored ended as `unclean`. */
  readonly endedUnclean: boolean;
  /**
   * Skipped, and the file has this many records after the stored copy's last one: the stored
   * copy is a snapshot taken while recording. They aren't imported, because stored raw never
   * changes. 0 otherwise.
   */
  readonly recordsNotImported: number;
}

/** What happened to the file's shots or settings. */
export interface MetadataImportCounts {
  /** Not stored before, so stored from the file. */
  readonly added: number;
  /** Stored already, the same as the file's. */
  readonly unchanged: number;
  /** Stored already, different from the file's, and kept (policy `keep`). */
  readonly kept: number;
  /** Stored already, different from the file's, and replaced with it (policy `replace`). */
  readonly replaced: number;
}

export interface ShotImportCounts extends MetadataImportCounts {
  /**
   * Stored shots with the file's id but another recording, anchor, source or creation time
   * (D-019). They are left as they were, whatever the policy.
   */
  readonly conflicts: readonly Id[];
  /**
   * How many of the file's shots belong to a recording that is neither in the file nor stored.
   * They are imported anyway: the recording may come in another file.
   */
  readonly withoutRecording: number;
}

export interface ImportReport {
  readonly recordings: readonly RecordingImport[];
  readonly shots: ShotImportCounts;
  readonly settings: MetadataImportCounts;
}

/**
 * Merges a parsed export (`parseExport`) into storage: recordings first, then shots, then
 * settings. See the module comment for the rules. It can be run again after a failure, or on
 * the same file twice: what is already stored is skipped or compared.
 *
 * @throws StorageError if storing fails (except `exists` for a recording, which is a skip). What
 *   was stored before the failure stays stored.
 */
export async function importBundle(
  storage: ImportStorage,
  bundle: ExportBundle,
  options: ImportOptions = {},
): Promise<ImportReport> {
  const policy = options.metadata ?? 'keep';
  const recordings: RecordingImport[] = [];
  for (const entry of bundle.recordings) recordings.push(await importRecording(storage, entry));
  const fileRecordings = new Set(bundle.recordings.map((entry) => entry.recording.id));
  const shots = await importShots(storage, bundle.shots, fileRecordings, policy);
  const settings = await importSettings(storage, bundle.settings ?? {}, policy);
  return { recordings, shots, settings };
}

async function importRecording(
  storage: ImportStorage,
  entry: ExportedRecording,
): Promise<RecordingImport> {
  const { recording, frames, events } = entry;
  const open = recording.endedAtEpochMs === null && recording.endReason === null;
  const stored = open
    ? {
        ...recording,
        endedAtEpochMs: uncleanEndEpochMs(recording, {
          frame: frames.at(-1) ?? null,
          event: events.at(-1) ?? null,
        }),
        endReason: 'unclean' as const,
      }
    : recording;
  try {
    await storage.raw.addRecording({ recording: stored, frames, events });
    return { id: recording.id, outcome: 'imported', endedUnclean: open, recordsNotImported: 0 };
  } catch (error) {
    if (!(error instanceof StorageError && error.code === 'exists')) throw error;
  }
  const last = await storage.raw.last(recording.id);
  const storedLastSeq = Math.max(-1, last.frame?.seq ?? -1, last.event?.seq ?? -1);
  const recordsNotImported =
    frames.filter((frame) => frame.seq > storedLastSeq).length +
    events.filter((event) => event.seq > storedLastSeq).length;
  return { id: recording.id, outcome: 'skipped', endedUnclean: false, recordsNotImported };
}

async function importShots(
  storage: ImportStorage,
  shots: readonly Shot[],
  fileRecordings: ReadonlySet<Id>,
  policy: MetadataPolicy,
): Promise<ShotImportCounts> {
  const counts = { added: 0, unchanged: 0, kept: 0, replaced: 0 };
  const conflicts: Id[] = [];
  let withoutRecording = 0;
  const recordingStored = new Map<Id, boolean>();
  for (const shot of shots) {
    if (!fileRecordings.has(shot.recordingId)) {
      let found = recordingStored.get(shot.recordingId);
      if (found === undefined) {
        found = (await storage.recordings.get(shot.recordingId)) !== null;
        recordingStored.set(shot.recordingId, found);
      }
      if (!found) withoutRecording++;
    }

    const stored = await storage.shots.get(shot.id);
    if (stored === null) {
      await storage.shots.create(shot);
      counts.added++;
    } else if (jsonEqual(stored, shot)) {
      counts.unchanged++;
    } else if (!sameShotIdentity(stored, shot)) {
      conflicts.push(shot.id);
    } else if (policy === 'keep') {
      counts.kept++;
    } else {
      await storage.shots.replace(shot);
      counts.replaced++;
    }
  }
  return { ...counts, conflicts, withoutRecording };
}

async function importSettings(
  storage: ImportStorage,
  settings: Readonly<Record<string, JsonValue>>,
  policy: MetadataPolicy,
): Promise<MetadataImportCounts> {
  const counts = { added: 0, unchanged: 0, kept: 0, replaced: 0 };
  for (const [key, value] of Object.entries(settings)) {
    const stored = await storage.kv.get(key);
    if (stored === undefined) {
      await storage.kv.set(key, value);
      counts.added++;
    } else if (jsonEqual(stored, value)) {
      counts.unchanged++;
    } else if (policy === 'keep') {
      counts.kept++;
    } else {
      await storage.kv.set(key, value);
      counts.replaced++;
    }
  }
  return counts;
}

/** Whether two JSON values are equal: the same structure and values, object keys in any order. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    const left: readonly unknown[] = a;
    const right: readonly unknown[] = b;
    return left.every((item, i) => jsonEqual(item, right[i]));
  }
  const left = a as Readonly<Record<string, unknown>>;
  const right = b as Readonly<Record<string, unknown>>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && jsonEqual(left[key], right[key]))
  );
}
