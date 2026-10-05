/**
 * A recording's analysis (T1.14; ARCHITECTURE "Analysis pipeline"): decode → timeline →
 * zero-tracking → resample → shot windows → markers per window → metrics, stamped with
 * `ANALYSIS_VERSION` and every parameter.
 *
 * - `analyzeRaw` is a pure function of the raw frames and events. Its `analysis` is JSON-native:
 *   the derived cache stores it, keyed by recording and version, and checks its shape when it
 *   reads it back (`parseRecordingAnalysis`). The working data beside it (the timeline, the
 *   segmentation, every marker's diagnostics) is never cached.
 * - `analyzeRecording` adds the shot matching (`matching.ts`), a pure function of the analysis
 *   and the recording's shots. Metadata never enters the cached result, so editing a shot (a
 *   dose, a grade) never makes it stale.
 *
 * Times are timeline seconds (T1.9), masses liquid grams: net of the window's baseline and of
 * any other steps inside it (T1.12).
 */

import type { AppEvent, RawFrame, Shot } from '../model';
import { hasTrustedWeight } from '../protocol';
import { buildTimeline, type RateSource, type Timeline } from '../timebase';
import { segmentCurve, type SegmentCurve } from './curve';
import { LIQUID_FLAGS } from './liquid-markers';
import { matchShots, type ShotMatching } from './matching';
import {
  markersInOrder,
  segmentMarkers,
  shotMetrics,
  type SegmentMarkers,
  type ShotMetrics,
} from './metrics';
import { resolveAnalysisParams, type AnalysisOverrides, type AnalysisParams } from './params';
import { measurePhases, type PhaseMeasurement } from './phases';
import { PUMP_FLAGS } from './pump-markers';
import { segment, type Segmentation } from './segment';
import { shotMarkers, type ShotMarkers } from './shot-markers';
import type { Baseline, ShotWindowEnd } from './shot-windows';
import type { Step } from './steps';
import type { TailFit } from './tail';
import { ANALYSIS_VERSION } from './version';

/** What the analysis reads: a recording's raw frames and app events (`RawRecording` has them). */
export interface RawInput {
  readonly frames: readonly RawFrame[];
  readonly events: readonly AppEvent[];
}

/**
 * - `refused-frames`: weight frames with an unknown unit or sign byte were left out (D-005,
 *   D-014), so weights are missing: the UI must say so.
 */
export const RECORDING_FLAGS = ['refused-frames'] as const;
export type RecordingFlag = (typeof RECORDING_FLAGS)[number];

/**
 * A segment's own flags, beside the pump markers' and the liquid markers' (T1.12, T1.13):
 * - `refused-frames`: weight frames inside the window were left out (D-005, D-014);
 * - `markers-out-of-order`: pump_on, first_drip and pump_off don't come in that order, so the
 *   durations between the ones out of order are null.
 */
const OWN_SEGMENT_FLAGS = ['refused-frames', 'markers-out-of-order'] as const;

/** Every flag a segment can carry: each from one of the lists, so the schema knows them all. */
export type SegmentFlag =
  (typeof PUMP_FLAGS)[number] | (typeof LIQUID_FLAGS)[number] | (typeof OWN_SEGMENT_FLAGS)[number];

export const SEGMENT_FLAGS: readonly SegmentFlag[] = [
  ...new Set<SegmentFlag>([...PUMP_FLAGS, ...LIQUID_FLAGS, ...OWN_SEGMENT_FLAGS]),
];

/** How the timeline was built (T1.9): enough to tell a recording timed by the scale. */
export interface TimelineSummary {
  /** Weight frames that decode. */
  readonly frames: number;
  /** Of them, the ones timed by the scale's timer; the rest by their arrival. */
  readonly deviceTimedFrames: number;
  readonly rateSource: RateSource;
  /** How much faster the scale's clock ran, ppm, or null without a fitted rate. */
  readonly driftPpm: number | null;
  /** The sample interval, ms, or null with fewer than two frames. */
  readonly intervalMs: number | null;
}

/** A shot window (T1.11), as the derived cache keeps it. */
export interface SegmentWindow {
  /** The window's first and last time, s. */
  readonly startT: number;
  readonly endT: number;
  readonly end: ShotWindowEnd;
  /** The stable level the shot rose from, zero-tracked (T1.11). */
  readonly baseline: Baseline;
  /** The last sample before the cup went on, s, or null when it was on from the start. */
  readonly cupPlacedT: number | null;
  /** Where the rise ends, s: the start of the plateau it rises to, else the window's end. */
  readonly riseEndT: number;
  /**
   * How far the level rose from the baseline to the window's end, net of the other steps taken
   * out of the liquid, g.
   */
  readonly riseG: number;
}

/** One shot window's analysis. */
export interface SegmentAnalysis {
  /** Its place among the recording's shot windows, from 0. */
  readonly index: number;
  readonly window: SegmentWindow;
  readonly markers: SegmentMarkers;
  /** The tail fit from pump_off (T1.12), or null: the flags say why. */
  readonly tail: TailFit | null;
  readonly metrics: ShotMetrics;
  /**
   * Whether it looks like espresso: a `pump_on`, or a `pump_off` with a draining tail. Only
   * then does it get a post-hoc shot when no shot claims it (D-047).
   */
  readonly espresso: boolean;
  /** Weight frames refused inside the window (D-005, D-014). */
  readonly refusedFrames: number;
  readonly flags: readonly SegmentFlag[];
  /** The liquid and flow on a coarse grid, for the history's charts (T1.19). */
  readonly curve: SegmentCurve;
}

