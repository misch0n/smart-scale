/**
 * The inspection charts' renderer (T1.15): panels stacked on one time axis, vertical marks
 * across them all (markers and app events), and a legend. A `ChartSpec` says what to draw;
 * `renderChart` lays it out as an SVG document. `charts.ts` builds the specs from an analysis.
 *
 * Each panel has its own y axis: there is never a second scale on one panel. Marks carry their
 * labels in ink beside the line, so no identity rests on colour alone, and every mark and glyph
 * has a `<title>` that a browser shows on hover. The colours are the dataviz skill's reference
 * palette, checked with its validator (D-051).
 */

import {
  dotsData,
  escapeXml,
  linearScale,
  logScale,
  pathData,
  px,
  textWidth,
  tickLabel,
  type Scale,
} from './svg';

/** Ink and chrome. */
export const INK = {
  surface: '#fcfcfb',
  primary: '#0b0b0b',
  secondary: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  band: '#f0efec',
} as const;

/** Series colours in a panel, in their fixed order: blue, orange, aqua. */
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a'] as const;

/**
 * The five markers' colours. In time order (green, violet, red, yellow, magenta) every
 * neighbouring pair passes the validator's colour-blind separation.
 */
export const MARKER_COLORS = {
  pumpOn: '#008300',
  firstDrip: '#4a3aa7',
  pumpOff: '#e34948',
  settled: '#eda100',
  cupRemoved: '#e87ba4',
} as const;

/** The shot windows' shading on an overview. */
export const WINDOW_FILL = '#cde2fb';

export type SeriesStyle = 'line' | 'thin' | 'dashed' | 'dots';

export interface Series {
  /** For the `<title>`; the legend is given separately. */
  readonly label: string;
  /** Times, s, and values in the panel's unit; NaN is a gap. */
  readonly t: readonly number[];
  readonly values: readonly number[];
  readonly color: string;
  readonly style: SeriesStyle;
}

/** A horizontal line: a reference level. */
export interface Level {
  readonly value: number;
  /** Written in the right margin, or null. */
  readonly label: string | null;
  readonly color: string;
  readonly dashed: boolean;
  /** Its time span, s; default the whole chart. */
  readonly fromT?: number;
  readonly toT?: number;
}

/** A shaded time span in one panel. */
export interface Band {
  readonly fromT: number;
  readonly toT: number;
  /** Written at the band's bottom left, or null. */
  readonly label: string | null;
  readonly fill: string;
}

export type GlyphShape = 'up' | 'down' | 'diamond' | 'dot';

/** A point drawn as a small shape. */
export interface Glyph {
  readonly t: number;
  readonly value: number;
  readonly shape: GlyphShape;
  readonly color: string;
  readonly title: string;
}

export interface Panel {
  /** The y axis's title, with its unit: `liquid, g`. */
  readonly title: string;
  /** The panel's series and levels, named on its title line. */
  readonly legend: readonly LegendEntry[];
  /** The plot's height, px. */
  readonly height: number;
  /** The y range shown. A log panel needs both above 0. */
  readonly range: readonly [number, number];
  readonly log: boolean;
  readonly series: readonly Series[];
  readonly levels: readonly Level[];
  readonly bands: readonly Band[];
  readonly glyphs: readonly Glyph[];
}

export type MarkStyle = 'solid' | 'dashed' | 'dotted';

/** A vertical line across every panel: a marker or an app event. */
export interface Mark {
  readonly t: number;
  /** Written above the panels, or null for an unlabelled line. */
  readonly label: string | null;
  readonly color: string;
  readonly style: MarkStyle;
  /** Shown on hover. */
  readonly title: string;
}

export type Swatch = SeriesStyle | MarkStyle | 'band' | GlyphShape;

export interface LegendEntry {
  readonly label: string;
  readonly color: string;
  readonly swatch: Swatch;
}

