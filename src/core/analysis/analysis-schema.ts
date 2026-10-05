/**
 * The runtime schema of a cached `RecordingAnalysis` (T1.14), on the model's parser kit (D-018):
 * the derived cache's `result` is checked when it is read back, so that a malformed or outdated
 * entry is recomputed rather than shown. Each `ObjectSchema` needs a parser for every key of its
 * type, so the result's type and this check can't drift apart.
 */

import { field, type Field, type ObjectSchema } from '../model';
import { RATE_SOURCES } from '../timebase';
import { ONSET_SHAPES, type FirstDrip } from './first-drip';
import { SETTLED_SOURCES, type CupRemoved, type Settled } from './liquid-markers';
import type { SegmentMarkers, SegmentPumpOff, ShotMetrics } from './metrics';
import {
  DEFAULT_LIQUID_PARAMS,
  DEFAULT_PUMP_PARAMS,
  DEFAULT_SEGMENTATION_PARAMS,
  type AnalysisParams,
  type TimelineParams,
} from './params';
import { PUMP_DETECTORS, PUMP_ON_SOURCES, type PumpOn } from './pump-markers';
import {
  RECORDING_FLAGS,
  SEGMENT_FLAGS,
  type RecordingAnalysis,
  type SegmentAnalysis,
  type SegmentWindow,
  type TimelineSummary,
} from './recording-analysis';
import { SHOT_WINDOW_ENDS, type Baseline } from './shot-windows';
import { STEP_KINDS, TARE_SOURCES, type Step } from './steps';
import { TAIL_SOURCES, type TailFit } from './tail';

const { number, nonNegativeInteger, nullable, object, oneOf, arrayOf } = field;

/** An object of numbers with exactly the keys of `defaults`. */
function numbersLike<T extends object>(defaults: T): Field<T> {
  const schema = Object.fromEntries(Object.keys(defaults).map((key) => [key, number]));
  return object(schema as ObjectSchema<T>);
}

const params = object<AnalysisParams>({
  timeline: object<TimelineParams>({
    minRunFrames: nonNegativeInteger,
    minFitSpanMs: number,
    maxDriftPpm: number,
  }),
  segmentation: numbersLike(DEFAULT_SEGMENTATION_PARAMS),
  liquid: numbersLike(DEFAULT_LIQUID_PARAMS),
  pump: numbersLike(DEFAULT_PUMP_PARAMS),
});

const timeline = object<TimelineSummary>({
  frames: nonNegativeInteger,
  deviceTimedFrames: nonNegativeInteger,
  rateSource: oneOf(RATE_SOURCES),
  driftPpm: nullable(number),
  intervalMs: nullable(number),
});

const step = object<Step>({
  kind: oneOf(STEP_KINDS),
  tareSource: nullable(oneOf(TARE_SOURCES)),
  startT: number,
  endT: number,
  sizeG: number,
  levelBeforeG: number,
  levelAfterG: number,
  jumps: nonNegativeInteger,
});

const window = object<SegmentWindow>({
  startT: number,
  endT: number,
  end: oneOf(SHOT_WINDOW_ENDS),
  baseline: object<Baseline>({
    startT: number,
    endT: number,
    levelG: number,
    sigmaG: number,
    sampleCount: nonNegativeInteger,
  }),
  cupPlacedT: nullable(number),
  riseEndT: number,
  riseG: number,
});

const markers = object<SegmentMarkers>({
  pumpOn: nullable(object<PumpOn>({ t: number, source: oneOf(PUMP_ON_SOURCES) })),
  firstDrip: nullable(
    object<FirstDrip>({
      t: number,
      onset: oneOf(ONSET_SHAPES),
      changeT: number,
      alarmT: number,
      sigmaG: number,
      fitPoints: nonNegativeInteger,
      fitRmsG: number,
    }),
  ),
  pumpOff: nullable(
    object<SegmentPumpOff>({
      t: number,
      detector: oneOf(PUMP_DETECTORS),
      weightG: nullable(number),
    }),
  ),
  settled: nullable(
    object<Settled>({ t: number, weightG: number, source: oneOf(SETTLED_SOURCES) }),
  ),
  cupRemoved: nullable(object<CupRemoved>({ t: number, weightG: number })),
});

const tail = object<TailFit>({
  source: oneOf(TAIL_SOURCES),
  tauS: number,
  flowAtPumpOffGps: number,
  finalWeightG: number,
  rSquared: nullable(number),
  points: nonNegativeInteger,
  startT: number,
  endT: number,
});

const metrics = object<ShotMetrics>({
  firstDripS: nullable(number),
  extractionS: nullable(number),
  totalS: nullable(number),
  averageFlowGps: nullable(number),
  pumpOffWeightG: nullable(number),
  yieldG: nullable(number),
  honestYieldG: nullable(number),
  tailMassG: nullable(number),
  tauS: nullable(number),
});

const segment = object<SegmentAnalysis>({
  index: nonNegativeInteger,
  window,
  markers,
  tail: nullable(tail),
  metrics,
  espresso: field.boolean,
  refusedFrames: nonNegativeInteger,
  flags: arrayOf(oneOf(SEGMENT_FLAGS)),
});

const analysis = object<RecordingAnalysis>({
  analysisVersion: nonNegativeInteger,
  params,
  lastSeq: nullable(nonNegativeInteger),
  timeline,
  refusedFrames: nonNegativeInteger,
  quantisationG: number,
  toleranceG: number,
  steps: arrayOf(step),
  segments: arrayOf(segment),
  flags: arrayOf(oneOf(RECORDING_FLAGS)),
});

/**
 * A `RecordingAnalysis` from the derived cache: missing nullable fields become null and unknown
 * keys are dropped (D-018).
 *
 * @throws SchemaError when a required field is missing or a value has the wrong type.
 */
export function parseRecordingAnalysis(value: unknown, path = 'analysis'): RecordingAnalysis {
  return analysis(value, path);
}
