/**
 * The inspection charts (T1.15), as `ChartSpec`s for `renderChart`:
 *
 * - `segmentChart`: one shot window, around its shot. Panels: the liquid (samples, the smoothed
 *   liquid, and the drain model after pump_off), the derived flow (with the scale's own flow
 *   figure beside it), the detrended variance (with the pump detectors' noise levels), and the
 *   sound levels when the recording has them.
 * - `recordingChart`: the whole recording. Panels: the reading as it arrived and the
 *   zero-tracked weight, with the steps and the shot windows; the sound levels.
 *
 * Both draw the markers, the simulator's truth when there is one, and the app events: commands,
 * annotations and UI actions, on the arrival clock, which the timeline follows to within the
 * link's latency (T1.9).
 */

import {
  quadraticSG,
  sgWindowSamples,
  windowLiquid,
  type AnalysisRun,
  type SegmentAnalysis,
  type StepKind,
} from '../analysis';
import type { AppEvent, RawFrame } from '../model';
import { hasTrustedWeight } from '../protocol';
import { quantile, savitzkyGolayCoefficients } from '../signal';
import { decodeSoundFrame } from '../sound';
import {
  INK,
  MARKER_COLORS,
  SERIES_COLORS,
  WINDOW_FILL,
  type ChartSpec,
  type Glyph,
  type GlyphShape,
  type LegendEntry,
  type Level,
  type Mark,
  type MarkStyle,
  type Panel,
  type Series,
} from './chart';

/** The true markers of one simulated shot, on the timeline, s (T1.3's `ShotTruth`). */
export interface TrueMarkers {
  readonly index: number;
  readonly pumpOnT: number;
  readonly firstDripT: number;
  readonly pumpOffT: number;
  readonly settledT: number;
  readonly cupRemovedT: number | null;
}

export interface ChartInput {
  /** Names the recording in the title: its file and id. */
  readonly label: string;
  readonly frames: readonly RawFrame[];
  readonly events: readonly AppEvent[];
  readonly run: AnalysisRun;
  /** The simulator's truth, or empty. */
  readonly truth: readonly TrueMarkers[];
  /** Lines added under the title, such as the parameters changed. */
  readonly notes: readonly string[];
}

/** The detrended variance's window, s: about ten samples at the scale's rate. */
export const VARIANCE_WINDOW_S = 1;

/** A segment chart starts this long before the shot does, s… */
const LEAD_S = 5;

/** …and ends this long after it settles, s, unless the cup comes off within `CUP_WAIT_S`. */
const TRAIL_S = 8;
const CUP_WAIT_S = 15;

/** The shortest segment chart, s. */
const MIN_SPAN_S = 10;

/** The yields' levels start this long before pump_off, s. */
const LEVEL_LEAD_S = 3;

/**
 * A Tare + start tap up to this long before a window starts belongs to its shot, s: the tap's
 * tare can be what starts the window (shot B of session 2).
 */
const TAP_BEFORE_S = 10;

/** The sound levels drawn, by their names in layout 1 (T1.24, D-050). */
const SOUND_MEASURES = ['all', '50 Hz harmonics', '60 Hz harmonics'] as const;

const MARKERS = [
  { key: 'pumpOn', name: 'pump_on' },
  { key: 'firstDrip', name: 'first_drip' },
  { key: 'pumpOff', name: 'pump_off' },
  { key: 'settled', name: 'settled' },
  { key: 'cupRemoved', name: 'cup_removed' },
] as const;

