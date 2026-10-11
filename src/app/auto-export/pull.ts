/**
 * The pull (T3.21, D-113): what the destination holds, read back and merged into this device, so
 * a wiped phone, or a second one, gets its recordings, shots, entities and settings again.
 * Automatic export runs it before it uploads, at startup, after the settings are saved, on Retry,
 * and when the app is shown again after a while.
 *
 * - **What is read.** One listing of the destination; nothing more when it hasn't changed since
 *   the last pull. A recording's file is read unless the ledger says the destination holds what
 *   this device last uploaded or pulled (`synced` at that version); so are the entities' and the
 *   settings' files. A file this build can't read is skipped and named in the report.
 * - **Recordings.** Raw is only ever added (hard rule 1): a stored recording is left as it is.
 *   The file's shots are stored before its recording, so the analysis never finds the recording
 *   without them and makes post-hoc shots of its own.
 * - **Shots**, one by one: a new one is added, an equal one left. Two versions of one shot:
 *   - a deleted one stands, on either side (deleting is deliberate);
 *   - else, if this device's hasn't changed since the last sync of that file, the destination's
 *     replaces it; if the destination's hasn't, this device's stays (it goes up next);
 *   - else both changed, or there was no sync to tell: both are kept, the destination's as a
 *     copy with a new id, and History shows the two (the user's word: "let's just display them
 *     both").
 * - **Entities**, one by one: added, or the newer version wins (`updatedAtEpochMs`; a seed
 *   nobody changed here always gives way).
 * - **Settings**, key by key: added, or the destination's replaces this device's when this
 *   device's settings haven't changed since the last sync, or changed before the destination's
 *   file was written (the newer wins).
 *
 * After a merge the ledger records the destination's version, so the next upload replaces it with
 * this device's merged file (which holds everything the destination's did) without comparing.
 */

import { parseExport, type ExportBundle } from '../../core/export';
import {
  ENTITY_KINDS,
  field,
  isPristineSeed,
  newId,
  sameEntityIdentity,
  sameShotIdentity,
  type EntityLists,
  type JsonValue,
  type Shot,
} from '../../core/model';
import type {
  EntityRepository,
  KeyValueRepository,
  LocalRepository,
  RawRepository,
  RecordingRepository,
  ShotRepository,
} from '../../storage';
import { ENTITIES_FILE_NAME, importRecording, jsonEqual, SETTINGS_FILE_NAME } from '../export';
import {
  ENTITIES_LEDGER_KEY,
  entitiesDigest,
  readFileLedgerEntry,
  readLedger,
  SETTINGS_LEDGER_KEY,
  settingsDigest,
  shotsDigest,
  writeFileLedgerEntry,
  writeLedgerEntry,
  type FileLedgerEntry,
  type LedgerEntry,
} from './ledger';
import type { BackupSink } from './sink';

/** Device-local: the destination and listing version of the last complete pull. */
export const PULLED_KEY = 'autoExport.pulled';
/** Device-local: when this device's settings last changed, epoch ms (T3.21). */
export const SETTINGS_CHANGED_KEY = 'autoExport.settingsChangedAt';

/** A recording's file at the destination: `YYYY/MM/<name>.json` under the prefix. */
const RECORDING_PATH = /^\d{4}\/\d{2}\/[^/]+\.json$/;

/** What a pull storage needs (`AppStorage` has it). */
export interface PullStorage {
  readonly recordings: Pick<RecordingRepository, 'get'>;
  readonly raw: Pick<RawRepository, 'addRecording' | 'last'>;
  readonly shots: Pick<ShotRepository, 'get' | 'create' | 'replace'>;
  readonly entities: Pick<EntityRepository, 'get' | 'create' | 'replace'>;
  readonly kv: Pick<KeyValueRepository, 'get' | 'set' | 'entries'>;
  readonly local: LocalRepository;
}

export interface PullOptions {
  readonly storage: PullStorage;
  /** `destinationKey` of the settings. */
  readonly destination: string;
  /** The settings' path prefix, like `smart-scale/`. */
  readonly prefix: string;
  readonly epochNow: () => number;
  /** False once newer settings took over: the pull stops between files. */
  readonly stillCurrent: () => boolean;
}

/** What a pull brought. */
export interface PullReport {
  /** Files read from the destination. */
  readonly files: number;
  /** Recordings stored from it. */
  readonly recordings: number;
  readonly shots: {
    readonly added: number;
    /** Replaced by the destination's version. */
    readonly updated: number;
    /** Both versions kept: the destination's stored as a copy. */
    readonly copies: number;
  };
  readonly entities: { readonly added: number; readonly updated: number };
  /** Settings added or replaced. */
  readonly settings: number;
  /** Files this build couldn't read, by path. */
  readonly unreadable: readonly string[];
}

