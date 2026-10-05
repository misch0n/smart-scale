/**
 * The accuracy targets the user agreed for the real scale (T1.16, D-060), on the simulator's
 * defaults, which follow hardware session 2 (D-059): readings in 0.1 g steps, no vibration from
 * the pump, a drain with τ 0.2 s and a first lump of 0.2 g. Each shot is started with the
 * Tare + start tap at pump_on, as the user times shots (Q4), and analysed by `analyzeRaw`, as the
 * app runs it. Over 100 seeds:
 *
 * - first_drip and pump_off: the median error within 0.05 s, 90% within 0.1 s, every one within
 *   0.15 s (first_drip) or 0.2 s (pump_off), and the median signed error within 0.05 s;
 * - the first-drip time within 0.15 s, the extraction and the total within 0.2 s;
 * - the yield within 0.05 g, the honest yield within 0.1 g, w(pump_off) within 0.25 g, and the
 *   average flow within 2%;
 * - none for τ, which 0.1 g readings of a 0.2 s drain hold to about ±50%, nor for pump_on, the
 *   user's own tap.
 *
 * The usual shot lifts the cup 30 s after the pump stops, as hardware test C3 asks. The same
 * shots with the cup lifted 1 s after it are the yields' hardest case.
 */

import { describe, expect, it } from 'vitest';
import { median } from '../signal';
import {
  espressoScenario,
  simulateSession,
  toRawRecording,
  type EspressoScenarioOptions,
} from '../sim';
import { analyzeRaw, type SegmentAnalysis } from './recording-analysis';
import {
  absQuantile,
  errorsOf,
  phasedPumpOnMs,
  seeds,
  shotErrors,
  timelineOffset,
  type ShotErrors,
} from './test-runs';

interface TappedShot {
  readonly segment: SegmentAnalysis;
  readonly errors: ShotErrors;
}

/** The usual shot with `seed`, tapped at pump_on (its phase varied, D-036), and analysed. */
function tappedShot(seed: number, options: EspressoScenarioOptions = {}): TappedShot {
  const pumpOnMs = phasedPumpOnMs(seed);
  const session = simulateSession(
    espressoScenario({ seed, pumpOnMs, manualStartMs: pumpOnMs, ...options }),
  );
  const raw = toRawRecording(session);
  const run = analyzeRaw(raw);
  expect(run.analysis.segments).toHaveLength(1);
  const [segment] = run.analysis.segments;
  const offset = timelineOffset(session, raw.frames, run.timeline);
  return { segment, errors: shotErrors(segment, session.truth.shots[0], offset) };
}

/** `make`'s value, made on the first call: shots shared by the tests that read them. */
function once<T>(make: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= make());
}

/** 100 shots, the cup lifted 30 s after the pump stops. */
const usual = once(() => seeds(100).map((seed) => tappedShot(seed)));

/** The same shots, the cup lifted 1 s after the pump stops. */
const liftedEarly = once(() =>
  seeds(100).map((seed) => tappedShot(seed, { cupOffAfterPumpOffMs: 1000 })),
);

/** The errors' median, 90% and worst magnitudes, and the magnitude of their median. */
function spread(errors: readonly number[]) {
  return {
    median: absQuantile(errors, 0.5),
    p90: absQuantile(errors, 0.9),
    worst: absQuantile(errors, 1),
    bias: Math.abs(median(errors)),
  };
}

