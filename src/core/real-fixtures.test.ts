import { describe, expect, it } from 'vitest';
import probeSession from '../../fixtures/real/2026-10-04_probe-session_20444bd0.json?raw';
import { quantisationStep, segment } from './analysis';
import { parseExport } from './export';
import { decodeFrame, hasTrustedWeight } from './protocol';
import { buildTimeline } from './timebase';

/*
 * Real recordings from the probe (fixtures/real/, U1.1), read by the code that will analyse
 * every shot. docs/hardware-tests.md "Session 1" has the answers they gave, and
 * fixtures/real/README.md what happens in each one.
 */

describe('hardware session 1 (2026-10-04): probe commands, tares and a lift, no shot', () => {
  const [session] = parseExport(probeSession).bundle.recordings;
  const decoded = session.frames.map((frame) => ({ frame, decoded: decodeFrame(frame.bytes) }));
  const weights = decoded.flatMap(({ frame, decoded: result }) =>
    result.kind === 'weight' ? [{ t: frame.tMs / 1000, frame: result }] : [],
  );
  const gramsBetween = (fromS: number, toS: number) =>
    weights.filter(({ t }) => t >= fromS && t < toS).map(({ frame }) => frame.weightG);

  it('decodes every frame: checksums valid, grams, known signs (A9, A10, A16)', () => {
    const ff11 = decoded.filter(({ frame }) => frame.source === 'ff11');
    expect(ff11).toHaveLength(3359);
    expect(ff11.every(({ decoded: frame }) => frame.kind === 'weight')).toBe(true);
    expect(weights.every(({ frame }) => hasTrustedWeight(frame))).toBe(true);
    expect(new Set(weights.map(({ frame }) => frame.weightSignByte))).toEqual(
      new Set([0x2b, 0x2d]),
    );
    // FF12 sent two event frames in the Ultra's layout: when the scale started its own timer,
    // and at the app's stop. Nothing at the button's tare (118.5 s; A7).
    const ff12 = decoded.filter(({ frame }) => frame.source === 'ff12');
    expect(ff12.map(({ decoded: frame }) => (frame.kind === 'event' ? frame.state : null))).toEqual(
      ['started', 'stopped'],
    );
  });

  it('weighs in tenths of a gram, and holds still at rest (A11)', () => {
    const grams = weights.map(({ frame }) => frame.weightG);
    expect(quantisationStep(grams)).toBe(0.1);
    // While the weight moves fast, a few readings fall a hundredth short of a tenth: the scale
    // truncates a float (38.6 → 38.59).
    const offTenths = grams.filter((g) => Math.round(g * 100) % 10 !== 0);
    expect(offTenths.length).toBeLessThan(25);
    for (const g of offTenths) expect(Math.abs(Math.round(g * 100)) % 10).toBe(9);
    // 92 s with the tared item on the platform, and not one change.
    const still = gramsBetween(126.5, 218.7);
    expect(still.length).toBeGreaterThan(900);
    expect(new Set(still)).toEqual(new Set([0]));
  });

  it('turns smoothing off from the second frame (A13)', () => {
    expect(weights.map(({ frame }) => frame.flowSmoothing).slice(0, 2)).toEqual([1, 0]);
    expect(weights.slice(1).every(({ frame }) => frame.flowSmoothing === 0)).toBe(true);
    expect(session.events.filter((event) => event.type === 'smoothing-confirmed')).toHaveLength(1);
  });

  it('samples every 100.7 ms, and the timer ticks 100 ms per sample on a slow clock (A1)', () => {
    const timeline = buildTimeline(session.frames);
    expect(timeline.rateSource).toBe('fitted');
    expect(timeline.nominalInterval?.source).toBe('device');
    expect(timeline.nominalInterval?.ms).toBeCloseTo(100.7, 1);
    // The scale's clock runs 0.7% slow against the phone's.
    expect(timeline.driftPpm ?? NaN).toBeGreaterThan(-7100);
    expect(timeline.driftPpm ?? NaN).toBeLessThan(-6800);
    // The timer field moves in whole ticks, one per sample while it runs. A tick that came
    // twice (1.9 s, at 28.4 s) splits a run.
    expect(weights.every(({ frame }) => frame.timerMs % 100 === 0)).toBe(true);
    expect(timeline.runs.map((run) => [run.startTimerMs, run.endTimerMs])).toEqual([
      [1100, 1800],
      [2000, 55400],
      [100, 4300],
      [100, 12100],
      [100, 5600],
    ]);
    for (const run of timeline.runs) {
      expect(run.endTimerMs - run.startTimerMs).toBe(100 * (run.frameCount - 1));
    }
  });

  it('finds the tares from the log and the jumps, and no shot (A3, A7)', () => {
    const segmentation = segment(buildTimeline(session.frames), session.events);
    expect(segmentation.refusedFrames).toBe(0);
    expect(segmentation.quantisationG).toBe(0.1);
    expect(segmentation.shotWindows).toEqual([]);
    const tares = segmentation.steps.filter((step) => step.kind === 'tare');
    const expected = [
      // The app's stop ended the scale's own timer run, and the scale zeroed itself.
      { t: 82.35, source: 'jump' },
      // The scale's button.
      { t: 118.41, source: 'jump' },
      { t: 126.36, source: 'command' },
      { t: 241.05, source: 'command' },
      { t: 256.17, source: 'command' },
    ];
    expect(tares.map((step) => step.tareSource)).toEqual(expected.map((tare) => tare.source));
    tares.forEach((step, i) => expect(Math.abs(step.startT - expected[i].t)).toBeLessThan(0.15));
    // Net: the item, tared, reads minus its 9.6 g once lifted.
    for (const g of gramsBetween(112.9, 115)) expect([-9.7, -9.6]).toContain(g);
  });
});
