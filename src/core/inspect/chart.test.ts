import { describe, expect, it } from 'vitest';
import { INK, MARKER_COLORS, renderChart, type ChartSpec, type Mark, type Panel } from './chart';
import { wellFormed } from './test-svg';

const panel = (overrides: Partial<Panel> = {}): Panel => ({
  title: 'liquid, g',
  legend: [{ label: 'smoothed', color: '#2a78d6', swatch: 'line' }],
  height: 200,
  range: [0, 40],
  log: false,
  series: [
    {
      label: 'smoothed liquid',
      t: [0, 10, 20, 30],
      values: [0, 10, Number.NaN, 30],
      color: '#2a78d6',
      style: 'line',
    },
  ],
  levels: [{ value: 35, label: 'yield 35.0 g', color: MARKER_COLORS.settled, dashed: true }],
  bands: [{ fromT: 2, toT: 4, label: 'baseline', fill: INK.band }],
  glyphs: [{ t: 5, value: 1, shape: 'diamond', color: INK.secondary, title: 'tare' }],
  ...overrides,
});

const mark = (t: number, label: string | null): Mark => ({
  t,
  label,
  color: MARKER_COLORS.pumpOff,
  style: 'solid',
  title: `${label ?? 'mark'} at ${t}`,
});

const spec = (overrides: Partial<ChartSpec> = {}): ChartSpec => ({
  title: 'a <test> & "chart"',
  notes: ['flags: none'],
  span: [0, 30],
  panels: [panel(), panel({ title: 'variance, g²', log: true, range: [1e-5, 1] })],
  marks: [mark(10, 'pump_off 10.00'), mark(10.2, 'settled 10.20'), mark(50, 'outside')],
  legend: [{ label: 'pump_off', color: MARKER_COLORS.pumpOff, swatch: 'solid' }],
  ...overrides,
});

describe('renderChart', () => {
  it('writes a well-formed SVG document with its text escaped', () => {
    const svg = renderChart(spec());
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.endsWith('</svg>\n')).toBe(true);
    expect(wellFormed(svg)).toBe(true);
    expect(svg).toContain('a &lt;test&gt; &amp; &quot;chart&quot;');
    expect(svg).not.toContain('<test>');
  });

  it('draws a clipped plot per panel, with the series broken at a gap', () => {
    const svg = renderChart(spec());
    expect(svg.match(/<clipPath id="plot-\d+">/g)).toHaveLength(2);
    expect(svg).toContain('clip-path="url(#plot-1)"');
    // One path for the smoothed liquid in each panel, broken once at the NaN.
    const paths = [...svg.matchAll(/<path d="(M[^"]*)" fill="none"/g)].map((m) => m[1]);
    expect(paths).toHaveLength(2);
    for (const d of paths) expect(d.match(/M/g)).toHaveLength(2);
  });

  it('labels the marks in the span, in rows where they would overlap', () => {
    const svg = renderChart(spec());
    expect(svg).toContain('pump_off 10.00');
    expect(svg).toContain('settled 10.20');
    expect(svg).not.toContain('>outside<');
    const rows = [...svg.matchAll(/<text x="[\d.]+" y="([\d.]+)" class="mark"/g)].map((m) =>
      Number(m[1]),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).not.toBe(rows[1]);
  });

  it('keeps marks far apart on one row', () => {
    const svg = renderChart(spec({ marks: [mark(1, 'a'), mark(25, 'b')] }));
    const rows = [...svg.matchAll(/<text x="[\d.]+" y="([\d.]+)" class="mark"/g)].map((m) =>
      Number(m[1]),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toBe(rows[1]);
  });

  it('gives every mark and glyph a title to show on hover', () => {
    const svg = renderChart(spec({ marks: [mark(12, null)] }));
    expect(svg).toContain('<title>mark at 12</title>');
    expect(svg).toContain('<title>tare</title>');
    expect(svg).not.toContain('class="mark"');
  });

  it('labels the levels in the right margin, and the log panel by decades', () => {
    const svg = renderChart(spec());
    // The second panel's range ends at 1, so its level at 35 is off the plot, unlabelled.
    expect(svg.match(/>yield 35.0 g</g)).toHaveLength(1);
    for (const tick of ['1e-5', '1e-4', '1e-3', '0.01', '0.1', '1']) {
      expect(svg).toContain(`text-anchor="end">${tick}</text>`);
    }
  });

  it('grows with the panels', () => {
    const one = renderChart(spec({ panels: [panel()] }));
    const two = renderChart(spec());
    const height = (svg: string) => Number(/height="(\d+)" viewBox/.exec(svg)?.[1]);
    expect(height(two)).toBeGreaterThan(height(one) + 200);
  });
});
