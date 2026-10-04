/**
 * The raw layer's records: each recording's frames and app events. Raw is append-only (spec
 * "Layers"; CLAUDE.md hard rule 1), so this repository adds records and reads them, and has no
 * way to change or delete one. It writes with IndexedDB's `add`, which refuses to overwrite a
 * stored key, so not even a bug in here can replace a stored record (D-023).
 *
 * Frames are stored in chunks, keyed by `[recordingId, seq of the chunk's first frame]`, each
 * written once and never touched again. Each append writes one or more new chunks, so a chunk
 * holds one batch: about a second of frames from the recorder, more from an import. Events
 * are stored one per record, keyed by `[recordingId, seq]`.
 *
 * An import (T1.7) stores a whole recording at once with `addRecording`: its row and all its
 * records in one transaction, so a failed import leaves nothing behind, and importing the file
 * again isn't blocked by a half-stored recording.
 */

import {
  field,
  normaliseAppEvent,
  normaliseRawFrame,
  normaliseRecording,
  SchemaError,
  type AppEvent,
  type Id,
  type RawFrame,
  type Recording,
} from '../core/model';
import { recordingKeyRange, type Connection } from './db';
import { StorageError } from './errors';

/** The most frames one chunk holds. A larger append is split across chunks. */
export const DEFAULT_FRAMES_PER_CHUNK = 256;

/** One append's records, from one recording. Each list is in `seq` order. */
export interface RawBatch {
  readonly frames: readonly RawFrame[];
  readonly events: readonly AppEvent[];
}

/** A recording with everything stored for it. Each list is in `seq` order. */
export interface RawRecording {
  readonly recording: Recording;
  readonly frames: readonly RawFrame[];
  readonly events: readonly AppEvent[];
}

/** A recording's last stored frame and last stored event. */
export interface LastRawRecords {
  readonly frame: RawFrame | null;
  readonly event: AppEvent | null;
}

/** Raw frames and events: add and read only. */
export interface RawRepository {
  /**
   * Stores a batch in one transaction: all of it, or nothing. The recording must be stored
   * already, and every record must come after everything stored for it, frames and events
   * alike: `seq` only grows. A gap in `seq` is allowed (it records a loss) but a repeat isn't.
   *
   * @throws RangeError or TypeError if the batch isn't one recording's records in seq order;
   *   SchemaError on a malformed record; StorageError `not-found`, `out-of-order`, `quota` or
   *   another code if storing fails.
   */
  append(recordingId: Id, batch: RawBatch): Promise<void>;
  /**
   * Stores a whole recording, its row and its frames and events, in one transaction: all of
   * it, or nothing. This is how an import adds a recording (T1.7); the recorder uses
   * `recordings.create` and `append`. The records are checked as an append's are.
   *
   * @throws StorageError `exists` if a recording with its id is stored (raw is never
   *   replaced), `quota` or another code if storing fails; RangeError or TypeError if the
   *   records aren't the recording's in seq order; SchemaError on a malformed record.
   */
  addRecording(raw: RawRecording): Promise<void>;
  /** The recording and its frames and events, read in one transaction; null if it isn't stored. */
  read(recordingId: Id): Promise<RawRecording | null>;
  /** The last frame and the last event stored for a recording, null where there is none. */
  last(recordingId: Id): Promise<LastRawRecords>;
}

/**
 * How frames are stored: a run of one recording's frames, without their recording id, which
 * the chunk holds once. The read path puts it back and normalises every frame.
 */
interface StoredChunk {
  readonly recordingId: Id;
  /** The first frame's seq, and with the recording id the chunk's key. */
  readonly firstSeq: number;
  readonly frames: readonly Omit<RawFrame, 'recordingId'>[];
}

const RAW_STORES = ['recordings', 'frameChunks', 'events'] as const;