/** The chart of segment `index`: see the module comment. */
export function segmentChart(input: ChartInput, index: number): ChartSpec {
  const { run } = input;
  const segment = run.analysis.segments[index];
  const window = run.segmentation.shotWindows[index];
  const { pump } = run.markers[index];
  const { params } = run.analysis;
  const liquid = windowLiquid(run.segmentation, window);
  const { start, step, values } = liquid.grid;
  const sgWindow = sgWindowSamples(params.liquid.sgWindowS, step);
  const gridT = values.map((_, k) => start + k * step);
  const smooth = quadraticSG(values, sgWindow, step);
  const flow = quadraticSG(values, sgWindow, step, 1);
  const variance = detrendedVariance(
    values,
    smooth,
    sgWindow,
    Math.max(3, Math.round(VARIANCE_WINDOW_S / step)),
  );
  const taps = input.events.flatMap((event) =>
    event.type === 'command-sent' &&
    event.data.command === 'tareAndStartTimer' &&
    event.tMs / 1000 >= window.startT - TAP_BEFORE_S &&
    event.tMs / 1000 <= window.endT
      ? [event.tMs / 1000]
      : [],
  );
  // The simulator's pump_on for a shot whose first drip is in this window, so the chart shows
  // what pump_on is measured against.
  const truePumpOns = input.truth.flatMap((truth) =>
    truth.firstDripT >= window.startT && truth.firstDripT <= window.endT ? [truth.pumpOnT] : [],
  );
  const span = segmentSpan(segment, [...taps, ...truePumpOns]);
  const inSpan = (t: number) => t >= span[0] && t <= span[1];
  const drain = drainModel(segment, run, index);

  const { markers, metrics } = segment;
  // The yields' levels start a little before the shot ends, clear of its rise.
  const endingT = markers.pumpOff?.t ?? markers.settled?.t ?? markers.cupRemoved?.t;
  const levelFromT = endingT === undefined ? undefined : endingT - LEVEL_LEAD_S;
  const liquidLevels: Level[] = [{ value: 0, label: 'baseline', color: INK.axis, dashed: false }];
  const pumpOffWeight = markers.pumpOff?.weightG ?? null;
  if (pumpOffWeight !== null) {
    liquidLevels.push({
      value: pumpOffWeight,
      label: `w(pump_off) ${grams(pumpOffWeight)}`,
      color: MARKER_COLORS.pumpOff,
      dashed: true,
      fromT: levelFromT,
    });
  }
  if (markers.settled) {
    liquidLevels.push({
      value: markers.settled.weightG,
      label: `yield ${grams(markers.settled.weightG)}`,
      color: MARKER_COLORS.settled,
      dashed: true,
      fromT: levelFromT,
    });
  }
  if (markers.cupRemoved) {
    liquidLevels.push({
      value: markers.cupRemoved.weightG,
      label: `honest ${grams(markers.cupRemoved.weightG)}`,
      color: MARKER_COLORS.cupRemoved,
      dashed: true,
      fromT: levelFromT,
    });
  }

  const sampleT = liquid.t.filter(inSpan);
  const sampleG = liquid.g.filter((_, i) => inSpan(liquid.t[i]));
  const liquidSeries: Series[] = [
    { label: 'liquid samples', t: sampleT, values: sampleG, color: INK.muted, style: 'dots' },
    {
      label: 'smoothed liquid',
      t: gridT,
      values: smooth,
      color: SERIES_COLORS[0],
      style: 'line',
    },
  ];
  const liquidLegend: LegendEntry[] = [
    { label: 'samples', color: INK.muted, swatch: 'dots' },
    {
      label: `smoothed (SG ${params.liquid.sgWindowS} s)`,
      color: SERIES_COLORS[0],
      swatch: 'line',
    },
  ];
  if (drain) {
    liquidSeries.push({
      label: drain.label,
      t: drain.t,
      values: drain.liquid,
      color: SERIES_COLORS[1],
      style: 'dashed',
    });
    liquidLegend.push({ label: drain.label, color: SERIES_COLORS[1], swatch: 'dashed' });
  }

  const scaleFlow = run.timeline.samples.filter(
    (sample) => inSpan(sample.t) && hasTrustedWeight(sample.frame),
  );
  const flowSeries: Series[] = [
    {
      label: "the scale's flow figure",
      t: scaleFlow.map((sample) => sample.t),
      values: scaleFlow.map((sample) => sample.frame.flowGps),
      color: INK.muted,
      style: 'thin',
    },
    { label: 'derived flow', t: gridT, values: flow, color: SERIES_COLORS[0], style: 'line' },
  ];
  const flowLegend: LegendEntry[] = [
    { label: 'derived (SG slope)', color: SERIES_COLORS[0], swatch: 'line' },
    { label: "the scale's own figure (recorded, never used)", color: INK.muted, swatch: 'thin' },
  ];
  if (drain) {
    flowSeries.push({
      label: drain.label,
      t: drain.t,
      values: drain.flow,
      color: SERIES_COLORS[1],
      style: 'dashed',
    });
    flowLegend.push({ label: drain.label, color: SERIES_COLORS[1], swatch: 'dashed' });
  }

  const floorVar = run.segmentation.sigmaFloorG ** 2;
  const varianceLevels: Level[] = [
    { value: floorVar, label: 'quantisation', color: INK.muted, dashed: true },
  ];
  const varianceLegend: LegendEntry[] = [
    {
      label: `about the smoothed liquid, over ${VARIANCE_WINDOW_S} s`,
      color: SERIES_COLORS[0],
      swatch: 'line',
    },
  ];
  const { vibration, varianceStep } = pump;
  if (vibration && markers.firstDrip) {
    const ratio = vibration.pumpVarG2 / Math.max(vibration.quietVarG2, 1e-12);
    varianceLevels.push(
      {
        value: vibration.quietVarG2,
        label: null,
        color: SERIES_COLORS[1],
        dashed: false,
        toT: vibration.t,
      },
      {
        value: vibration.pumpVarG2,
        label: `pump_on test ×${ratio.toFixed(1)}`,
        color: SERIES_COLORS[1],
        dashed: false,
        fromT: vibration.t,
        toT: markers.firstDrip.t,
      },
    );
  }
  if (varianceStep) {
    const spanS = params.pump.levelSpanS;
    varianceLevels.push(
      {
        value: varianceStep.pumpVarG2,
        label: 'pump_off test',
        color: SERIES_COLORS[1],
        dashed: false,
        fromT: varianceStep.t - spanS,
        toT: varianceStep.t,
      },
      {
        value: varianceStep.quietVarG2,
        label: null,
        color: SERIES_COLORS[1],
        dashed: false,
        fromT: varianceStep.t,
        toT: varianceStep.t + spanS,
      },
    );
  }
  if (vibration || varianceStep) {
    varianceLegend.push({
      label: "the pump detectors' noise levels",
      color: SERIES_COLORS[1],
      swatch: 'line',
    });
  }
  let varianceHigh = 1e-1;
  variance.forEach((v, k) => {
    if (Number.isFinite(v) && inSpan(gridT[k])) varianceHigh = Math.max(varianceHigh, v);
  });

  const panels: Panel[] = [
    {
      title: 'liquid, g',
      legend: liquidLegend,
      height: 300,
      range: paddedRange(
        [...sampleG, ...liquidLevels.map((level) => level.value)],
        0.05,
        [-0.5, 1],
      ),
      log: false,
      series: liquidSeries,
      levels: liquidLevels,
      bands: [
        {
          fromT: window.baseline.startT,
          toT: window.baseline.endT,
          label: 'baseline',
          fill: INK.band,
        },
      ],
      glyphs: [],
    },
    {
      title: 'flow, g/s',
      legend: flowLegend,
      height: 170,
      range: paddedRange([...flow.filter((_, k) => inSpan(gridT[k])), 0], 0.1, [-0.5, 0.5], 0.01),
      log: false,
      series: flowSeries,
      levels: [{ value: 0, label: null, color: INK.axis, dashed: false }],
      bands: [],
      glyphs: [],
    },
    {
      title: 'detrended variance, g² (log)',
      legend: varianceLegend,
      height: 150,
      range: [Math.min(1e-5, floorVar / 10), varianceHigh * 2],
      log: true,
      series: [
        {
          label: 'detrended variance',
          t: gridT,
          values: variance,
          color: SERIES_COLORS[0],
          style: 'line',
        },
      ],
      levels: varianceLevels,
      bands: [],
      glyphs: [],
    },
  ];
  const sound = soundPanel(input.frames, span);
  if (sound) panels.push(sound);

  const marks = [
    ...eventMarks(input.events),
    ...markerMarks(segment, true),
    ...input.truth.flatMap(truthMarks),
  ];
  const header = [
    `window ${seconds(window.startT)}–${seconds(window.endT)} s, ending ${window.end}` +
      ` · espresso: ${segment.espresso ? 'yes' : 'no'}` +
      ` · baseline ${grams(window.baseline.levelG)}, σ ${grams(window.baseline.sigmaG, 3)}`,
    [
      `first-drip time ${or(metrics.firstDripS, seconds, ' s')}`,
      `extraction ${or(metrics.extractionS, seconds, ' s')}`,
      `total ${or(metrics.totalS, seconds, ' s')}`,
      `average flow ${or(metrics.averageFlowGps, (v) => v.toFixed(2), ' g/s')}`,
      `w(pump_off) ${or(metrics.pumpOffWeightG, grams)}`,
      `yield ${or(metrics.yieldG, grams)}`,
      `honest yield ${or(metrics.honestYieldG, grams)}`,
      `tail ${or(metrics.tailMassG, grams)}`,
      `τ ${or(metrics.tauS, seconds, ' s')}`,
    ].join(' · '),
    `flags: ${segment.flags.length > 0 ? segment.flags.join(', ') : 'none'}`,
    ...input.notes,
  ];
  return {
    title: `${input.label} · segment ${index}`,
    notes: header,
    span,
    panels,
    marks,
    legend: marksLegend(input.truth.length > 0),
  };
}

