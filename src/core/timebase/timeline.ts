/**
 * Timebase reconstruction (T1.9; D-006, D-032): one time per weight frame for the analysis, from
 * the scale's timer field where it advances and the arrival time elsewhere.
 *
 * Each frame has two clocks (ARCHITECTURE "Timebase"). Arrival is always there, but BLE
 * connection events, the phone and stalls delay it by a varying amount. The timer field is the
 * scale's stopwatch: exact to the millisecond on the scale's own clock, but only while it runs.
 * It reads 0 before `04` or `07`, and freezes after `05`.
 *
 * - **Device runs.** Stretches of consecutive weight frames whose timer field strictly
 *   increases. A frame whose value is 0, or equals its neighbour's, is left out: 0 means the
 *   timer isn't running, and a repeated value is a frozen timer, whose first frame carries the
 *   moment it stopped rather than its own sample time. A value that falls starts a new run (`07`
 *   restarts at 0, and the 24-bit field wraps after 4.6 hours).
 * - **Mapping.** Each run maps the timer onto the arrival clock: `arrival = offset + rate ×
 *   timer` (`fit.ts`). The rate takes the scale clock's drift out: at 300 ppm a single offset
 *   (D-006) would be 18 ms off after a minute. All runs share it, fitted over all of them once
 *   they span `minFitSpanMs` together, else 1. Each run's offset puts its line under every frame
 *   of it, touching the fastest. A run long enough to fit alone also reports its own drift: the
 *   drift check.
 * - **Elsewhere,** a frame takes its arrival time less the median delay of the device-timed
 *   frames (`arrivalCorrectionMs`), so both kinds of time sit on the same footing. Then each such
 *   time is held between its neighbours, so `t` never decreases.
 *
 * `t` is the sample time plus the link's least latency, a constant no recording can reveal:
 * durations and rates don't depend on it.
 */

import type { RawFrame } from '../model';
import { decodeFrame, type WeightFrame } from '../protocol';
import { median, quantile } from '../signal';
import { leastIntercept, robustSlope, type Point } from './fit';

/** Where a frame's time came from. */
export type TimeSource = 'device' | 'arrival';

/** A decoded FF11 weight frame with its arrival time: the timebase's input. */
export interface ArrivedWeightFrame {
  readonly seq: number;
  /** Arrival, ms since the recording started (`RawFrame.tMs`). */
  readonly tMs: number;
  readonly frame: WeightFrame;
}

/** One weight frame on the analysis time axis. */
export interface TimelineSample {
  readonly seq: number;
  /** The sample's time, s since the recording started (see the module comment). */
  readonly t: number;
  readonly timeSource: TimeSource;
  /** The device run it was timed by (an index into `Timeline.runs`), or null. */
  readonly run: number | null;
  /** Arrival, s since the recording started. */
  readonly arrivalT: number;
  /** The decoded frame, so the analysis needn't decode it again. */
  readonly frame: WeightFrame;
}

/** How late frames arrived compared with the fastest ones: the link's jitter, ms. */
export interface JitterStats {
  readonly count: number;
  readonly meanMs: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly maxMs: number;
}

/**
 * How the recording's rate was settled:
 * - `fitted`: from its device runs' frames;
 * - `implausible`: the fit drifted more than `maxDriftPpm`, so it was set aside for rate 1;
 * - `too-short`: the runs span less than `minFitSpanMs` together, too little to fit: rate 1;
 * - `none`: there are no device runs.
 */
export type RateSource = 'fitted' | 'implausible' | 'too-short' | 'none';

/** A stretch of frames timed by the scale's timer. */
export interface DeviceRun {
  readonly firstSeq: number;
  readonly lastSeq: number;
  readonly frameCount: number;
  /** The timer field of its first and last frame, ms. */
  readonly startTimerMs: number;
  readonly endTimerMs: number;
  /** The mapping `arrival = offsetMs + rate × timer`, ms on both sides; the recording's rate. */
  readonly offsetMs: number;
  readonly rate: number;
  /**
   * The drift check: how much faster the scale's clock ran than the phone's by this run's frames
   * alone, ppm; null when the run spans less than `minFitSpanMs`. It should agree with the
   * recording's `driftPpm`.
   */
  readonly ownDriftPpm: number | null;
  /** Each frame's arrival less its mapped time. */
  readonly jitter: JitterStats;
}

