import { describe, expect, it } from 'vitest';
import { createRawFrame, type CharacteristicName, type RawFrame } from '../model';
import { encodeEventFrame, encodeWeightFrame } from '../protocol';
import {
  buildTimeline,
  decodeWeightFrames,
  deviceRunIndexes,
  timelineOf,
  type Timeline,
} from './timeline';

const REC = '01923456-789a-7000-8000-000000000001';

function weightFrame(
  seq: number,
  tMs: number,
  timerMs: number,
  options: { source?: CharacteristicName; unitByte?: number } = {},
): RawFrame {
  const bytes = encodeWeightFrame({ timerMs, weightG: 1.5, unitByte: options.unitByte });
  return createRawFrame(REC, seq, tMs, options.source ?? 'ff11', bytes);
}

/** Frames with these timer values, sampled every 100 ms and arriving `delay(i)` later. */
function series(timers: readonly number[], delay: (i: number) => number = () => 20): RawFrame[] {
  return timers.map((timer, i) => weightFrame(i, 1000 + 100 * i + delay(i), timer));
}

const runsOf = (timers: readonly number[]): number[][] =>
  deviceRunIndexes(decodeWeightFrames(series(timers)));

const isNonDecreasing = (timeline: Timeline): boolean =>
  timeline.samples.every((s, i) => i === 0 || s.t >= timeline.samples[i - 1].t);

describe('decodeWeightFrames', () => {
  it('keeps the FF11 weight frames that decode, in seq order', () => {
    const corrupt = weightFrame(3, 300, 300);
    corrupt.bytes[6] ^= 0x01; // the checksum no longer matches
    const frames: RawFrame[] = [
      weightFrame(5, 500, 500),
      weightFrame(0, 0, 0),
      weightFrame(1, 100, 100, { source: 'ff12' }),
      createRawFrame(
        REC,
        2,
        200,
        'ff11',
        encodeEventFrame({ stateByte: 1, timerMs: 0, weightG: 0 }),
      ),
      corrupt,
      createRawFrame(
        REC,
        4,
        400,
        'ff11',
        encodeWeightFrame({ timerMs: 400, weightG: 1 }).slice(0, 12),
      ),
      weightFrame(6, 600, 600, { unitByte: 0x02 }), // not grams: its timer is still good
    ];
    const weights = decodeWeightFrames(frames);
    expect(weights.map((w) => [w.seq, w.tMs, w.frame.timerMs])).toEqual([
      [0, 0, 0],
      [5, 500, 500],
      [6, 600, 600],
    ]);
    expect(weights[2].frame.unitOk).toBe(false);
  });
});

describe('deviceRunIndexes', () => {
  it('leaves out zeros, and frozen values with the first frame that froze', () => {
    // 05 froze the timer between 237 and the next sample: 337 is when it stopped, not a sample.
    expect(runsOf([0, 0, 0, 37, 137, 237, 337, 337, 337])).toEqual([[3, 4, 5]]);
  });

  it('starts a new run where the timer falls: a restart (07) or the 24-bit wrap', () => {
    expect(runsOf([37, 137, 237, 40, 140, 240])).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ]);
    expect(runsOf([16_777_100, 16_777_200, 85, 185])).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it('starts a new run where a frozen timer resumes (04), without the frozen frames', () => {
    expect(runsOf([37, 137, 237, 237, 237, 240, 340])).toEqual([
      [0, 1],
      [5, 6],
    ]);
  });

  it('keeps a run going across frames that failed to decode', () => {
    const frames = series([100, 200, 300, 400]);
    const broken = createRawFrame(REC, 99, 1250, 'ff11', new Uint8Array([3, 11, 0]));
    const timeline = buildTimeline([...frames.slice(0, 2), broken, ...frames.slice(2)], {
      minRunFrames: 4,
    });
    expect(timeline.runs).toHaveLength(1);
    expect(timeline.runs[0].frameCount).toBe(4);
  });
});