/** The chart of the whole recording: see the module comment. */
export function recordingChart(input: ChartInput): ChartSpec {
  const { run } = input;
  const { analysis, segmentation } = run;
  const received = run.timeline.samples.filter((sample) => hasTrustedWeight(sample.frame));
  const tracked = segmentation.samples;
  let lastT = received.at(-1)?.t ?? 0;
  for (const record of [input.frames, input.events].flat()) {
    lastT = Math.max(lastT, record.tMs / 1000);
  }
  const span: [number, number] = [0, Math.max(lastT, 1)];
  const glyphs: Glyph[] = analysis.steps.map((step) => ({
    t: step.startT,
    value: step.levelBeforeG,
    shape: STEP_SHAPES[step.kind],
    color: INK.secondary,
    title:
      `${step.kind}${step.tareSource ? ` (${step.tareSource})` : ''} ` +
      `${step.sizeG >= 0 ? '+' : ''}${grams(step.sizeG)} at ${seconds(step.startT)} s`,
  }));
  const weights = [...received.map((sample) => sample.frame.weightG), ...tracked.weightG];
  const panels: Panel[] = [
    {
      title: 'weight, g',
      legend: [
        { label: 'zero-tracked', color: SERIES_COLORS[0], swatch: 'line' },
        { label: 'as the scale sent it', color: INK.muted, swatch: 'thin' },
        { label: 'shot window (#segment)', color: WINDOW_FILL, swatch: 'band' },
      ],
      height: 360,
      range: paddedRange(weights, 0.05, [-1, 1]),
      log: false,
      series: [
        {
          label: 'as the scale sent it',
          t: received.map((sample) => sample.t),
          values: received.map((sample) => sample.frame.weightG),
          color: INK.muted,
          style: 'thin',
        },
        {
          label: 'zero-tracked',
          t: tracked.t,
          values: tracked.weightG,
          color: SERIES_COLORS[0],
          style: 'line',
        },
      ],
      levels: [{ value: 0, label: null, color: INK.axis, dashed: false }],
      bands: analysis.segments.map((segment) => ({
        fromT: segment.window.startT,
        toT: segment.window.endT,
        label: `#${segment.index}${segment.espresso ? ' espresso' : ''}`,
        fill: WINDOW_FILL,
      })),
      glyphs,
    },
  ];
  const sound = soundPanel(input.frames, span);
  if (sound) panels.push(sound);

  const { timeline } = analysis;
  return {
    title: `${input.label} · the whole recording`,
    notes: [
      `${timeline.frames} weight frames (${timeline.deviceTimedFrames} timed by the scale)` +
        ` · rate ${timeline.rateSource}` +
        `${timeline.driftPpm === null ? '' : `, drift ${Math.round(timeline.driftPpm)} ppm`}` +
        `${timeline.intervalMs === null ? '' : ` · a sample every ${timeline.intervalMs.toFixed(2)} ms`}`,
      `quantum ${grams(analysis.quantisationG, 2)} · stability tolerance ` +
        `${grams(analysis.toleranceG, 2)} · ${analysis.steps.length} steps · ` +
        `${analysis.segments.length} shot windows · refused frames ${analysis.refusedFrames}` +
        ` · flags: ${analysis.flags.length > 0 ? analysis.flags.join(', ') : 'none'}`,
      ...input.notes,
    ],
    span,
    panels,
    marks: [
      ...eventMarks(input.events),
      ...analysis.segments.flatMap((segment) => markerMarks(segment, false)),
      ...input.truth.flatMap(truthMarks),
    ],
    legend: [
      ...marksLegend(input.truth.length > 0),
      ...(Object.entries(STEP_SHAPES) as [StepKind, GlyphShape][]).map(([kind, shape]) => ({
        label: `step: ${kind}`,
        color: INK.secondary,
        swatch: shape,
      })),
    ],
  };
}

