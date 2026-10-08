/**
 * The history's charts (T1.19; boards History and History-Detail): a shot's
 * curve from the analysis (`SegmentAnalysis.curve`) on the brew chart's geometry
 * (`../brew/chart`), counted from a zero.
 *
 * - **The zero** is pump_on, the Tare + start tap (Q4), else the first drip: a shot without the
 *   tap has no pump_on. The detail and a row's small graph start at pump_on, or at the first
 *   drip (no preinfusion: the shot was found by its weight, T3.17), and end where the tail
 *   ended (the shot settled), else 6 s after the pump stopped. The axis ends there too, not at
 *   a round number (T3.17, D-110).
 * - Compare's overlay of two shots went with Compare (T3.6).
 */

import type { SegmentAnalysis, SegmentCurve } from '../../core/analysis';
import type { StageMarkers } from '../stages';
import {
  curvePath,
  quarterTicks,
  share,
  weightAxisG,
  xOf,
  yOfWeight,
  PLOT,
  type ChartPoint,
  type ChartScale,
} from '../brew/chart';

export type Zero = 'pumpOn' | 'firstDrip';

export const ZERO_LABELS: Readonly<Record<Zero, string>> = {
  pumpOn: 'pump on',
  firstDrip: 'the first drip',
};

/** A chart looks this long after the pump stopped for the tail's end, s, at most. */
const AFTER_S = 6;
/**
 * The tail has ended once the flow, after pump off and after the liquid settled, is down to
 * this, g/s: the drips have stopped (T3.17). PROVISIONAL(U1.1: the flow's noise on a still cup)
 */
const TAIL_END_GPS = 0.1;

/** A shot's markers on its chart, s from its zero; null when the analysis found none. */
export type PlotMarkers = StageMarkers;

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
  const ended = shotEnd(segment, t0);
  if (ended === null) return null;
  const { points, end } = ended;
  return {
    zero,
    scale: { fromS: 0, timeS: end, weightG: weightAxisG(targetG ?? 0, maxG(points)) },
    points,
    markers: markersFrom(segment, t0, end),
    targetG,
  };
}

/**
 * The reference shot's curve for the extraction's charts (T3.7, D-105): s from its pump_on, as
 * the live chart counts from the Start tap, until its tail ended; null for a shot
 * without pump_on (no tap), which can't be lined up with a live shot.
 */
export function referenceCurve(segment: SegmentAnalysis): ChartPoint[] | null {
  const t0 = zeroT(segment, 'pumpOn');
  if (t0 === null || segment.curve.weightG.length === 0) return null;
  return shotEnd(segment, t0)?.points ?? null;
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
  const step = tickStepS(scale.timeS);
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

function markersFrom(segment: SegmentAnalysis, t0: number, end: number): PlotMarkers {
  const at = (t: number | undefined) => (t === undefined ? null : t - t0);
  const { markers } = segment;
  return {
    pumpOnS: at(markers.pumpOn?.t),
    firstDripS: at(markers.firstDrip?.t),
    pumpOffS: at(markers.pumpOff?.t),
    endS: end,
  };
}

/**
 * A chart's points from `t0` to where the shot ended, and that end, s from `t0` (T3.17): once the
 * flow is down to a trickle after pump off and after the liquid settled (the drips stopped), at
 * most 6 s after pump off or at the settling, whichever is later; without pump off, at the
 * settling or the curve's end. Not on until the cup comes off. Null for an empty curve.
 */
function shotEnd(
  segment: SegmentAnalysis,
  t0: number,
): { readonly points: ChartPoint[]; readonly end: number } | null {
  const { markers, curve } = segment;
  const curveEnd = curve.startT + (curve.weightG.length - 1) * curve.stepS - t0;
  const pumpOff = markers.pumpOff === null ? null : markers.pumpOff.t - t0;
  const settled = markers.settled === null ? null : markers.settled.t - t0;
  const limit = Math.min(
    curveEnd,
    pumpOff === null ? (settled ?? curveEnd) : Math.max(pumpOff + AFTER_S, settled ?? pumpOff),
  );
  if (limit <= 0) return null;
  const all = curvePoints(curve, t0, 0, limit);
  // The tail ends where the flow has died down, past pump off and the settling.
  const from = Math.max(pumpOff ?? limit, settled ?? -Infinity);
  const last = all.findIndex(
    (point) => point.tS >= from && point.flowGps !== null && point.flowGps <= TAIL_END_GPS,
  );
  if (last === -1) return all.length === 0 ? null : { points: all, end: limit };
  return { points: all.slice(0, last + 1), end: all[last].tS };
}

/** The time axis's steps, s: the first that gives no more than four and a half per axis. */
const TICK_STEPS_S = [5, 10, 15, 20, 30, 60, 120, 300];

/** The step between the time axis's labels for an axis `spanS` long (it ends where the shot does). */
export function tickStepS(spanS: number): number {
  return TICK_STEPS_S.find((step) => spanS / step <= 4.5) ?? TICK_STEPS_S.at(-1)!;
}

function maxG(points: readonly ChartPoint[]): number {
  let max = 0;
  for (const point of points) max = Math.max(max, point.g);
  return max;
}
