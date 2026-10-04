import { describe, expect, it } from 'vitest';
import { RecordingSequence, type RawFrame } from '../model';
import { encodeWeightFrame, GRAM_UNIT_BYTES } from '../protocol';
import { buildTimeline } from '../timebase';
import { FRAME_RESOLUTION_G, quantisationStep, trustedWeights } from './samples';

describe('quantisationStep', () => {
  it('is the smallest change between consecutive weights', () => {
    expect(quantisationStep([110, 110.01, 109.99, 110.02])).toBe(0.01);
    expect(quantisationStep([110, 110.1, 110.1, 109.9, 0])).toBe(0.1);
    expect(quantisationStep([-0.3, -0.1, 0.1])).toBe(0.2);
  });

  it('compares in hundredths, so floating point rounding is no step', () => {
    // 0.07 − 0.06 is 0.010000000000000009, and 1.06 − 1.01 is 0.050000000000000044.
    expect(quantisationStep([0.06, 0.07])).toBe(0.01);
    expect(quantisationStep([1.01, 1.06, 1.01])).toBe(0.05);
  });

  it("is the frame's resolution when the weight never changes", () => {
    expect(quantisationStep([])).toBe(FRAME_RESOLUTION_G);
    expect(quantisationStep([5, 5, 5])).toBe(FRAME_RESOLUTION_G);
  });
});

describe('trustedWeights', () => {
  it('leaves out frames whose unit byte is unknown, and counts them', () => {
    const sequence = new RecordingSequence('01923456-789a-7000-8000-000000000001');
    const frame = (k: number, unitByte: number): RawFrame =>
      sequence.frame(
        k * 100,
        'ff11',
        encodeWeightFrame({
          timerMs: 0,
          weightG: k,
          flowGps: 0,
          unitByte,
          batteryPct: 90,
          standbyMin: 5,
          buzzerGear: 2,
          flowSmoothing: 0,
        }),
      );
    const grams = GRAM_UNIT_BYTES[0];
    const frames = [frame(0, grams), frame(1, 0x02), frame(2, grams), frame(3, 0x02)];
    const { samples, refusedFrames } = trustedWeights(buildTimeline(frames));
    expect(refusedFrames).toBe(2);
    expect(samples.seq).toEqual([0, 2]);
    expect(samples.weightG).toEqual([0, 2]);
    expect(samples.t).toEqual([0, 0.2]);
  });
});
