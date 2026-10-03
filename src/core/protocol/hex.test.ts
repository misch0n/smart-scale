import { describe, expect, it } from 'vitest';
import { fromHex, toHex } from './hex';

describe('toHex', () => {
  it('writes upper-case byte pairs separated by spaces, like the docs', () => {
    expect(toHex(new Uint8Array([0x03, 0x0a, 0x01, 0x00, 0x00, 0x08]))).toBe('03 0A 01 00 00 08');
  });

  it('takes any separator, including none', () => {
    expect(toHex([0xff, 0x00, 0x7f], '')).toBe('FF007F');
    expect(toHex([0xff, 0x00], ':')).toBe('FF:00');
  });

  it('returns an empty string for no bytes', () => {
    expect(toHex(new Uint8Array(0))).toBe('');
  });
});

describe('fromHex', () => {
  it('parses spaced, packed and mixed-case hex', () => {
    const expected = [0x03, 0x0a, 0x01, 0x00];
    expect([...fromHex('03 0A 01 00')]).toEqual(expected);
    expect([...fromHex('030a0100')]).toEqual(expected);
    expect([...fromHex('  030A\n0100 ')]).toEqual(expected);
  });

  it('returns no bytes for an empty or blank string', () => {
    expect(fromHex('')).toHaveLength(0);
    expect(fromHex('   ')).toHaveLength(0);
  });

  it('rejects odd-length groups instead of re-pairing the digits', () => {
    expect(() => fromHex('3 A')).toThrow(SyntaxError);
    expect(() => fromHex('030')).toThrow(SyntaxError);
  });

  it('rejects non-hex characters and prefixes', () => {
    expect(() => fromHex('0G')).toThrow(SyntaxError);
    expect(() => fromHex('0x03')).toThrow(SyntaxError);
    expect(() => fromHex('03,0A')).toThrow(SyntaxError);
  });

  it('round-trips every byte value', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(fromHex(toHex(all))).toEqual(all);
    expect(fromHex(toHex(all, ''))).toEqual(all);
  });
});
