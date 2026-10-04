import { describe, expect, it } from 'vitest';
import { base64ToUtf8, canonicalJson, sha256Hex, utf8ToBase64 } from './encoding';

describe('base64', () => {
  it('encodes UTF-8, as GitHub expects', () => {
    expect(utf8ToBase64('')).toBe('');
    expect(utf8ToBase64('Crème')).toBe('Q3LDqG1l'); // C r 0xC3 0xA8 m e
  });

  it('round-trips any text, longer than one chunk too', () => {
    const text = `${'☕ 18 g → 36 g, 0x30 '.repeat(5000)}\u2028end`;
    expect(base64ToUtf8(utf8ToBase64(text))).toBe(text);
  });

  it('ignores line breaks, and refuses bytes that are not UTF-8', () => {
    expect(base64ToUtf8('Q3LDqG1l\n')).toBe('Crème');
    expect(() => base64ToUtf8(btoa(String.fromCharCode(0xff, 0xfe)))).toThrow();
  });
});

describe('sha256Hex', () => {
  it('hashes UTF-8 text', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('canonicalJson', () => {
  it('sorts keys at every depth, and keeps array order', () => {
    expect(canonicalJson({ b: 1, a: [{ d: null, c: 'x' }, 2] })).toBe(
      '{"a":[{"c":"x","d":null},2],"b":1}',
    );
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });
});
