import { describe, expect, it } from 'vitest';
import { RecordingSequence, type RawFrame } from '../model';
import { encodeWeightFrame, GRAM_UNIT_BYTES } from '../protocol';
import { buildTimeline } from '../timebase';
import {
  FRAME_RESOLUTION_G,
  quantisationStep,
  readingGrid,
  snapToGrid,
  trustedWeights,
} from './samples';

/** A tenth as the Themis Mini sends it: a float32 times 100, truncated to hundredths (D-048). */
const sent = (tenths: number) => Math.trunc(Math.fround(Math.fround(tenths / 10) * 100)) / 100 + 0;

describe('readingGrid and snapToGrid', () => {
  it('finds the tenths under readings a hundredth short, and snaps them back', () => {
    const grams = [0, 351, 351, 352, 2648, -2648, 3].map(sent);
    expect(grams).toEqual([0, 35.09, 35.09, 35.2, 264.79, -264.79, 0.3]);
    expect(readingGrid(grams)).toBe(0.1);
    expect(snapToGrid(grams, 0.1)).toEqual([0, 35.1, 35.1, 35.2, 264.8, -264.8, 0.3]);
  });

  it('takes the coarsest grid every reading lies on, and none for hundredths', () => {
    expect(readingGrid([0, 120, 119.99, 240])).toBe(1);
    expect(readingGrid([0, 0.5, 1.49])).toBe(0.5);
    expect(readingGrid([1.01, 1.06, 1.1])).toBe(0.05);
    expect(readingGrid([0.06, 0.07, 0.08])).toBeNull();
    expect(readingGrid([])).toBeNull();
    expect(snapToGrid([0.06, 0.07], null)).toEqual([0.06, 0.07]);
  });

  it('lets one reading in 1000 lie off the grid, and leaves it as it is', () => {
    const grams = Array.from({ length: 2000 }, (_, i) => sent(i % 50));
    grams[700] = 1.23;
    expect(readingGrid(grams)).toBe(0.1);
    expect(snapToGrid(grams, 0.1)[700]).toBe(1.23);
    grams[701] = 1.27;
    grams[702] = 1.33;
    expect(readingGrid(grams)).toBeNull();
  });
});

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

  it('is 0.1 g for tenths that come a hundredth short, at rest as in motion (D-048)', () => {
    // Read as sent, 35.09 to 35.0 is a change of 0.09 g.
    expect(quantisationStep([350, 351, 350, 351, 352].map(sent))).toBe(0.1);
    expect(quantisationStep([2648, 2648, 2649, -2648].map(sent))).toBe(0.1);
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
