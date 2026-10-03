/**
 * Frame layouts and the decoder. This is the only code that knows where fields sit in a frame.
 * Offsets are 0-based; the spec's byte table counts from 1 (docs/protocol-notes.md).
 *
 * The raw layer stores notification bytes verbatim and everything here is derived from them
 * (D-004), so a fix to this decoder applies retroactively to every recording.
 */

import { hasValidChecksum, xorChecksum } from './checksum';

/** Byte 0 of every frame: the product number. */
export const PRODUCT_BYTE = 0x03;

/** Byte 1 of every frame: its type. */
export const FRAME_TYPE = {
  /** App to scale. Only `commands.ts` builds these. */
  command: 0x0a,
  /** Weight notification, about 10–20 per second. */
  weight: 0x0b,
  /** Event, documented for the Ultra only (spec "Likely additional frame — 03 0D"). */
  event: 0x0d,
  /** Powder weight, documented for the Ultra only. */
  powder: 0x0f,
} as const;

export const COMMAND_FRAME_LENGTH = 6;
/** Weight, event and powder frames are all 20 bytes. */
export const NOTIFICATION_FRAME_LENGTH = 20;
/** Product, type and checksum: anything shorter can't be a frame. */
const MIN_FRAME_LENGTH = 3;

/**
 * Unit byte values that mean grams (D-005). `0x01` is the Ultra doc's value; hardware test A9
 * confirms the Mini's. Frames with any other value decode with `unitOk: false`.
 */
export const GRAM_UNIT_BYTES: readonly number[] = [0x01];

/**
 * Sign bytes are probably ASCII `+` and `-` (protocol-notes, finding 3). Any other value is
 * reported as unknown instead of guessed; hardware test A10 settles it.
 */
export const SIGN_POSITIVE = 0x2b;
export const SIGN_NEGATIVE = 0x2d;

/** Largest magnitudes the fields can carry (u24 and u16). */
export const U24_MAX = 0xffffff;
export const U16_MAX = 0xffff;

/**
 * `03 0B`, the weight notification. Each signed quantity comes as its sign byte, the unsigned
 * integer the scale sent, and the decoded value. When a sign byte isn't recognised the value is
 * the unsigned magnitude and `...SignKnown` is false: check `hasTrustedWeight()` before using
 * `weightG`.
 */
export interface WeightFrame {
  readonly kind: 'weight';
  /** The scale's stopwatch, not a clock: zero until started, frozen after a stop (D-006). */
  readonly timerMs: number;
  readonly unitByte: number;
  /** Whether `unitByte` is in `GRAM_UNIT_BYTES`. Refuse the weight loudly if not (D-005). */
  readonly unitOk: boolean;
  readonly weightSignByte: number;
  readonly weightSignKnown: boolean;
  /** Weight × 100, unsigned. */
  readonly weightRaw: number;
  readonly weightG: number;
  readonly flowSignByte: number;
  readonly flowSignKnown: boolean;
  /** Flow × 100, unsigned. */
  readonly flowRaw: number;
  /** The scale's own flow figure. Recorded, never used: the app derives its own flow. */
  readonly flowGps: number;
  readonly batteryPct: number;
  /** Standby time, minutes × 10. */
  readonly standbyRaw: number;
  readonly standbyMin: number;
  readonly buzzerGear: number;
  /** `0` off, `1` on. The recorder turns it off and confirms it here (spec parsing rule 5). */
  readonly flowSmoothing: number;
  /** Documented as `00`. */
  readonly reserved: number;
}

export type EventState = 'stopped' | 'started' | 'ready' | 'exit-ready' | 'exit-done';

/** Event state names, indexed by the state byte. */
const EVENT_STATES: readonly EventState[] = [
  'stopped',
  'started',
  'ready',
  'exit-ready',
  'exit-done',
];

/**
 * `03 0D`, decoded with the Ultra's layout. That layout is tentative for the Mini, and which
 * characteristic carries it is unknown (protocol-notes, finding 8).
 */
