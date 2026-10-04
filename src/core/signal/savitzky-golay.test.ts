import { describe, expect, it } from 'vitest';
import { Rng } from '../sim';
import { savitzkyGolay, savitzkyGolayCoefficients } from './savitzky-golay';

/** Expects each weight to equal numerators[j] / denominator. */
function expectWeights(weights: number[], numerators: number[], denominator: number): void {
  expect(weights).toHaveLength(numerators.length);
  weights.forEach((weight, j) => expect(weight).toBeCloseTo(numerators[j] / denominator, 13));
}

describe('savitzkyGolayCoefficients', () => {
  it('match the textbook 5-point weights', () => {
    expectWeights(savitzkyGolayCoefficients({ window: 5, order: 2 }), [-3, 12, 17, 12, -3], 35);
    expectWeights(
      savitzkyGolayCoefficients({ window: 5, order: 2, derivative: 1 }),
      [-2, -1, 0, 1, 2],
      10,
    );
  });

  // Savitzky and Golay (1964), as corrected by Steinier, Termonia and Deltour (1972).
  it.each([
    [7, 2, 0, [-2, 3, 6, 7, 6, 3, -2], 21],
    [9, 2, 0, [-21, 14, 39, 54, 59, 54, 39, 14, -21], 231],
    [5, 3, 1, [1, -8, 0, 8, -1], 12],
    [7, 3, 1, [22, -67, -58, 0, 58, 67, -22], 252],
    [5, 2, 2, [2, -1, -2, -1, 2], 7],
    [7, 2, 2, [5, 0, -3, -4, -3, 0, 5], 42],
  ])('match the tables: window %i, order %i, derivative %i', (window, order, d, nums, den) => {
    expectWeights(savitzkyGolayCoefficients({ window, order, derivative: d }), nums, den);
  });

  // From exact rational least squares (Python fractions), for positions off the centre.
  it.each([
    [5, 2, 0, 0, [31, 9, -3, -5, 3], 35],
    [5, 2, 0, 1, [9, 13, 12, 6, -5], 35],
    [5, 2, 1, 0, [-54, 13, 40, 27, -26], 70],
    [7, 3, 2, 0, [26, -21, -24, -4, 18, 21, -16], 42],
    [11, 4, 1, 1, [-2364, 210, 1076, 973, 472, -24, -280, -229, 28, 222, -84], 5148],
  ])(
    'fit off the centre: window %i, order %i, derivative %i at %i',
    (window, order, derivative, position, nums, den) => {
      expectWeights(savitzkyGolayCoefficients({ window, order, derivative, position }), nums, den);
    },
  );

  it('mirror at the other end, with odd derivatives changing sign', () => {
    const first = savitzkyGolayCoefficients({ window: 7, order: 3, derivative: 1, position: 0 });
    const last = savitzkyGolayCoefficients({ window: 7, order: 3, derivative: 1, position: 6 });
    last.forEach((weight, j) => expect(weight).toBeCloseTo(-first[6 - j], 13));
  });

  it('average for order 0, and pass a window of one through', () => {
    expectWeights(savitzkyGolayCoefficients({ window: 5, order: 0 }), [1, 1, 1, 1, 1], 5);
    expect(savitzkyGolayCoefficients({ window: 1, order: 0 })).toEqual([1]);
  });

  it('refuse fits that are not determined', () => {
    const refuse = (window: number, order: number, derivative = 0, position?: number) =>
      expect(() => savitzkyGolayCoefficients({ window, order, derivative, position })).toThrow(
        RangeError,
      );
    refuse(4, 2); // even
    refuse(3, 3); // no more samples than coefficients
    refuse(5, 2, 3); // derivative above the order
    refuse(5, -1);
    refuse(5, 2, -1);
    refuse(5.5, 2);
    refuse(5, 2, 0, -0.5);
    refuse(5, 2, 0, 4.5);
  });
});

/** A polynomial with the given coefficients (constant first), and its first two derivatives. */
function polynomial(coefficients: number[]): ((t: number) => number)[] {
  const at = (cs: number[]) => (t: number) => cs.reduceRight((sum, c) => sum * t + c, 0);
  const derive = (cs: number[]) => cs.slice(1).map((c, k) => c * (k + 1));
  const first = derive(coefficients);
  return [at(coefficients), at(first), at(derive(first))];
}

