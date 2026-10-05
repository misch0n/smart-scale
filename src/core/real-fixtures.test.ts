import { describe, expect, it } from 'vitest';
import probeSession from '../../fixtures/real/2026-10-04_probe-session_20444bd0.json?raw';
import twoShots from '../../fixtures/real/2026-10-05_two-shots_0a69da56.json?raw';
import { analyzeRaw, quantisationStep, segment } from './analysis';
import { parseExport } from './export';
import type { RawFrame } from './model';
import {
  allWhitelistedCommands,
  decodeFrame,
  hasTrustedWeight,
  tareAndStartTimer,
  toHex,
} from './protocol';
import { simulateSession, toRawRecording } from './sim';
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
    // FF12 sent two event frames in the Ultra's layout, both in the automatic mode: when the
    // scale started its own run, and at the app's stop that ended it. Nothing at the button's
    // tare (118.5 s; A7).
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
      // The app's stop ended the automatic mode's run, and the scale zeroed itself.
      { t: 82.35, source: 'jump' },
      // The scale's button: pressed at 117.5 s, which put 13.1 g on the platform, then let go
      // and tared in one frame at 118.5 s (D-051).
      { t: 117.39, source: 'jump' },
      { t: 126.36, source: 'command' },
      { t: 241.05, source: 'command' },
      { t: 256.17, source: 'command' },
    ];
    expect(tares.map((step) => step.tareSource)).toEqual(expected.map((tare) => tare.source));
    tares.forEach((step, i) => expect(Math.abs(step.startT - expected[i].t)).toBeLessThan(0.15));
    // Net: the item, tared, reads minus its 9.6 g once lifted.
    for (const g of gramsBetween(112.9, 115)) expect([-9.7, -9.6]).toContain(g);
  });

  it('keeps the zero where the recording started, through every tare (D-051)', () => {
    const { samples, steps, transients } = segment(buildTimeline(session.frames), session.events);
    const tracked = (fromS: number, toS: number) =>
      samples.t.flatMap((t, i) => (t >= fromS && t < toS ? [samples.weightG[i]] : []));
    // Every tare: the level before and after agree.
    for (const step of steps.filter((each) => each.kind === 'tare')) {
      expect(Math.abs(step.levelAfterG - step.levelBeforeG)).toBeLessThan(0.05);
    }
    // The button's tare is measured from before its press, which is a transient.
    const button = steps.find((step) => step.tareSource === 'jump' && step.startT > 117)!;
    expect(button.jumps).toBe(2);
    expect(button.sizeG).toBeCloseTo(9.6, 6);
    expect(transients).toContainEqual({ startT: button.startT, endT: button.endT, jumps: 2 });
    // The empty platform reads 0 after it, and the 9.6 g item 9.6 g, as before it.
    for (const g of [...tracked(113.6, 115), ...tracked(118.6, 119)]) expect(g).toBeCloseTo(0, 6);
    for (const g of [...tracked(60, 112), ...tracked(124, 218)]) expect(g).toBeCloseTo(9.6, 6);
    expect(tracked(300, 338).every((g) => Math.abs(g - 9.7) < 1e-6)).toBe(true);
  });

  it('analyses to no shot and no flag, timed by the scale where its timer ran (T1.14)', () => {
    const { analysis } = analyzeRaw(session);
    expect(analysis.segments).toEqual([]);
    expect(analysis.flags).toEqual([]);
    expect(analysis.refusedFrames).toBe(0);
    expect(analysis.timeline.frames).toBe(3359);
    expect(analysis.timeline.rateSource).toBe('fitted');
    expect(analysis.steps.filter((step) => step.kind === 'tare')).toHaveLength(5);
  });
});

/*
 * The simulator against the same recording (T1.22): an idle session on the simulator's defaults
 * should read like session 1 where the two can be compared. D-021 lists the rest.
 */