export interface ChartSpec {
  readonly title: string;
  /** Lines under the title. */
  readonly notes: readonly string[];
  /** The time span shown, s on the recording's timeline. */
  readonly span: readonly [number, number];
  readonly panels: readonly Panel[];
  readonly marks: readonly Mark[];
  readonly legend: readonly LegendEntry[];
}

const WIDTH = 1200;
const LEFT = 72;
const RIGHT = 150;
const PLOT_WIDTH = WIDTH - LEFT - RIGHT;
const FONT = 11;
const NOTE_FONT = 12;
const TITLE_FONT = 15;
const LINE = 16;
const LABEL_ROW = 14;
const MAX_LABEL_ROWS = 8;
const PANEL_TITLE = 18;
const PANEL_GAP = 12;
const AXIS_BELOW = 34;
const LEGEND_ROW = 18;
const SWATCH = 22;

/** An SVG document for `spec`. */
export function renderChart(spec: ChartSpec): string {
  const [fromT, toT] = spec.span;
  const x = linearScale(fromT, toT, LEFT, LEFT + PLOT_WIDTH, { count: 12 });
  const out: string[] = [];

  let y = 10 + TITLE_FONT;
  out.push(`<text x="${LEFT}" y="${y}" class="title">${escapeXml(spec.title)}</text>`);
  for (const note of spec.notes) {
    y += LINE;
    out.push(`<text x="${LEFT}" y="${y}" class="note">${escapeXml(note)}</text>`);
  }
  y += 8;

  const visible = spec.marks.filter((mark) => mark.t >= x.low && mark.t <= x.high);
  const rows = placeLabels(visible, x);
  const rowCount = Math.max(0, ...rows.map((row) => row + 1));
  const labelTop = y;
  y += rowCount * LABEL_ROW + 4;

  const panelTops: number[] = [];
  for (const panel of spec.panels) {
    y += PANEL_TITLE;
    panelTops.push(y);
    y += panel.height + PANEL_GAP;
  }
  const plotBottom = y - PANEL_GAP;

  // The grids, then the marks across them, then the data over both.
  const ys = spec.panels.map((panel, index) => panelScale(panel, panelTops[index]));
  spec.panels.forEach((panel, index) => {
    out.push(...panelBack(panel, index, panelTops[index], x, ys[index]));
  });
  visible.forEach((mark, i) => {
    const mx = x.at(mark.t);
    const row = rows[i];
    const top = row >= 0 ? labelTop + row * LABEL_ROW + LABEL_ROW - 2 : (panelTops[0] ?? labelTop);
    out.push(
      `<line x1="${px(mx)}" y1="${px(top)}" x2="${px(mx)}" y2="${px(plotBottom)}" ` +
        `stroke="${mark.color}" stroke-width="1.5"${dashArray(mark.style)}>` +
        `<title>${escapeXml(mark.title)}</title></line>`,
    );
  });
  spec.panels.forEach((panel, index) => {
    out.push(...panelFront(panel, index, panelTops[index], x, ys[index]));
  });

  // Mark labels over the panels' frames.
  visible.forEach((mark, i) => {
    if (mark.label === null || rows[i] < 0) return;
    const mx = x.at(mark.t);
    const ly = labelTop + rows[i] * LABEL_ROW + LABEL_ROW - 4;
    const right = mx + 3 + textWidth(mark.label, FONT) > WIDTH - 4;
    out.push(
      `<text x="${px(right ? mx - 3 : mx + 3)}" y="${px(ly)}" class="mark"` +
        `${right ? ' text-anchor="end"' : ''}>${escapeXml(mark.label)}</text>`,
    );
  });

  // The time axis under the last panel.
  for (const tick of x.ticks) {
    out.push(
      `<text x="${px(x.at(tick))}" y="${px(plotBottom + 14)}" class="tick" ` +
        `text-anchor="middle">${tickLabel(tick, x)}</text>`,
    );
  }
  out.push(
    `<text x="${LEFT + PLOT_WIDTH / 2}" y="${px(plotBottom + 30)}" class="note" ` +
      `text-anchor="middle">time, s (the recording's timeline)</text>`,
  );

  y = plotBottom + AXIS_BELOW + 10;
  const legend = renderLegend(spec.legend, y);
  out.push(...legend.lines);
  const height = Math.ceil(legend.bottom + 10);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" ` +
      `viewBox="0 0 ${WIDTH} ${height}" font-family="system-ui, -apple-system, 'Segoe UI', ` +
      `sans-serif" font-size="${FONT}">`,
    `<title>${escapeXml(spec.title)}</title>`,
    // A halo in the surface's colour keeps text readable where a mark's line crosses it.
    '<style>' +
      `.title{font-size:${TITLE_FONT}px;font-weight:600;fill:${INK.primary}}` +
      `.note{font-size:${NOTE_FONT}px;fill:${INK.secondary}}` +
      `.panel{font-size:${NOTE_FONT}px;font-weight:600;fill:${INK.secondary}}` +
      `.tick{fill:${INK.muted};font-variant-numeric:tabular-nums}` +
      `.mark{fill:${INK.primary}}` +
      `.level{fill:${INK.secondary}}` +
      `.note,.panel,.mark,.level{paint-order:stroke;stroke:${INK.surface};stroke-width:3px;` +
      'stroke-linejoin:round}' +
      '</style>',
    `<rect width="${WIDTH}" height="${height}" fill="${INK.surface}"/>`,
    ...out,
    '</svg>',
    '',
  ].join('\n');
}