export interface EventFrame {
  readonly kind: 'event';
  readonly stateByte: number;
  /** null when the state byte isn't one of the documented values. */
  readonly state: EventState | null;
  readonly timerMs: number;
  readonly weightSignByte: number;
  readonly weightSignKnown: boolean;
  readonly weightRaw: number;
  readonly weightG: number;
  readonly resultSignByte: number;
  readonly resultSignKnown: boolean;
  readonly resultRaw: number;
  /** Average flow in g/s in timing mode, or the brew ratio in ratio mode (Ultra doc). */
  readonly result: number;
}

/** `03 0F`, the powder weight, decoded with the Ultra's layout (tentative). */
export interface PowderFrame {
  readonly kind: 'powder';
  readonly powderSignByte: number;
  readonly powderSignKnown: boolean;
  readonly powderRaw: number;
  readonly powderG: number;
}

/** A frame with a valid checksum whose header has no known layout. */
export interface UnknownFrame {
  readonly kind: 'unknown';
  readonly productByte: number;
  readonly typeByte: number;
  readonly length: number;
}

/**
 * A frame that failed validation. Analysis and the live display drop these (spec parsing
 * rule 1); the recorder stores them anyway (D-004) and counts them for the alarm.
 *
 * - `length`: a known header with the wrong length (whatever its checksum), or too short to be
 *   a frame at all.
 * - `checksum`: the last byte isn't the XOR of the others.
 */
export interface InvalidFrame {
  readonly kind: 'invalid';
  readonly reason: 'length' | 'checksum';
  readonly length: number;
}

export type DecodedFrame = WeightFrame | EventFrame | PowderFrame | UnknownFrame | InvalidFrame;

/**
 * Decodes one notification. Never throws: whatever the bytes, the result is one of the
 * `DecodedFrame` kinds. A recognised header is length-checked before the checksum, so a
 * truncated weight frame reports `length` rather than a misleading `checksum`.
 */
export function decodeFrame(bytes: Uint8Array): DecodedFrame {
  const length = bytes.length;
  if (length < MIN_FRAME_LENGTH) return { kind: 'invalid', reason: 'length', length };
  const layout = bytes[0] === PRODUCT_BYTE ? LAYOUTS.get(bytes[1]) : undefined;
  if (layout && length !== layout.length) return { kind: 'invalid', reason: 'length', length };
  if (!hasValidChecksum(bytes)) return { kind: 'invalid', reason: 'checksum', length };
  if (!layout) return { kind: 'unknown', productByte: bytes[0], typeByte: bytes[1], length };
  return layout.decode(bytes);
}

/**
 * Whether a weight frame's `weightG` can be used as grams: the unit byte is a gram value and
 * the sign byte is recognised. Live and analysis code refuse other frames loudly (D-005, D-014).
 */
export function hasTrustedWeight(frame: WeightFrame): boolean {
  return frame.unitOk && frame.weightSignKnown;
}

interface Layout {
  readonly length: number;
  readonly decode: (bytes: Uint8Array) => DecodedFrame;
}

const LAYOUTS: ReadonlyMap<number, Layout> = new Map<number, Layout>([
  [FRAME_TYPE.weight, { length: NOTIFICATION_FRAME_LENGTH, decode: decodeWeight }],
  [FRAME_TYPE.event, { length: NOTIFICATION_FRAME_LENGTH, decode: decodeEvent }],
  [FRAME_TYPE.powder, { length: NOTIFICATION_FRAME_LENGTH, decode: decodePowder }],
]);

function decodeWeight(b: Uint8Array): WeightFrame {
  const weightRaw = u24(b, 7);
  const flowRaw = u16(b, 11);
  const standbyRaw = u16(b, 14);
  return {
    kind: 'weight',
    timerMs: u24(b, 2),
    unitByte: b[5],
    unitOk: GRAM_UNIT_BYTES.includes(b[5]),
    weightSignByte: b[6],
    weightSignKnown: signOf(b[6]) !== null,
    weightRaw,
    weightG: applySign(b[6], weightRaw, 100),
    flowSignByte: b[10],
    flowSignKnown: signOf(b[10]) !== null,
    flowRaw,
    flowGps: applySign(b[10], flowRaw, 100),
    batteryPct: b[13],
    standbyRaw,
    standbyMin: standbyRaw / 10,
    buzzerGear: b[16],
    flowSmoothing: b[17],
    reserved: b[18],
  };
}

