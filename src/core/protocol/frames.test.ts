import { describe, expect, it } from 'vitest';
import { xorChecksum } from './checksum';
import {
  decodeFrame,
  encodeWeightFrame,
  GRAM_UNIT_BYTES,
  hasTrustedWeight,
  SIGN_NEGATIVE,
  SIGN_POSITIVE,
  U16_MAX,
  U24_MAX,
  type DecodedFrame,
  type EventFrame,
  type PowderFrame,
  type WeightFrame,
  type WeightFrameInput,
} from './frames';
import { fromHex, toHex } from './hex';

// Golden frames, laid out by hand from the 0-based table in docs/protocol-notes.md, so the
// decoder is checked against the documentation rather than against its own encoder.
//
// timer 75 300 ms (0x012624, above the 16-bit limit), unit 01, +36.52 g, +3.21 g/s, battery 87%,
// standby 5.0 min, buzzer gear 3, smoothing off, reserved 00.
const WEIGHT_POSITIVE = '03 0B 01 26 24 01 2B 00 0E 44 2B 01 41 57 00 32 03 00 00 66';
// timer 0, unit 01, -12.34 g, -0.05 g/s, battery 100%, standby 30.0 min, buzzer 0, smoothing on.
const WEIGHT_NEGATIVE = '03 0B 00 00 00 01 2D 00 04 D2 2D 00 05 64 01 2C 00 01 00 92';
// Ultra layout: state 01 (started), 28 450 ms, +36.10 g, result +1.27.
const EVENT_STARTED = '03 0D 01 00 6F 22 2B 00 0E 1A 2B 00 7F 00 00 00 00 00 00 29';
// Ultra layout: +18.00 g.
const POWDER = '03 0F 2B 00 07 08 00 00 00 00 00 00 00 00 00 00 00 00 00 28';

function decodeHex(hex: string): DecodedFrame {
  return decodeFrame(fromHex(hex));
}

function asWeight(frame: DecodedFrame): WeightFrame {
  if (frame.kind !== 'weight') throw new Error(`expected a weight frame, got ${frame.kind}`);
  return frame;
}

/** Sets byte `index` and recomputes the checksum. */
function withByte(hex: string, index: number, value: number): Uint8Array {
  const bytes = fromHex(hex);
  bytes[index] = value;
  bytes[bytes.length - 1] = xorChecksum(bytes.subarray(0, bytes.length - 1));
  return bytes;
}

/** Appends the XOR checksum to the given bytes. */
function sealed(bytes: number[]): Uint8Array {
  return Uint8Array.from([...bytes, xorChecksum(bytes)]);
}

