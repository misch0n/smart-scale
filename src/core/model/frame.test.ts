import { describe, expect, it } from 'vitest';
import { decodeFrame, encodeWeightFrame, fromHex } from '../protocol';
import { createRawFrame, normaliseRawFrame } from './frame';
import { SchemaError } from './schema';

const REC = '01923456-789a-7000-8000-000000000001';

describe('createRawFrame', () => {
  it('holds a copy of the bytes, so a reused transport buffer cannot change it', () => {
    const buffer = encodeWeightFrame({ timerMs: 1200, weightG: 18.5 });
    const frame = createRawFrame(REC, 0, 12.5, 'ff11', buffer);
    buffer.fill(0);
    expect(frame.bytes).not.toBe(buffer);
    expect(decodeFrame(frame.bytes)).toMatchObject({ kind: 'weight', weightG: 18.5 });
  });

  // D-004: frames are stored as they arrived, whatever the decoder makes of them.
  it.each([
    ['empty', ''],
    ['too short', '03 0B'],
    ['a bad checksum', '03 0A 01 00 00 00'],
    ['an unknown header', '05 01 04'],
    ['over-long', '03 0B 00 00 00 01 2B 00 07 08 2B 00 00 64 00 32 00 00 00 00 00'],
  ])('keeps a frame that is %s', (_, hex) => {
    const bytes = fromHex(hex);
    expect(createRawFrame(REC, 3, 0, 'ff12', bytes).bytes).toEqual(bytes);
  });

  it('refuses bytes that are not a Uint8Array', () => {
    const view = new DataView(new ArrayBuffer(4));
    expect(() => createRawFrame(REC, 0, 0, 'ff11', view as unknown as Uint8Array)).toThrow(
      SchemaError,
    );
  });

  it.each([
    ['a NaN time', REC, 0, NaN, 'ff11', 'frame.tMs'],
    ['a negative seq', REC, -1, 0, 'ff11', 'frame.seq'],
    ['a fractional seq', REC, 1.5, 0, 'ff11', 'frame.seq'],
    ['an unknown source', REC, 0, 0, 'ff13', 'frame.source'],
    ['a malformed recording id', 'rec-1', 0, 0, 'ff11', 'frame.recordingId'],
  ])('refuses %s', (_, recordingId, seq, tMs, source, path) => {
    expect(() =>
      createRawFrame(recordingId, seq, tMs, source as 'ff11', new Uint8Array(1)),
    ).toThrow(`${path}:`);
  });
});

describe('normaliseRawFrame', () => {
  it('drops unknown keys', () => {
    const frame = createRawFrame(REC, 0, 1, 'ff11', new Uint8Array([1]));
    expect(normaliseRawFrame({ ...frame, decoded: { weightG: 1 } })).toEqual(frame);
  });
});