export function rawRepository(
  connection: Connection,
  framesPerChunk = DEFAULT_FRAMES_PER_CHUNK,
): RawRepository {
  if (!Number.isSafeInteger(framesPerChunk) || framesPerChunk < 1) {
    throw new RangeError(`rawRepository: ${framesPerChunk} frames per chunk`);
  }

  return {
    async append(recordingId, batch) {
      const doing = `Appending to recording ${recordingId}`;
      const { frames, events, firstSeq } = checkBatch(recordingId, batch);
      if (firstSeq === null) return;
      const chunks = toChunks(recordingId, frames, framesPerChunk);
      await connection.run(RAW_STORES, 'readwrite', doing, async (tx) => {
        const chunkStore = tx.objectStore('frameChunks');
        const eventStore = tx.objectStore('events');
        const range = recordingKeyRange(recordingId);
        const [found, lastChunk, lastEvent] = await Promise.all([
          tx.objectStore('recordings').getKey(recordingId),
          chunkStore.openCursor(range, 'prev'),
          eventStore.openCursor(range, 'prev'),
        ]);
        if (found === undefined) {
          throw new StorageError('not-found', `${doing}: no such recording`);
        }
        const storedSeq = Math.max(
          lastChunk ? (readChunk(lastChunk.value, 'frameChunk').at(-1)?.seq ?? -1) : -1,
          lastEvent ? normaliseAppEvent(lastEvent.value).seq : -1,
        );
        if (firstSeq <= storedSeq) {
          throw new StorageError(
            'out-of-order',
            `${doing}: seq ${firstSeq} doesn't come after seq ${storedSeq}, which is stored`,
          );
        }
        await Promise.all([
          ...chunks.map((chunk) => chunkStore.add(chunk)),
          ...events.map((event) => eventStore.add(event)),
          tx.done,
        ]);
      });
    },

    async addRecording(raw) {
      const recording = normaliseRecording(raw.recording);
      const { frames, events } = checkBatch(recording.id, raw);
      const chunks = toChunks(recording.id, frames, framesPerChunk);
      await connection.run(RAW_STORES, 'readwrite', `Adding recording ${recording.id}`, (tx) =>
        Promise.all([
          // First, so that an existing recording fails the transaction before anything else.
          tx.objectStore('recordings').add(recording),
          ...chunks.map((chunk) => tx.objectStore('frameChunks').add(chunk)),
          ...events.map((event) => tx.objectStore('events').add(event)),
          tx.done,
        ]),
      );
    },

    read(recordingId) {
      return connection.run(
        RAW_STORES,
        'readonly',
        `Reading recording ${recordingId}`,
        async (tx) => {
          const range = recordingKeyRange(recordingId);
          const [recording, chunks, events] = await Promise.all([
            tx.objectStore('recordings').get(recordingId),
            tx.objectStore('frameChunks').getAll(range),
            tx.objectStore('events').getAll(range),
          ]);
          if (recording === undefined) return null;
          return {
            recording: normaliseRecording(recording),
            frames: chunks.flatMap((chunk, i) => readChunk(chunk, `frameChunks[${i}]`)),
            events: events.map((event, i) => normaliseAppEvent(event, `events[${i}]`)),
          };
        },
      );
    },

    last(recordingId) {
      const stores = ['frameChunks', 'events'] as const;
      return connection.run(stores, 'readonly', `Reading recording ${recordingId}`, async (tx) => {
        const range = recordingKeyRange(recordingId);
        const [chunk, event] = await Promise.all([
          tx.objectStore('frameChunks').openCursor(range, 'prev'),
          tx.objectStore('events').openCursor(range, 'prev'),
        ]);
        return {
          frame: chunk ? (readChunk(chunk.value, 'frameChunk').at(-1) ?? null) : null,
          event: event ? normaliseAppEvent(event.value) : null,
        };
      });
    },
  };
}

/**
 * The batch's records, normalised and checked: all from the recording, each list in strictly
 * increasing seq order, and no seq used twice. `firstSeq` is the lowest seq, or null for an
 * empty batch.
 */
function checkBatch(
  recordingId: Id,
  batch: RawBatch,
): { frames: RawFrame[]; events: AppEvent[]; firstSeq: number | null } {
  const frames = batch.frames.map((frame, i) => normaliseRawFrame(frame, `frames[${i}]`));
  const events = batch.events.map((event, i) => normaliseAppEvent(event, `events[${i}]`));
  checkRecords(recordingId, 'frames', frames);
  checkRecords(recordingId, 'events', events);
  const seqs = [...frames, ...events].map((record) => record.seq).sort((a, b) => a - b);
  for (let i = 1; i < seqs.length; i++) {
    if (seqs[i] === seqs[i - 1]) {
      throw new RangeError(`append: a frame and an event both have seq ${seqs[i]}`);
    }
  }
  return { frames, events, firstSeq: seqs.length > 0 ? seqs[0] : null };
}

function checkRecords(
  recordingId: Id,
  kind: string,
  records: readonly { readonly recordingId: Id; readonly seq: number }[],
): void {
  for (let i = 0; i < records.length; i++) {
    const { recordingId: owner, seq } = records[i];
    if (owner !== recordingId) {
      throw new TypeError(
        `append: ${kind}[${i}] belongs to recording ${owner}, not ${recordingId}`,
      );
    }
    if (i > 0 && seq <= records[i - 1].seq) {
      throw new RangeError(
        `append: ${kind}[${i}] has seq ${seq} after seq ${records[i - 1].seq}; seq must increase`,
      );
    }
  }
}

/** The frames in chunks of up to `framesPerChunk`, in order. */
function toChunks(
  recordingId: Id,
  frames: readonly RawFrame[],
  framesPerChunk: number,
): StoredChunk[] {
  const chunks: StoredChunk[] = [];
  for (let i = 0; i < frames.length; i += framesPerChunk) {
    chunks.push(toChunk(recordingId, frames.slice(i, i + framesPerChunk)));
  }
  return chunks;
}

function toChunk(recordingId: Id, frames: readonly RawFrame[]): StoredChunk {
  return {
    recordingId,
    firstSeq: frames[0].seq,
    frames: frames.map(({ seq, tMs, source, bytes }) => ({
      seq,
      tMs,
      source,
      bytes: ownBuffer(bytes),
    })),
  };
}

/**
 * The bytes, in an `ArrayBuffer` of their own. IndexedDB stores a view's whole buffer, so a
 * frame that is a view into a larger buffer would store all of it.
 */
function ownBuffer(bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes
    : bytes.slice();
}

const parseChunk = field.object<{
  readonly recordingId: Id;
  readonly firstSeq: number;
  readonly frames: readonly unknown[];
}>({
  recordingId: field.id,
  firstSeq: field.nonNegativeInteger,
  frames: field.arrayOf((value) => value),
});

/** A stored chunk's frames, each normalised (D-018). */
function readChunk(value: unknown, path: string): RawFrame[] {
  const chunk = parseChunk(value, path);
  return chunk.frames.map((frame, i) => {
    const framePath = `${path}.frames[${i}]`;
    if (typeof frame !== 'object' || frame === null || Array.isArray(frame)) {
      throw new SchemaError(framePath, 'expected an object');
    }
    return normaliseRawFrame({ ...frame, recordingId: chunk.recordingId }, framePath);
  });
}