describe('timelineOf', () => {
  it('uses arrival time when the timer never runs', () => {
    const timeline = buildTimeline(series([0, 0, 0, 0, 0], (i) => [20, 35, 20, 90, 20][i]));
    expect(timeline.samples.map((s) => [s.t, s.timeSource, s.run])).toEqual([
      [1.02, 'arrival', null],
      [1.135, 'arrival', null],
      [1.22, 'arrival', null],
      [1.39, 'arrival', null],
      [1.42, 'arrival', null],
    ]);
    expect(timeline.samples[1].arrivalT).toBe(1.135);
    expect(timeline.runs).toEqual([]);
    expect(timeline.rateSource).toBe('none');
    expect(timeline.jitter).toBeNull();
    expect(timeline.driftPpm).toBeNull();
    expect(timeline.arrivalCorrectionMs).toBe(0);
    expect(timeline.nominalInterval).toEqual({ ms: 100, source: 'arrival' });
  });

  it('copes with no frames, or one', () => {
    expect(buildTimeline([])).toMatchObject({ samples: [], runs: [], nominalInterval: null });
    expect(buildTimeline(series([0])).nominalInterval).toBeNull();
  });

  it("maps a long run onto the arrival clock, with the scale clock's drift", () => {
    // The scale's clock runs 300 ppm fast; frames wait 15 ms, then a connection event.
    const timers = Array.from({ length: 400 }, (_, i) => 37 + 100 * i);
    const sampleMs = (timer: number): number => 5000 + timer / 1.0003;
    const delays = [0, 7, 14];
    const frames = timers.map((timer, i) =>
      weightFrame(i, sampleMs(timer) + 15 + delays[i % 3], timer),
    );
    const timeline = buildTimeline(frames);
    const [run] = timeline.runs;
    expect(run).toMatchObject({
      firstSeq: 0,
      lastSeq: 399,
      frameCount: 400,
      startTimerMs: 37,
      endTimerMs: 39_937,
    });
    expect(timeline.rateSource).toBe('fitted');
    // Within a few ppm: the repeating delays bias the slope a little.
    expect(timeline.driftPpm).toBeCloseTo(300, -1);
    expect(run.ownDriftPpm).toBe(timeline.driftPpm); // the only run
    for (const [i, sample] of timeline.samples.entries()) {
      expect(sample.timeSource).toBe('device');
      expect(sample.run).toBe(0);
      expect(sample.t * 1000).toBeCloseTo(sampleMs(timers[i]) + 15, 0);
    }
    expect(run.jitter.medianMs).toBeCloseTo(7, 0);
    expect(run.jitter.maxMs).toBeCloseTo(14, 0);
    expect(timeline.nominalInterval?.source).toBe('device');
    expect(timeline.nominalInterval?.ms).toBeCloseTo(100 / 1.0003, 3);
  });

  it('gives runs too short to fit a rate the least offset and rate 1', () => {
    const short = buildTimeline(series([100, 200, 300, 400], (i) => [30, 21, 25, 40][i]));
    expect(short.rateSource).toBe('too-short');
    expect(short.runs[0]).toMatchObject({ rate: 1, ownDriftPpm: null });
    // arrival − timer: 1030 − 100, 1121 − 200, 1225 − 300, 1340 − 400: the least is 921.
    expect(short.runs[0].offsetMs).toBe(921);
    expect(short.samples.map((s) => s.t)).toEqual([1.021, 1.121, 1.221, 1.321]);
    expect(short.driftPpm).toBeNull();
  });

  it('fits one rate over every run, and checks each long run against it', () => {
    const long = Array.from({ length: 350 }, (_, i) => 50 + 100 * i);
    const frames = [
      ...long.map((timer, i) => weightFrame(i, 2000 + timer / 1.001 + (i % 2) * 9, timer)),
      ...[60, 160, 260].map((timer, i) =>
        weightFrame(350 + i, 40_000 + timer / 1.001 + 5 * i, timer),
      ),
    ];
    const timeline = buildTimeline(frames);
    expect(timeline.rateSource).toBe('fitted');
    expect(timeline.driftPpm).toBeCloseTo(1000, -1);
    const [first, second] = timeline.runs;
    expect(second.rate).toBe(first.rate);
    expect(first.ownDriftPpm).toBeCloseTo(1000, -1);
    expect(second.ownDriftPpm).toBeNull();
    // The second run's line touches its fastest frame: the first, at 40 000 + 60 / 1.001.
    expect(second.offsetMs + second.rate * 60).toBeCloseTo(40_000 + 60 / 1.001, 6);
  });

  it('sets aside a fit that drifts implausibly far, and uses rate 1', () => {
    const timers = Array.from({ length: 400 }, (_, i) => 10 + 100 * i);
    const timeline = buildTimeline(timers.map((timer, i) => weightFrame(i, timer * 1.05, timer)));
    expect(timeline.rateSource).toBe('implausible');
    expect(timeline.driftPpm).toBeNull();
    expect(timeline.runs[0].rate).toBe(1);
    expect(timeline.runs[0].ownDriftPpm).toBeCloseTo(-47_619, 0);
  });

  it('shifts arrival-timed frames by the median jitter, and never lets time go back', () => {
    const timers = [0, 0, 0, 37, 137, 237, 337, 437, 437, 437];
    // A stall delivers seq 2 and 3 together. Seq 7 (the timer froze) arrives with seq 6, and
    // seq 8 and 9 come in a burst.
    const arrivals = [1020, 1130, 1400, 1400, 1425, 1530, 1625, 1625, 1800, 1800];
    const timeline = buildTimeline(timers.map((timer, i) => weightFrame(i, arrivals[i], timer)));
    const [run] = timeline.runs;
    expect(run).toMatchObject({ firstSeq: 3, lastSeq: 6, offsetMs: 1288, rate: 1 });
    expect(run.jitter).toMatchObject({ count: 4, meanMs: 20, medianMs: 2.5, maxMs: 75 });
    expect(run.jitter.p95Ms).toBeCloseTo(64.5, 9); // between 5 and 75, at 85%
    expect(timeline.arrivalCorrectionMs).toBe(2.5);
    expect(timeline.samples.map((s) => [Math.round(s.t * 10_000) / 10, s.timeSource])).toEqual([
      [1017.5, 'arrival'],
      [1127.5, 'arrival'],
      [1325, 'arrival'], // 1397.5, held down to the run's first frame
      [1325, 'device'],
      [1425, 'device'],
      [1525, 'device'],
      [1625, 'device'],
      [1625, 'arrival'], // 1622.5, held up to the run's last frame
      [1797.5, 'arrival'],
      [1797.5, 'arrival'],
    ]);
    expect(isNonDecreasing(timeline)).toBe(true);
  });

  it("puts a stretch without the timer on the sample grid, at the runs' period (D-063)", () => {
    // 40 frames before the timer starts, then a run whose rate gives the period: the scale's
    // clock 0.7% slow, so a sample every 100.7 ms of the phone's. Frames wait 10 to 55 ms for a
    // connection event, as in hardware session 1; the run's all 10 ms, for an exact rate.
    const periodMs = 100 / 0.993;
    const waits = [10, 40, 10, 25, 55];
    const frames = Array.from({ length: 80 }, (_, i) => {
      const sampleMs = 1000 + periodMs * i;
      return i < 40
        ? weightFrame(i, sampleMs + waits[i % waits.length], 0)
        : weightFrame(i, sampleMs + 10, 100 * (i - 39));
    });
    const timeline = timelineOf(decodeWeightFrames(frames), { minFitSpanMs: 0 });
    expect(timeline.rateSource).toBe('fitted');
    expect(timeline.gridPeriodMs).toBeCloseTo(periodMs, 6);
    expect(timeline.samples.slice(0, 40).every((s) => s.timeSource === 'grid')).toBe(true);
    expect(timeline.samples.slice(40).every((s) => s.timeSource === 'device')).toBe(true);
    // Each frame its sample time and the least wait, as the run's frames are.
    for (const [i, sample] of timeline.samples.entries()) {
      expect(sample.t * 1000).toBeCloseTo(1000 + periodMs * i + 10, 6);
    }
  });

  it('cuts the grid where a frame was lost, behind a long gap or a late frame', () => {
    // 60 samples before the timer starts; sample 20 lost behind a long gap, sample 45 behind
    // a late frame (44 arrives 70 ms late, 46 on time: a gap of 1.4 periods). Each part gets its
    // own line, under its fastest frame. A run of 40 frames after gives the period.
    const periodMs = 100 / 0.993;
    const waits = [12, 42, 12, 27, 57];
    const wait = (k: number) =>
      k >= 60 ? 12 : k === 44 ? 70 : k === 46 ? 12 : waits[k % waits.length];
    const samples = [
      ...Array.from({ length: 60 }, (_, k) => k).filter((k) => k !== 20 && k !== 45),
      ...Array.from({ length: 40 }, (_, k) => 60 + k),
    ];
    const frames = samples.map((k, i) =>
      weightFrame(i, 1000 + periodMs * k + wait(k), k < 60 ? 0 : 100 * (k - 59)),
    );
    const timeline = timelineOf(decodeWeightFrames(frames), { minFitSpanMs: 0 });
    expect(timeline.gridPeriodMs).toBeCloseTo(periodMs, 6);
    for (const [i, sample] of timeline.samples.slice(0, 58).entries()) {
      expect(sample.timeSource).toBe('grid');
      expect(sample.t * 1000).toBeCloseTo(1000 + periodMs * samples[i] + 12, 6);
    }
  });

  it('fits the period from the arrivals without the timer', () => {
    const waits = [12, 42, 12, 27, 57];
    const frames = Array.from({ length: 120 }, (_, k) =>
      weightFrame(k, 1000 + 100.7 * k + waits[k % waits.length], 0),
    );
    const timeline = buildTimeline(frames);
    expect(timeline.runs).toEqual([]);
    expect(timeline.gridPeriodMs).toBeCloseTo(100.7, 1);
    expect(timeline.nominalInterval).toEqual({ ms: timeline.gridPeriodMs, source: 'grid' });
    for (const [k, sample] of timeline.samples.entries()) {
      expect(sample.timeSource).toBe('grid');
      expect(Math.abs(sample.t * 1000 - (1000 + 100.7 * k + 12))).toBeLessThan(3);
    }
  });

  it('keeps arrival times where the grid would drift from them', () => {
    // 30 frames 110 ms apart before a run at 100 ms: on the run's period the grid would drift
    // away from their arrivals, as lost frames would make it. They keep their arrival times.
    const frames = [
      ...Array.from({ length: 30 }, (_, k) => weightFrame(k, 1000 + 110 * k + 20, 0)),
      ...Array.from({ length: 40 }, (_, k) => weightFrame(30 + k, 4400 + 100 * k, 100 * (k + 1))),
    ];
    const timeline = timelineOf(decodeWeightFrames(frames), { minFitSpanMs: 0 });
    expect(timeline.gridPeriodMs).toBeNull();
    for (const sample of timeline.samples.slice(0, 30)) {
      expect(sample.timeSource).toBe('arrival');
      expect(sample.t).toBe(sample.arrivalT);
    }
    expect(isNonDecreasing(timeline)).toBe(true);
  });

  it('checks its options', () => {
    expect(() => timelineOf([], { minRunFrames: 1 })).toThrow(RangeError);
    expect(() => timelineOf([], { minFitSpanMs: -1 })).toThrow(RangeError);
    expect(() => timelineOf([], { maxDriftPpm: Number.NaN })).toThrow(RangeError);
  });
});
