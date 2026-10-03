import { describe, expect, it } from 'vitest';
import { Rng } from './random';

const draws = (rng: Rng, n: number): number[] => Array.from({ length: n }, () => rng.uint32());

describe('Rng', () => {
  it('repeats its sequence for the same seed', () => {
    expect(draws(new Rng(42), 100)).toEqual(draws(new Rng(42), 100));
  });

  it('gives different sequences for different seeds', () => {
    expect(draws(new Rng(1), 10)).not.toEqual(draws(new Rng(2), 10));
    expect(draws(new Rng(0), 10)).not.toEqual(draws(new Rng(2 ** 32 - 1), 10));
  });

  it('pins its output, so a change of generator is a deliberate one', () => {
    // Changing these values changes every simulated session: tests tuned on them shift too.
    expect(draws(new Rng(1), 3)).toMatchInlineSnapshot(`
      [
        960850752,
        2734082507,
        3058966613,
      ]
    `);
  });

  it.each([-1, 1.5, 2 ** 32, NaN, Infinity])('rejects seed %s', (seed) => {
    expect(() => new Rng(seed)).toThrow(RangeError);
  });

  describe('fork', () => {
    it('is the same stream for the same seed and label', () => {
      expect(draws(new Rng(7).fork('noise'), 20)).toEqual(draws(new Rng(7).fork('noise'), 20));
    });

    it('differs by label and by seed', () => {
      const noise = draws(new Rng(7).fork('noise'), 10);
      expect(draws(new Rng(7).fork('link'), 10)).not.toEqual(noise);
      expect(draws(new Rng(8).fork('noise'), 10)).not.toEqual(noise);
      expect(draws(new Rng(7), 10)).not.toEqual(noise);
    });

    it("doesn't depend on how far the parent has got", () => {
      const parent = new Rng(7);
      draws(parent, 1000);
      expect(draws(parent.fork('noise'), 10)).toEqual(draws(new Rng(7).fork('noise'), 10));
    });
  });

  describe('distributions', () => {
    const N = 20_000;

    it('next() is uniform in [0, 1)', () => {
      const rng = new Rng(3);
      const values = Array.from({ length: N }, () => rng.next());
      expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...values)).toBeLessThan(1);
      expect(mean(values)).toBeCloseTo(0.5, 1);
      // Ten equal bins each get close to a tenth.
      const bins = new Array<number>(10).fill(0);
      for (const v of values) bins[Math.floor(v * 10)]++;
      for (const count of bins) expect(Math.abs(count / N - 0.1)).toBeLessThan(0.01);
    });

    it('uniform() and int() stay in range', () => {
      const rng = new Rng(4);
      for (let i = 0; i < 1000; i++) {
        const u = rng.uniform(-2, 3);
        expect(u).toBeGreaterThanOrEqual(-2);
        expect(u).toBeLessThan(3);
        const n = rng.int(6);
        expect(Number.isInteger(n) && n >= 0 && n < 6).toBe(true);
      }
    });

    it('gaussian() has mean 0 and σ 1', () => {
      const rng = new Rng(5);
      const values = Array.from({ length: N }, () => rng.gaussian());
      expect(mean(values)).toBeCloseTo(0, 1);
      expect(Math.sqrt(variance(values))).toBeCloseTo(1, 1);
      expect(values.every(Number.isFinite)).toBe(true);
    });

    it('gaussian() always takes exactly two draws', () => {
      const a = new Rng(6);
      const b = new Rng(6);
      for (let i = 0; i < 50; i++) a.gaussian();
      for (let i = 0; i < 100; i++) b.next();
      expect(a.uint32()).toBe(b.uint32());
    });

    it('exponential() has the given mean and is never negative', () => {
      const rng = new Rng(7);
      const values = Array.from({ length: N }, () => rng.exponential(8));
      expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
      expect(mean(values)).toBeGreaterThan(7.7);
      expect(mean(values)).toBeLessThan(8.3);
    });
  });
});

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function variance(values: number[]): number {
  const m = mean(values);
  return values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
}
