/**
 * A small SVG kit for the inspection charts (T1.15): scales with round ticks, paths that break
 * where a value is missing, and text made safe for XML. Strings in, strings out, so it runs in
 * Node and in tests without a DOM.
 */

/** A map from data values onto pixels, with the ticks to label. */
export interface Scale {
  /** The pixel for a value. A log scale puts values at or below `low` on `low`. */
  readonly at: (value: number) => number;
  /** The range shown, low to high. */
  readonly low: number;
  readonly high: number;
  readonly ticks: readonly number[];
  /** The tick step, or 0 on a log scale (a tick per decade). */
  readonly step: number;
  readonly log: boolean;
}

/** The round step, 1, 2 or 5 × 10ⁿ, that cuts `span` into about `count` parts. */
export function roundStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
}

/** `value` without the float noise that multiplying out a step leaves (0.30000000000000004). */
function clean(value: number): number {
  return Number(value.toPrecision(12));
}

export interface LinearScaleOptions {
  /** About how many ticks. Default 5. */
  readonly count?: number;
  /** Widen the range out to the ticks around it. Default false. */
  readonly round?: boolean;
}

/**
 * A linear scale of `[low, high]` onto the pixels `[from, to]`; `to` may be the smaller (a y
 * axis grows upwards). An empty or invalid range is widened around its value.
 */
export function linearScale(
  low: number,
  high: number,
  from: number,
  to: number,
  options: LinearScaleOptions = {},
): Scale {
  let lo = Number.isFinite(low) ? low : 0;
  let hi = Number.isFinite(high) ? high : lo + 1;
  if (!(hi > lo)) {
    const pad = Math.max(0.5, Math.abs(lo) * 0.05);
    lo -= pad;
    hi += pad;
  }
  const step = roundStep(hi - lo, options.count ?? 5);
  if (options.round) {
    lo = clean(Math.floor(lo / step + 1e-9) * step);
    hi = clean(Math.ceil(hi / step - 1e-9) * step);
  }
  const ticks: number[] = [];
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + step * 1e-9; k++) {
    ticks.push(clean(k * step));
  }
  const span = hi - lo;
  return {
    at: (value) => from + ((value - lo) / span) * (to - from),
    low: lo,
    high: hi,
    ticks,
    step,
    log: false,
  };
}

/**
 * A log scale of `[low, high]` (both above 0) onto the pixels `[from, to]`, widened to whole
 * decades, with a tick on each.
 */
export function logScale(low: number, high: number, from: number, to: number): Scale {
  const lo = Math.floor(Math.log10(low > 0 && Number.isFinite(low) ? low : 1e-6));
  let hi = Math.ceil(Math.log10(high > 0 && Number.isFinite(high) ? high : 1));
  if (hi <= lo) hi = lo + 1;
  const ticks: number[] = [];
  for (let k = lo; k <= hi; k++) ticks.push(clean(10 ** k));
  return {
    at: (value) => {
      if (Number.isNaN(value)) return Number.NaN;
      const decade = value > 0 ? Math.max(Math.log10(value), lo) : lo;
      return from + ((decade - lo) / (hi - lo)) * (to - from);
    },
    low: 10 ** lo,
    high: 10 ** hi,
    ticks,
    step: 0,
    log: true,
  };
}

/** A tick's label: as many decimals as the step needs; a log tick like `0.01` or `1e-4`. */
export function tickLabel(value: number, scale: Scale): string {
  if (scale.log) return value >= 0.01 ? String(clean(value)) : value.toExponential(0);
  const decimals = Math.max(0, -Math.floor(Math.log10(scale.step) + 1e-9));
  return value.toFixed(decimals);
}

/** A coordinate, to a tenth of a pixel. */
export function px(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/**
 * The `d` of a path through the points, broken where a value or its pixel is missing (NaN or
 * infinite): a gap in the data shows as a gap in the line.
 */
export function pathData(xs: readonly number[], ys: readonly number[], x: Scale, y: Scale): string {
  const parts: string[] = [];
  let pen = false;
  for (let i = 0; i < xs.length; i++) {
    const px0 = x.at(xs[i]);
    const py0 = y.at(ys[i]);
    if (!Number.isFinite(px0) || !Number.isFinite(py0)) {
      pen = false;
      continue;
    }
    parts.push(`${pen ? 'L' : 'M'}${px(px0)} ${px(py0)}`);
    pen = true;
  }
  return parts.join('');
}

/**
 * The `d` of a path that draws a dot at each point: a zero-length segment, which round caps turn
 * into a dot as wide as the stroke. One path for every dot keeps a chart small.
 */
export function dotsData(xs: readonly number[], ys: readonly number[], x: Scale, y: Scale): string {
  const parts: string[] = [];
  for (let i = 0; i < xs.length; i++) {
    const px0 = x.at(xs[i]);
    const py0 = y.at(ys[i]);
    if (Number.isFinite(px0) && Number.isFinite(py0)) parts.push(`M${px(px0)} ${px(py0)}h0`);
  }
  return parts.join('');
}

const XML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/** Text made safe for an XML element or attribute. */
export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

/**
 * About how wide `text` sets in the charts' sans-serif at `fontPx`, px: generous, since the
 * fallback font (DejaVu Sans in headless Chromium) sets wide.
 */
export function textWidth(text: string, fontPx: number): number {
  return text.length * fontPx * 0.62;
}
