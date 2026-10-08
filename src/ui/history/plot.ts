/**
 * The history's charts (T1.19; boards History and History-Detail): a shot's
 * curve from the analysis (`SegmentAnalysis.curve`) on the brew chart's geometry
 * (`../brew/chart`), counted from a zero.
 *
 * - **The zero** is pump_on, the Tare + start tap (Q4), else the first drip: a shot without the
 *   tap has no pump_on. The detail and a row's small graph start at pump_on, or 3 s before the
 *   first drip, and run until 6 s after the pump stopped (or the shot settled).
 * - Compare's overlay of two shots went with Compare (T3.6).
 */

import type { SegmentAnalysis, SegmentCurve } from '../../core/analysis';
import {
  curvePath,
  quarterTicks,
  share,
  timeAxisS,
  weightAxisG,
  xOf,
  yOfWeight,
  PLOT,
  pointAt,
  type ChartPoint,
  type ChartScale,
} from '../brew/chart';

export type Zero = 'pumpOn' | 'firstDrip';

export const ZERO_LABELS: Readonly<Record<Zero, string>> = {
  pumpOn: 'pump on',
  firstDrip: 'preinfusion end',
};

/** Counted from the first drip, a chart starts this long before it, s, without a pre-infusion. */
const FIRST_DRIP_LEAD_S = 3;
/** A chart runs this long after the pump stopped, or the shot settled, s. */
const AFTER_S = 6;

/** A shot's markers on its chart, s from its zero; null when the analysis found none. */
export interface PlotMarkers {
  readonly pumpOnS: number | null;
  readonly firstDripS: number | null;
  readonly pumpOffS: number | null;
}

export interface ShotPlot {
  readonly zero: Zero;
  readonly scale: ChartScale;
  /** From the plot's left edge to its right, s from the zero. */
  readonly points: readonly ChartPoint[];
  readonly markers: PlotMarkers;
  readonly targetG: number | null;
}

/** The time a shot is counted from, by `zero`, s on the timeline; null without that marker. */
export function zeroT(segment: SegmentAnalysis, zero: Zero): number | null {
  return (zero === 'pumpOn' ? segment.markers.pumpOn?.t : segment.markers.firstDrip?.t) ?? null;
}

/** The detail's chart and a row's small graph; null for a shot without pump_on or first drip. */
export function shotPlot(segment: SegmentAnalysis, targetG: number | null): ShotPlot | null {
  const zero: Zero = segment.markers.pumpOn ? 'pumpOn' : 'firstDrip';
  const t0 = zeroT(segment, zero);
  if (t0 === null || segment.curve.weightG.length === 0) return null;
  const fromS = zero === 'pumpOn' ? 0 : -FIRST_DRIP_LEAD_S;
  const timeS = timeAxisS(endS(segment, t0) - fromS);
  const points = curvePoints(segment.curve, t0, fromS, fromS + timeS);
  return {
    zero,
    scale: { fromS, timeS, weightG: weightAxisG(targetG ?? 0, maxG(points)) },
    points,
    markers: markersFrom(segment, t0),
    targetG,
  };
}

/**
 * The reference shot's curve for the extraction's charts (T3.7, D-105): s from its pump_on, as
 * the live chart counts from the Start tap, until 6 s after the pump stopped; null for a shot
 * without pump_on (no tap), which can't be lined up with a live shot.
 */
export function referenceCurve(segment: SegmentAnalysis): ChartPoint[] | null {
  const t0 = zeroT(segment, 'pumpOn');
  if (t0 === null || segment.curve.weightG.length === 0) return null;
  const points = curvePoints(segment.curve, t0, 0, endS(segment, t0));
  return points.length === 0 ? null : points;
}

/** A row's small graph (board History): the weight's and the flow's paths, the target's height. */
export interface Sparkline {
  readonly weight: string;
  /** The flow, on the charts' 0–5 g/s (T3.13). */
  readonly flow: string;
  /** The target line's y in the plot, or null without a target. */
  readonly targetY: number | null;
}

export function sparkline(segment: SegmentAnalysis, targetG: number | null): Sparkline | null {
  const plot = shotPlot(segment, targetG);
  if (plot === null) return null;
  return {
    weight: linePath(plot.scale, plot.points, 'g', 0.5),
    flow: linePath(plot.scale, plot.points, 'flowGps', 0.5),
    targetY: targetG === null ? null : yOfWeight(plot.scale, targetG),
  };
}