describe('the simulator against hardware session 1 (D-037)', () => {
  const [real] = parseExport(probeSession).bundle.recordings;
  // A 9.6 g item put on, tared and the timer started with 07, then 100 s of nothing.
  const simulated = toRawRecording(
    simulateSession({
      seed: 1,
      durationMs: 110_000,
      script: [
        { type: 'cup-on', atMs: 1000, massG: 9.6 },
        { type: 'command', atMs: 3000, command: tareAndStartTimer() },
      ],
    }),
  );
  const both = [
    ['real', real.frames],
    ['simulated', simulated.frames],
  ] as const;
  const timelines = both.map(([, frames]) => buildTimeline(frames));
  const weightsOf = (frames: readonly RawFrame[]) =>
    frames.flatMap((frame) => {
      const decoded = decodeFrame(frame.bytes);
      return decoded.kind === 'weight' ? [{ t: frame.tMs / 1000, frame: decoded }] : [];
    });

  it('weighs in the same 0.1 g steps', () => {
    for (const [, frames] of both) {
      expect(quantisationStep(weightsOf(frames).map(({ frame }) => frame.weightG))).toBe(0.1);
    }
  });

  it('samples every 100.7 ms, on a clock 0.69% slow', () => {
    const [realTimeline, simTimeline] = timelines;
    expect(simTimeline.nominalInterval?.source).toBe('device');
    expect(
      Math.abs(simTimeline.nominalInterval!.ms - realTimeline.nominalInterval!.ms),
    ).toBeLessThan(0.02);
    expect(simTimeline.driftPpm!).toBeLessThan(0);
    expect(Math.abs(simTimeline.driftPpm! - realTimeline.driftPpm!)).toBeLessThan(50);
  });

  it('counts the timer in 100 ms ticks, one per sample', () => {
    for (const [i, [, frames]] of both.entries()) {
      expect(weightsOf(frames).every(({ frame }) => frame.timerMs % 100 === 0)).toBe(true);
      for (const run of timelines[i].runs) {
        expect(run.endTimerMs - run.startTimerMs).toBe(100 * (run.frameCount - 1));
      }
    }
    // The simulated run, like each the app started in session 1, reads 100 ms in its first
    // frame.
    expect(timelines[1].runs.map((run) => run.startTimerMs)).toEqual([100]);
  });

  it('holds the reading still for 92 s at rest, while its own flow figure moves', () => {
    const still = (frames: readonly RawFrame[], fromS: number) =>
      weightsOf(frames).filter(({ t }) => t >= fromS && t < fromS + 92.2);
    for (const [name, frames] of both) {
      const rows = still(frames, name === 'real' ? 126.5 : 6);
      expect(rows.length).toBeGreaterThan(900);
      expect(new Set(rows.map(({ frame }) => frame.weightG))).toEqual(new Set([0]));
      // The scale's flow, worked out before it rounds the weight: σ 0.018 g/s in session 1.
      const flows = rows.map(({ frame }) => frame.flowGps);
      const mean = flows.reduce((a, b) => a + b, 0) / flows.length;
      const sd = Math.sqrt(flows.reduce((a, b) => a + (b - mean) ** 2, 0) / (flows.length - 1));
      expect(sd).toBeGreaterThan(0.014);
      expect(sd).toBeLessThan(0.022);
    }
  });

  it('delivers frames on a 30 ms connection-event grid, as late on the timer’s line', () => {
    const [realJitter, simJitter] = timelines.map((timeline) => timeline.jitter!);
    expect(Math.abs(simJitter.medianMs - realJitter.medianMs)).toBeLessThan(2);
    expect(Math.abs(simJitter.p95Ms - realJitter.p95Ms)).toBeLessThan(3);
    // Arrival gaps of three and four connection intervals, and a few of two and five.
    const shares = both.map(([, frames]) => {
      const t = weightsOf(frames).map((row) => row.t * 1000);
      const gaps = t
        .slice(1)
        .map((ms, k) => ms - t[k])
        .filter((ms) => ms < 200);
      return [2, 3, 4, 5].map(
        (n) => gaps.filter((ms) => Math.abs(ms - 30 * n) <= 5).length / gaps.length,
      );
    });
    shares[1].forEach((share, n) => expect(Math.abs(share - shares[0][n])).toBeLessThan(0.03));
    expect(shares[0][1] + shares[0][2]).toBeGreaterThan(0.9);
  });

  it('replays the probe’s timer commands of session 1 into the same timer runs', () => {
    // From 250 s, when the scale was in its timer mode: the same commands at the same times.
    const commands = real.events.flatMap((event) =>
      event.type === 'command-sent' && event.tMs > 250_000
        ? [{ atMs: event.tMs, hex: event.data.hex }]
        : [],
    );
    const replayed = toRawRecording(
      simulateSession({
        seed: 1,
        durationMs: 300_000,
        script: [
          { type: 'cup-on', atMs: 252_400, massG: 9.7 },
          ...commands.map(({ atMs, hex }) => ({
            type: 'command' as const,
            atMs,
            command: allWhitelistedCommands().find((c) => toHex(c.bytes, '') === hex)!,
          })),
        ],
      }),
    );
    const runsFrom = (frames: readonly RawFrame[]) =>
      buildTimeline(frames.filter((frame) => frame.tMs > 250_000)).runs.map((run) => [
        run.startTimerMs,
        run.endTimerMs,
      ]);
    const realRuns = runsFrom(real.frames);
    expect(realRuns).toEqual([
      [100, 4300],
      [100, 12100],
      [100, 5600],
    ]);
    // `04` doesn't resume the frozen timer, `06` doesn't stop a running one; each run starts
    // at 100 ms and ends within a tick of the real one.
    const simRuns = runsFrom(replayed.frames);
    expect(simRuns).toHaveLength(3);
    simRuns.forEach(([start, end], k) => {
      expect(start).toBe(100);
      expect(Math.abs(end - realRuns[k][1])).toBeLessThanOrEqual(100);
    });
  });
});

