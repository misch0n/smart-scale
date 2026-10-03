/**
 * A raw frame: one BLE notification exactly as it arrived (D-004). Frames with bad checksums,
 * wrong lengths or unknown headers are frames too. Decoding them is derived work for
 * `src/core/protocol`, so a decoder fix applies to every recording ever made.
 */

import type { Id } from './ids';
import { field, SchemaError, type ObjectSchema } from './schema';

/** The characteristic a notification came from: weight data (FF11) or commands (FF12). */
export const CHARACTERISTIC_NAMES = ['ff11', 'ff12'] as const;
export type CharacteristicName = (typeof CHARACTERISTIC_NAMES)[number];

export interface RawFrame {
  readonly recordingId: Id;
  /** The recording's sequence number, shared with its app events (`RecordingSequence`). */
  readonly seq: number;
  /**
   * Arrival time: ms since the recording started, on the recorder's monotonic clock (a float).
   * The scale's own timer is inside `bytes` (D-006).
   */
  readonly tMs: number;
  readonly source: CharacteristicName;
  /** The notification's bytes, verbatim. Never mutate them: raw is append-only. */
  readonly bytes: Uint8Array<ArrayBuffer>;
}

const RAW_FRAME_SCHEMA: ObjectSchema<RawFrame> = {
  recordingId: field.id,
  seq: field.nonNegativeInteger,
  tMs: field.number,
  source: field.oneOf(CHARACTERISTIC_NAMES),
  bytes: field.bytes,
};

const parseRawFrame = field.object(RAW_FRAME_SCHEMA);

/**
 * A complete `RawFrame` from stored or imported data (D-018). Any number of bytes is accepted,
 * including zero: raw keeps what arrived. The bytes are not copied.
 *
 * @throws SchemaError when a field is missing or has the wrong type.
 */
export function normaliseRawFrame(input: unknown, path = 'frame'): RawFrame {
  return parseRawFrame(input, path);
}

/**
 * A raw frame holding a copy of `bytes`, so a transport that reuses its buffer can't change a
 * recorded frame. The recorder makes frames through `RecordingSequence.frame()`, which assigns
 * `seq`.
 *
 * @throws SchemaError on a malformed input (a programming error, like a NaN time).
 */
export function createRawFrame(
  recordingId: Id,
  seq: number,
  tMs: number,
  source: CharacteristicName,
  bytes: Uint8Array,
): RawFrame {
  // Checked before copying: `new Uint8Array(x)` turns anything that isn't array-like into an
  // empty array, which would record a frame with no bytes.
  if (!(bytes instanceof Uint8Array)) {
    throw new SchemaError('frame.bytes', 'expected a Uint8Array');
  }
  return normaliseRawFrame({ recordingId, seq, tMs, source, bytes: new Uint8Array(bytes) });
}
