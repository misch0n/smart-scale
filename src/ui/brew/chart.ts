/**
 * The shot chart's geometry (the mockups' charts, design/ui-exploration/tools/curves.mjs): a
 * 1000 × 500 plot, y down, with time from the pump start across it, weight up it (labelled on
 * the right), and flow on its own scale, 0–5 g/s (labelled on the left, T3.9). The axes start at
 * 0–40 s and 0–40 g, and grow in steps when the shot needs more: 0–60 g for a target past 36 g,
 * as on the waiting screen.
 */

export const PLOT = { width: 1000, height: 500 } as const;

/** The flow axis's top, g/s (T3.9: was 3, unlabelled). Faster flow is drawn at the top. */
export const FLOW_AXIS_GPS = 5;

/** The flow axis's labels, g/s, on the left: 1 to 4 (0 is the floor, 5 the top). */
export const FLOW_TICKS: readonly number[] = [1, 2, 3, 4];

/** A flow label's height, as a share of the plot from its top: `"60%"` for 2 g/s. */
export function flowTop(gps: number): string {
  return `${round1((1 - gps / FLOW_AXIS_GPS) * 100)}%`;
}

/**
 * The weight axis's labels at its quarters, on the right, but the top one and any within 8 % of
 * the axis of the target, whose own label sits there (T3.9).
 */
export function weightTicks(weightG: number, targetG: number | null): number[] {
  return quarterTicks(weightG)
    .slice(0, 3)
    .filter((g) => targetG === null || Math.abs(g - targetG) / weightG >= 0.08);
}

/** The weight axes the chart steps through, g. */
const WEIGHT_AXES = [40, 60, 80, 100, 150, 200, 300, 500];
/** The time axes, s. */
const TIME_AXES = [40, 60, 80, 120, 180, 240, 360, 600];

/**
 * The smallest weight axis whose top 10 % stays clear of the target, for its label, and that holds
 * the most in the cup: 0–40 g up to a 36 g target, as the waiting screen draws it.
 */
export function weightAxisG(targetG: number, maxG = 0): number {
  return WEIGHT_AXES.find((axis) => targetG <= axis * 0.9 && maxG <= axis) ?? WEIGHT_AXES.at(-1)!;
}

/** The smallest time axis that holds `maxS`. */
export function timeAxisS(maxS: number): number {
  return TIME_AXES.find((axis) => maxS <= axis) ?? TIME_AXES.at(-1)!;
}

/** The labels of an axis at its quarters, without 0: 10, 20, 30, 40 for 40. */
export function quarterTicks(axis: number): number[] {
  return [1, 2, 3, 4].map((i) => Number(((axis * i) / 4).toFixed(1)));
}

export interface ChartScale {
  /** The time across the plot, s. */
  readonly timeS: number;
  readonly weightG: number;
  /**
   * The time at the plot's left edge, s: 0 (the default) to start at the pump, below 0 for a
   * chart that shows the time before its zero (the history's overlay, T1.19).
   */
  readonly fromS?: number;
}

export function xOf(scale: ChartScale, tS: number): number {
  const fromS = scale.fromS ?? 0;
  return round1((Math.min(Math.max(tS - fromS, 0), scale.timeS) / scale.timeS) * PLOT.width);
}

export function yOfWeight(scale: ChartScale, g: number): number {
  return round1(
    PLOT.height - (Math.min(Math.max(g, 0), scale.weightG) / scale.weightG) * PLOT.height,
  );
}

export function yOfFlow(gps: number): number {
  return round1(
    PLOT.height - (Math.min(Math.max(gps, 0), FLOW_AXIS_GPS) / FLOW_AXIS_GPS) * PLOT.height,
  );
}

/** A point of a shot's curve: s from the pump start, g in the cup, g/s. */
export interface ChartPoint {
  readonly tS: number;
  readonly g: number;
  readonly flowGps: number | null;
}

/**
 * The SVG path of the weight, or of the flow where it is known, through `points` in time order.
 * Points closer than `minStepS` to the one before are skipped, except the last.
 */
export function curvePath(
  scale: ChartScale,
  points: readonly ChartPoint[],
  key: 'g' | 'flowGps',
  minStepS = 0.2,
): string {
  const parts: string[] = [];
  let lastS = -Infinity;
  let pen: 'M' | 'L' = 'M';
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const value = point[key];
    if (value === null) {
      pen = 'M';
      continue;
    }
    if (point.tS - lastS < minStepS && i !== points.length - 1) continue;
    lastS = point.tS;
    const y = key === 'g' ? yOfWeight(scale, value) : yOfFlow(value);
    parts.push(`${pen}${xOf(scale, point.tS)} ${y}`);
    pen = 'L';
  }
  return parts.join('');
}

/** As a share of the plot's width or height, for labels laid over it: `"18.5%"`. */
export function share(value: number, of: number): string {
  return `${round1((value / of) * 100)}%`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