const STEP_SHAPES: Readonly<Record<StepKind, GlyphShape>> = {
  tare: 'diamond',
  'cup-placed': 'up',
  'cup-removed': 'down',
  other: 'dot',
};

/**
 * The noise variance about the liquid's own trend, g², per grid sample: the residuals from the
 * smoothed liquid over `window` samples centred on each. A residual from a Savitzky–Golay fit
 * carries 1 − c₀ of white noise's variance (c₀ the fit's centre weight), so the variance is
 * divided by that and estimates the noise's own, as the pump detectors' levels do. NaN where the
 * window takes in a gap, and at the ends.
 */
export function detrendedVariance(
  values: readonly number[],
  smooth: readonly number[],
  sgWindow: number,
  window: number,
): number[] {
  const out = values.map(() => Number.NaN);
  if (values.length < sgWindow) return out;
  const c0 = savitzkyGolayCoefficients({ window: sgWindow, order: 2 })[(sgWindow - 1) / 2];
  const residual = values.map((value, k) => value - smooth[k]);
  const half = Math.max(1, Math.floor(window / 2));
  for (let k = half; k + half < values.length; k++) {
    const part = residual.slice(k - half, k + half + 1);
    if (!part.every(Number.isFinite)) continue;
    const mean = part.reduce((sum, r) => sum + r, 0) / part.length;
    const squares = part.reduce((sum, r) => sum + (r - mean) ** 2, 0);
    out[k] = squares / (part.length - 1) / (1 - c0);
  }
  return out;
}

