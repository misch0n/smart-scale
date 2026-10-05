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
 * - **Elsewhere, on the sample grid** (T1.16, D-063). The scale samples on its own clock all the
 *   time, timer or not, and the link loses no frame (hardware sessions 1 and 2): arrivals sit on
 *   a regular grid, late by a connection event or a stall. So a stretch of frames between device
 *   runs is timed as one: `t = offset + period × k` for its k-th frame, with the device runs'
 *   period (their rate times the timer's tick) or else the stretch's own fitted one, and the
 *   offset that puts the line under every frame, touching the fastest, as for a run. A stretch
 *   is cut where a gap could hide a lost frame (`GRID_GAP_PERIODS`).
 * - **What's left,** stretches too short to fit (`GRID_MIN_FRAMES`), takes its arrival time less
 *   the median delay of the device-timed frames (`arrivalCorrectionMs`), so all sit on the same
 *   footing. Then each such time is held between its neighbours, so `t` never decreases.
 *
 * `t` is the sample time plus the link's least latency, a constant no recording can reveal:
 * durations and rates don't depend on it.
 */

import type { RawFrame } from '../model';
import { decodeFrame, type WeightFrame } from '../protocol';
import { median, quantile } from '../signal';
import { leastIntercept, robustSlope, type Point } from './fit';

/**
 * Where a frame's time came from: the scale's timer, the sample grid its arrivals sit on, or its
 * own arrival.
 */
export type TimeSource = 'device' | 'grid' | 'arrival';

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
export const RATE_SOURCES = ['fitted', 'implausible', 'too-short', 'none'] as const;
export type RateSource = (typeof RATE_SOURCES)[number];

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
  /** The period grid-timed frames were put on, ms on the phone's clock; null without them. */
  readonly gridPeriodMs: number | null;
  /**
   * The scale's sample interval, ms on the phone's clock: the median step within device runs,
   * else the grid's period, else the median arrival gap. Null with fewer than two frames.
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
 * A stretch of arrival-timed frames this short keeps its arrival times: its fastest frame may
 * not have come at the first connection event.
 */
export const GRID_MIN_FRAMES = 10;

/**
 * An arrival gap longer than this many periods cuts a grid stretch: a frame lost there would
 * put the frames after it a period off. A stall cuts one too, harmlessly. Hardware session 1's
 * gaps were 90, 120 and 150 ms at 100.7 ms, outside the microphone's stalls.
 */
export const GRID_GAP_PERIODS = 1.5;

/** A lost frame shows as every later frame of a stretch arriving late: this many, at least. */
const LOSS_MIN_AFTER = 5;

/** By this many periods, at least: a period, less a frame's jitter (D-037: 33 ms at p95). */
const LOSS_JUMP_PERIODS = 0.75;

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

  // The scale's sample grid for the frames between runs. Cut where a frame may be lost, a stretch
  // is timed in parts, each under its own line.
  const stretches = arrivalStretches(weights, sources);
  const cut = (periodMs: number) =>
    stretches
      .flatMap((stretch) => cutAtGaps(stretch, weights, periodMs))
      .flatMap((part) => cutAtLosses(part, weights, periodMs));
  const tickMs = steps.length > 0 ? median(timerSteps(groups, weights)) : null;
  // The runs' period, their rate times the timer's tick. Else the stretches' own, each fitted
  // whole: its parts are too short to fit well, and the cuts bias them (a long gap tends to
  // follow an early frame and precede a late one). A lost frame would tilt it, by a period over
  // the stretch; the real link has lost none (D-063).
  const periodMs =
    rateSource === 'fitted' && tickMs !== null
      ? rate * tickMs
      : periodOf(stretches.map((stretch) => gridPoints(stretch, weights)));
  const parts =
    periodMs === null ? [] : cut(periodMs).filter((part) => part.length >= GRID_MIN_FRAMES);
  let gridded = 0;
  for (const part of parts) {
    const points = gridPoints(part, weights);
    const offsetMs = leastIntercept(points, periodMs!);
    // A period off, as lost frames would make it, leaves the arrivals drifting or sawing about
    // the grid: then they are the better guess. On the real link three in four frames wait less
    // than 30 ms (D-037), stalls aside.
    const delays = points.map((point) => point.y - (offsetMs + periodMs! * point.x));
    if (
      quantile(
        [...delays].sort((a, b) => a - b),
        0.75,
      ) >
      periodMs! / 2
    )
      continue;
    part.forEach((i, k) => {
      times[i] = offsetMs + periodMs! * k;
      sources[i] = 'grid';
    });
    gridded++;
  }
  const gridPeriodMs = gridded > 0 ? periodMs : null;

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
    gridPeriodMs,
    nominalInterval: nominalInterval(weights, steps, gridPeriodMs),
  };
}