/** Whether the pull changed anything here. */
export function pullChangedAnything(report: PullReport): boolean {
  const { shots, entities } = report;
  return (
    report.recordings + shots.added + shots.updated + shots.copies > 0 ||
    entities.added + entities.updated + report.settings > 0
  );
}

const parsePulled = field.object<{ destination: string; version: string }>({
  destination: field.string,
  version: field.string,
});

/**
 * Reads the destination back and merges it in. Resolves to null when its listing is the one
 * the last pull read: nothing changed there.
 *
 * @throws BackupError from the sink; StorageError if storing fails. What was merged before a
 *   failure stays merged, and the ledger says so: the next pull reads the rest.
 */
export async function pull(sink: BackupSink, options: PullOptions): Promise<PullReport | null> {
  const { storage, destination, prefix } = options;
  const listing = await sink.list();
  const last = readPulled(await storage.local.get(PULLED_KEY));
  if (last?.destination === destination && last.version === listing.version) return null;

  const report = {
    files: 0,
    recordings: 0,
    shots: { added: 0, updated: 0, copies: 0 },
    entities: { added: 0, updated: 0 },
    settings: 0,
    unreadable: [] as string[],
  };
  const ledger = await readLedger(storage.local);
  const byPath = new Map<string, LedgerEntry>();
  for (const entry of ledger.values()) {
    if (entry.destination === destination) byPath.set(entry.path, entry);
  }

  for (const file of listing.files) {
    if (!file.path.startsWith(prefix)) continue;
    const relative = file.path.slice(prefix.length);
    if (relative === ENTITIES_FILE_NAME || relative === SETTINGS_FILE_NAME) continue;
    if (!RECORDING_PATH.test(relative)) continue;
    const known = byPath.get(file.path);
    if (known?.state === 'synced' && known.version === file.version) continue;
    if (!options.stillCurrent()) return report;
    const bundle = await readBundle(sink, file.path, report);
    if (bundle === null) continue;
    if (bundle.file.recordings.length !== 1) {
      report.unreadable.push(file.path);
      continue;
    }
    const recordingId = bundle.file.recordings[0].recording.id;
    const base = ledger.get(recordingId);
    await mergeRecordingFile(
      storage,
      bundle.file,
      base?.destination === destination ? base : null,
      report,
    );
    await writeLedgerEntry(storage.local, recordingId, {
      state: 'synced',
      destination,
      path: file.path,
      shotsDigest: await shotsDigest(bundle.file.shots),
      version: bundle.version,
      atEpochMs: options.epochNow(),
      reason: null,
    });
  }

  for (const [name, key] of [
    [ENTITIES_FILE_NAME, ENTITIES_LEDGER_KEY],
    [SETTINGS_FILE_NAME, SETTINGS_LEDGER_KEY],
  ] as const) {
    const path = prefix + name;
    const file = listing.files.find((candidate) => candidate.path === path);
    if (file === undefined) continue;
    const stored = await readFileLedgerEntry(storage.local, key);
    const known = stored?.destination === destination ? stored : null;
    if (known?.state === 'synced' && known.version === file.version) continue;
    if (!options.stillCurrent()) return report;
    const bundle = await readBundle(sink, path, report);
    if (bundle === null) continue;
    let digest: string;
    if (name === ENTITIES_FILE_NAME) {
      if (bundle.file.entities === null) {
        report.unreadable.push(path);
        continue;
      }
      await mergeEntities(storage, bundle.file.entities, report);
      digest = await entitiesDigest(bundle.file.entities);
    } else {
      if (bundle.file.settings === null) {
        report.unreadable.push(path);
        continue;
      }
      await mergeSettings(storage, bundle.file, known, report);
      digest = await settingsDigest(bundle.file.settings);
    }
    const entry: FileLedgerEntry = {
      state: 'synced',
      destination,
      path,
      digest,
      version: bundle.version,
      atEpochMs: options.epochNow(),
      reason: null,
    };
    await writeFileLedgerEntry(storage.local, key, entry);
  }

  await storage.local.set(PULLED_KEY, { destination, version: listing.version });
  return report;
}

/** Forgets the last pull's listing, so the next pull reads the destination's files again. */
export async function forgetPull(local: LocalRepository): Promise<void> {
  await local.set(PULLED_KEY, null);
}

/** Records that this device's settings changed now (T3.21): the newer side wins a pull. */
export async function settingsChangedNow(local: LocalRepository, epochMs: number): Promise<void> {
  await local.set(SETTINGS_CHANGED_KEY, epochMs);
}

