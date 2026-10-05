/**
 * A segment's curve (T1.19): its liquid and flow on a coarse grid, which the history draws (spec
 * v2 "App structure and look": a row's small graph, the shot's large one, and the overlay of
 * two). The derived cache keeps it beside the markers, so a chart needs no raw.
 *
 * - **The liquid** is the window's (`windowLiquid`): zero-tracked, less the baseline before the
 *   pump and the other steps inside the window. It is smoothed with a quadratic Savitzky–Golay
 *   fit over `CURVE_SMOOTHING_S`, wider than the markers' (0.5 s), because a chart wants the
 *   shape rather than the scale's 0.1 g steps. The flow is the derivative of a fit over
 *   `CURVE_FLOW_SMOOTHING_S`: a drop of 0.1 g in a tenth of a second is 1 g/s, so a narrower one
 *   draws the steps as spikes.
 * - **The points** are every `CURVE_STEP_S` (a whole number of grid steps), rounded to 0.01 g
 *   and g/s, from `CURVE_LEAD_S` before the shot starts (the baseline's end, pump_on or
 *   first_drip, whichever is first) to `CURVE_TRAIL_S` after it ends (first_drip, pump_off or
 *   settled, whichever is last), inside the window.
 * - **Gaps** in the liquid (another step's transition, a transient, or a step of the pour itself,
 *   which the markers leave out: session 2's first shot gushed in two steps at first_drip) are
 *   bridged in a straight line, as a chart would draw them, up to `CURVE_MAX_GAP_S`. Longer
 *   ones, and the window's ends, are null.
 *
 * Display only: no marker or metric reads it. A change to a constant here changes the output, so
 * it needs an `ANALYSIS_VERSION` bump.
 */

import { quadraticSG, sgWindowSamples, windowLiquid } from './liquid';
import type { SegmentMarkers } from './metrics';
import type { Segmentation } from './segment';
import type { ShotWindow } from './shot-windows';

/** The time between the curve's points, s: rounded to a whole number of grid steps. */
export const CURVE_STEP_S = 0.2;
/** The weight's smoothing fit's span, s. */
export const CURVE_SMOOTHING_S = 1;
/** The flow's, s. */
export const CURVE_FLOW_SMOOTHING_S = 2;
/** How long before the shot starts the curve does, s: enough to align two at first_drip. */
export const CURVE_LEAD_S = 10;
/** How long after the shot ends the curve does, s. */
export const CURVE_TRAIL_S = 10;
/** The longest gap in the liquid bridged in a straight line, s. */
export const CURVE_MAX_GAP_S = 5;

export interface SegmentCurve {
  /** The first point's time, s on the timeline. */
  readonly startT: number;
  /** The time between points, s. */
  readonly stepS: number;
  /** The liquid at each point, g; null where it is unknown. */
  readonly weightG: readonly (number | null)[];
  /** The flow at each point, g/s; null where it is unknown. */
  readonly flowGps: readonly (number | null)[];
}

/** The curve of `window`, the window the markers measured in (`ShotMarkers.window`). Pure. */
export function segmentCurve(
  segmentation: Segmentation,
  window: ShotWindow,
  markers: SegmentMarkers,
): SegmentCurve {
  const { start, step, values } = windowLiquid(segmentation, window).grid;
  const every = Math.max(1, Math.round(CURVE_STEP_S / step));
  const stepS = step * every;
  const known = (t: number | undefined): t is number => t !== undefined;
  const begins = [window.baseline.endT, markers.pumpOn?.t, markers.firstDrip?.t].filter(known);
  const ends = [
    window.baseline.endT,
    markers.firstDrip?.t,
    markers.pumpOff?.t,
    markers.settled?.t,
  ].filter(known);
  // Grid indices, on multiples of `every` from the window's first sample.
  const first = Math.max(
    0,
    Math.ceil((Math.min(...begins) - CURVE_LEAD_S - start) / stepS) * every,
  );
  const last = Math.min(
    values.length - 1,
    Math.floor((Math.max(...ends) + CURVE_TRAIL_S - start) / step),
  );
  if (last < first) return { startT: start + first * step, stepS, weightG: [], flowGps: [] };

  const fit = sgWindowSamples(CURVE_SMOOTHING_S, step);
  const flowFit = sgWindowSamples(CURVE_FLOW_SMOOTHING_S, step);
  const bridged = bridgeGaps(values, Math.floor(CURVE_MAX_GAP_S / step));
  const smooth = quadraticSG(bridged, fit, step);
  const flow = quadraticSG(bridged, flowFit, step, 1);
  const weightG: (number | null)[] = [];
  const flowGps: (number | null)[] = [];
  for (let k = first; k <= last; k += every) {
    weightG.push(hundredths(smooth[k]));
    flowGps.push(hundredths(flow[k]));
  }
  return { startT: start + first * step, stepS, weightG, flowGps };
}

/** The time of a curve's point `i`, s on the timeline. */
export function curveTime(curve: SegmentCurve, i: number): number {
  return curve.startT + i * curve.stepS;
}

/**
 * `values` with every run of NaN up to `maxRun` long, between two numbers, filled in a straight
 * line between them.
 */
export function bridgeGaps(values: readonly number[], maxRun: number): number[] {
  const out = [...values];
  let i = 0;
  while (i < out.length) {
    if (!Number.isNaN(out[i])) {
      i++;
      continue;
    }
    let end = i;
    while (end < out.length && Number.isNaN(out[end])) end++;
    // NaN from i to end − 1, between out[i − 1] and out[end].
    if (i > 0 && end < out.length && end - i <= maxRun) {
      const from = out[i - 1];
      const to = out[end];
      for (let k = i; k < end; k++) out[k] = from + ((to - from) * (k - i + 1)) / (end - i + 1);
    }
    i = end;
  }
  return out;
}

function hundredths(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value * 100) / 100;
  return rounded === 0 ? 0 : rounded; // no -0
}
