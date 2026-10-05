import { describe, expect, it } from 'vitest';
import { Rng } from '../sim';
import { LiveWeight, type LiveSample } from './live-weight';

/** Feeds `grams(t)` every `stepMs` from `fromMs` to `toMs`, rounded to tenths as the scale does. */
function feed(
  weight: LiveWeight,
  fromMs: number,
  toMs: number,
  grams: (tMs: number) => number,
  stepMs = 100,
): LiveSample[] {
  const samples: LiveSample[] = [];
  for (let tMs = fromMs; tMs <= toMs; tMs += stepMs) {
    samples.push(weight.add(tMs, Math.round(grams(tMs) * 10) / 10));
  }
  return samples;
}

describe('LiveWeight', () => {
  it('shows a steady pour where it is, not where the EMA trails it, and its flow', () => {
    const weight = new LiveWeight();
    feed(weight, 0, 1000, () => 0);
    const pour = feed(weight, 1100, 6000, (t) => (2 * (t - 1000)) / 1000);
    for (const sample of pour.slice(15)) {
      const trueG = (2 * (sample.tMs - 1000)) / 1000;
      expect(Math.abs(sample.smoothG - trueG)).toBeLessThan(0.1);
      expect(sample.flowGps).toBeCloseTo(2, 1);
    }
  });

  it('has no flow until a few readings span enough time', () => {
    const weight = new LiveWeight();
    const [first, second, third, fourth, fifth] = feed(weight, 0, 400, () => 5);
    expect([first, second, third, fourth].map((sample) => sample.flowGps)).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(fifth.flowGps).toBe(0);
    expect(fifth.noiseG).toBe(0);
  });

  it('calls readings stable within one step over half a second, a short tenth included', () => {
    const weight = new LiveWeight();
    const still = feed(weight, 0, 600, (t) => (t % 200 === 0 ? 35.09 : 35.2));
    expect(still.at(-1)!.stable).toBe(true);
    expect(still.at(-1)!.levelG).toBeCloseTo(35.15, 1);
    const twoSteps = feed(weight, 700, 1400, (t) => (t % 200 === 0 ? 35.0 : 35.2));
    expect(twoSteps.at(-1)!.stable).toBe(false);
    expect(twoSteps.at(-1)!.levelG).toBeNull();
  });

  it('holds the smoothed weight through a jump until half a second passes without one', () => {
    const weight = new LiveWeight();
    feed(weight, 0, 1000, () => 0);
    // A cup put on: it settles in over three readings.
    const placing = [40, 95, 110, 110, 110, 110, 110, 110, 110].map((g, i) =>
      weight.add(1100 + 100 * i, g),
    );
    expect(placing.slice(0, 3).every((sample) => sample.jump)).toBe(true);
    // The display holds the level before the jump while disturbed, then takes the reading.
    for (const sample of placing.filter((s) => s.disturbed)) expect(sample.smoothG).toBe(0);
    expect(placing.at(-1)!.disturbed).toBe(false);
    expect(placing.at(-1)!.smoothG).toBe(110);
    // The flow leaves the jump out: none just after it, 0 once the readings since span enough.
    expect(placing[3].flowGps).toBeNull();
    expect(placing.at(-1)!.flowGps).toBe(0);
  });

  it('moves the zero, not the weight, when the tare it expected lands', () => {
    const weight = new LiveWeight();
    feed(weight, 0, 1000, () => 110);
    weight.expectTare(1000);
    expect(weight.tareOutcome).toBe('expected');
    const [landed, ...after] = feed(weight, 1100, 2000, () => 0);
    expect(landed.tareG).toBe(110);
    expect(landed.jump).toBe(false);
    expect(weight.zeroG).toBe(110);
    expect(weight.tareOutcome).toBe('seen');
    for (const sample of [landed, ...after]) expect(sample.grossG).toBe(110);
  });

  it('keeps its own zero when the tare never shows, as in another mode (D-038)', () => {
    const weight = new LiveWeight();
    feed(weight, 0, 1000, () => 110);
    weight.expectTare(1000);
    const after = feed(weight, 1100, 2500, () => 110);
    expect(weight.tareOutcome).toBe('not-seen');
    expect(weight.zeroG).toBe(0);
    expect(after.every((sample) => sample.grossG === 110)).toBe(true);
  });

  it('looks for nothing when the tare comes at 0, so the pump-start dip stays a dip (shot B)', () => {
    const weight = new LiveWeight();
    feed(weight, 0, 1000, () => 0);
    weight.expectTare(1000);
    const dip = feed(weight, 1100, 2000, (t) => (t < 1400 ? -0.1 : -0.2));
    expect(weight.tareOutcome).toBe('seen');
    expect(weight.zeroG).toBe(0);
    expect(dip.at(-1)!.grossG).toBe(-0.2);
  });

  it('takes no tare from a reading passing 0 mid-jump, as when the cup is lifted', () => {
    const weight = new LiveWeight();
    feed(weight, 0, 1000, () => 110);
    weight.expectTare(1000);
    // The lift: 110 → 60 → 0 → −0.1 g, the cup off and the scale untared.
    for (const [i, g] of [60, 0, -0.1, -0.1].entries()) weight.add(1100 + 100 * i, g);
    expect(weight.zeroG).toBe(0);
    expect(weight.last!.grossG).toBe(-0.1);
  });

  it('measures noise from the steps between readings: none at rest, none from one drop', () => {
    const weight = new LiveWeight();
    const still = feed(weight, 0, 1000, () => 20);
    expect(still.at(-1)!.noiseG).toBe(0);
    // One lump of 0.2 g lands and holds.
    const drop = feed(weight, 1100, 1500, () => 20.2);
    expect(drop.every((sample) => sample.noiseG === 0)).toBe(true);
  });

  it('measures the noise of a shaking reading, about its σ', () => {
    const weight = new LiveWeight();
    const rng = new Rng(7);
    let sum = 0;
    let count = 0;
    for (let tMs = 0; tMs <= 30_000; tMs += 100) {
      const sample = weight.add(tMs, 20 + 0.1 * rng.gaussian());
      if (tMs >= 1000) {
        sum += sample.noiseG!;
        count++;
      }
    }
    expect(sum / count).toBeGreaterThan(0.08);
    expect(sum / count).toBeLessThan(0.12);
    // A change that must stand out of it: four σ.
    expect(weight.clearOfNoiseG(0.15, weight.last)).toBeGreaterThan(0.2);
  });

  it('takes a time that goes back as the last one', () => {
    const weight = new LiveWeight();
    weight.add(1000, 1);
    expect(weight.add(900, 1).tMs).toBe(1000);
  });

  it('forgets everything on reset', () => {
    const weight = new LiveWeight();
    feed(weight, 0, 1000, () => 110);
    weight.expectTare(1000);
    feed(weight, 1100, 1500, () => 0);
    weight.reset();
    expect(weight.last).toBeNull();
    expect(weight.zeroG).toBe(0);
    expect(weight.tareOutcome).toBeNull();
    expect(weight.add(0, 5).smoothG).toBe(5);
  });
});