/** A recording's analysis: what the derived cache stores. JSON-native. */
export interface RecordingAnalysis {
  /** `ANALYSIS_VERSION` when it was computed. */
  readonly analysisVersion: number;
  /** Every parameter it ran with, defaults filled in. */
  readonly params: AnalysisParams;
  /**
   * The last raw record it read, by `seq` (frames and events share one counter), or null for an
   * empty recording. A cached result stands only while no later record is stored.
   */
  readonly lastSeq: number | null;
  readonly timeline: TimelineSummary;
  /** Weight frames refused for an unknown unit or sign byte (D-005, D-014). */
  readonly refusedFrames: number;
  /** The scale's quantisation step, read off the data, g (T1.11). */
  readonly quantisationG: number;
  /** The stability tolerance, g (T1.11). */
  readonly toleranceG: number;
  /** Tares, vessels placed and lifted, and other steps, in time order (T1.11). */
  readonly steps: readonly Step[];
  /** The shot windows, in time order. */
  readonly segments: readonly SegmentAnalysis[];
  /** The beans, grind and milk phases the capture flow logged, and what each held (T2.5). */
  readonly phases: readonly PhaseMeasurement[];
  readonly flags: readonly RecordingFlag[];
}

/** `analyzeRaw`'s output: the result, and the working data it came from. */
export interface AnalysisRun {
  readonly analysis: RecordingAnalysis;
  /** Working data, never cached: for inspection (T1.15) and charts. */
  readonly timeline: Timeline;
  readonly segmentation: Segmentation;
  /** Each segment's markers with the detectors' diagnostics, in segment order. */
  readonly markers: readonly ShotMarkers[];
}

/** `analyzeRecording`'s output: the analysis and its shots. */
export interface AnalyzedRecording extends AnalysisRun {
  readonly matching: ShotMatching;
}

/**
 * Analyses a recording's raw frames and events. Pure: the same input always gives the same
 * output.
 *
 * @throws RangeError on invalid parameters.
 */
export function analyzeRaw(raw: RawInput, overrides: AnalysisOverrides = {}): AnalysisRun {
  const params = resolveAnalysisParams(overrides);
  const timeline = buildTimeline(raw.frames, params.timeline);
  const segmentation = segment(timeline, raw.events, params.segmentation);
  const refusedT = timeline.samples
    .filter((sample) => !hasTrustedWeight(sample.frame))
    .map((sample) => sample.t);
  const markers = segmentation.shotWindows.map((window) =>
    shotMarkers(segmentation, window, { pump: params.pump, liquid: params.liquid }),
  );
  const segments = markers.map((shot, index) =>
    segmentAnalysis(index, shot, refusedT, segmentation),
  );
  const analysis: RecordingAnalysis = {
    analysisVersion: ANALYSIS_VERSION,
    params,
    lastSeq: lastSeqOf(raw),
    timeline: {
      frames: timeline.samples.length,
      deviceTimedFrames: timeline.samples.filter((sample) => sample.timeSource === 'device').length,
      rateSource: timeline.rateSource,
      driftPpm: timeline.driftPpm,
      intervalMs: timeline.nominalInterval?.ms ?? null,
    },
    refusedFrames: segmentation.refusedFrames,
    quantisationG: segmentation.quantisationG,
    toleranceG: segmentation.toleranceG,
    steps: segmentation.steps.map((step) => ({ ...step })),
    segments,
    phases: measurePhases(segmentation, raw.events, timeline.samples.at(-1)?.t ?? 0),
    flags: segmentation.refusedFrames > 0 ? ['refused-frames'] : [],
  };
  return { analysis, timeline, segmentation, markers };
}

/**
 * Analyses a recording and matches its shots (every one, discarded ones too) to the segments.
 * Pure.
 *
 * @throws RangeError on invalid parameters.
 */
export function analyzeRecording(
  raw: RawInput,
  shots: readonly Shot[],
  overrides: AnalysisOverrides = {},
): AnalyzedRecording {
  const run = analyzeRaw(raw, overrides);
  return { ...run, matching: matchShots(run.analysis.segments, shots) };
}

/** The highest `seq` among the frames and events, or null without any. */
function lastSeqOf(raw: RawInput): number | null {
  let last = -1;
  for (const record of raw.frames) last = Math.max(last, record.seq);
  for (const record of raw.events) last = Math.max(last, record.seq);
  return last < 0 ? null : last;
}

function segmentAnalysis(
  index: number,
  shot: ShotMarkers,
  refusedT: readonly number[],
  segmentation: Segmentation,
): SegmentAnalysis {
  // The window the liquid was measured in: its baseline is the level before the pump.
  const { window } = shot;
  const markers = segmentMarkers(shot);
  const tail = shot.liquid.tail && { ...shot.liquid.tail };
  const refusedFrames = refusedT.filter((t) => t >= window.startT && t <= window.endT).length;
  const flags = new Set<SegmentFlag>([...shot.pump.flags, ...shot.liquid.flags]);
  if (refusedFrames > 0) flags.add('refused-frames');
  if (!markersInOrder(markers)) flags.add('markers-out-of-order');
  return {
    index,
    window: {
      startT: window.startT,
      endT: window.endT,
      end: window.end,
      baseline: { ...window.baseline },
      cupPlacedT: window.cupPlaced?.startT ?? null,
      riseEndT: window.riseEndT,
      riseG: window.riseG,
    },
    markers,
    tail,
    metrics: shotMetrics(markers, tail),
    espresso: markers.pumpOn !== null || (markers.pumpOff !== null && tail !== null),
    refusedFrames,
    flags: [...flags],
    curve: segmentCurve(segmentation, window, markers),
  };
}
