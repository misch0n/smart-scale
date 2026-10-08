// The history's large chart (board History-Detail): weight and flow over time from a zero, the
// markers labelled above the plot, the weight on the right, the flow on the left (0–5 g/s,
// T3.9), the time below, and the target.
// (Compare's overlay of two shots went with Compare, T3.6.)

import {
  FLOW_TICKS,
  flowTop,
  PLOT,
  pointAt,
  share,
  yOfWeight,
  type ChartPoint,
  type ChartScale,
} from '../brew/chart';
import { tenths } from '../brew/format';
import { ScrubReadout, useScrub } from '../scrub';
import { linePath, placeMarks, timeTicks, weightTicks, type ChartMark, type Zero } from './plot';

export interface ChartSeries {
  readonly points: readonly ChartPoint[];
}

export interface HistoryChartProps {
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
  scale,
  zero,
  series,
  marks,
  targetG = null,
  label,
}: HistoryChartProps) {
  const targetY = targetG === null ? null : yOfWeight(scale, targetG);
  const inside = placeMarks(
    scale,
    marks.filter(
      (mark) => mark.tS >= (scale.fromS ?? 0) && mark.tS <= (scale.fromS ?? 0) + scale.timeS,
    ),
  );
  const labelRows = Math.max(1, ...inside.map((mark) => mark.row + 1));
  // Held, the chart reads at the finger (T3.10).
  const scrub = useScrub<HTMLDivElement>();
  const scrubS = scrub.at === null ? null : (scale.fromS ?? 0) + scrub.at * scale.timeS;
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
      <div class="hchart-plot scrub-plot" ref={scrub.ref}>
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
                stroke: 'var(--tick)',
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
                stroke: 'var(--sub)',
                strokeWidth: 1.5,
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
                stroke: 'var(--line-a)',
                strokeWidth: 2.5,
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
        {scrub.at !== null && scrubS !== null && (
          <ScrubReadout
            at={scrub.at}
            tS={scrubS}
            lines={series.map((s, i) => ({
              name: `Shot ${i + 1}`,
              point: pointAt(s.points, scrubS),
              colour: 'var(--line-a)',
            }))}
          />
        )}
        {/* The flow's axis, 0–5 g/s, on the left (T3.9). */}
        {FLOW_TICKS.map((gps) => (
          <span key={gps} class="hchart-flow" style={{ top: flowTop(gps) }}>
            {gps === FLOW_TICKS.at(-1) ? `${gps} g/s` : gps}
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
