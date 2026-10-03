import { describe, expect, it } from 'vitest';
import { hasValidChecksum, xorChecksum } from './checksum';
import { fromHex } from './hex';

describe('xorChecksum', () => {
  // Every pre-computed command in the spec's table, including the two the app must never send:
  // the checksum function itself has to agree with the spec on all of them.
  it.each([
    ['03 0A 01 00 00', 0x08],
    ['03 0A 04 00 00', 0x0d],
    ['03 0A 05 00 00', 0x0c],
    ['03 0A 06 00 00', 0x0f],
    ['03 0A 07 00 00', 0x0e],
    ['03 0A 08 00 00', 0x01],
    ['03 0A 09 00 00', 0x00],
    ['03 0A 15 00 00', 0x1c],
    ['03 0A 25 00 00', 0x2c],
  ])('XOR of %s is the spec value', (hex, expected) => {
    expect(xorChecksum(fromHex(hex))).toBe(expected);
  });

  it('is 0 for no bytes', () => {
    expect(xorChecksum([])).toBe(0);
  });
});

describe('hasValidChecksum', () => {
  it('accepts a frame whose last byte is the XOR of the rest', () => {
    expect(hasValidChecksum(fromHex('03 0A 01 00 00 08'))).toBe(true);
  });

  it('rejects a frame with a wrong last byte', () => {
    expect(hasValidChecksum(fromHex('03 0A 01 00 00 09'))).toBe(false);
  });

  it('catches any single flipped bit', () => {
    const frame = fromHex('03 0B 01 26 24 01 2B 00 0E 44 2B 01 41 57 00 32 03 00 00 66');
    expect(hasValidChecksum(frame)).toBe(true);
    for (let i = 0; i < frame.length; i++) {
      for (let bit = 0; bit < 8; bit++) {
        const corrupt = frame.slice();
        corrupt[i] ^= 1 << bit;
        expect(hasValidChecksum(corrupt)).toBe(false);
      }
    }
  });

  it('rejects frames too short to hold a checksum and a byte', () => {
    expect(hasValidChecksum(new Uint8Array(0))).toBe(false);
    expect(hasValidChecksum(new Uint8Array([0x00]))).toBe(false);
  });

  // Doc revisions before 2026-07-30 showed byte 19 of the weight frame as 00 (protocol-notes,
  // finding 6). Such frames must fail, so the failure alarm can see them.
  it('rejects a weight frame with a zero checksum byte', () => {
    expect(
      hasValidChecksum(fromHex('03 0B 01 26 24 01 2B 00 0E 44 2B 01 41 57 00 32 03 00 00 00')),
    ).toBe(false);
  });
});