/** Each visible mark's label row, or −1 when it has none. */
function placeLabels(marks: readonly Mark[], x: Scale): number[] {
  const rowEnds: number[] = [];
  const order = marks.map((_, i) => i).sort((a, b) => marks[a].t - marks[b].t);
  const rows = marks.map(() => -1);
  for (const i of order) {
    const label = marks[i].label;
    if (label === null) continue;
    const mx = x.at(marks[i].t);
    const width = textWidth(label, FONT) + 6;
    const right = mx + 3 + width > WIDTH - 4;
    const left = right ? mx - 3 - width : mx;
    const end = right ? mx : mx + 3 + width;
    let row = rowEnds.findIndex((rowEnd) => rowEnd < left);
    if (row < 0 && rowEnds.length < MAX_LABEL_ROWS) row = rowEnds.length;
    // Every row taken: the one that frees up soonest, overlapping.
    if (row < 0) row = rowEnds.indexOf(Math.min(...rowEnds));
    rowEnds[row] = Math.max(rowEnds[row] ?? -Infinity, end);
    rows[i] = row;
  }
  return rows;
}

function dashArray(style: MarkStyle | SeriesStyle): string {
  if (style === 'dashed') return ' stroke-dasharray="6 4"';
  if (style === 'dotted') return ' stroke-dasharray="2 3"';
  return '';
}

/** A panel's y scale: its range onto its plot, upwards. */
function panelScale(panel: Panel, top: number): Scale {
  const bottom = top + panel.height;
  const [low, high] = panel.range;
  return panel.log
    ? logScale(low, high, bottom, top)
    : linearScale(low, high, bottom, top, { count: Math.max(2, Math.round(panel.height / 40)) });
}

/** A panel's clip path and grid, under the marks. */
function panelBack(panel: Panel, index: number, top: number, x: Scale, y: Scale): string[] {
  const bottom = top + panel.height;
  const right = LEFT + PLOT_WIDTH;
  const out: string[] = [
    `<clipPath id="plot-${index}"><rect x="${LEFT}" y="${px(top)}" width="${PLOT_WIDTH}" ` +
      `height="${panel.height}"/></clipPath>`,
  ];
  for (const tick of x.ticks) {
    const tx = px(x.at(tick));
    out.push(
      `<line x1="${tx}" y1="${px(top)}" x2="${tx}" y2="${px(bottom)}" stroke="${INK.grid}"/>`,
    );
  }
  for (const tick of y.ticks) {
    const ty = y.at(tick);
    if (ty < top - 0.5 || ty > bottom + 0.5) continue;
    out.push(
      `<line x1="${LEFT}" y1="${px(ty)}" x2="${right}" y2="${px(ty)}" stroke="${INK.grid}"/>`,
      `<text x="${LEFT - 6}" y="${px(ty + 4)}" class="tick" text-anchor="end">` +
        `${tickLabel(tick, y)}</text>`,
    );
  }
  return out;
}