export interface Timeline {
  /** One per FF11 weight frame that decodes, in seq order. `t` never decreases. */
  readonly samples: readonly TimelineSample[];
  /** The device runs, in order: at least `minRunFrames` frames each. */
  readonly runs: readonly DeviceRun[];
  /** How the runs' shared rate was settled. */
  readonly rateSource: RateSource;
  /** How much faster the scale's clock runs than the phone's, ppm: the fitted rate's drift. */
  readonly driftPpm: number | null;
  /** Over every device-timed frame; null without device runs. */
  readonly jitter: JitterStats | null;
  /** Subtracted from arrival-timed frames' arrival: the median jitter, or 0 without runs. */
  readonly arrivalCorrectionMs: number;
  /**
   * The scale's sample interval, ms on the phone's clock: the median step within device runs,
   * or the median arrival gap without them. Null with fewer than two frames.
   */
  readonly nominalInterval: { readonly ms: number; readonly source: TimeSource } | null;
}

export interface TimelineOptions {
  /** The fewest frames a device run needs. Default `DEFAULT_MIN_RUN_FRAMES`. */
  readonly minRunFrames?: number;
  /**
   * The least timer span the runs need together to fit a rate, ms. Default
   * `DEFAULT_MIN_FIT_SPAN_MS`.
   */
  readonly minFitSpanMs?: number;
  /** The largest drift a fit may show and still be used, ppm. Default `DEFAULT_MAX_DRIFT_PPM`. */
  readonly maxDriftPpm?: number;
}

/** Fewer frames than this aren't worth timing by the timer. */
export const DEFAULT_MIN_RUN_FRAMES = 3;

/**
 * Below this span a fitted rate is noisier than the drift it corrects. On simulated runs at
 * 300 ppm, with a 15 or 30 ms connection interval, fitting beat a single offset from about 30 s.
 * A scale whose clock drifts less would favour a longer span.
 */
export const DEFAULT_MIN_FIT_SPAN_MS = 30_000; // PROVISIONAL(U1.1: A1)

/**
 * A fitted drift beyond this is taken for a bad fit rather than the scale's clock. Crystals
 * drift tens of ppm, a ceramic resonator thousands; 2% leaves room for either.
 */
export const DEFAULT_MAX_DRIFT_PPM = 20_000; // PROVISIONAL(U1.1: A1)

/**
 * The recording's FF11 weight frames that decode, in seq order. Anything else is left out: other
 * kinds of frame, FF12 frames, and frames that fail the checksum or the length check (spec
 * parsing rule 1). Frames with an unknown unit or sign byte stay: their timer field is fine.
 */
export function decodeWeightFrames(frames: readonly RawFrame[]): ArrivedWeightFrame[] {
  const weights: ArrivedWeightFrame[] = [];
  for (const raw of frames) {
    if (raw.source !== 'ff11') continue;
    const frame = decodeFrame(raw.bytes);
    if (frame.kind === 'weight') weights.push({ seq: raw.seq, tMs: raw.tMs, frame });
  }
  return weights.sort((a, b) => a.seq - b.seq);
}

/** The timeline of a recording's raw frames. See the module comment. */
export function buildTimeline(
  frames: readonly RawFrame[],
  options: TimelineOptions = {},
): Timeline {
  return timelineOf(decodeWeightFrames(frames), options);
}