/** The timer's step between consecutive frames of each run, ms on the scale's clock. */
function timerSteps(
  groups: readonly (readonly number[])[],
  weights: readonly ArrivedWeightFrame[],
) {
  return groups.flatMap((group) =>
    group.slice(1).map((i, k) => weights[i].frame.timerMs - weights[group[k]].frame.timerMs),
  );
}

/** The stretches of consecutive frames still timed by arrival, as indexes into `weights`. */
function arrivalStretches(
  weights: readonly ArrivedWeightFrame[],
  sources: readonly TimeSource[],
): number[][] {
  const stretches: number[][] = [];
  let current: number[] = [];
  for (let i = 0; i < weights.length; i++) {
    if (sources[i] === 'arrival') {
      current.push(i);
    } else if (current.length > 0) {
      stretches.push(current);
      current = [];
    }
  }
  if (current.length > 0) stretches.push(current);
  return stretches;
}

/** A stretch's arrivals against frame number: x is k for its k-th frame, y the arrival, ms. */
function gridPoints(stretch: readonly number[], weights: readonly ArrivedWeightFrame[]): Point[] {
  return stretch.map((i, k) => ({ x: k, y: weights[i].tMs }));
}

/**
 * The period arrivals step by, ms: the slope of arrival against frame number that `groups`
 * (`gridPoints`) share, each with its own intercept, stalls trimmed (`robustSlope`). Null when
 * no group has two points.
 */
function periodOf(groups: readonly (readonly Point[])[]): number | null {
  const fitted = groups.filter((group) => group.length >= 2);
  if (fitted.length === 0) return null;
  const period = robustSlope(fitted);
  return period > 0 ? period : null;
}

/**
 * `part` cut where a frame was lost without a long gap (the frame before it late): from there on
 * every frame arrives a period later than the line under the frames before it says, so the
 * least delay of the frames after rises by most of a period (`LOSS_JUMP_PERIODS`) over the least
 * of those before; a late frame just before the loss rises less. At least `LOSS_MIN_AFTER`
 * frames must follow, or a few late frames at the end would pass for one.
 */
function cutAtLosses(
  part: readonly number[],
  weights: readonly ArrivedWeightFrame[],
  periodMs: number,
): number[][] {
  const points = gridPoints(part, weights);
  const offsetMs = leastIntercept(points, periodMs);
  const delays = points.map((p) => p.y - (offsetMs + periodMs * p.x));
  const leastAfter = [...delays];
  for (let k = delays.length - 2; k >= 0; k--) {
    leastAfter[k] = Math.min(leastAfter[k], leastAfter[k + 1]);
  }
  let leastBefore = Number.POSITIVE_INFINITY;
  for (let k = 1; k <= delays.length - LOSS_MIN_AFTER; k++) {
    leastBefore = Math.min(leastBefore, delays[k - 1]);
    if (leastAfter[k] - leastBefore > LOSS_JUMP_PERIODS * periodMs) {
      return [part.slice(0, k), ...cutAtLosses(part.slice(k), weights, periodMs)];
    }
  }
  return [[...part]];
}

/** `stretch` cut where consecutive frames arrived more than `GRID_GAP_PERIODS` apart. */
function cutAtGaps(
  stretch: readonly number[],
  weights: readonly ArrivedWeightFrame[],
  periodMs: number,
): number[][] {
  const parts: number[][] = [[stretch[0]]];
  for (let k = 1; k < stretch.length; k++) {
    const gap = weights[stretch[k]].tMs - weights[stretch[k - 1]].tMs;
    if (gap > GRID_GAP_PERIODS * periodMs) parts.push([]);
    parts[parts.length - 1].push(stretch[k]);
  }
  return parts;
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
 * Keeps `times` from ever decreasing by moving only entries not timed by a device run: first
 * each one up to the time before it, then each one down to the time after it. Device times
 * increase on their own within a run and from one run to the next, and so do grid times within
 * a stretch.
 */
function holdArrivalTimesInOrder(times: number[], sources: readonly TimeSource[]): void {
  for (let i = 1; i < times.length; i++) {
    if (sources[i] !== 'device') times[i] = Math.max(times[i], times[i - 1]);
  }
  for (let i = times.length - 2; i >= 0; i--) {
    if (sources[i] !== 'device') times[i] = Math.min(times[i], times[i + 1]);
  }
}

function nominalInterval(
  weights: readonly ArrivedWeightFrame[],
  deviceSteps: readonly number[],
  gridPeriodMs: number | null,
): Timeline['nominalInterval'] {
  if (deviceSteps.length > 0) return { ms: median(deviceSteps), source: 'device' };
  if (gridPeriodMs !== null) return { ms: gridPeriodMs, source: 'grid' };
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
