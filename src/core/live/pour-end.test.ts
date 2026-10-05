import { describe, expect, it } from 'vitest';
import { pourEndMs, type PourReading } from './pour-end';

/** Readings every 100 ms from `fromMs` to `toMs` of `grams(t)`, rounded to the scale's tenths. */
function readings(fromMs: number, toMs: number, grams: (tMs: number) => number): PourReading[] {
  const out: PourReading[] = [];
  for (let tMs = fromMs; tMs <= toMs; tMs += 100) {
    out.push({ tMs, grossG: Math.round(grams(tMs) * 10) / 10 });
  }
  return out;
}

describe('pourEndMs', () => {
  it('finds where a steady pour stopped', () => {
    // 2 g/s until 10.0 s, then nothing more.
    const end = pourEndMs(readings(9000, 11_000, (t) => (2 * (Math.min(t, 10_000) - 9000)) / 1000));
    expect(end).not.toBeNull();
    expect(Math.abs(end! - 10_000)).toBeLessThanOrEqual(100);
  });

  it('lands about one time constant into a drain, where the pour line meets the end level', () => {
    // 2 g/s until 10.0 s, then a drain with τ 0.2 s: 0.4 g more.
    const tauMs = 200;
    const grams = (t: number) =>
      t <= 10_000 ? (2 * (t - 9000)) / 1000 : 2 + 0.4 * (1 - Math.exp(-(t - 10_000) / tauMs));
    const end = pourEndMs(readings(9000, 11_000, grams))!;
    expect(end - 10_000).toBeGreaterThan(50);
    expect(end - 10_000).toBeLessThan(300);
  });

  it('needs four readings, and a pour before the knee', () => {
    expect(pourEndMs(readings(0, 200, () => 1))).toBeNull();
    expect(pourEndMs(readings(0, 2000, (t) => 10 - t / 1000))).toBeNull();
  });
});