/**
 * A shot's three stages, colour-coded on its chart in place of the marker lines (T3.16, D-109):
 * preinfusion (pump on to the first drip), extraction (the first drip to pump off) and the tail
 * (after pump off).
 */
export const STAGES = ['preinfusion', 'extraction', 'tail'] as const;
export type Stage = (typeof STAGES)[number];

/** Each stage's colour, as a CSS value (`--stage-…` in theme.css). */
export const STAGE_COLOUR: Readonly<Record<Stage, string>> = {
  preinfusion: 'var(--stage-pre)',
  extraction: 'var(--stage-ext)',
  tail: 'var(--stage-tail)',
};

/**
 * The stage at `tS`, s from the chart's zero: before the first drip the preinfusion (without
 * pump_on too: the dry start), up to pump off the extraction, then the tail.
 */
export function stageAt(markers: PlotMarkers, tS: number): Stage {
  if (markers.firstDripS !== null && tS < markers.firstDripS) return 'preinfusion';
  if (markers.pumpOffS === null || tS < markers.pumpOffS) return 'extraction';
  return 'tail';
}

/**
 * The points by stage, each run holding the point where the next starts too, so the coloured
 * line has no gap. A stage with no points has an empty run.
 */
export function stageRuns(
  markers: PlotMarkers,
  points: readonly ChartPoint[],
): Readonly<Record<Stage, readonly ChartPoint[]>> {
  const runs: Record<Stage, ChartPoint[]> = { preinfusion: [], extraction: [], tail: [] };
  let previous: Stage | null = null;
  for (const point of points) {
    const stage = stageAt(markers, point.tS);
    if (previous !== null && previous !== stage) runs[previous].push(point);
    runs[stage].push(point);
    previous = stage;
  }
  return runs;
}

/** A stage's span on the time axis, s from the zero, clipped to the chart's. */
export interface StageSpan {
  readonly stage: Stage;
  readonly fromS: number;
  readonly toS: number;
}

/** The stages' spans across the chart, for the strip under it; a stage it doesn't reach, none. */
export function stageSpans(markers: PlotMarkers, scale: ChartScale): StageSpan[] {
  const start = scale.fromS ?? 0;
  const end = start + scale.timeS;
  const clip = (t: number) => Math.min(end, Math.max(start, t));
  const firstDrip = markers.firstDripS === null ? start : clip(markers.firstDripS);
  const pumpOff = markers.pumpOffS === null ? end : clip(markers.pumpOffS);
  const preFrom = markers.pumpOnS === null ? start : clip(markers.pumpOnS);
  return [
    { stage: 'preinfusion' as const, fromS: preFrom, toS: firstDrip },
    { stage: 'extraction' as const, fromS: firstDrip, toS: pumpOff },
    { stage: 'tail' as const, fromS: pumpOff, toS: end },
  ].filter((span) => span.toS > span.fromS);
}

/** A line of the reading at a moment beyond the time, weight and flow: a stage that has ended. */
export interface StageNote {
  readonly stage: Stage;
  readonly text: string;
}

/**
 * What the finger's moment adds (T3.16): the stages it is past, with how long they lasted
 * (`preinfusion 7.4 s`, `extraction 24.6 s`), and in the tail what has dripped since pump off
 * (`tail +0.3 g`). A preinfusion without pump_on has no duration, so no note.
 */
export function stageNotes(
  markers: PlotMarkers,
  points: readonly ChartPoint[],
  tS: number,
): StageNote[] {
  const notes: StageNote[] = [];
  const { pumpOnS, firstDripS, pumpOffS } = markers;
  if (pumpOnS !== null && firstDripS !== null && tS >= firstDripS) {
    notes.push({
      stage: 'preinfusion',
      text: `preinfusion ${(firstDripS - pumpOnS).toFixed(1)} s`,
    });
  }
  if (pumpOffS !== null && tS >= pumpOffS) {
    const from = firstDripS ?? pumpOnS;
    if (from !== null) {
      notes.push({ stage: 'extraction', text: `extraction ${(pumpOffS - from).toFixed(1)} s` });
    }
    const atOff = pointAt(points, pumpOffS);
    const now = pointAt(points, tS);
    if (atOff !== null && now !== null) {
      const dripped = Math.max(0, now.g - atOff.g);
      notes.push({ stage: 'tail', text: `tail +${dripped.toFixed(1)} g` });
    }
  }
  return notes;
}