/** The timeline of decoded weight frames, in seq order (`decodeWeightFrames`). */
export function timelineOf(
  weights: readonly ArrivedWeightFrame[],
  options: TimelineOptions = {},
): Timeline {
  const minRunFrames = options.minRunFrames ?? DEFAULT_MIN_RUN_FRAMES;
  const minFitSpanMs = options.minFitSpanMs ?? DEFAULT_MIN_FIT_SPAN_MS;
  const maxDriftPpm = options.maxDriftPpm ?? DEFAULT_MAX_DRIFT_PPM;
  if (!(Number.isInteger(minRunFrames) && minRunFrames >= 2)) {
    throw new RangeError(`timeline: minRunFrames ${minRunFrames} isn't an integer from 2`);
  }
  if (!(minFitSpanMs >= 0) || !(maxDriftPpm >= 0)) {
    throw new RangeError('timeline: minFitSpanMs and maxDriftPpm must be numbers ≥ 0');
  }

  const groups = deviceRunIndexes(weights).filter((group) => group.length >= minRunFrames);
  const points = groups.map((group) =>
    group.map((i): Point => ({ x: weights[i].frame.timerMs, y: weights[i].tMs })),
  );

  // One rate for every run, fitted over all of them once they span enough together.
  const spans = points.map((run) => run[run.length - 1].x - run[0].x);
  const totalSpan = spans.reduce((total, span) => total + span, 0);
  let rateSource: RateSource = points.length === 0 ? 'none' : 'too-short';
  let rate = 1;
  if (points.length > 0 && totalSpan >= minFitSpanMs) {
    const fitted = robustSlope(points);
    rateSource = Math.abs(driftOf(fitted)) <= maxDriftPpm ? 'fitted' : 'implausible';
    if (rateSource === 'fitted') rate = fitted;
  }

  const times = weights.map((w) => w.tMs);
  const sources: TimeSource[] = weights.map(() => 'arrival');
  const runOf: (number | null)[] = weights.map(() => null);
  const allJitter: number[] = [];
  const steps: number[] = [];
  const runs: DeviceRun[] = groups.map((group, r) => {
    const offsetMs = leastIntercept(points[r], rate);
    const jitter: number[] = [];
    group.forEach((i, k) => {
      const mapped = offsetMs + rate * points[r][k].x;
      times[i] = mapped;
      sources[i] = 'device';
      runOf[i] = r;
      // The line passes under every point; rounding can leave it a hair above one.
      jitter.push(Math.max(0, points[r][k].y - mapped));
      if (k > 0) steps.push(rate * (points[r][k].x - points[r][k - 1].x));
    });
    for (const value of jitter) allJitter.push(value);
    return {
      firstSeq: weights[group[0]].seq,
      lastSeq: weights[group[group.length - 1]].seq,
      frameCount: group.length,
      startTimerMs: points[r][0].x,
      endTimerMs: points[r][points[r].length - 1].x,
      offsetMs,
      rate,
      ownDriftPpm: spans[r] >= minFitSpanMs ? driftOf(robustSlope([points[r]])) : null,
      jitter: jitterStats(jitter),
    };
  });

  const arrivalCorrectionMs = allJitter.length > 0 ? median(allJitter) : 0;
  for (let i = 0; i < times.length; i++) {
    if (sources[i] === 'arrival') times[i] -= arrivalCorrectionMs;
  }
  holdArrivalTimesInOrder(times, sources);

  const samples = weights.map((w, i): TimelineSample => ({
    seq: w.seq,
    t: times[i] / 1000,
    timeSource: sources[i],
    run: runOf[i],
    arrivalT: w.tMs / 1000,
    frame: w.frame,
  }));
  return {
    samples,
    runs,
    rateSource,
    driftPpm: rateSource === 'fitted' ? driftOf(rate) : null,
    jitter: allJitter.length > 0 ? jitterStats(allJitter) : null,
    arrivalCorrectionMs,
    nominalInterval: nominalInterval(weights, steps),
  };
}

/**
 * The device runs, as indexes into `weights`: stretches of consecutive frames whose timer field
 * strictly increases, without a 0 or a value repeated by a neighbour.
 */
export function deviceRunIndexes(weights: readonly ArrivedWeightFrame[]): number[][] {
  const timer = (i: number): number | null =>
    i >= 0 && i < weights.length ? weights[i].frame.timerMs : null;
  const runs: number[][] = [];
  let current: number[] = [];
  for (let i = 0; i < weights.length; i++) {
    const value = weights[i].frame.timerMs;
    const eligible = value > 0 && value !== timer(i - 1) && value !== timer(i + 1);
    if (!eligible) {
      if (current.length > 0) runs.push(current);
      current = [];
      continue;
    }
    const last = current.at(-1);
    if (last !== undefined && value < weights[last].frame.timerMs) {
      runs.push(current); // the timer fell back: restarted (07) or wrapped
      current = [];
    }
    current.push(i);
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

/**
 * Keeps `times` from ever decreasing by moving only arrival-timed entries: first each one up to
 * the time before it, then each one down to the time after it. Device times increase on their
 * own within a run and from one run to the next.
 */
function holdArrivalTimesInOrder(times: number[], sources: readonly TimeSource[]): void {
  for (let i = 1; i < times.length; i++) {
    if (sources[i] === 'arrival') times[i] = Math.max(times[i], times[i - 1]);
  }
  for (let i = times.length - 2; i >= 0; i--) {
    if (sources[i] === 'arrival') times[i] = Math.min(times[i], times[i + 1]);
  }
}

function nominalInterval(
  weights: readonly ArrivedWeightFrame[],
  deviceSteps: readonly number[],
): Timeline['nominalInterval'] {
  if (deviceSteps.length > 0) return { ms: median(deviceSteps), source: 'device' };
  if (weights.length < 2) return null;
  const gaps = weights.slice(1).map((w, i) => w.tMs - weights[i].tMs);
  return { ms: median(gaps), source: 'arrival' };
}

/** A rate (arrival ms per timer ms) as the scale clock's drift: + when the scale runs fast. */
function driftOf(rate: number): number {
  return (1 / rate - 1) * 1e6;
}

function jitterStats(values: readonly number[]): JitterStats {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count: sorted.length,
    meanMs: sum / sorted.length,
    medianMs: quantile(sorted, 0.5),
    p95Ms: quantile(sorted, 0.95),
    maxMs: sorted[sorted.length - 1],
  };
}