/**
 * A panel's bands, levels, series and glyphs, clipped to its plot, then its frame, and its title
 * and legend over the marks.
 */
function panelFront(panel: Panel, index: number, top: number, x: Scale, y: Scale): string[] {
  const bottom = top + panel.height;
  const right = LEFT + PLOT_WIDTH;
  const out: string[] = [];
  const data: string[] = [];
  for (const band of panel.bands) {
    const from = Math.max(LEFT, x.at(band.fromT));
    const to = Math.min(right, x.at(band.toT));
    if (!(to > from)) continue;
    data.push(
      `<rect x="${px(from)}" y="${px(top)}" width="${px(to - from)}" height="${panel.height}" ` +
        `fill="${band.fill}" fill-opacity="0.6"/>`,
    );
    if (band.label !== null) {
      data.push(
        `<text x="${px(from + 3)}" y="${px(bottom - 5)}" class="level">` +
          `${escapeXml(band.label)}</text>`,
      );
    }
  }
  for (const level of panel.levels) {
    const ly = y.at(level.value);
    if (!Number.isFinite(ly)) continue;
    const from = Math.max(LEFT, x.at(level.fromT ?? x.low));
    const to = Math.min(right, x.at(level.toT ?? x.high));
    if (!(to > from)) continue;
    data.push(
      `<line x1="${px(from)}" y1="${px(ly)}" x2="${px(to)}" y2="${px(ly)}" ` +
        `stroke="${level.color}" stroke-width="1.5"${level.dashed ? ' stroke-dasharray="6 4"' : ''}/>`,
    );
  }
  for (const series of panel.series) {
    if (series.style === 'dots') {
      const d = dotsData(series.t, series.values, x, y);
      if (d) {
        data.push(
          `<path d="${d}" stroke="${series.color}" stroke-width="3" stroke-linecap="round">` +
            `<title>${escapeXml(series.label)}</title></path>`,
        );
      }
      continue;
    }
    const d = pathData(series.t, series.values, x, y);
    if (!d) continue;
    const width = series.style === 'thin' ? 1 : 2;
    data.push(
      `<path d="${d}" fill="none" stroke="${series.color}" stroke-width="${width}" ` +
        `stroke-linejoin="round"${dashArray(series.style)}><title>${escapeXml(series.label)}` +
        '</title></path>',
    );
  }
  for (const glyph of panel.glyphs) {
    const gx = x.at(glyph.t);
    const gy = y.at(glyph.value);
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;
    data.push(
      `<path d="${glyphPath(glyph.shape, gx, Math.min(bottom - 4, Math.max(top + 4, gy)))}" ` +
        `fill="${glyph.color}" stroke="${INK.surface}" stroke-width="1">` +
        `<title>${escapeXml(glyph.title)}</title></path>`,
    );
  }
  out.push(`<g clip-path="url(#plot-${index})">`, ...data, '</g>');
  out.push(
    `<rect x="${LEFT}" y="${px(top)}" width="${PLOT_WIDTH}" height="${panel.height}" ` +
      `fill="none" stroke="${INK.axis}"/>`,
  );
  out.push(...levelLabels(panel.levels, y, top, bottom));
  out.push(
    `<text x="${LEFT}" y="${px(top - 6)}" class="panel">${escapeXml(panel.title)}</text>`,
    ...legendLine(panel.legend, LEFT + textWidth(panel.title, NOTE_FONT) + 24, top - 10),
  );
  return out;
}

