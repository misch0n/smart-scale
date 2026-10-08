/**
 * The history's trend (T3.3, D-085; no board draws it, Q29): one of a shot's figures against
 * another, over the filtered shots, each a dot in its taste's colour, with a straight line fitted
 * through them; for example the first drip against the grind setting since the grinder's last
 * care. The figures come from the analysis's cache and the snapshot, never from raw. Pure: the
 * points, the fit and the chart's geometry.
 */

import type { ShotMetrics } from '../../core/analysis';
import {
  dateOfDay,
  dayNumber,
  localDate,
  type Direction,
  type GrindSettingKind,
  type Id,
  type Shot,
} from '../../core/model';
import { dateLabel, settingLabel, todayDate } from '../setup/format';
import { shotDaysOffRoast, localOffset, type OffsetOf } from './filters';

/** What the trend reads of an entry: `HistoryEntry` has it. */
export interface TrendEntry {
  readonly shot: Shot;
  readonly atEpochMs: number;
  readonly segment: {
    readonly metrics: Pick<ShotMetrics, 'firstDripS' | 'totalS' | 'yieldG'>;
  } | null;
  readonly match: { readonly ratio: number | null };
}

/** The figures the trend can draw up. */
export const TREND_Y = ['firstDrip', 'total', 'ratio', 'yield'] as const;
export type TrendY = (typeof TREND_Y)[number];

/** And across. */
export const TREND_X = ['grind', 'roast', 'date'] as const;
export type TrendX = (typeof TREND_X)[number];

export const TREND_Y_LABEL: Readonly<Record<TrendY, string>> = {
  firstDrip: 'Preinfusion',
  total: 'Time',
  ratio: 'Ratio',
  yield: 'Yield',
};

export const TREND_X_LABEL: Readonly<Record<TrendX, string>> = {
  grind: 'Grind',
  roast: 'Days off roast',
  date: 'Date',
};

export interface TrendPoint {
  readonly shotId: Id;
  readonly x: number;
  readonly y: number;
  readonly taste: Direction | null;
}

/** y = slope · x + intercept, least squares. */
export interface TrendFit {
  readonly slope: number;
  readonly intercept: number;
}

export interface Trend {
  readonly x: TrendX;
  readonly y: TrendY;
  /** In the entries' order. */
  readonly points: readonly TrendPoint[];
  /** Null with fewer than three points, or all at one x. */
  readonly fit: TrendFit | null;
}

/** A fit needs this many points. */
export const MIN_FIT_POINTS = 3;

function yOf(entry: TrendEntry, y: TrendY): number | null {
  const metrics = entry.segment?.metrics ?? null;
  switch (y) {
    case 'firstDrip':
      return metrics?.firstDripS ?? null;
    case 'total':
      return metrics?.totalS ?? null;
    case 'ratio':
      return entry.match.ratio;
    case 'yield':
      return metrics?.yieldG ?? null;
  }
}

function xOf(entry: TrendEntry, x: TrendX, offsetOf: OffsetOf): number | null {
  switch (x) {
    case 'grind':
      return entry.shot.grindSetting?.value ?? null;
    case 'roast':
      return shotDaysOffRoast(entry, offsetOf);
    case 'date':
      // The local day's number: shots of a day share it.
      return dayNumber(localDate(entry.atEpochMs, offsetOf(entry.atEpochMs)));
  }
}

/**
 * The grinder every entry with a grind setting used; null when they used several, or none. Grind
 * settings of different grinders don't share an axis.
 */
export function singleGrinder(entries: readonly TrendEntry[]): Id | null {
  const ids = new Set(
    entries.filter((e) => e.shot.grindSetting !== null).map((e) => e.shot.grinderId),
  );
  if (ids.size !== 1) return null;
  const [id] = ids;
  return id;
}

/** The trend of `y` across `x` over `entries`: every shot that has both. */
export function trend(
  entries: readonly TrendEntry[],
  x: TrendX,
  y: TrendY,
  offsetOf: OffsetOf = localOffset,
): Trend {
  const points = entries.flatMap((entry) => {
    const px = xOf(entry, x, offsetOf);
    const py = yOf(entry, y);
    return px === null || py === null
      ? []
      : [{ shotId: entry.shot.id, x: px, y: py, taste: entry.shot.direction }];
  });
  return { x, y, points, fit: leastSquares(points) };
}

function leastSquares(points: readonly TrendPoint[]): TrendFit | null {
  if (points.length < MIN_FIT_POINTS) return null;
  const n = points.length;
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.x - meanX) ** 2;
    sxy += (p.x - meanX) * (p.y - meanY);
  }
  if (sxx < 1e-12) return null;
  const slope = sxy / sxx;
  return { slope, intercept: meanY - slope * meanX };
}

/** The chart's box, in its SVG's units: the plot inside the margins for the ticks. */
export const TREND_BOX = { width: 340, height: 200, left: 40, right: 12, top: 12, bottom: 28 };