async function readBundle(
  sink: BackupSink,
  path: string,
  report: { files: number; unreadable: string[] },
): Promise<{ readonly file: ExportBundle; readonly version: string } | null> {
  const remote = await sink.read(path);
  if (remote === null) return null; // gone since the listing
  report.files++;
  try {
    return { file: parseExport(remote.text).bundle, version: remote.version };
  } catch {
    report.unreadable.push(path);
    return null;
  }
}

function readPulled(value: JsonValue | undefined): { destination: string; version: string } | null {
  if (value === undefined || value === null) return null;
  try {
    return parsePulled(value, PULLED_KEY);
  } catch {
    return null;
  }
}

/**
 * One recording's file: its shots first, then its recording. `base` is the ledger's entry from
 * before: when this device last synced that file.
 */
async function mergeRecordingFile(
  storage: PullStorage,
  bundle: ExportBundle,
  base: LedgerEntry | null,
  report: { recordings: number; shots: { added: number; updated: number; copies: number } },
): Promise<void> {
  const syncedAt = base?.state === 'synced' ? base.atEpochMs : null;
  for (const theirs of bundle.shots) {
    const ours = await storage.shots.get(theirs.id);
    if (ours === null) {
      await storage.shots.create(theirs);
      report.shots.added++;
      continue;
    }
    // Another recording, anchor or source under the same id: left alone (D-019).
    if (jsonEqual(ours, theirs) || !sameShotIdentity(ours, theirs)) continue;
    const choice = chooseShot(ours, theirs, syncedAt);
    if (choice === 'theirs') {
      await storage.shots.replace(theirs);
      report.shots.updated++;
    } else if (choice === 'both') {
      await storage.shots.create(conflictCopy(theirs));
      report.shots.copies++;
    }
  }
  const imported = await importRecording(storage, bundle.recordings[0]);
  if (imported.outcome === 'imported') report.recordings++;
}

/** Which of two versions of a shot stays: see the module comment. */
export function chooseShot(
  ours: Shot,
  theirs: Shot,
  syncedAtEpochMs: number | null,
): 'ours' | 'theirs' | 'both' {
  if (ours.discardedAtEpochMs !== null) return 'ours';
  if (theirs.discardedAtEpochMs !== null) return 'theirs';
  if (syncedAtEpochMs !== null) {
    if (ours.updatedAtEpochMs <= syncedAtEpochMs) return 'theirs';
    if (theirs.updatedAtEpochMs <= syncedAtEpochMs) return 'ours';
  }
  return 'both';
}

/**
 * The destination's version of a shot kept beside this device's: a shot of its own (a new id),
 * as it was there. Its recording and anchor are the original's, so History shows it at the same
 * moment, with the same chart (`History`).
 */
function conflictCopy(theirs: Shot): Shot {
  return { ...theirs, id: newId() };
}

/** The entities, one by one: see the module comment. */
async function mergeEntities(
  storage: PullStorage,
  entities: EntityLists,
  report: { entities: { added: number; updated: number } },
): Promise<void> {
  for (const kind of ENTITY_KINDS) {
    for (const theirs of entities[kind]) {
      const ours = await storage.entities.get(kind, theirs.id);
      if (ours === null) {
        await storage.entities.create(kind, theirs);
        report.entities.added++;
      } else if (jsonEqual(ours, theirs) || !sameEntityIdentity(ours, theirs)) {
        continue;
      } else if (isPristineSeed(ours) || theirs.updatedAtEpochMs > ours.updatedAtEpochMs) {
        await storage.entities.replace(kind, theirs);
        report.entities.updated++;
      }
    }
  }
}

/** The settings, key by key: see the module comment. */
async function mergeSettings(
  storage: PullStorage,
  bundle: ExportBundle,
  base: FileLedgerEntry | null,
  report: { settings: number },
): Promise<void> {
  const theirs = bundle.settings ?? {};
  const ours = Object.fromEntries(await storage.kv.entries());
  const unchangedHere = base?.state === 'synced' && base.digest === (await settingsDigest(ours));
  const changedAt = await storage.local.get(SETTINGS_CHANGED_KEY);
  const theirsNewer =
    unchangedHere || typeof changedAt !== 'number' || bundle.exportedAtEpochMs > changedAt;
  for (const [key, value] of Object.entries(theirs)) {
    const current: JsonValue | undefined = ours[key];
    if (current !== undefined && (jsonEqual(current, value) || !theirsNewer)) continue;
    await storage.kv.set(key, value);
    report.settings++;
  }
}
