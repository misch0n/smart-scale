import { describe, expect, it } from 'vitest';
import probeSession from '../../fixtures/real/2026-10-04_probe-session_20444bd0.json?raw';
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