function decodeEvent(b: Uint8Array): EventFrame {
  const weightRaw = u24(b, 7);
  const resultRaw = u16(b, 11);
  return {
    kind: 'event',
    stateByte: b[2],
    state: EVENT_STATES[b[2]] ?? null,
    timerMs: u24(b, 3),
    weightSignByte: b[6],
    weightSignKnown: signOf(b[6]) !== null,
    weightRaw,
    weightG: applySign(b[6], weightRaw, 100),
    resultSignByte: b[10],
    resultSignKnown: signOf(b[10]) !== null,
    resultRaw,
    result: applySign(b[10], resultRaw, 100),
  };
}

function decodePowder(b: Uint8Array): PowderFrame {
  const powderRaw = u24(b, 3);
  return {
    kind: 'powder',
    powderSignByte: b[2],
    powderSignKnown: signOf(b[2]) !== null,
    powderRaw,
    powderG: applySign(b[2], powderRaw, 100),
  };
}

/** Physical values for one weight frame. Optional fields default to a plausible idle scale. */
export interface WeightFrameInput {
  /** The scale's stopwatch (D-006): integer milliseconds, 0 to `U24_MAX`. */
  timerMs: number;
  /** Grams, rounded to 0.01 g like the scale's resolution. */
  weightG: number;
  /** g/s, rounded to 0.01. Default 0. */
  flowGps?: number;
  /** Default `GRAM_UNIT_BYTES[0]`. */
  unitByte?: number;
  /** Overrides the sign byte, for example to simulate an unrecognised one. */
  weightSignByte?: number;
  flowSignByte?: number;
  /** Default 100. */
  batteryPct?: number;
  /** Minutes, rounded to 0.1. Default 5. */
  standbyMin?: number;
  /** Default 0. */
  buzzerGear?: number;
  /** Default 0 (off). */
  flowSmoothing?: number;
  /** Default 0. */
  reserved?: number;
}

/**
 * Builds a 20-byte weight frame with a valid checksum: the inverse of `decodeFrame` for
 * `03 0B`. Used by the simulator and tests; the app never sends weight frames.
 *
 * @throws RangeError when a value doesn't fit its field. Nothing is silently truncated.
 */
export function encodeWeightFrame(input: WeightFrameInput): Uint8Array<ArrayBuffer> {
  const fn = 'encodeWeightFrame';
  const weight = toSignedField(fn, 'weightG', input.weightG, U24_MAX, input.weightSignByte);
  const flow = toSignedField(fn, 'flowGps', input.flowGps ?? 0, U16_MAX, input.flowSignByte);
  const standbyMin = input.standbyMin ?? 5;
  if (!Number.isFinite(standbyMin) || standbyMin < 0) {
    throw new RangeError(`${fn}: standbyMin ${standbyMin} is not a duration`);
  }
  const standbyRaw = checkInt(fn, 'standbyMin × 10', Math.round(standbyMin * 10), U16_MAX);

  const b = new Uint8Array(NOTIFICATION_FRAME_LENGTH);
  b[0] = PRODUCT_BYTE;
  b[1] = FRAME_TYPE.weight;
  putU24(b, 2, checkInt(fn, 'timerMs', input.timerMs, U24_MAX));
  b[5] = checkInt(fn, 'unitByte', input.unitByte ?? GRAM_UNIT_BYTES[0], 0xff);
  b[6] = weight.signByte;
  putU24(b, 7, weight.raw);
  b[10] = flow.signByte;
  putU16(b, 11, flow.raw);
  b[13] = checkInt(fn, 'batteryPct', input.batteryPct ?? 100, 0xff);
  putU16(b, 14, standbyRaw);
  b[16] = checkInt(fn, 'buzzerGear', input.buzzerGear ?? 0, 0xff);
  b[17] = checkInt(fn, 'flowSmoothing', input.flowSmoothing ?? 0, 0xff);
  b[18] = checkInt(fn, 'reserved', input.reserved ?? 0, 0xff);
  b[19] = xorChecksum(b.subarray(0, 19));
  return b;
}

