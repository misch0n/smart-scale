import { describe, expect, it } from 'vitest';
import { createIdGenerator, idTimestampMs, isId, newId, shortId } from './ids';

const T = 0x0192_3456_789a;

/** A clock that reads the given values in turn, then keeps reading the last one. */
function clock(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

const zeros = (bytes: Uint8Array) => {
  bytes.fill(0);
};

/** Deterministic random bytes (xorshift32), so tests that need distinct bytes are repeatable. */
function seededRandom(seed: number): (bytes: Uint8Array) => void {
  let x = seed;
  return (bytes) => {
    for (let i = 0; i < bytes.length; i++) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      bytes[i] = x & 0xff;
    }
  };
}

function isStrictlyIncreasing(ids: readonly string[]): boolean {
  return ids.every((id, i) => i === 0 || ids[i - 1] < id);
}

describe('id layout', () => {
  it('is a UUIDv7: timestamp, version 7, counter, variant 10, random tail', () => {
    const next = createIdGenerator({ now: () => T, fillRandom: zeros });
    expect(next()).toBe('01923456-789a-7000-8000-000000000000');
    expect(next()).toBe('01923456-789a-7001-8000-000000000000');
  });

  it('keeps the version and variant bits whatever the random bytes are', () => {
    const next = createIdGenerator({ now: () => T, fillRandom: (b) => b.fill(0xff) });
    // The counter is seeded from 11 random bits (0x7ff), and the tail's top two bits are 10.
    expect(next()).toBe('01923456-789a-77ff-bfff-ffffffffffff');
  });

  it('reads the creation time back', () => {
    const next = createIdGenerator({ now: () => 1_791_043_200_123.9 });
    expect(idTimestampMs(next())).toBe(1_791_043_200_123);
  });

  it('agrees with the RFC 9562 example', () => {
    // RFC 9562 Appendix A.6: 017F22E2-79B0-7CC3-98C4-DC0C0C07398F, made 2022-02-22 19:22:22 UTC.
    const example = '017f22e2-79b0-7cc3-98c4-dc0c0c07398f';
    expect(isId(example)).toBe(true);
    expect(idTimestampMs(example)).toBe(Date.UTC(2022, 1, 22, 19, 22, 22));
  });

  it.each([NaN, -1, Infinity, 2 ** 48])('refuses a clock reading of %s', (reading) => {
    const next = createIdGenerator({ now: () => reading });
    expect(() => next()).toThrow(RangeError);
  });
});

describe('ordering', () => {
  it('is strictly increasing within one millisecond, past the 4096-id counter', () => {
    const next = createIdGenerator({ now: () => T, fillRandom: zeros });
    const ids = Array.from({ length: 10_000 }, next);
    expect(isStrictlyIncreasing(ids)).toBe(true);
    // The counter starts at 0 here, so the 4097th id borrows the next millisecond.
    expect(idTimestampMs(ids[4095])).toBe(T);
    expect(idTimestampMs(ids[4096])).toBe(T + 1);
    expect(idTimestampMs(ids[9999])).toBe(T + 2);
  });

  it('stays increasing when the clock steps back, then follows it forward again', () => {
    const next = createIdGenerator({ now: clock(T, T - 500, T - 500, T + 10), fillRandom: zeros });
    const ids = [next(), next(), next(), next()];
    expect(isStrictlyIncreasing(ids)).toBe(true);
    expect(ids.map(idTimestampMs)).toEqual([T, T, T, T + 10]);
  });

  it('reseeds the counter each new millisecond, so ids are hard to guess', () => {
    const next = createIdGenerator({ now: clock(T, T + 1, T + 2), fillRandom: seededRandom(7) });
    const counters = [next(), next(), next()].map((id) => id.slice(15, 18));
    expect(new Set(counters).size).toBe(3);
  });

  it('sorts as strings in creation order with the default generator', () => {
    const ids = Array.from({ length: 2000 }, newId);
    expect(ids.every(isId)).toBe(true);
    expect(isStrictlyIncreasing(ids)).toBe(true);
  });

  it('draws the tail from crypto.getRandomValues by default', () => {
    const a = createIdGenerator({ now: () => T });
    const b = createIdGenerator({ now: () => T });
    expect(a().slice(19)).not.toBe(b().slice(19));
  });
});

describe('isId', () => {
  it('accepts generated ids', () => {
    expect(isId(newId())).toBe(true);
  });

  it.each([
    ['upper case', '01923456-789A-7000-8000-000000000000'],
    ['a UUIDv4', '550e8400-e29b-41d4-a716-446655440000'],
    ['the wrong variant', '01923456-789a-7000-c000-000000000000'],
    ['no dashes', '01923456789a70008000000000000000'],
    ['too short', '01923456-789a-7000-8000-00000000000'],
    ['empty', ''],
  ])('rejects %s', (_, value) => {
    expect(isId(value)).toBe(false);
  });

  it.each([null, undefined, 42, {}])('rejects %s', (value) => {
    expect(isId(value)).toBe(false);
  });
});

describe('shortId', () => {
  it('is the last 8 hex digits, the random ones', () => {
    expect(shortId('01923456-789a-7000-8000-0000deadbeef')).toBe('deadbeef');
  });

  it('tells apart ids made in the same minute, unlike their first 8 digits', () => {
    const next = createIdGenerator({ now: clock(T, T + 30_000), fillRandom: seededRandom(1) });
    const [a, b] = [next(), next()];
    expect(a.slice(0, 8)).toBe(b.slice(0, 8));
    expect(shortId(a)).not.toBe(shortId(b));
  });

  it('refuses a non-id, as idTimestampMs does', () => {
    expect(() => shortId('not-an-id')).toThrow(TypeError);
    expect(() => idTimestampMs('not-an-id')).toThrow(TypeError);
  });
});
