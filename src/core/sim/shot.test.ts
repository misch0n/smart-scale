import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHOT_PARAMS,
  deliveredG,
  finalDeliveredG,
  settledAtMs,
  ShotModel,
  type ShotParams,
} from './shot';

const shot = (overrides: Partial<ShotParams> = {}, pumpOnMs = 1000): ShotModel =>
  new ShotModel(pumpOnMs, { ...DEFAULT_SHOT_PARAMS, ...overrides });

describe('ShotModel', () => {
  it('places the markers from the parameters', () => {
    const s = shot({ preInfusionMs: 5000, extractionMs: 20_000 }, 7000);
    expect(s.pumpOnMs).toBe(7000);
    expect(s.firstDripMs).toBe(12_000);
    expect(s.pumpOffMs).toBe(32_000);
  });

  it('delivers nothing before first_drip', () => {
    const s = shot();
    expect(s.liquidAt(0)).toBe(0);
    expect(s.liquidAt(s.firstDripMs)).toBe(0);
    expect(s.flowAt(s.firstDripMs - 1)).toBe(0);
  });

  it('delivers the yield in the end, w(pump_off) plus ẇ(pump_off)·τ (spec "Tail handling")', () => {
    const s = shot({ yieldG: 40, tailTauMs: 2000 });
    expect(s.tailMassG).toBeCloseTo(s.flowAtPumpOffGps * 2, 12);
    expect(s.liquidAtPumpOffG + s.tailMassG).toBeCloseTo(40, 10);
    expect(s.liquidAt(s.pumpOffMs + 100 * 2000)).toBeCloseTo(40, 10);
  });

  it('drains exponentially after pump_off, with τ', () => {
    const s = shot({ tailTauMs: 1500 });
    const tau = 1500;
    expect(s.flowAt(s.pumpOffMs + tau) / s.flowAtPumpOffGps).toBeCloseTo(Math.exp(-1), 12);
    const left = (t: number) => s.liquidAtPumpOffG + s.tailMassG - s.liquidAt(t);
    expect(left(s.pumpOffMs + 2 * tau) / left(s.pumpOffMs + tau)).toBeCloseTo(Math.exp(-1), 9);
  });

  it('keeps the flow continuous at pump_off', () => {
    const s = shot();
    expect(s.flowAt(s.pumpOffMs - 1e-6)).toBeCloseTo(s.flowAt(s.pumpOffMs + 1e-6), 6);
    expect(s.liquidAt(s.pumpOffMs)).toBe(s.liquidAtPumpOffG);
  });

  it('follows the flow profile, scaled to the yield', () => {
    const s = shot({ flowProfile: [[0, 1]], extractionMs: 10_000, tailTauMs: 1000, yieldG: 22 });
    // Flat flow f for 10 s, then f·1 s of tail: 11 f = 22, so f = 2 g/s.
    expect(s.flowScaleGps).toBeCloseTo(2, 12);
    expect(s.flowAt(s.firstDripMs + 5000)).toBeCloseTo(2, 12);
    expect(s.liquidAt(s.firstDripMs + 5000)).toBeCloseTo(10, 10);
  });

  it('interpolates between profile points and holds the last one', () => {
    const s = shot({
      flowProfile: [
        [0, 0],
        [0.5, 2],
      ],
      extractionMs: 10_000,
    });
    const at = (fraction: number) => s.flowAt(s.firstDripMs + fraction * 10_000) / s.flowScaleGps;
    expect(at(0)).toBe(0);
    expect(at(0.25)).toBeCloseTo(1, 12);
    expect(at(0.5)).toBeCloseTo(2, 12);
    expect(at(0.9)).toBeCloseTo(2, 12);
  });

  it('has a flow that is the derivative of the delivered liquid', () => {
    const s = shot();
    for (let t = s.firstDripMs + 200; t < s.pumpOffMs + 10_000; t += 997) {
      const h = 0.5;
      const slope = ((s.liquidAt(t + h) - s.liquidAt(t - h)) / (2 * h)) * 1000;
      expect(slope).toBeCloseTo(s.flowAt(t), 4);
    }
  });

  it('never delivers less as time goes on', () => {
    const s = shot();
    let last = 0;
    for (let t = 0; t < s.pumpOffMs + 20_000; t += 7.3) {
      const liquid = s.liquidAt(t);
      expect(liquid).toBeGreaterThanOrEqual(last);
      last = liquid;
    }
  });

  it.each<[string, Partial<ShotParams>, number?]>([
    ['a negative start', {}, -1],
    ['a zero yield', { yieldG: 0 }],
    ['a negative pre-infusion', { preInfusionMs: -1 }],
    ['a zero extraction', { extractionMs: 0 }],
    ['a zero tail τ', { tailTauMs: 0 }],
    ['a NaN dose', { doseG: NaN }],
    ['an empty profile', { flowProfile: [] }],
    ['a profile not starting at 0', { flowProfile: [[0.1, 1]] }],
    [
      'a profile going back',
      {
        flowProfile: [
          [0, 0],
          [0.5, 1],
          [0.4, 1],
        ],
      },
    ],
    [
      'a profile past 1',
      {
        flowProfile: [
          [0, 0],
          [1.5, 1],
        ],
      },
    ],
    ['a negative level', { flowProfile: [[0, -1]] }],
    ['a profile with no flow at all', { flowProfile: [[0, 0]] }],
  ])('rejects %s', (_, overrides, pumpOnMs = 0) => {
    expect(() => shot(overrides, pumpOnMs)).toThrow(RangeError);
  });
});