/**
 * The span a segment chart shows, s: from `LEAD_S` before the shot starts (the baseline's end,
 * pump_on, first_drip, or one of `starts`, such as a Tare + start tap; whichever comes first) to
 * `TRAIL_S` after it settles, or to the window's end when the cup comes off within `CUP_WAIT_S`.
 */
export function segmentSpan(
  segment: SegmentAnalysis,
  starts: readonly number[] = [],
): [number, number] {
  const { window, markers } = segment;
  const begins = [window.baseline.endT, markers.pumpOn?.t, markers.firstDrip?.t, ...starts].filter(
    (t): t is number => t !== undefined,
  );
  const from = Math.min(...begins) - LEAD_S;
  const settledT =
    markers.settled && markers.settled.t <= window.endT ? markers.settled.t : undefined;
  const activityEnd = Math.max(
    ...[window.baseline.endT, markers.firstDrip?.t, markers.pumpOff?.t, settledT].filter(
      (t): t is number => t !== undefined,
    ),
  );
  let to = window.endT - activityEnd <= CUP_WAIT_S ? window.endT + 1 : activityEnd + TRAIL_S;
  if (to - from < MIN_SPAN_S) to = from + MIN_SPAN_S;
  return [from, to];
}

interface Drain {
  readonly label: string;
  readonly t: number[];
  readonly liquid: number[];
  readonly flow: number[];
}

/**
 * The drain after pump_off as the analysis modelled it: the tail fit (T1.12) when there is one,
 * else the regime change's knee (T1.13). Null without either.
 */
function drainModel(segment: SegmentAnalysis, run: AnalysisRun, index: number): Drain | null {
  const { markers, tail } = segment;
  const pumpOff = markers.pumpOff;
  if (!pumpOff) return null;
  const endT = segment.window.endT;
  const t: number[] = [];
  for (let at = pumpOff.t; at <= endT; at += 0.05) t.push(at);
  if (tail) {
    const flow = t.map((at) => tail.flowAtPumpOffGps * Math.exp(-(at - pumpOff.t) / tail.tauS));
    return {
      label: `tail fit, τ ${seconds(tail.tauS)} s`,
      t,
      liquid: flow.map((f) => tail.finalWeightG - f * tail.tauS),
      flow,
    };
  }
  const regime = run.markers[index].pump.regimeChange;
  if (!regime || pumpOff.detector !== 'regime-change') return null;
  const flow = t.map((at) => regime.flowGps * Math.exp(-(at - regime.t) / regime.tauS));
  return {
    label: `regime change's drain, τ ${seconds(regime.tauS)} s`,
    t,
    liquid: flow.map((f) => regime.weightG + (regime.flowGps - f) * regime.tauS),
    flow,
  };
}