/** The levels' labels in the right margin, pushed apart where they would overlap. */
function levelLabels(levels: readonly Level[], y: Scale, top: number, bottom: number): string[] {
  const labelled = levels
    .filter((level) => level.label !== null && Number.isFinite(y.at(level.value)))
    .map((level) => ({ text: level.label!, at: y.at(level.value) }))
    .filter((label) => label.at >= top - 1 && label.at <= bottom + 1)
    .sort((a, b) => a.at - b.at);
  const out: string[] = [];
  let last = -Infinity;
  for (const label of labelled) {
    const at = Math.max(label.at + 4, last + 12);
    last = at;
    out.push(
      `<text x="${LEFT + PLOT_WIDTH + 6}" y="${px(at)}" class="level">` +
        `${escapeXml(label.text)}</text>`,
    );
  }
  return out;
}

function glyphPath(shape: GlyphShape, x: number, y: number): string {
  switch (shape) {
    case 'up':
      return `M${px(x)} ${px(y - 6)}L${px(x + 5)} ${px(y + 3)}L${px(x - 5)} ${px(y + 3)}Z`;
    case 'down':
      return `M${px(x)} ${px(y + 6)}L${px(x + 5)} ${px(y - 3)}L${px(x - 5)} ${px(y - 3)}Z`;
    case 'diamond':
      return `M${px(x)} ${px(y - 5)}L${px(x + 5)} ${px(y)}L${px(x)} ${px(y + 5)}L${px(x - 5)} ${px(y)}Z`;
    case 'dot':
      return `M${px(x - 4)} ${px(y)}a4 4 0 1 0 8 0a4 4 0 1 0 -8 0Z`;
  }
}

/** Legend entries on one line from `x`, centred on `y`. */
function legendLine(entries: readonly LegendEntry[], x: number, y: number): string[] {
  const lines: string[] = [];
  let lx = x;
  for (const entry of entries) {
    lines.push(...swatch(entry, lx, y));
    lines.push(
      `<text x="${px(lx + SWATCH + 6)}" y="${px(y + 4)}" class="note">` +
        `${escapeXml(entry.label)}</text>`,
    );
    lx += SWATCH + 6 + textWidth(entry.label, NOTE_FONT) + 18;
  }
  return lines;
}

function renderLegend(
  entries: readonly LegendEntry[],
  top: number,
): { lines: string[]; bottom: number } {
  const lines: string[] = [];
  let lx = LEFT;
  let ly = top;
  for (const entry of entries) {
    const width = SWATCH + 6 + textWidth(entry.label, NOTE_FONT) + 18;
    if (lx + width > WIDTH - 10 && lx > LEFT) {
      lx = LEFT;
      ly += LEGEND_ROW;
    }
    lines.push(...swatch(entry, lx, ly));
    lines.push(
      `<text x="${px(lx + SWATCH + 6)}" y="${px(ly + 4)}" class="note">` +
        `${escapeXml(entry.label)}</text>`,
    );
    lx += width;
  }
  return { lines, bottom: entries.length > 0 ? ly + LEGEND_ROW / 2 : top };
}

function swatch(entry: LegendEntry, x: number, y: number): string[] {
  const { color } = entry;
  switch (entry.swatch) {
    case 'band':
      return [
        `<rect x="${px(x)}" y="${px(y - 6)}" width="${SWATCH}" height="10" fill="${color}" ` +
          `fill-opacity="0.6" stroke="${INK.axis}"/>`,
      ];
    case 'dots':
      return [
        `<path d="M${px(x + 4)} ${px(y)}h0M${px(x + 11)} ${px(y)}h0M${px(x + 18)} ${px(y)}h0" ` +
          `stroke="${color}" stroke-width="3" stroke-linecap="round"/>`,
      ];
    case 'up':
    case 'down':
    case 'diamond':
    case 'dot':
      return [`<path d="${glyphPath(entry.swatch, x + SWATCH / 2, y)}" fill="${color}"/>`];
    default: {
      const width = entry.swatch === 'thin' ? 1 : 2;
      return [
        `<line x1="${px(x)}" y1="${px(y)}" x2="${px(x + SWATCH)}" y2="${px(y)}" ` +
          `stroke="${color}" stroke-width="${width}"${dashArray(entry.swatch)}/>`,
      ];
    }
  }
}