/** Deterministic PRNG (mulberry32), so fuzz failures reproduce. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('decodeFrame: weight frames (03 0B)', () => {
  it('decodes every field of a positive frame', () => {
    expect(decodeHex(WEIGHT_POSITIVE)).toEqual({
      kind: 'weight',
      timerMs: 75_300,
      unitByte: 0x01,
      unitOk: true,
      weightSignByte: SIGN_POSITIVE,
      weightSignKnown: true,
      weightRaw: 3652,
      weightG: 36.52,
      flowSignByte: SIGN_POSITIVE,
      flowSignKnown: true,
      flowRaw: 321,
      flowGps: 3.21,
      batteryPct: 87,
      standbyRaw: 50,
      standbyMin: 5,
      buzzerGear: 3,
      flowSmoothing: 0,
      reserved: 0,
    });
  });

  it('applies negative signs to weight and flow', () => {
    expect(decodeHex(WEIGHT_NEGATIVE)).toMatchObject({
      kind: 'weight',
      timerMs: 0,
      weightSignByte: SIGN_NEGATIVE,
      weightSignKnown: true,
      weightRaw: 1234,
      weightG: -12.34,
      flowRaw: 5,
      flowGps: -0.05,
      batteryPct: 100,
      standbyRaw: 300,
      standbyMin: 30,
      flowSmoothing: 1,
    });
  });

  it('never returns -0 for a zero reading with a minus sign', () => {
    const zero = toHex(encodeWeightFrame({ timerMs: 0, weightG: 0 }));
    const frame = asWeight(decodeFrame(withByte(zero, 6, SIGN_NEGATIVE)));
    expect(frame.weightSignByte).toBe(SIGN_NEGATIVE);
    expect(Object.is(frame.weightG, 0)).toBe(true);
  });

  describe('unit byte (D-005)', () => {
    it('accepts the gram values', () => {
      expect(GRAM_UNIT_BYTES).toEqual([0x01]);
      expect(asWeight(decodeHex(WEIGHT_POSITIVE)).unitOk).toBe(true);
    });

    it.each([0x00, 0x02, 0xff])('flags unit byte %i but still decodes the frame', (unit) => {
      const frame = asWeight(decodeFrame(withByte(WEIGHT_POSITIVE, 5, unit)));
      expect(frame.unitByte).toBe(unit);
      expect(frame.unitOk).toBe(false);
      expect(frame.weightG).toBe(36.52);
      expect(hasTrustedWeight(frame)).toBe(false);
    });
  });

  describe('sign bytes (D-014)', () => {
    it.each([0x00, 0x01, 0x2c, 0xff])(
      'flags weight sign byte %i and keeps the magnitude',
      (sign) => {
        const frame = asWeight(decodeFrame(withByte(WEIGHT_NEGATIVE, 6, sign)));
        expect(frame.weightSignByte).toBe(sign);
        expect(frame.weightSignKnown).toBe(false);
        expect(frame.weightRaw).toBe(1234);
        expect(frame.weightG).toBe(12.34);
        expect(hasTrustedWeight(frame)).toBe(false);
      },
    );

    it('flags an unknown flow sign without distrusting the weight', () => {
      const frame = asWeight(decodeFrame(withByte(WEIGHT_POSITIVE, 10, 0x00)));
      expect(frame.flowSignKnown).toBe(false);
      expect(frame.flowGps).toBe(3.21);
      expect(hasTrustedWeight(frame)).toBe(true);
    });
  });
});

describe('decodeFrame: Ultra frames (tentative on the Mini)', () => {
  it('decodes an event frame (03 0D)', () => {
    expect(decodeHex(EVENT_STARTED)).toEqual<EventFrame>({
      kind: 'event',
      stateByte: 1,
      state: 'started',
      timerMs: 28_450,
      weightSignByte: SIGN_POSITIVE,
      weightSignKnown: true,
      weightRaw: 3610,
      weightG: 36.1,
      resultSignByte: SIGN_POSITIVE,
      resultSignKnown: true,
      resultRaw: 127,
      result: 1.27,
    });
  });

  it.each([
    [0, 'stopped'],
    [1, 'started'],
    [2, 'ready'],
    [3, 'exit-ready'],
    [4, 'exit-done'],
    [5, null],
    [0xff, null],
  ])('maps event state byte %i to %s', (stateByte, state) => {
    expect(decodeFrame(withByte(EVENT_STARTED, 2, stateByte))).toMatchObject({
      kind: 'event',
      stateByte,
      state,
    });
  });

  it('decodes a powder frame (03 0F)', () => {
    expect(decodeHex(POWDER)).toEqual<PowderFrame>({
      kind: 'powder',
      powderSignByte: SIGN_POSITIVE,
      powderSignKnown: true,
      powderRaw: 1800,
      powderG: 18,
    });
  });
});

describe('decodeFrame: invalid and unknown frames', () => {
  it('reports a bad checksum', () => {
    const bytes = fromHex(WEIGHT_POSITIVE);
    bytes[19] ^= 0x01;
    expect(decodeFrame(bytes)).toEqual({ kind: 'invalid', reason: 'checksum', length: 20 });
  });

  it('reports a bad checksum on an unknown header too', () => {
    expect(decodeHex('03 0E 01 02 FF')).toEqual({ kind: 'invalid', reason: 'checksum', length: 5 });
  });

  it.each([19, 21, 6])(
    'reports a %i-byte weight frame as wrong length, even with a valid checksum',
    (length) => {
      const body = [...fromHex(WEIGHT_POSITIVE).subarray(0, 19)];
      while (body.length < length - 1) body.push(0);
      const bytes = sealed(body.slice(0, length - 1));
      expect(decodeFrame(bytes)).toEqual({ kind: 'invalid', reason: 'length', length });
    },
  );

  it('reports a wrong-length event frame as wrong length', () => {
    const bytes = sealed([0x03, 0x0d, 0x01, 0x00, 0x6f, 0x22, 0x2b, 0x00, 0x0e, 0x1a]);
    expect(decodeFrame(bytes)).toEqual({ kind: 'invalid', reason: 'length', length: 11 });
  });

  it.each([0, 1, 2])('reports %i bytes as too short to be a frame', (length) => {
    expect(decodeFrame(new Uint8Array(length))).toEqual({
      kind: 'invalid',
      reason: 'length',
      length,
    });
  });

  it('reports an unknown type with a valid checksum as unknown', () => {
    expect(decodeFrame(sealed([0x03, 0x0e, 0x01, 0x02]))).toEqual({
      kind: 'unknown',
      productByte: 0x03,
      typeByte: 0x0e,
      length: 5,
    });
  });

  it('reports another product number as unknown, even with a weight-frame type', () => {
    const body = [...fromHex(WEIGHT_POSITIVE).subarray(0, 19)];
    body[0] = 0x04;
    expect(decodeFrame(sealed(body))).toEqual({
      kind: 'unknown',
      productByte: 0x04,
      typeByte: 0x0b,
      length: 20,
    });
  });

  it('reports a command frame echoed back as unknown', () => {
    expect(decodeHex('03 0A 01 00 00 08')).toEqual({
      kind: 'unknown',
      productByte: 0x03,
      typeByte: 0x0a,
      length: 6,
    });
  });

  it('never throws, whatever the bytes', () => {
    const random = prng(0x5ca1e);
    const byte = () => Math.floor(random() * 256);
    const kinds = new Set<string>();
    for (let i = 0; i < 20_000; i++) {
      const length = Math.floor(random() * 41);
      const bytes = Uint8Array.from({ length }, byte);
      // Steer most frames onto known headers with valid checksums so the field decoders run.
      if (length >= 3 && i % 4 !== 0) {
        bytes[0] = 0x03;
        bytes[1] = [0x0a, 0x0b, 0x0d, 0x0f, byte()][i % 5];
        if (i % 3 !== 0) bytes[length - 1] = xorChecksum(bytes.subarray(0, length - 1));
      }
      const frame = decodeFrame(bytes);
      kinds.add(frame.kind);
      for (const value of Object.values(frame)) {
        if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
      }
    }
    expect([...kinds].sort()).toEqual(['event', 'invalid', 'powder', 'unknown', 'weight']);
  });
});

describe('encodeWeightFrame', () => {
  const full: Required<Omit<WeightFrameInput, 'weightSignByte' | 'flowSignByte'>> = {
    timerMs: 75_300,
    weightG: 36.52,
    flowGps: 3.21,
    unitByte: 0x01,
    batteryPct: 87,
    standbyMin: 5,
    buzzerGear: 3,
    flowSmoothing: 0,
    reserved: 0,
  };

  it('reproduces the hand-built golden frames', () => {
    expect(toHex(encodeWeightFrame(full))).toBe(WEIGHT_POSITIVE);
    expect(
      toHex(
        encodeWeightFrame({
          timerMs: 0,
          weightG: -12.34,
          flowGps: -0.05,
          batteryPct: 100,
          standbyMin: 30,
          flowSmoothing: 1,
        }),
      ),
    ).toBe(WEIGHT_NEGATIVE);
  });

  it.each<[string, WeightFrameInput]>([
    ['a negative weight', { ...full, weightG: -3.07, flowGps: -0.42 }],
    ['a timer above 65.535 s (24-bit)', { ...full, timerMs: 65_536 }],
    ['a long timer', { ...full, timerMs: 3_723_004 }],
    ['flow above 2.55 g/s (16-bit)', { ...full, flowGps: 2.56 }],
    ['high flow', { ...full, flowGps: 12.34 }],
    ['weight above 655.35 g (24-bit)', { ...full, weightG: 655.36 }],
    ['zero everything', { timerMs: 0, weightG: 0, flowGps: 0, batteryPct: 0, standbyMin: 0 }],
    [
      'every field at its maximum',
      {
        timerMs: U24_MAX,
        weightG: U24_MAX / 100,
        flowGps: U16_MAX / 100,
        unitByte: 0xff,
        batteryPct: 0xff,
        standbyMin: U16_MAX / 10,
        buzzerGear: 0xff,
        flowSmoothing: 0xff,
        reserved: 0xff,
      },
    ],
    ['the most negative values', { ...full, weightG: -U24_MAX / 100, flowGps: -U16_MAX / 100 }],
  ])('round-trips %s', (_, input) => {
    expect(decodeFrame(encodeWeightFrame(input))).toMatchObject({ kind: 'weight', ...input });
  });

  it('round-trips the raw maxima exactly', () => {
    const frame = asWeight(
      decodeFrame(
        encodeWeightFrame({
          timerMs: U24_MAX,
          weightG: -U24_MAX / 100,
          flowGps: U16_MAX / 100,
          standbyMin: U16_MAX / 10,
        }),
      ),
    );
    expect(frame).toMatchObject({
      timerMs: 16_777_215,
      weightRaw: 16_777_215,
      weightG: -167_772.15,
      flowRaw: 65_535,
      flowGps: 655.35,
      standbyRaw: 65_535,
      standbyMin: 6553.5,
    });
  });

  it('fills idle defaults for optional fields', () => {
    expect(decodeFrame(encodeWeightFrame({ timerMs: 0, weightG: 1 }))).toMatchObject({
      unitByte: GRAM_UNIT_BYTES[0],
      unitOk: true,
      flowGps: 0,
      flowSignByte: SIGN_POSITIVE,
      batteryPct: 100,
      standbyMin: 5,
      buzzerGear: 0,
      flowSmoothing: 0,
      reserved: 0,
    });
  });

  it('rounds weight and flow to the scale resolution of 0.01', () => {
    const frame = asWeight(
      decodeFrame(encodeWeightFrame({ timerMs: 0, weightG: 1.234, flowGps: -0.006 })),
    );
    expect(frame.weightG).toBe(1.23);
    expect(frame.flowGps).toBe(-0.01);
  });

  it('sends a plus sign for values that round to zero', () => {
    const frame = asWeight(decodeFrame(encodeWeightFrame({ timerMs: 0, weightG: -0.004 })));
    expect(frame.weightSignByte).toBe(SIGN_POSITIVE);
    expect(Object.is(frame.weightG, 0)).toBe(true);
  });

  it('takes sign-byte overrides, to simulate unrecognised signs', () => {
    const frame = asWeight(
      decodeFrame(encodeWeightFrame({ timerMs: 0, weightG: -5, weightSignByte: 0x00 })),
    );
    expect(frame.weightSignByte).toBe(0x00);
    expect(frame.weightSignKnown).toBe(false);
    expect(frame.weightG).toBe(5);
  });

  it.each<[string, Partial<WeightFrameInput>]>([
    ['a negative timer', { timerMs: -1 }],
    ['a timer past 24 bits', { timerMs: U24_MAX + 1 }],
    ['a fractional timer', { timerMs: 1.5 }],
    ['a weight past 24 bits', { weightG: (U24_MAX + 1) / 100 }],
    ['a NaN weight', { weightG: NaN }],
    ['an infinite weight', { weightG: -Infinity }],
    ['a flow past 16 bits', { flowGps: (U16_MAX + 1) / 100 }],
    ['a battery above 255', { batteryPct: 256 }],
    ['a negative standby time', { standbyMin: -0.1 }],
    ['a standby time past 16 bits', { standbyMin: (U16_MAX + 1) / 10 }],
    ['a unit byte above 255', { unitByte: 0x100 }],
    ['a sign byte above 255', { weightSignByte: 0x100 }],
    ['a negative reserved byte', { reserved: -1 }],
  ])('rejects %s', (_, override) => {
    expect(() => encodeWeightFrame({ ...full, ...override })).toThrow(RangeError);
  });
});