/** The sound levels in `span`, or null with fewer than two readings there (T1.24). */
function soundPanel(frames: readonly RawFrame[], span: readonly [number, number]): Panel | null {
  const readings = frames.flatMap((frame) => {
    const t = frame.tMs / 1000;
    if (frame.source !== 'mic' || t < span[0] || t > span[1]) return [];
    const decoded = decodeSoundFrame(frame.bytes);
    return decoded ? [{ t, decoded }] : [];
  });
  if (readings.length < 2) return null;
  const names = readings[0].decoded.layout.measures.map((measure) => measure.name);
  const wanted = SOUND_MEASURES.filter((name) => names.includes(name));
  const shown = wanted.length > 0 ? [...wanted] : names.slice(0, 3);
  const series: Series[] = shown.map((name, i) => ({
    label: name,
    t: readings.map((reading) => reading.t),
    values: readings.map((reading) => {
      const at = reading.decoded.layout.measures.findIndex((measure) => measure.name === name);
      return at < 0 ? Number.NaN : reading.decoded.levelsDb[at];
    }),
    color: SERIES_COLORS[i],
    style: i === 0 ? 'line' : 'thin',
  }));
  return {
    title: 'sound, dB',
    legend: series.map((s, i) => ({
      label: s.label,
      color: s.color,
      swatch: i === 0 ? 'line' : 'thin',
    })),
    height: 140,
    range: paddedRange(
      series.flatMap((s) => s.values),
      0.05,
      [-60, -40],
    ),
    log: false,
    series,
    levels: [],
    bands: [],
    glyphs: [],
  };
}

/** The marks of a segment's markers: labelled with their times, or not. */
function markerMarks(segment: SegmentAnalysis, labelled: boolean): Mark[] {
  const { markers } = segment;
  return MARKERS.flatMap(({ key, name }) => {
    const marker = markers[key];
    if (!marker) return [];
    const how =
      key === 'pumpOff'
        ? markers.pumpOff?.detector
        : key === 'settled'
          ? markers.settled?.source
          : key === 'firstDrip'
            ? markers.firstDrip?.onset
            : undefined;
    const text = `${name} ${seconds(marker.t)}${how ? `, ${how}` : ''}`;
    return [
      {
        t: marker.t,
        label: labelled ? text : null,
        color: MARKER_COLORS[key],
        style: 'solid' as const,
        title: `segment ${segment.index}: ${text}`,
      },
    ];
  });
}

/** The marks of one simulated shot's true markers: dotted, unlabelled. */
function truthMarks(truth: TrueMarkers): Mark[] {
  const times: Record<(typeof MARKERS)[number]['key'], number | null> = {
    pumpOn: truth.pumpOnT,
    firstDrip: truth.firstDripT,
    pumpOff: truth.pumpOffT,
    settled: truth.settledT,
    cupRemoved: truth.cupRemovedT,
  };
  return MARKERS.flatMap(({ key, name }) => {
    const t = times[key];
    return t === null
      ? []
      : [
          {
            t,
            label: null,
            color: MARKER_COLORS[key],
            style: 'dotted' as const,
            title: `shot ${truth.index}: true ${name} ${seconds(t)}`,
          },
        ];
  });
}

/** How each kind of app event is drawn, or null for those with no moment worth marking. */
function eventMark(event: AppEvent): { label: string; color: string; style: MarkStyle } | null {
  switch (event.type) {
    case 'command-sent':
    case 'command-failed': {
      const failed = event.type === 'command-failed' ? ' failed' : '';
      return {
        label: `${commandLabel(event.data)}${failed}`,
        color: INK.secondary,
        style: 'dashed',
      };
    }
    case 'annotation':
      return {
        label: `"${event.data.text ?? event.data.label}"`,
        color: INK.primary,
        style: 'dashed',
      };
    case 'ui-action':
      return { label: event.data.action, color: INK.muted, style: 'dotted' };
    case 'sound-started':
    case 'sound-stopped':
    case 'smoothing-not-confirmed':
    case 'error':
    case 'disconnected':
      return { label: event.type, color: INK.muted, style: 'dotted' };
    default:
      return null;
  }
}

