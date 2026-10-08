// A finished shot's chart (T3.16, D-109; the shot card and a shot's page): weight and flow over
// time from its zero, the weight coloured by stage (preinfusion, extraction, tail) and a strip of
// the stages under the plot, in place of the marker lines; only the target keeps its line. The
// weight on the right, the flow on the left (0–5 g/s, T3.9), the time below. Held, it reads the
// moment (T3.10): the time, the weight and the flow, and the stages ended by then with how long
// they lasted. The reference shot, when one is drawn (T3.7), lies under it.

import {
  FLOW_TICKS,
  flowTop,
  PLOT,
  pointAt,
  share,
  timeAxisS,
  weightAxisG,
  xOf,
  yOfWeight,
  type ChartPoint,
  type ChartScale,
} from '../brew/chart';
import { tenths } from '../brew/format';
import { ScrubReadout, useScrub } from '../scrub';
import {
  linePath,
  STAGE_COLOUR,
  stageAt,
  stageNotes,
  stageRuns,
  stageSpans,
  STAGES,
  timeTicks,
  weightTicks,
  type ShotPlot,
  type Stage,
} from './plot';
import './staged-chart.css';

const STROKE = { vectorEffect: 'non-scaling-stroke', fill: 'none' } as const;

const STAGE_LABEL: Readonly<Record<Stage, string>> = {
  preinfusion: 'preinfusion',
  extraction: 'extraction',
  tail: 'tail',
};