/** Values for one `03 0D` event frame, in the Ultra's layout (tentative on the Mini). */
export interface EventFrameInput {
  /** `0` stopped, `1` started, `2` ready, `3` exit ready, `4` exit done. */
  stateByte: number;
  /** The scale's stopwatch: integer milliseconds, 0 to `U24_MAX`. */
  timerMs: number;
  /** Grams, rounded to 0.01. */
  weightG: number;
  /** Average flow (timing mode) or ratio (ratio mode), rounded to 0.01. Default 0. */
  result?: number;
}

/**
 * Builds a 20-byte `03 0D` event frame with a valid checksum: the inverse of `decodeFrame` for
 * it. The simulator uses it to stand in for the timer events the Mini may send (protocol-notes,
 * finding 8); the app never sends these.
 *
 * @throws RangeError when a value doesn't fit its field.
 */
export function encodeEventFrame(input: EventFrameInput): Uint8Array<ArrayBuffer> {
  const fn = 'encodeEventFrame';
  const weight = toSignedField(fn, 'weightG', input.weightG, U24_MAX, undefined);
  const result = toSignedField(fn, 'result', input.result ?? 0, U16_MAX, undefined);

  const b = new Uint8Array(NOTIFICATION_FRAME_LENGTH);
  b[0] = PRODUCT_BYTE;
  b[1] = FRAME_TYPE.event;
  b[2] = checkInt(fn, 'stateByte', input.stateByte, 0xff);
  putU24(b, 3, checkInt(fn, 'timerMs', input.timerMs, U24_MAX));
  b[6] = weight.signByte;
  putU24(b, 7, weight.raw);
  b[10] = result.signByte;
  putU16(b, 11, result.raw);
  // Bytes 13–18 are documented as 00.
  b[19] = xorChecksum(b.subarray(0, 19));
  return b;
}

function signOf(signByte: number): 1 | -1 | null {
  if (signByte === SIGN_POSITIVE) return 1;
  if (signByte === SIGN_NEGATIVE) return -1;
  return null;
}

/** raw / scale with the sign applied. An unknown sign leaves the magnitude; zero is never -0. */
function applySign(signByte: number, raw: number, scale: number): number {
  if (raw === 0) return 0;
  return ((signOf(signByte) ?? 1) * raw) / scale;
}

/** A signed quantity as its sign byte and its magnitude × 100, the layout every frame uses. */
function toSignedField(
  fn: string,
  name: string,
  value: number,
  max: number,
  signByteOverride: number | undefined,
): { signByte: number; raw: number } {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${fn}: ${name} ${value} is not a finite number`);
  }
  const scaled = Math.round(value * 100);
  const raw = checkInt(fn, `|${name}| × 100`, Math.abs(scaled), max);
  const signByte =
    signByteOverride === undefined
      ? scaled < 0
        ? SIGN_NEGATIVE
        : SIGN_POSITIVE
      : checkInt(fn, `${name} sign byte`, signByteOverride, 0xff);
  return { signByte, raw };
}

function checkInt(fn: string, name: string, value: number, max: number): number {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new RangeError(`${fn}: ${name} ${value} is not an integer in 0–${max}`);
  }
  return value;
}

function u24(b: Uint8Array, at: number): number {
  return (b[at] << 16) | (b[at + 1] << 8) | b[at + 2];
}

function u16(b: Uint8Array, at: number): number {
  return (b[at] << 8) | b[at + 1];
}

function putU24(b: Uint8Array, at: number, value: number): void {
  b[at] = value >>> 16;
  b[at + 1] = (value >>> 8) & 0xff;
  b[at + 2] = value & 0xff;
}

function putU16(b: Uint8Array, at: number, value: number): void {
  b[at] = value >>> 8;
  b[at + 1] = value & 0xff;
}
