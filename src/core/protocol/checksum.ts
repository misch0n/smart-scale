/**
 * Every BOOKOO frame ends in one checksum byte: the XOR of all the bytes before it. That covers
 * 6-byte commands and 20-byte notifications alike.
 */

/** XOR of all the given bytes. */
export function xorChecksum(bytes: ArrayLike<number>): number {
  let xor = 0;
  for (let i = 0; i < bytes.length; i++) xor ^= bytes[i];
  return xor & 0xff;
}

/**
 * True when the last byte equals the XOR of all the bytes before it. A frame needs at least one
 * byte besides the checksum, so anything shorter is never valid.
 */
export function hasValidChecksum(frame: Uint8Array): boolean {
  if (frame.length < 2) return false;
  return xorChecksum(frame.subarray(0, frame.length - 1)) === frame[frame.length - 1];
}