/** The app events worth marking, labelled. */
export function eventMarks(events: readonly AppEvent[]): Mark[] {
  return events.flatMap((event) => {
    const mark = eventMark(event);
    if (!mark) return [];
    const t = event.tMs / 1000;
    return [{ t, ...mark, title: `${eventSummary(event)} at ${seconds(t)} s` }];
  });
}

const COMMAND_SHORT: Readonly<Record<string, string>> = {
  tare: 'tare',
  setBuzzer: 'buzzer',
  setAutoOff: 'auto-off',
  startTimer: 'start',
  stopTimer: 'stop',
  resetTimer: 'reset',
  tareAndStartTimer: 'tare + start',
  flowSmoothingOff: 'smoothing off',
  keepAlive: 'keep-alive',
};

/** A command as the docs name it: its sub-command byte and what it does, like `07 tare + start`. */
export function commandLabel(data: {
  readonly command: string;
  readonly hex: string;
  readonly param: number | null;
}): string {
  const short = COMMAND_SHORT[data.command] ?? data.command;
  return `${data.hex.slice(4, 6)} ${short}${data.param === null ? '' : ` ${data.param}`}`;
}

/** One line on what an app event says. */
export function eventSummary(event: AppEvent): string {
  switch (event.type) {
    case 'connected':
      return `connected to ${event.data.deviceName ?? 'a scale'}`;
    case 'disconnected':
      return `disconnected (${event.data.reason})${event.data.message ? `: ${event.data.message}` : ''}`;
    case 'command-sent':
      return `${commandLabel(event.data)}${event.data.reason ? ` (${event.data.reason})` : ''}`;
    case 'command-failed':
      return `${commandLabel(event.data)} failed: ${event.data.error}`;
    case 'ui-action':
      return event.data.action;
    case 'annotation':
      return `${event.data.label}${event.data.text ? `: ${event.data.text}` : ''}`;
    case 'smoothing-confirmed':
      return `smoothing off confirmed after ${event.data.attempts} attempts`;
    case 'smoothing-not-confirmed':
      return `smoothing still on after ${event.data.attempts} attempts`;
    case 'error':
      return `error${event.data.context ? ` in ${event.data.context}` : ''}: ${event.data.message}`;
    case 'characteristic-properties':
      return `${event.data.characteristic} properties`;
    case 'sound-started':
      return `sound levels started (layout ${event.data.layout}, ${event.data.input ?? 'input unknown'})`;
    case 'sound-input':
      return `sound input ${event.data.contextState}${event.data.muted ? ', muted' : ''}`;
    case 'sound-stopped':
      return `sound levels stopped (${event.data.reason})`;
  }
}

/** The bottom legend: the markers, the truth, and the app events. */
function marksLegend(truth: boolean): LegendEntry[] {
  return [
    ...MARKERS.map(({ key, name }) => ({
      label: name,
      color: MARKER_COLORS[key],
      swatch: 'solid' as const,
    })),
    ...(truth
      ? [
          {
            label: "dotted: the simulator's truth",
            color: INK.secondary,
            swatch: 'dotted' as const,
          },
        ]
      : []),
    { label: 'command', color: INK.secondary, swatch: 'dashed' },
    { label: 'annotation', color: INK.primary, swatch: 'dashed' },
    { label: 'other app event', color: INK.muted, swatch: 'dotted' },
  ];
}

/**
 * A y range around `values`: their 0.5% to 99.5% quantiles, so that a lone spike can't flatten
 * the rest, widened by `pad` of its span and to at least `least`.
 */
function paddedRange(
  values: readonly number[],
  pad: number,
  least: readonly [number, number],
  tail = 0.005,
): [number, number] {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) return [least[0], least[1]];
  const low = Math.min(least[0], quantile(finite, tail));
  const high = Math.max(least[1], quantile(finite, 1 - tail));
  const margin = (high - low) * pad;
  return [low - margin, high + margin];
}

function seconds(value: number): string {
  return value.toFixed(2);
}

function grams(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)} g`;
}

function or(value: number | null, format: (value: number) => string, unit = ''): string {
  return value === null ? '—' : `${format(value)}${unit}`;
}