export interface TrendTick {
  readonly at: number;
  readonly label: string;
}

/** The trend placed on the chart. */
export interface TrendChart {
  readonly dots: readonly {
    readonly cx: number;
    readonly cy: number;
    readonly taste: Direction | null;
    readonly shotId: Id;
  }[];
  /** The fitted line across the plot; null without a fit. */
  readonly line: {
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
  } | null;
  readonly xTicks: readonly TrendTick[];
  readonly yTicks: readonly TrendTick[];
}

/** An axis around `values`, padded so no dot sits on the edge; a lone value gets room both ways. */
function axis(values: readonly number[], pad: number): { min: number; max: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  if (span < 1e-9) return { min: min - pad, max: max + pad };
  return { min: min - span * 0.08, max: max + span * 0.08 };
}

/**
 * The trend's geometry: each dot, the fitted line within the plot, and the ticks at both ends
 * of each axis, labelled by `format`. Null without a point.
 */
export function trendChart(
  t: Trend,
  formatX: (value: number) => string,
  formatY: (value: number) => string,
): TrendChart | null {
  if (t.points.length === 0) return null;
  const { width, height, left, right, top, bottom } = TREND_BOX;
  const xs = axis(
    t.points.map((p) => p.x),
    1,
  );
  const ys = axis(
    t.points.map((p) => p.y),
    t.y === 'ratio' ? 0.1 : 1,
  );
  const px = (x: number) => left + ((x - xs.min) / (xs.max - xs.min)) * (width - left - right);
  const py = (y: number) => top + (1 - (y - ys.min) / (ys.max - ys.min)) * (height - top - bottom);
  const minX = Math.min(...t.points.map((p) => p.x));
  const maxX = Math.max(...t.points.map((p) => p.x));
  const minY = Math.min(...t.points.map((p) => p.y));
  const maxY = Math.max(...t.points.map((p) => p.y));
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    dots: t.points.map((p) => ({
      cx: round(px(p.x)),
      cy: round(py(p.y)),
      taste: p.taste,
      shotId: p.shotId,
    })),
    line:
      t.fit === null
        ? null
        : {
            x1: round(px(minX)),
            y1: round(py(t.fit.slope * minX + t.fit.intercept)),
            x2: round(px(maxX)),
            y2: round(py(t.fit.slope * maxX + t.fit.intercept)),
          },
    xTicks: uniqueTicks([
      { at: round(px(minX)), label: formatX(minX) },
      { at: round(px(maxX)), label: formatX(maxX) },
    ]),
    yTicks: uniqueTicks([
      { at: round(py(maxY)), label: formatY(maxY) },
      { at: round(py(minY)), label: formatY(minY) },
    ]),
  };
}

function uniqueTicks(ticks: readonly TrendTick[]): TrendTick[] {
  return ticks.filter((tick, i) => ticks.findIndex((t) => t.label === tick.label) === i);
}

/** An x value as its axis writes it: `6.2`, `22`, `12 d`, `4 Oct`. */
export function xText(x: TrendX, value: number, kind: GrindSettingKind): string {
  switch (x) {
    case 'grind':
      return settingLabel(kind, value);
    case 'roast':
      return `${Math.round(value)} d`;
    case 'date':
      return dateLabel(dateOfDay(Math.round(value)), todayDate());
  }
}

/** A y value: `8.0 s`, `1:2.1`, `36.0 g`. */
export function yText(y: TrendY, value: number): string {
  switch (y) {
    case 'firstDrip':
    case 'total':
      return `${value.toFixed(1)} s`;
    case 'ratio':
      return `1:${value.toFixed(1)}`;
    case 'yield':
      return `${value.toFixed(1)} g`;
  }
}

/**
 * What the line says per step across: `First drip −1.0 s per 0.1 of grind`, `Ratio +0.05 per
 * day off roast`. Null without a fit.
 */
export function slopeText(t: Trend, kind: GrindSettingKind): string | null {
  if (t.fit === null) return null;
  const step = t.x === 'grind' && kind === 'stepless' ? 0.1 : 1;
  const value = t.fit.slope * step;
  const unit = t.y === 'ratio' ? '' : t.y === 'yield' ? ' g' : ' s';
  const digits = t.y === 'ratio' ? 2 : 1;
  const per =
    t.x === 'grind'
      ? kind === 'clicks'
        ? 'per click'
        : 'per 0.1 of grind'
      : t.x === 'roast'
        ? 'per day off roast'
        : 'per day';
  // The sign of what shows: a slope that rounds to nothing is ±0.
  const shown = Math.abs(value).toFixed(digits);
  const sign = Number(shown) === 0 ? '±' : value > 0 ? '+' : '−';
  return `${TREND_Y_LABEL[t.y]} ${sign}${shown}${unit} ${per}, fitted over ${t.points.length} shots`;
}
