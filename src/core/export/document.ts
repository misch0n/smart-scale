/**
 * The export document: the JSON shape of a current-version file, and its conversion from and to
 * an `ExportBundle`. docs/export-format.md describes the shape:
 *
 * - each recording entry is `{ recording, frames, events }`, and the records inside it leave
 *   out `recordingId`, which the entry's recording supplies;
 * - a frame is a compact row, `[seq, tMs, source, hex]`, with its bytes as packed upper-case
 *   hex;
 * - an event is `{ seq, tMs, type, data }`;
 * - shots and settings are top-level, because they are metadata, imported by different rules
 *   than raw.
 *
 * Every record goes through the model's normaliser on the way in and on the way out (D-018), so
 * a file carries every field, `null` included, and a parsed record has every field too.
 */

import { toHex } from '../protocol';
import {
  field,
  FRAME_SOURCES,
  normaliseAppEvent,
  normaliseAppInfo,
  normaliseRawFrame,
  normaliseRecording,
  normaliseShot,
  SchemaError,
  type AppEvent,
  type AppInfo,
  type Field,
  type FrameSource,
  type Id,
  type RawFrame,
  type Recording,
  type Shot,
} from '../model';
import {
  EXPORT_FORMAT,
  FORMAT_VERSION,
  type ExportBundle,
  type ExportedRecording,
  type ExportSettings,
} from './format';

/** A frame in the file: `[seq, tMs, source, hex]`. */
export type FrameRow = readonly [seq: number, tMs: number, source: FrameSource, hex: string];

/** An event in the file: the model's `AppEvent` without `recordingId`. */
export type EventEntry = Omit<AppEvent, 'recordingId'>;

/** A recording in the file, with its raw records. */
export interface RecordingEntry {
  readonly recording: Recording;
  readonly frames: readonly FrameRow[];
  readonly events: readonly EventEntry[];
}

/** A current-version export, as JSON. */
export interface ExportDocument {
  readonly format: typeof EXPORT_FORMAT;
  readonly formatVersion: number;
  readonly exportedAtEpochMs: number;
  readonly app: AppInfo;
  readonly recordings: readonly RecordingEntry[];
  readonly shots: readonly Shot[];
  readonly settings: ExportSettings | null;
}

/**
 * The document for a bundle. Every record is normalised, so the document has every field.
 *
 * @throws SchemaError if the bundle is malformed (a programming error): a record that doesn't
 *   normalise, a frame or event of another recording, records out of seq order, or an id used
 *   twice.
 */
export function toDocument(bundle: ExportBundle): ExportDocument {
  const checked = normaliseBundle(bundle);
  checkBundle(checked);
  return {
    format: EXPORT_FORMAT,
    formatVersion: FORMAT_VERSION,
    exportedAtEpochMs: checked.exportedAtEpochMs,
    app: checked.app,
    recordings: checked.recordings.map(({ recording, frames, events }) => ({
      recording,
      frames: frames.map((frame): FrameRow => [
        frame.seq,
        frame.tMs,
        frame.source,
        toHex(frame.bytes, ''),
      ]),
      events: events.map(({ seq, tMs, type, data }): EventEntry => ({ seq, tMs, type, data })),
    })),
    shots: checked.shots,
    settings: checked.settings,
  };
}

/**
 * The bundle a current-version document describes. Missing nullable fields become `null` and
 * unknown keys are dropped (D-018).
 *
 * @throws SchemaError, naming the place, if the document is malformed: a missing or mistyped
 *   field, an unknown event type, a bad frame row or hex, records out of seq order, or an id
 *   used twice.
 */
export function fromDocument(document: unknown): ExportBundle {
  const bundle = parseBundle(document);
  checkBundle(bundle);
  return bundle;
}

const PACKED_UPPER_HEX = /^(?:[0-9A-F]{2})*$/;

/** Bytes from packed upper-case hex, the only form the format allows: `030B00`. */
const hexField: Field<Uint8Array<ArrayBuffer>> = (value, path) => {
  const hex = field.string(value, path);
  if (!PACKED_UPPER_HEX.test(hex)) {
    const shown = hex.length > 48 ? `${hex.slice(0, 48)}…` : hex;
    throw new SchemaError(path, `expected packed upper-case hex, got ${JSON.stringify(shown)}`);
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = (nibble(hex.charCodeAt(2 * i)) << 4) | nibble(hex.charCodeAt(2 * i + 1));
  }
  return bytes;
};

/** The value of a hex digit already checked to be 0–9 or A–F. */
function nibble(charCode: number): number {
  return charCode <= 0x39 ? charCode - 0x30 : charCode - 0x37;
}

const sourceField = field.oneOf(FRAME_SOURCES);

function frameRowField(recordingId: Id): Field<RawFrame> {
  return (value, path) => {
    if (!Array.isArray(value) || value.length !== 4) {
      throw new SchemaError(path, 'expected a frame row, [seq, tMs, source, hex]');
    }
    const row: readonly unknown[] = value;
    return normaliseRawFrame(
      {
        recordingId,
        seq: field.nonNegativeInteger(row[0], `${path}[0]`),
        tMs: field.number(row[1], `${path}[1]`),
        source: sourceField(row[2], `${path}[2]`),
        bytes: hexField(row[3], `${path}[3]`),
      },
      path,
    );
  };
}

