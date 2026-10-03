/**
 * Record ids: UUIDv7 strings (RFC 9562) in lower case, like
 * `01923456-789a-7c3d-9e8f-0a1b2c3d4e5f` (D-017).
 *
 * - The first 48 bits are the creation time in epoch ms, so ids sort by creation time as plain
 *   strings.
 * - The 12 bits after the version digit are a counter (RFC 9562 §6.2, method 1). Ids from one
 *   generator are therefore strictly increasing, even within one millisecond or when the clock
 *   steps back.
 * - The last 62 bits are random, from `crypto.getRandomValues`.
 */

import { toHex } from '../protocol';

export type Id = string;

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** The largest timestamp 48 bits hold: a date in the year 10889. */
const MAX_TIMESTAMP_MS = 2 ** 48 - 1;
const COUNTER_MAX = 0xfff;
/**
 * A new millisecond seeds the counter below `0x800`, so at least 2048 more ids fit in that
 * millisecond before the counter overflows.
 */
const COUNTER_SEED_MASK = 0x7ff;

export interface IdGeneratorOptions {
  /** The clock, in epoch ms. Default `Date.now()`. */
  readonly now?: () => number;
  /** Fills the array with random bytes. Default `crypto.getRandomValues`. */
  readonly fillRandom?: (bytes: Uint8Array<ArrayBuffer>) => void;
}

/**
 * Returns a function that makes ids. Each generator keeps its own counter, so only ids from the
 * same generator are guaranteed to be in creation order within a millisecond.
 *
 * When the counter overflows (4096 ids in one millisecond), the generator moves on to the next
 * millisecond early, as RFC 9562 allows.
 *
 * @throws RangeError from the returned function if the clock reads a time a UUIDv7 can't hold.
 */
export function createIdGenerator(options: IdGeneratorOptions = {}): () => Id {
  const now = options.now ?? (() => Date.now());
  const fillRandom =
    options.fillRandom ??
    ((bytes: Uint8Array<ArrayBuffer>) => {
      crypto.getRandomValues(bytes);
    });
  // Bytes 0–1 seed the counter; bytes 2–9 are the random tail.
  const random = new Uint8Array(10);
  let lastMs = -1;
  let counter = 0;

  return () => {
    const ms = Math.floor(now());
    if (!(ms >= 0 && ms <= MAX_TIMESTAMP_MS)) {
      throw new RangeError(`createIdGenerator: the clock read ${ms}, outside 0 to 2^48 - 1 ms`);
    }
    fillRandom(random);
    const seed = ((random[0] << 8) | random[1]) & COUNTER_SEED_MASK;
    if (ms > lastMs) {
      lastMs = ms;
      counter = seed;
    } else if (counter < COUNTER_MAX) {
      counter++;
    } else if (lastMs < MAX_TIMESTAMP_MS) {
      lastMs++;
      counter = seed;
    } else {
      throw new RangeError('createIdGenerator: no ids left at the last representable millisecond');
    }
    return format(lastMs, counter, random.subarray(2));
  };
}

const defaultGenerator = createIdGenerator();

/** A new id from the shared generator (the system clock and `crypto.getRandomValues`). */
export function newId(): Id {
  return defaultGenerator();
}

/** Whether `value` is an id in this module's format: a lower-case UUIDv7 string. */
export function isId(value: unknown): value is Id {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

/** When the id was created, in epoch ms (its first 48 bits). */
export function idTimestampMs(id: Id): number {
  assertId(id, 'idTimestampMs');
  return parseInt(id.slice(0, 8) + id.slice(9, 13), 16);
}

/**
 * The last 8 hex digits of an id, for display and file names. Use these and not the first 8:
 * those are timestamp bits, shared by every id created within about 65 seconds.
 */
export function shortId(id: Id): string {
  assertId(id, 'shortId');
  return id.slice(-8);
}

function assertId(id: Id, caller: string): void {
  if (!isId(id)) {
    throw new TypeError(`${caller}: ${JSON.stringify(id)} is not an id (a lower-case UUIDv7)`);
  }
}

function format(ms: number, counter: number, tail: Uint8Array): Id {
  const b = new Uint8Array(16);
  // 48-bit big-endian timestamp. Division, not bit shifts: shifts would truncate to 32 bits.
  let t = ms;
  for (let i = 5; i >= 0; i--) {
    b[i] = t % 256;
    t = Math.floor(t / 256);
  }
  b[6] = 0x70 | (counter >> 8);
  b[7] = counter & 0xff;
  b.set(tail, 8);
  b[8] = 0x80 | (b[8] & 0x3f);
  const hex = toHex(b, '').toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