describe('savitzkyGolay', () => {
  it.each([
    [5, 2],
    [7, 2],
    [7, 3],
    [9, 4],
    [11, 2],
    [5, 4],
    [21, 6],
  ])(
    'reproduces polynomials up to its order exactly, edges included: window %i, order %i',
    (window, order) => {
      const rng = new Rng(window * 31 + order);
      const step = 0.1;
      for (let degree = 0; degree <= order; degree++) {
        const exact = polynomial(Array.from({ length: degree + 1 }, () => rng.uniform(-3, 3)));
        const times = Array.from({ length: 40 }, (_, i) => -1.3 + i * step);
        const values = times.map(exact[0]);
        for (let derivative = 0; derivative <= Math.min(2, order); derivative++) {
          const filtered = savitzkyGolay(values, { window, order, derivative, step });
          expect(filtered).toHaveLength(values.length);
          filtered.forEach((value, i) => {
            const truth = exact[derivative](times[i]);
            expect(Math.abs(value - truth)).toBeLessThan(1e-8 * Math.max(1, Math.abs(truth)));
          });
        }
      }
    },
  );

  it('applies the tabled weights in the interior', () => {
    const values = [0, 0, 0, 0, 35, 0, 0, 0, 0];
    const smoothed = savitzkyGolay(values, { window: 5, order: 2 }).slice(2, 7);
    [-3, 12, 17, 12, -3].forEach((n, j) => expect(smoothed[j]).toBeCloseTo(n, 12));
    // An impulse comes out reversed through the derivative weights: a rise, then a fall.
    const slopes = savitzkyGolay(values, { window: 5, order: 2, derivative: 1 }).slice(2, 7);
    [7, 3.5, 0, -3.5, -7].forEach((n, j) => expect(slopes[j]).toBeCloseTo(n, 12));
  });

  it('scales derivatives by the step', () => {
    const values = [1, 4, 9, 16, 25, 36, 49]; // (i + 1)², sampled every 0.5 s
    const perSample = savitzkyGolay(values, { window: 5, order: 2, derivative: 2 });
    const perSecond = savitzkyGolay(values, { window: 5, order: 2, derivative: 2, step: 0.5 });
    perSample.forEach((value, i) => {
      expect(value).toBeCloseTo(2, 10);
      expect(perSecond[i]).toBeCloseTo(8, 10);
    });
  });

  it('cuts white noise by the sum of the squared weights', () => {
    const rng = new Rng(11);
    const noise = Array.from({ length: 50_000 }, () => rng.gaussian());
    const smoothed = savitzkyGolay(noise, { window: 5, order: 2 }).slice(2, -2);
    const variance = smoothed.reduce((sum, v) => sum + v * v, 0) / smoothed.length;
    // Σc² = 595 / 1225; the estimate's own error is under 1%.
    expect(variance / ((9 + 144 + 289 + 144 + 9) / 35 ** 2)).toBeCloseTo(1, 1);
  });

  it('fits a series shorter than the window as a whole', () => {
    const exact = polynomial([2, -1, 0.5]);
    const values = [0, 1, 2, 3].map(exact[0]);
    const slopes = savitzkyGolay(values, { window: 7, order: 2, derivative: 1 });
    slopes.forEach((slope, i) => expect(slope).toBeCloseTo(exact[1](i), 10));
    expect(savitzkyGolay([], { window: 7, order: 2 })).toEqual([]);
    expect(() => savitzkyGolay([1, 2], { window: 7, order: 2 })).toThrow(RangeError);
  });

  it('refuses a bad step or fit', () => {
    expect(() => savitzkyGolay([1, 2, 3], { window: 3, order: 1, step: 0 })).toThrow(RangeError);
    expect(() => savitzkyGolay([1, 2, 3], { window: 2, order: 1 })).toThrow(RangeError);
    expect(() => savitzkyGolay([1, 2, 3], { window: 3, order: 1, derivative: 2 })).toThrow(
      RangeError,
    );
  });
});
