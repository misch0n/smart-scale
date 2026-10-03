/**
 * Hex helpers for logs, the probe display, tests and the export format. The default output,
 * upper case with spaces (`03 0A 01 00 00 08`), matches how the spec and docs write bytes, so
 * what the probe shows can be compared with the docs by eye.
 */

const HEX_DIGITS = /^[0-9a-fA-F]*$/;

/** Formats bytes as two-digit upper-case hex, joined by `separator` (a space by default). */
export function toHex(bytes: ArrayLike<number>, separator = ' '): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    parts.push((bytes[i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  }
  return parts.join(separator);
}

/**
 * Parses hex in either case. Whitespace may separate groups, and each group must have an even
 * number of digits, so `03 0A`, `030a` and `030A 0100` all parse, while `3 A` is rejected
 * rather than read as `3A`.
 *
 * @throws SyntaxError on anything else.
 */
export function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const groups = hex.trim().split(/\s+/).filter(Boolean);
  for (const group of groups) {
    if (group.length % 2 !== 0 || !HEX_DIGITS.test(group)) {
      throw new SyntaxError(`fromHex: "${group}" is not whole bytes of hex in "${hex}"`);
    }
  }
  const digits = groups.join('');
  const bytes = new Uint8Array(digits.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(digits.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