function eventField(recordingId: Id): Field<AppEvent> {
  return (value, path) => {
    if (!isPlainObject(value)) throw new SchemaError(path, 'expected an event object');
    // The entry's recording supplies the id, whatever the event says.
    return normaliseAppEvent({ ...value, recordingId }, path);
  };
}

/** A recording entry in a document: frames as rows, records without `recordingId`. */
const documentEntryField: Field<ExportedRecording> = (value, path) => {
  if (!isPlainObject(value)) throw new SchemaError(path, 'expected a recording entry object');
  const recording = normaliseRecording(member(value, 'recording'), `${path}.recording`);
  return {
    recording,
    frames: field.arrayOf(frameRowField(recording.id))(member(value, 'frames'), `${path}.frames`),
    events: field.arrayOf(eventField(recording.id))(member(value, 'events'), `${path}.events`),
  };
};

/** A recording in a bundle: model records. */
const bundleEntryField: Field<ExportedRecording> = (value, path) => {
  if (!isPlainObject(value)) throw new SchemaError(path, 'expected an object');
  return {
    recording: normaliseRecording(member(value, 'recording'), `${path}.recording`),
    frames: field.arrayOf(normaliseRawFrame)(member(value, 'frames'), `${path}.frames`),
    events: field.arrayOf(normaliseAppEvent)(member(value, 'events'), `${path}.events`),
  };
};

/** Settings: an object whose values are any JSON. */
const settingsField: Field<ExportSettings> = (value, path) => {
  if (!isPlainObject(value)) throw new SchemaError(path, 'expected an object of settings');
  return field.json(value, path) as ExportSettings;
};

const nullableSettingsField = field.nullable(settingsField);
const shotsField = field.arrayOf(normaliseShot);

/**
 * Parses the parts a document and a bundle share, with `entry` for each recording. Paths start
 * at the top level, like `recordings[0].frames[12][3]`.
 */
function bundleParser(entry: Field<ExportedRecording>): (value: unknown) => ExportBundle {
  const recordingsField = field.arrayOf(entry);
  return (value) => {
    if (!isPlainObject(value)) throw new SchemaError('export', 'expected an object');
    return {
      exportedAtEpochMs: field.number(member(value, 'exportedAtEpochMs'), 'exportedAtEpochMs'),
      app: normaliseAppInfo(member(value, 'app'), 'app'),
      recordings: recordingsField(member(value, 'recordings'), 'recordings'),
      shots: shotsField(member(value, 'shots'), 'shots'),
      settings: nullableSettingsField(member(value, 'settings'), 'settings'),
    };
  };
}

/** A document's bundle. */
const parseBundle = bundleParser(documentEntryField);
/** A bundle with every record normalised, as `toDocument` writes it. */
const normaliseBundle = bundleParser(bundleEntryField);

/**
 * Checks what the record schemas can't: each recording's frames and events are its own, each
 * list in strictly increasing seq order, with no seq used by both a frame and an event; and no
 * recording or shot id appears twice. Storage holds raw to the same rules (D-023), so a file
 * that passes can be stored, and one that fails does so before anything is.
 */
function checkBundle(bundle: ExportBundle): void {
  const recordingIds = new Set<Id>();
  bundle.recordings.forEach(({ recording, frames, events }, i) => {
    const path = `recordings[${i}]`;
    if (recordingIds.has(recording.id)) {
      throw new SchemaError(`${path}.recording.id`, `recording ${recording.id} appears twice`);
    }
    recordingIds.add(recording.id);
    checkRecords(`${path}.frames`, recording.id, frames);
    checkRecords(`${path}.events`, recording.id, events);
    checkNoSharedSeq(path, frames, events);
  });
  const shotIds = new Set<Id>();
  bundle.shots.forEach((shot, i) => {
    if (shotIds.has(shot.id)) {
      throw new SchemaError(`shots[${i}].id`, `shot ${shot.id} appears twice`);
    }
    shotIds.add(shot.id);
  });
}

function checkRecords(
  path: string,
  recordingId: Id,
  records: readonly { readonly recordingId: Id; readonly seq: number }[],
): void {
  for (let i = 0; i < records.length; i++) {
    const { recordingId: owner, seq } = records[i];
    if (owner !== recordingId) {
      throw new SchemaError(`${path}[${i}]`, `belongs to recording ${owner}, not ${recordingId}`);
    }
    if (i > 0 && seq <= records[i - 1].seq) {
      throw new SchemaError(
        `${path}[${i}]`,
        `seq ${seq} comes after seq ${records[i - 1].seq}, but seq must increase`,
      );
    }
  }
}

/** Both lists are in increasing seq order, so one pass finds a seq they share. */
function checkNoSharedSeq(
  path: string,
  frames: readonly RawFrame[],
  events: readonly AppEvent[],
): void {
  let f = 0;
  let e = 0;
  while (f < frames.length && e < events.length) {
    const frameSeq = frames[f].seq;
    const eventSeq = events[e].seq;
    if (frameSeq === eventSeq) {
      throw new SchemaError(`${path}.events[${e}]`, `seq ${eventSeq} is frames[${f}]'s seq too`);
    }
    if (frameSeq < eventSeq) f++;
    else e++;
  }
}

/** A key's value, or `undefined` when the object doesn't have it as its own. */
function member(value: Readonly<Record<string, unknown>>, key: string): unknown {
  return Object.hasOwn(value, key) ? value[key] : undefined;
}

export function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