describe('the targets agreed for the real scale (D-060)', () => {
  it('times every shot from the tap, flagged as manual, and calls it espresso', () => {
    for (const { segment } of usual()) {
      expect(segment.markers.pumpOn?.source).toBe('manual');
      expect(segment.espresso).toBe(true);
    }
    // In 2 shots in 100 the knee reads the drain under `minDrainTauS`: no tail fit, and the
    // yield measured all the same.
    const flags = usual().map(({ segment }) => segment.flags.join(' '));
    const usualFlags = 'no-vibration manual-pump-on';
    expect(flags.filter((shot) => shot === usualFlags).length).toBeGreaterThanOrEqual(97);
    for (const shot of flags) expect([usualFlags, `${usualFlags} tail-too-short`]).toContain(shot);
    for (const { segment } of liftedEarly()) {
      expect(segment.markers.pumpOn?.source).toBe('manual');
      expect(segment.espresso).toBe(true);
    }
  });

  it('times first_drip: median 0.05 s, 90% within 0.1 s, all within 0.15 s, bias 0.05 s', () => {
    // Measured: median 0.034 s, 90% within 0.072 s, worst 0.091 s, 0.032 s late. Lifting the
    // cup early changes nothing here.
    const errors = errorsOf(usual(), 'firstDripT');
    expect(errors).toHaveLength(100);
    const s = spread(errors);
    expect(s.median).toBeLessThanOrEqual(0.05);
    expect(s.p90).toBeLessThanOrEqual(0.1);
    expect(s.worst).toBeLessThanOrEqual(0.15);
    expect(s.bias).toBeLessThanOrEqual(0.05);
  });

  it('times pump_off: median 0.05 s, 90% within 0.1 s, all within 0.2 s, bias 0.05 s', () => {
    // Measured: median 0.029 s, 90% within 0.076 s, worst 0.117 s, 0.025 s late; the cup lifted
    // after 1 s, worst 0.113 s.
    for (const shots of [usual(), liftedEarly()]) {
      const errors = errorsOf(shots, 'pumpOffT');
      expect(errors).toHaveLength(100);
      const s = spread(errors);
      expect(s.median).toBeLessThanOrEqual(0.05);
      expect(s.p90).toBeLessThanOrEqual(0.1);
      expect(s.worst).toBeLessThanOrEqual(0.2);
      expect(s.bias).toBeLessThanOrEqual(0.05);
    }
  });

  it('gives the first-drip time within 0.15 s, the extraction and the total within 0.2 s', () => {
    // Measured, at worst: 0.106 s, 0.101 s (0.126 s with the cup lifted after 1 s), 0.132 s.
    for (const { errors: e } of [...usual(), ...liftedEarly()]) {
      expect(Math.abs(e.firstDripS!)).toBeLessThanOrEqual(0.15);
      expect(Math.abs(e.extractionS!)).toBeLessThanOrEqual(0.2);
      expect(Math.abs(e.totalS!)).toBeLessThanOrEqual(0.2);
    }
  });

  it('gives the yields within 0.05 and 0.1 g, w(pump_off) within 0.25 g, the flow within 2%', () => {
    // Measured, at worst: yield 0.002 g (0.031 g with the cup lifted after 1 s), honest yield
    // 0.000 g (0.080 g), w(pump_off) 0.179 g (0.194 g), flow 0.5%.
    for (const { errors: e } of [...usual(), ...liftedEarly()]) {
      if (e.yieldG !== null) expect(Math.abs(e.yieldG)).toBeLessThanOrEqual(0.05);
      expect(Math.abs(e.honestYieldG!)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(e.pumpOffWeightG!)).toBeLessThanOrEqual(0.25);
      expect(Math.abs(e.flowRatio!)).toBeLessThanOrEqual(0.02);
    }
    expect(errorsOf(usual(), 'yieldG')).toHaveLength(100);
    // Lifted after 1 s, a drain the knee reads under `minDrainTauS` leaves no tail to take the
    // yield from: 2 shots in 100.
    expect(errorsOf(liftedEarly(), 'yieldG').length).toBeGreaterThanOrEqual(97);
  });

  it('sets no target for τ: it reads about a fifth short, within about half', () => {
    // A drain with τ 0.2 s is two or three readings at 0.1 g (D-059). The truth's τ is the
    // stream's, and the shot's last partial drop never lands, so τ reads short. Measured: 98
    // shots in 100, median 19% short, worst 47%.
    const ratios = errorsOf(usual(), 'tauRatio');
    expect(ratios.length).toBeGreaterThanOrEqual(95);
    expect(absQuantile(ratios, 1)).toBeLessThan(0.6);
  });
});
