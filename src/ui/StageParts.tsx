// The stages' legend and strip (T3.16, T3.17; D-109, D-110), shared by the live chart and a
// finished shot's chart so the two read alike.

import type { ChartScale } from './brew/chart';
import { PLOT, share, xOf } from './brew/chart';
import { STAGE_COLOUR, stageSpans, type Stage, type StageMarkers } from './stages';
import './stages.css';

const STAGE_LABEL: Readonly<Record<Stage, string>> = {
  preinfusion: 'preinfusion',
  extraction: 'extraction',
  tail: 'tail',
};

/** A legend entry beyond the stages: a solid swatch, or a dashed line. */
export interface LegendExtra {
  readonly label: string;
  readonly colour: string;
  readonly dashed?: boolean;
}

/** The stages' swatches, then the flow, the target or the reference as the chart has them. */
export function StageLegend({
  stages,
  extras,
}: {
  stages: readonly Stage[];
  extras: readonly LegendExtra[];
}) {
  return (
    <div class="stage-legend muted" aria-hidden="true">
      {stages.map((stage) => (
        <span key={stage}>
          <span class="stage-swatch" style={{ background: STAGE_COLOUR[stage] }} />
          {STAGE_LABEL[stage]}
        </span>
      ))}
      {extras.map((extra) => (
        <span key={extra.label}>
          {extra.dashed ? (
            <svg viewBox="0 0 18 6" class="legend-line">
              <path
                d="M0 3H18"
                style={{
                  fill: 'none',
                  stroke: extra.colour,
                  strokeWidth: 1.5,
                  strokeDasharray: '3 2',
                }}
              />
            </svg>
          ) : (
            <span class="stage-swatch" style={{ background: extra.colour }} />
          )}
          {extra.label}
        </span>
      ))}
    </div>
  );
}

/** The stages along the time axis, in their colours, up to where the shot's data ends. */
export function StageStrip({ markers, scale }: { markers: StageMarkers; scale: ChartScale }) {
  return (
    <div class="stage-strip" aria-hidden="true" data-testid="stage-strip">
      {stageSpans(markers, scale).map((span) => (
        <span
          key={span.stage}
          data-stage={span.stage}
          style={{
            left: share(xOf(scale, span.fromS), PLOT.width),
            width: share(xOf(scale, span.toS) - xOf(scale, span.fromS), PLOT.width),
            background: STAGE_COLOUR[span.stage],
          }}
        />
      ))}
    </div>
  );
}
