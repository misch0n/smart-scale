// The history's large charts (boards History-Detail and History-Compare): weight and flow over
// time from a zero, the markers labelled above the plot, the weight on the right, the time
// below. The detail draws one shot with its target; the overlay draws A and B in their colours.

import { PLOT, share, yOfWeight, type ChartPoint, type ChartScale } from '../brew/chart';
import { tenths } from '../brew/format';
import { linePath, placeMarks, timeTicks, weightTicks, type ChartMark, type Zero } from './plot';

export interface ChartSeries {
  readonly points: readonly ChartPoint[];
  /** A's colour or B's; a single shot is A. */
  readonly line: 'a' | 'b';
}

export interface HistoryChartProps {
  readonly variant: 'detail' | 'overlay';
  readonly scale: ChartScale;
  readonly zero: Zero;
  /** Drawn in order: the last on top. */
  readonly series: readonly ChartSeries[];
  readonly marks: readonly ChartMark[];
  readonly targetG?: number | null;
  /** What the chart shows, for screen readers. */
  readonly label: string;
}

const STROKE = { vectorEffect: 'non-scaling-stroke', fill: 'none' } as const;

export function HistoryChart({
  variant,
  scale,
  zero,
  series,
  marks,
  targetG = null,
  label,
}: HistoryChartProps) {
  const overlay = variant === 'overlay';
  const targetY = targetG === null ? null : yOfWeight(scale, targetG);
  const inside = placeMarks(
    scale,
    marks.filter(
      (mark) => mark.tS >= (scale.fromS ?? 0) && mark.tS <= (scale.fromS ?? 0) + scale.timeS,
    ),
  );
  const labelRows = Math.max(1, ...inside.map((mark) => mark.row + 1));
  const colour = (line: 'a' | 'b') => (line === 'a' ? 'var(--line-a)' : 'var(--line-b)');
  // The target's label sits after the first mark past the zero: the first drip, on the detail.
  const labelX = inside.find((mark) => mark.tS > 0) ?? null;

  return (
    <div class="hchart">
      <div class="hchart-marks" style={{ height: `${labelRows * 16}px` }} aria-hidden="true">
        {inside.map((mark) => (
          <span
            key={mark.label}
            class={mark.right ? 'hchart-mark hchart-mark-right' : 'hchart-mark'}
            style={{
              left: share(mark.x, PLOT.width),
              top: `${mark.row * 16}px`,
              height: `${(labelRows - mark.row) * 16}px`,
            }}
          >
            {mark.label}
          </span>
        ))}
      </div>
      <div class="hchart-plot">
        <svg viewBox={`0 0 ${PLOT.width} ${PLOT.height}`} role="img" aria-label={label}>
          <path
            d="M0 125H1000M0 250H1000M0 375H1000"
            style={{ ...STROKE, stroke: 'var(--grid)', strokeWidth: 1 }}
          />
          <path d="M0 499H1000" style={{ ...STROKE, stroke: 'var(--rule)', strokeWidth: 1 }} />
          {inside.length > 0 && (
            <path
              d={inside.map((mark) => `M${mark.x} 0V500`).join('')}
              style={{
                ...STROKE,
                stroke: overlay ? 'var(--sub)' : 'var(--tick)',
                strokeWidth: 1,
                strokeDasharray: '3 3',
              }}
            />
          )}
          {targetY !== null && (
            <path
              d={`M0 ${targetY}H1000`}
              style={{ ...STROKE, stroke: 'var(--mark)', strokeWidth: 1, strokeDasharray: '5 3' }}
            />
          )}
          {series.map((s, i) => (
            <path
              key={`flow-${i}`}
              d={linePath(scale, s.points, 'flowGps')}
              style={{
                ...STROKE,
                stroke: overlay ? colour(s.line) : 'var(--sub)',
                strokeWidth: overlay ? 1.25 : 1.5,
                strokeDasharray: '4 3',
                strokeLinejoin: 'round',
              }}
            />
          ))}
          {series.map((s, i) => (
            <path
              key={`weight-${i}`}
              d={linePath(scale, s.points, 'g')}
              style={{
                ...STROKE,
                stroke: colour(s.line),
                strokeWidth: overlay ? 2 : 2.5,
                strokeLinejoin: 'round',
                strokeLinecap: 'round',
              }}
            />
          ))}
        </svg>
        {targetY !== null && targetG !== null && (
          <span
            class="hchart-target"
            style={{
              left: labelX === null ? '2%' : `calc(${share(labelX.x, PLOT.width)} + 4px)`,
              top: share(targetY, PLOT.height),
            }}
          >
            target {tenths(targetG)} g
          </span>
        )}
        {weightTicks(scale).map((tick) => (
          <span key={tick.label} class="hchart-y" style={{ top: tick.top }}>
            {tick.label}
          </span>
        ))}
      </div>
      <div class="hchart-x" aria-hidden="true">
        {timeTicks(scale, zero).map((tick) => (
          <span key={tick.label} class={`hchart-x-${tick.anchor}`} style={{ left: tick.left }}>
            {tick.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A legend entry: a short line in the series' style. */
export function LegendLine({ dashed, colour }: { dashed: boolean; colour: string }) {
  return (
    <svg viewBox="0 0 18 6" class="legend-line" aria-hidden="true">
      <path
        d="M0 3H18"
        style={{
          fill: 'none',
          stroke: colour,
          strokeWidth: dashed ? 1.5 : 2.5,
          strokeDasharray: dashed ? '3 2' : undefined,
        }}
      />
    </svg>
  );
}
