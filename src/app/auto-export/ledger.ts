/**
 * The automatic export's ledger (T1.20, D-030): for each recording, what the destination holds
 * of it. One device-local value per recording, under `autoExport.ledger.<id>`, never exported.
 *
 * A closed recording's raw records never change (CLAUDE.md hard rule 1), so its file changes
 * only when its shots do. The ledger keeps a digest of the shots that went into the file: a
 * scan compares it with the stored shots' digest, without reading any raw records, to find the
 * recordings to upload again. It also keeps the file's path, which stays the recording's for
 * good, and the version (GitHub's blob sha, itself a hash of the uploaded text) that an update
 * must name.
 */

import { field, type Id, type JsonValue, type ObjectSchema, type Shot } from '../../core/model';
import type { LocalRepository } from '../../storage';
import { canonicalJson, sha256Hex } from './encoding';

export const LEDGER_PREFIX = 'autoExport.ledger.';

export interface LedgerEntry {
  /**
   * `synced`: the destination's file holds what this device's would (it was uploaded from here,
   * or found equal). `held`: the destination's file differs and was left alone (`reason`).
   */
  readonly state: 'synced' | 'held';
  /** The destination it is about: `destinationKey` of the settings. */
  readonly destination: string;
  /** The file's path at the destination. */
  readonly path: string;
  /** `shotsDigest` of the recording's shots as they were compared or uploaded. */
  readonly shotsDigest: string;
  /** The destination's version of the file, which an update replaces; null if unknown. */
  readonly version: string | null;
  /** When the entry was written: for `synced`, when the file was last uploaded or confirmed. */
  readonly atEpochMs: number;
  /** For `held`: why the destination's file was left alone. null for `synced`. */
  readonly reason: string | null;
}

const LEDGER_ENTRY_SCHEMA: ObjectSchema<LedgerEntry> = {
  state: field.oneOf(['synced', 'held'] as const),
  destination: field.string,
  path: field.string,
  shotsDigest: field.string,
  version: field.nullable(field.string),
  atEpochMs: field.number,
  reason: field.nullable(field.string),
};

const parseLedgerEntry = field.object(LEDGER_ENTRY_SCHEMA);

/**
 * Every entry by recording id. An entry this build can't read is left out, as if there were
 * none: its recording's file is then compared with the destination's before anything is
 * written, which is always safe.
 *
 * @throws StorageError if reading fails.
 */
export async function readLedger(local: LocalRepository): Promise<Map<Id, LedgerEntry>> {
  const ledger = new Map<Id, LedgerEntry>();
  for (const [key, value] of await local.entries(LEDGER_PREFIX)) {
    const entry = tryParse(value, key);
    if (entry !== null) ledger.set(key.slice(LEDGER_PREFIX.length), entry);
  }
  return ledger;
}

/** The recording's entry, or null. @throws StorageError if reading fails. */
export async function readLedgerEntry(
  local: LocalRepository,
  recordingId: Id,
): Promise<LedgerEntry | null> {
  const key = LEDGER_PREFIX + recordingId;
  const value = await local.get(key);
  return value === undefined ? null : tryParse(value, key);
}

/** @throws StorageError if storing fails. */
export async function writeLedgerEntry(
  local: LocalRepository,
  recordingId: Id,
  entry: LedgerEntry,
): Promise<void> {
  await local.set(LEDGER_PREFIX + recordingId, { ...entry } satisfies Record<string, JsonValue>);
}

/**
 * A digest of a recording's shots, discarded ones too: equal shots give an equal digest,
 * whatever order they come in.
 */
export async function shotsDigest(shots: readonly Shot[]): Promise<string> {
  const sorted = [...shots].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return sha256Hex(canonicalJson(sorted as unknown as JsonValue));
}

function tryParse(value: JsonValue, key: string): LedgerEntry | null {
  try {
    return parseLedgerEntry(value, key);
  } catch {
    return null;
  }
}
