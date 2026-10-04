import { describe, expect, it } from 'vitest';
import { resampleLinear } from '../signal';
import type { WeightSamples } from './samples';
import { backedGridSamples, noiseBetween, stableStretches } from './stability';

const OPTIONS = { window: 5, toleranceG: 0.05, sigmaFloorG: 0.01 / Math.sqrt(12) };

/** Samples at `t` with the given weights, and the grid they resample onto at 0.1 s. */
function prepared(t: readonly number[], weightG: readonly number[]) {
  const samples: WeightSamples = { seq: t.map((_, i) => i), t: [...t], weightG: [...weightG] };
  return { samples, series: resampleLinear(t, weightG, 0.1) };
}

const every100ms = (count: number, from = 0) =>
  Array.from({ length: count }, (_, k) => Math.round((from + k * 0.1) * 1e9) / 1e9);

describe('stableStretches', () => {
  it('finds where the range stays within the tolerance, with level and noise', () => {
    // Flat at 10 g, a 5 g step at 2 s, then flat at 15 g with ±0.02 g of alternating noise.
    const t = every100ms(40);
    const weightG = t.map((x, k) => (x < 2 ? 10 : 15 + (k % 2 === 0 ? 0.02 : -0.02)));
    const { samples, series } = prepared(t, weightG);
    const stretches = stableStretches(series, samples, OPTIONS);
    expect(stretches.map((s) => [s.startIndex, s.endIndex])).toEqual([
      [0, 20],
      [20, 40],
    ]);
    expect(stretches[0]).toMatchObject({ startT: 0, levelG: 10, sampleCount: 20 });
    expect(stretches[0].endT).toBeCloseTo(1.9, 9);
    expect(stretches[0].sigmaG).toBe(OPTIONS.sigmaFloorG); // all equal: σ 0, floored
    expect(stretches[1].levelG).toBeCloseTo(15, 9);
    expect(stretches[1].sigmaG).toBeCloseTo(0.02 * Math.sqrt(20 / 19), 9);
  });

  it('allows exactly the tolerance, despite rounding in the readings', () => {
    // 1.06 − 1.01 is 0.050000000000000044 in floating point.
    const t = every100ms(10);
    const { samples, series } = prepared(
      t,
      t.map((_, k) => (k % 2 === 0 ? 1.01 : 1.06)),
    );
    expect(stableStretches(series, samples, OPTIONS)).toHaveLength(1);
  });

  it('finds nothing stable across a gap in the samples, however flat the line over it', () => {
    // A 0.5 s stall: the grid joins 10 g to 10 g, but nothing was measured in between.
    const t = [...every100ms(10), ...every100ms(10, 1.5)];
    const { samples, series } = prepared(
      t,
      t.map(() => 10),
    );
    const stretches = stableStretches(series, samples, OPTIONS);
    expect(stretches.map((s) => [s.startIndex, s.endIndex])).toEqual([
      [0, 10],
      [15, 25],
    ]);
  });

  it('lets one stray sample split a stretch', () => {
    const t = every100ms(30);
    const weightG = t.map((_, k) => (k === 15 ? 10.2 : 10 + (k % 3) * 0.01));
    const { samples, series } = prepared(t, weightG);
    const stretches = stableStretches(series, samples, OPTIONS);
    expect(stretches.map((s) => [s.startIndex, s.endIndex])).toEqual([
      [0, 15],
      [16, 30],
    ]);
  });

  it('ends a stretch where a window fails, so a slow drift can leave two sharing a sample', () => {
    // 0, …, 0, 0.03, 0.06, …: the windows holding both 0 and 0.06 fail.
    const t = every100ms(12);
    const weightG = t.map((_, k) => (k < 5 ? 0 : k === 5 ? 0.03 : 0.06));
    const { samples, series } = prepared(t, weightG);
    const stretches = stableStretches(series, samples, OPTIONS);
    expect(stretches.map((s) => [s.startIndex, s.endIndex])).toEqual([
      [0, 6],
      [5, 12],
    ]);
  });

  it('gives nothing for a series shorter than the window', () => {
    const { samples, series } = prepared(every100ms(4), [1, 1, 1, 1]);
    expect(stableStretches(series, samples, OPTIONS)).toEqual([]);
  });
});

describe('backedGridSamples', () => {
  it('backs a grid sample when the samples either side are at most 1.5 steps apart', () => {
    const series = { start: 0, step: 0.1, values: [0, 0, 0, 0, 0, 0, 0] };
    // Samples at 0, 0.12, 0.27 (gap 0.15: backed), then 0.6 (gap 0.33: not).
    expect(backedGridSamples(series, [0, 0.12, 0.27, 0.6])).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      true,
    ]);
  });
});

describe('noiseBetween', () => {
  it('uses the samples timed within the span, ends included', () => {
    const samples: WeightSamples = {
      seq: [0, 1, 2, 3, 4],
      t: [0, 1, 2, 3, 4],
      weightG: [100, 1, 2, 3, 100],
    };
    expect(noiseBetween(samples, 1, 3, 0, [])).toEqual({ levelG: 2, sigmaG: 1, sampleCount: 3 });
  });

  it('falls back to the values given when fewer than 3 samples fall within the span', () => {
    const samples: WeightSamples = { seq: [0, 1], t: [0, 1], weightG: [5, 5] };
    expect(noiseBetween(samples, 0, 1, 0.003, [4, 6, 5])).toEqual({
      levelG: 5,
      sigmaG: 1,
      sampleCount: 3,
    });
  });

  it('floors σ, quantised readings at rest being all equal', () => {
    const samples: WeightSamples = { seq: [0, 1, 2], t: [0, 1, 2], weightG: [7, 7, 7] };
    expect(noiseBetween(samples, 0, 2, 0.03, [])).toEqual({
      levelG: 7,
      sigmaG: 0.03,
      sampleCount: 3,
    });
  });
});