/** An x-axis label: its place as a share of the width, and its text. */
export interface TimeTick {
  readonly left: string;
  readonly label: string;
  /** Where its text sits against the place: the first and last ones keep inside the plot. */
  readonly anchor: 'start' | 'middle' | 'end';
}

/**
 * The time axis's labels: every quarter of the axis from 0 that is inside the plot, the last with
 * its unit. Counted from the first drip, they are signed (`+10`), as the board writes them.
 */
export function timeTicks(scale: ChartScale, zero: Zero): TimeTick[] {
  const fromS = scale.fromS ?? 0;
  const step = quarterTicks(scale.timeS)[0];
  const ticks: number[] = [];
  for (let t = Math.ceil(fromS / step) * step; t <= fromS + scale.timeS + 1e-9; t += step) {
    ticks.push(Number(t.toFixed(1)));
  }
  return ticks.map((t, i) => {
    const x = xOf(scale, t);
    const text = `${zero === 'firstDrip' && t > 0 ? '+' : ''}${t}`;
    return {
      left: share(x, PLOT.width),
      label: i === ticks.length - 1 ? `${text} s` : text,
      anchor: x <= 15 ? 'start' : x >= PLOT.width - 15 ? 'end' : 'middle',
    };
  });
}

/** The weight axis's labels, top down at its quarters: `30 g`, `20`, `10` for 40 g. */
export function weightTicks(scale: ChartScale): { readonly top: string; readonly label: string }[] {
  return quarterTicks(scale.weightG)
    .slice(0, 3)
    .reverse()
    .map((g, i) => ({ top: `${(i + 1) * 25}%`, label: i === 0 ? `${g} g` : `${g}` }));
}

/**
 * The curve's points from `fromS` to `toS`, s from `t0`, and the one either side of them, so
 * the line reaches the plot's edges (`xOf` holds them there). Where the liquid is unknown there
 * are none: `linePath` breaks the line there.
 */
export function curvePoints(
  curve: SegmentCurve,
  t0: number,
  fromS: number,
  toS: number,
): ChartPoint[] {
  const tOf = (i: number) => curve.startT + i * curve.stepS - t0;
  const first = Math.max(0, Math.ceil((fromS - curve.startT + t0) / curve.stepS - 1e-9) - 1);
  const points: ChartPoint[] = [];
  for (let i = first; i < curve.weightG.length; i++) {
    const g = curve.weightG[i];
    if (g !== null) points.push({ tS: tOf(i), g, flowGps: curve.flowGps[i] });
    if (tOf(i) >= toS - 1e-9) break;
  }
  return points;
}

/** Points further apart than this, s, are either side of a gap: the line breaks. */
const GAP_S = 1;

/** `curvePath`, with the line broken wherever points are missing. */
export function linePath(
  scale: ChartScale,
  points: readonly ChartPoint[],
  key: 'g' | 'flowGps',
  minStepS?: number,
): string {
  const parts: string[] = [];
  let run: ChartPoint[] = [];
  for (const point of points) {
    if (run.length > 0 && point.tS - run.at(-1)!.tS > GAP_S) {
      parts.push(curvePath(scale, run, key, minStepS));
      run = [];
    }
    run.push(point);
  }
  if (run.length > 0) parts.push(curvePath(scale, run, key, minStepS));
  return parts.join('');
}

function markersFrom(segment: SegmentAnalysis, t0: number): PlotMarkers {
  const at = (t: number | undefined) => (t === undefined ? null : t - t0);
  const { markers } = segment;
  return {
    pumpOnS: at(markers.pumpOn?.t),
    firstDripS: at(markers.firstDrip?.t),
    pumpOffS: at(markers.pumpOff?.t),
  };
}

/** Where a chart of the shot ends, s from `t0`: after the pump stopped, inside its curve. */
function endS(segment: SegmentAnalysis, t0: number): number {
  const { markers, curve } = segment;
  const curveEnd = curve.startT + (curve.weightG.length - 1) * curve.stepS - t0;
  const ended = markers.pumpOff?.t ?? markers.settled?.t ?? markers.firstDrip?.t;
  return ended === undefined ? curveEnd : Math.min(curveEnd, ended - t0 + AFTER_S);
}

function maxG(points: readonly ChartPoint[]): number {
  let max = 0;
  for (const point of points) max = Math.max(max, point.g);
  return max;
}