export function StagedChart({
  plot,
  reference = null,
  label,
  small = false,
}: {
  plot: ShotPlot;
  /** The reference shot's curve, from its pump_on: drawn when the chart counts from pump on. */
  reference?: readonly ChartPoint[] | null;
  /** What the chart shows, for screen readers. */
  label: string;
  /** The shot card's: shorter. */
  small?: boolean;
}) {
  const { markers, points, targetG, zero } = plot;
  const ref = zero === 'pumpOn' ? (reference ?? []) : [];
  const scale = widened(plot.scale, ref, targetG, points);
  const targetY = targetG === null ? null : yOfWeight(scale, targetG);
  const runs = stageRuns(markers, points);
  // Held, the chart reads at the finger (T3.10), with the stages ended by then (T3.16).
  const scrub = useScrub<HTMLDivElement>();
  const scrubS = scrub.at === null ? null : (scale.fromS ?? 0) + scrub.at * scale.timeS;

  return (
    <div class={small ? 'hchart hchart-small' : 'hchart'} data-testid="staged-chart">
      <div class="stage-legend muted" aria-hidden="true">
        {STAGES.map((stage) => (
          <span key={stage}>
            <span class="stage-swatch" style={{ background: STAGE_COLOUR[stage] }} />
            {STAGE_LABEL[stage]}
          </span>
        ))}
        <span>
          <svg viewBox="0 0 18 6" class="legend-line">
            <path
              d="M0 3H18"
              style={{ ...STROKE, stroke: 'var(--sub)', strokeWidth: 1.5, strokeDasharray: '3 2' }}
            />
          </svg>
          flow
        </span>
        {ref.length > 0 && (
          <span>
            <span class="stage-swatch" style={{ background: 'var(--line-b)' }} />
            reference
          </span>
        )}
      </div>
      <div class="hchart-plot scrub-plot" ref={scrub.ref}>
        <svg
          viewBox={`0 0 ${PLOT.width} ${PLOT.height}`}
          preserveAspectRatio={small ? 'none' : undefined}
          role="img"
          aria-label={label}
        >
          <path
            d="M0 125H1000M0 250H1000M0 375H1000"
            style={{ ...STROKE, stroke: 'var(--grid)', strokeWidth: 1 }}
          />
          <path d="M0 499H1000" style={{ ...STROKE, stroke: 'var(--rule)', strokeWidth: 1 }} />
          {targetY !== null && (
            <path
              d={`M0 ${targetY}H1000`}
              style={{ ...STROKE, stroke: 'var(--mark)', strokeWidth: 1, strokeDasharray: '5 3' }}
            />
          )}
          {ref.length > 0 && (
            <>
              <path
                d={linePath(scale, ref, 'flowGps')}
                data-testid="reference-flow"
                style={{
                  ...STROKE,
                  stroke: 'var(--line-b)',
                  strokeWidth: 1.25,
                  strokeDasharray: '4 3',
                  opacity: 0.6,
                }}
              />
              <path
                d={linePath(scale, ref, 'g')}
                data-testid="reference-curve"
                style={{
                  ...STROKE,
                  stroke: 'var(--line-b)',
                  strokeWidth: 2,
                  strokeLinejoin: 'round',
                  opacity: 0.75,
                }}
              />
            </>
          )}
          <path
            d={linePath(scale, points, 'flowGps')}
            style={{
              ...STROKE,
              stroke: 'var(--sub)',
              strokeWidth: 1.5,
              strokeDasharray: '4 3',
              strokeLinejoin: 'round',
            }}
          />
          {STAGES.map((stage) =>
            runs[stage].length < 2 ? null : (
              <path
                key={stage}
                d={linePath(scale, runs[stage], 'g')}
                data-testid={`stage-${stage}`}
                style={{
                  ...STROKE,
                  stroke: STAGE_COLOUR[stage],
                  strokeWidth: 2.5,
                  strokeLinejoin: 'round',
                  strokeLinecap: 'round',
                }}
              />
            ),
          )}
        </svg>
        {targetY !== null && targetG !== null && (
          <span class="hchart-target" style={{ left: '2%', top: share(targetY, PLOT.height) }}>
            target {tenths(targetG)} g
          </span>
        )}
        {!small &&
          weightTicks(scale).map((tick) => (
            <span key={tick.label} class="hchart-y" style={{ top: tick.top }}>
              {tick.label}
            </span>
          ))}
        {!small &&
          FLOW_TICKS.map((gps) => (
            <span key={gps} class="hchart-flow" style={{ top: flowTop(gps) }}>
              {gps === FLOW_TICKS.at(-1) ? `${gps} g/s` : gps}
            </span>
          ))}
        {scrub.at !== null && scrubS !== null && (
          <ScrubReadout
            at={scrub.at}
            tS={scrubS}
            lines={[
              {
                name: 'Shot',
                point: pointAt(points, scrubS),
                colour: STAGE_COLOUR[stageAt(markers, scrubS)],
              },
              ...(ref.length > 0
                ? [{ name: 'Reference', point: pointAt(ref, scrubS), colour: 'var(--line-b)' }]
                : []),
            ]}
            notes={stageNotes(markers, points, scrubS).map((note) => ({
              text: note.text,
              colour: STAGE_COLOUR[note.stage],
            }))}
          />
        )}
      </div>
      {/* The stages along the time axis, in their colours, where the marker lines were. */}
      <div class="stage-strip" aria-hidden="true">
        {stageSpans(markers, scale).map((span) => (
          <span
            key={span.stage}
            style={{
              left: share(xOf(scale, span.fromS), PLOT.width),
              width: share(xOf(scale, span.toS) - xOf(scale, span.fromS), PLOT.width),
              background: STAGE_COLOUR[span.stage],
            }}
          />
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

/** The shot's scale, wide enough for the reference's curve too. */
function widened(
  scale: ChartScale,
  ref: readonly ChartPoint[],
  targetG: number | null,
  points: readonly ChartPoint[],
): ChartScale {
  if (ref.length === 0) return scale;
  const fromS = scale.fromS ?? 0;
  const endS = Math.max(fromS + scale.timeS, ref.at(-1)!.tS);
  const maxG = Math.max(0, ...points.map((p) => p.g), ...ref.map((p) => p.g));
  return {
    fromS,
    timeS: timeAxisS(endS - fromS),
    weightG: weightAxisG(targetG ?? 0, maxG),
  };
}