describe('drops', () => {
  const s = shot();

  it('lands the first drop at first_drip', () => {
    expect(deliveredG(s, s.firstDripMs, 0.05)).toBe(0);
    expect(deliveredG(s, s.firstDripMs + 0.01, 0.05)).toBe(0.05);
  });

  it('stays within one drop ahead of the stream', () => {
    for (let t = s.firstDripMs; t < s.pumpOffMs + 15_000; t += 13.7) {
      const stream = s.liquidAt(t);
      const drops = deliveredG(s, t, 0.05);
      expect(drops).toBeGreaterThanOrEqual(stream - 1e-9);
      expect(drops).toBeLessThan(stream + 0.05 + 1e-9);
    }
  });

  it('is the stream itself with a drop size of 0', () => {
    expect(deliveredG(s, s.pumpOffMs, 0)).toBe(s.liquidAtPumpOffG);
  });

  it('delivers the yield in whole drops', () => {
    expect(finalDeliveredG(s, 0.05)).toBeCloseTo(38, 9);
    expect(finalDeliveredG(shot({ yieldG: 38.02 }), 0.05)).toBeCloseTo(38.05, 9);
    expect(finalDeliveredG(s, 0)).toBeCloseTo(38, 9);
  });
});

describe('settledAtMs', () => {
  it('is when what is still to come falls to the tolerance', () => {
    const s = shot({ tailTauMs: 1000 });
    const t = settledAtMs(s, 0, 0.05);
    // Continuous tail: tail·e^(−Δ/τ) = 0.05.
    expect(t).toBeCloseTo(s.pumpOffMs + 1000 * Math.log(s.tailMassG / 0.05), 0);
    expect(finalDeliveredG(s, 0) - s.liquidAt(t)).toBeCloseTo(0.05, 3);
  });

  it('is at pump_off when the tail is already within the tolerance', () => {
    const s = shot({
      flowProfile: [
        [0, 1],
        [0.99, 1],
        [1, 0],
      ],
    });
    expect(settledAtMs(s, 0, 0.05)).toBe(s.pumpOffMs);
  });

  it('counts whole drops', () => {
    const s = shot();
    const t = settledAtMs(s, 0.05, 0.05);
    const final = finalDeliveredG(s, 0.05);
    expect(final - deliveredG(s, t, 0.05)).toBeLessThanOrEqual(0.05 + 1e-9);
    expect(final - deliveredG(s, t - 1, 0.05)).toBeGreaterThan(0.05 - 1e-9);
  });
});