/*
 * Session 2 (2026-10-05, D-048): beans dosed, ground and weighed in the dosing cup, then two
 * shots, each started with Tare + start (07) as the pump went on. Shot A (264.7 s) ran fast, and
 * the scale was moved as it began; shot B (551.1 s) is a normal espresso. The scale was in its
 * timer mode. fixtures/real/README.md has the timeline.
 */
describe('hardware session 2 (2026-10-05): beans, grounds and two shots', () => {
  const [session] = parseExport(twoShots).bundle.recordings;
  const decoded = session.frames.map((frame) => ({ frame, decoded: decodeFrame(frame.bytes) }));
  const weights = decoded.flatMap(({ frame, decoded: result }) =>
    result.kind === 'weight' ? [{ t: frame.tMs / 1000, frame: result }] : [],
  );
  const between = (fromS: number, toS: number) =>
    weights.filter(({ t }) => t >= fromS && t < toS).map(({ frame }) => frame);
  const sd = (values: readonly number[]) => {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  };
  const { analysis } = analyzeRaw(session);
  const [, shotA, shotB] = analysis.segments;

  it('decodes every weight frame, and two FF12 frames of types it doesn’t know (03 0C, 03 0E)', () => {
    expect(weights).toHaveLength(6085);
    expect(weights.every(({ frame }) => hasTrustedWeight(frame))).toBe(true);
    const ff12 = decoded.filter(({ frame }) => frame.source === 'ff12');
    expect(
      ff12.map(({ decoded: frame }) => (frame.kind === 'unknown' ? frame.typeByte : null)),
    ).toEqual([0x0c, 0x0e]);
    // 03 0C carries "SN" and the scale's serial number, masked with X in this fixture.
    expect(String.fromCharCode(...ff12[0].frame.bytes.slice(4, 18))).toBe('SNXXXXXXXXXXXX');
  });

  it('reads tenths, some a hundredth short even at rest: a truncated float (A11)', () => {
    const grams = weights.map(({ frame }) => frame.weightG);
    for (const g of grams) expect(Math.abs(g * 10 - Math.round(g * 10))).toBeLessThan(0.11);
    const short = grams.filter((g) => Math.round(g * 100) % 10 !== 0);
    expect(short.length).toBeGreaterThan(700);
    for (const g of short) expect(Math.abs(Math.round(g * 100)) % 10).toBe(9);
    // Shot B settles on 35.1 g, which the scale sends as 35.09.
    expect(new Set(between(589.2, 590.6).map((frame) => frame.weightG))).toEqual(new Set([35.09]));
  });

  it('shows no pump vibration in the weight or in the scale’s flow figure (A2)', () => {
    // Shot B: the pump ran from the tap at 551.1 s; the first drip came at about 554.75 s.
    const pumping = between(552.3, 554.7);
    const resting = between(547.2, 551);
    expect(pumping.length).toBeGreaterThan(20);
    expect(pumping.filter((frame) => frame.weightG !== -0.2).length).toBeLessThanOrEqual(2);
    expect(new Set(resting.map((frame) => frame.weightG))).toEqual(new Set([0]));
    expect(sd(pumping.map((frame) => frame.flowGps))).toBeLessThan(0.03);
    expect(sd(resting.map((frame) => frame.flowGps))).toBeLessThan(0.03);
  });

  it('tares and starts the timer with 07 in the timer mode (A5)', () => {
    const sent = session.events.find(
      (event) => event.type === 'command-sent' && event.data.command === 'tareAndStartTimer',
    )!;
    const t = sent.tMs / 1000;
    expect(t).toBeCloseTo(264.73, 2);
    const after = between(t, t + 1);
    expect(between(t - 2, t).every((frame) => frame.weightG === 264.79)).toBe(true);
    expect(after.findIndex((frame) => frame.weightG === 0)).toBe(0);
    const ticking = weights.find(({ t: at, frame }) => at > t && frame.timerMs === 100)!;
    expect(ticking.t - t).toBeLessThan(0.4);
  });

  it('finds the bean pour and both shots, and shot B’s pump_off by the regime change', () => {
    expect(analysis.segments).toHaveLength(3);
    expect(analysis.segments[0].espresso).toBe(false); // the beans, 28–34 s
    expect(shotA.window.startT).toBeGreaterThan(237);
    expect(shotA.window.endT).toBeLessThan(314);
    expect(shotB.window.startT).toBeGreaterThan(486);
    expect(shotB.window.endT).toBeLessThan(591);
    for (const shot of [shotA, shotB]) expect(shot.flags).toContain('no-vibration');
    expect(shotB.markers.pumpOff?.detector).toBe('regime-change');
    expect(Math.abs(shotB.markers.pumpOff!.t - 586.8)).toBeLessThan(0.3);
    expect(Math.abs(shotB.metrics.yieldG! - 35.1)).toBeLessThan(0.3);
  });

  it('measures shot B from before its pump’s 0.2 g dip, and without the hand on the cup (T1.16)', () => {
    // The reading dipped from 0.0 to −0.2 g 0.3 s after the tap and held there until the first
    // drip. The yields come from the level before the tap; the cup settled on 35.1 g.
    expect(shotB.window.baseline.endT).toBeCloseTo(551.08, 2);
    expect(Math.abs(shotB.metrics.yieldG! - 35.1)).toBeLessThan(0.05);
    // Grabbing the cup pressed it down 0.5 g before the lift: no part of what reached it.
    expect(Math.abs(shotB.metrics.honestYieldG! - 35.1)).toBeLessThan(0.05);
    // The flow was 1.75 g/s as the pump stopped, with 34.6–34.8 g in the cup.
    expect(Math.abs(shotB.metrics.pumpOffWeightG! - 34.75)).toBeLessThan(0.15);
  });

  it('times the first drops as the readings show them, lumps of 0.2 g (T1.16)', () => {
    // Shot B: −0.2 g until 554.68 s, 0.0 at 554.78 s; the scale's own flow figure first moved
    // at 554.68 s. Shot A: 0.0 until 267.89 s, 0.2 g at 267.99 s.
    expect(Math.abs(shotB.markers.firstDrip!.t - 554.72)).toBeLessThan(0.08);
    expect(Math.abs(shotA.markers.firstDrip!.t - 267.95)).toBeLessThan(0.08);
  });

  it('reads the drain from the knee: over within a second, τ about 0.2 s (T1.16)', () => {
    for (const [shot, tau, final] of [
      [shotA, 0.27, 47.3],
      [shotB, 0.18, 35.1],
    ] as const) {
      expect(shot.tail?.source).toBe('knee');
      expect(Math.abs(shot.metrics.tauS! - tau)).toBeLessThan(0.05);
      expect(Math.abs(shot.tail!.finalWeightG - final)).toBeLessThan(0.1);
      expect(shot.flags).not.toContain('tail-too-short');
    }
  });

  // Known misses on real shots, for T1.16 (D-048). Each one fails today. When T1.16 fixes one,
  // its `it.fails` turns red: make it an `it`.
  it('reads the quantum as 0.1 g, readings like 35.09 snapped back to the grid (T1.16)', () => {
    expect(analysis.quantisationG).toBe(0.1);
    expect(analysis.toleranceG).toBe(0.1);
  });

  it('counts shot A’s whole yield, 47.3 g: the moved scale is part of the pour (T1.16)', () => {
    expect(Math.abs(shotA.metrics.yieldG! - 47.3)).toBeLessThan(0.15);
    expect(shotA.flags).toContain('pour-disturbed');
    expect(shotA.flags).not.toContain('other-steps');
    // The first liquid landed at about 267.95 s, before the scale was moved.
    expect(Math.abs(shotA.markers.firstDrip!.t - 267.95)).toBeLessThan(0.1);
  });

  it('counts the bean pour’s bursts as the pour: 17.7 g of beans (T1.16)', () => {
    const [beans] = analysis.segments;
    expect(Math.abs(beans.metrics.yieldG! - 17.7)).toBeLessThan(0.15);
    expect(beans.flags).toContain('pour-disturbed');
  });

  it('calls both shots espresso, timed from the tap: pump_on from 07 (T1.16, Q4)', () => {
    expect([shotA.espresso, shotB.espresso]).toEqual([true, true]);
    for (const [shot, tapT] of [
      [shotA, 264.73],
      [shotB, 551.08],
    ] as const) {
      expect(shot.markers.pumpOn?.source).toBe('manual');
      expect(shot.markers.pumpOn!.t).toBeCloseTo(tapT, 2);
      expect(shot.flags).toContain('manual-pump-on');
    }
    // The first drip came 3.3 and 3.7 s after the taps, by the readings.
    expect(Math.abs(shotA.metrics.firstDripS! - 3.25)).toBeLessThan(0.2);
    expect(Math.abs(shotB.metrics.firstDripS! - 3.6)).toBeLessThan(0.3);
    // The bean pour has no tap and no drain: no espresso.
    expect(analysis.segments[0].markers.pumpOn).toBeNull();
  });
});
