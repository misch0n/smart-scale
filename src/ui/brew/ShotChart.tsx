// The shot's chart, as the brew boards draw it (Brew-Ready, Brew-Shot, Brew-Finish): weight and
// flow from the pump start and the target line, the weight coloured by stage (preinfusion,
// extraction, tail) with a strip of them under the plot, as a finished shot's chart has them
// (T3.17, D-110): no marker lines. `empty` is the waiting screen's (the target only), `live` the
// extraction's, with the latest point, and `small` the shot card's until the analysis has read
// the shot. Each draws the reference shot's weight under the shot's, when one is picked (T3.7,
// D-105), and its axes hold the whole of it.

import { ScrubReadout, useScrub } from '../scrub';
import { StageLegend, StageStrip } from '../StageParts';
import { STAGE_COLOUR, stageAt, stageNotes, stageRuns, STAGES, type StageMarkers } from '../stages';
import {
  curvePath,
  FLOW_TICKS,
  pointAt,
  flowTop,
  PLOT,
  quarterTicks,
  share,
  timeAxisS,
  weightAxisG,
  weightTicks,
  xOf,
  yOfWeight,
  type ChartPoint,
  type ChartScale,
} from './chart';

export interface ShotChartProps {
  readonly variant: 'empty' | 'live' | 'small';
  /** From the pump start, in time order. */
  readonly points: readonly ChartPoint[];
  readonly targetG: number | null;
  /** From the pump start, s. */
  readonly firstDripS: number | null;
  readonly pumpOffS: number | null;
  /** Past the target by more than the margin: the weight above the line turns to the warning. */
  readonly over?: boolean;
  /** The reference shot's curve, from its pump_on (T3.7); null or absent for none. */
  readonly reference?: readonly ChartPoint[] | null;
}

const STROKE = { vectorEffect: 'non-scaling-stroke', fill: 'none' } as const;

export function ShotChart({
  variant,
  points,
  targetG,
  firstDripS,
  pumpOffS,
  over,
  reference = null,
}: ShotChartProps) {
  const last = points.at(-1) ?? null;
  const ref = reference ?? [];
  const maxG = Math.max(0, ...points.map((point) => point.g), ...ref.map((point) => point.g));
  const scale: ChartScale = {
    timeS: timeAxisS(Math.max(last?.tS ?? 0, pumpOffS ?? 0, ref.at(-1)?.tS ?? 0)),
    weightG: weightAxisG(targetG ?? 0, maxG),
  };
  const small = variant === 'small';
  const targetY = targetG === null ? null : yOfWeight(scale, targetG);
  // The live markers, display only: counted from the Start tap, up to the latest reading.
  const stages: StageMarkers = { pumpOnS: 0, firstDripS, pumpOffS, endS: last?.tS ?? null };
  const runs = stageRuns(stages, points);
  const nowColour = last === null ? 'var(--line-a)' : STAGE_COLOUR[stageAt(stages, last.tS)];
  // Held, the chart reads at the finger (T3.10).
  const scrub = useScrub<HTMLDivElement>();
  const scrubS = scrub.at === null ? null : scrub.at * scale.timeS;
  const clipId = `above-target-${variant}`;

  return (
    <div class={`chart chart-${variant}`}>
      {variant === 'live' && (
        <StageLegend
          stages={STAGES}
          extras={[
            { label: 'flow', colour: 'var(--sub)', dashed: true },
            { label: 'target', colour: 'var(--mark)', dashed: true },
            ...(ref.length > 0 ? [{ label: 'reference', colour: 'var(--line-b)' }] : []),
          ]}
        />
      )}
      <div class="chart-plot scrub-plot" ref={scrub.ref}>
        <svg
          viewBox={`0 0 ${PLOT.width} ${PLOT.height}`}
          preserveAspectRatio={small ? 'none' : undefined}
          aria-hidden="true"
        >
          {targetY !== null && over && (
            <defs>
              <clipPath id={clipId}>
                <rect x="0" y="0" width={PLOT.width} height={targetY} />
              </clipPath>
            </defs>
          )}
          <path
            d="M0 125H1000M0 250H1000M0 375H1000"
            style={{ ...STROKE, stroke: 'var(--grid)', strokeWidth: 1 }}
          />
          <path d="M0 499H1000" style={{ ...STROKE, stroke: 'var(--rule)', strokeWidth: 1 }} />
          {targetY !== null && !small && (
            <path
              d={`M0 ${targetY}H1000`}
              style={{ ...STROKE, stroke: 'var(--mark)', strokeWidth: 1, strokeDasharray: '5 3' }}
            />
          )}
          {ref.length > 0 && (
            <path
              d={curvePath(scale, ref, 'flowGps')}
              data-testid="reference-flow"
              style={{
                ...STROKE,
                stroke: 'var(--line-b)',
                strokeWidth: small ? 1 : 1.25,
                strokeDasharray: '4 3',
                strokeLinejoin: 'round',
                opacity: 0.6,
              }}
            />
          )}
          {ref.length > 0 && (
            <path
              d={curvePath(scale, ref, 'g')}
              data-testid="reference-curve"
              style={{
                ...STROKE,
                stroke: 'var(--line-b)',
                strokeWidth: small ? 1.5 : 2,
                strokeLinejoin: 'round',
                strokeLinecap: 'round',
                opacity: 0.75,
              }}
            />
          )}
          {points.length > 0 && (
            <>
              <path
                d={curvePath(scale, points, 'flowGps')}
                style={{
                  ...STROKE,
                  stroke: 'var(--sub)',
                  strokeWidth: small ? 1.25 : 1.5,
                  strokeDasharray: small ? '3 3' : '4 3',
                  strokeLinejoin: 'round',
                }}
              />
              {STAGES.map((stage) =>
                runs[stage].length < 2 ? null : (
                  <path
                    key={stage}
                    d={curvePath(scale, runs[stage], 'g')}
                    data-testid={`live-stage-${stage}`}
                    style={{
                      ...STROKE,
                      stroke: STAGE_COLOUR[stage],
                      strokeWidth: small ? 2 : 2.5,
                      strokeLinejoin: 'round',
                      strokeLinecap: 'round',
                    }}
                  />
                ),
              )}
              {over && targetY !== null && (
                <path
                  d={curvePath(scale, points, 'g')}
                  clip-path={`url(#${clipId})`}
                  style={{
                    ...STROKE,
                    stroke: 'var(--warn)',
                    strokeWidth: 3.5,
                    strokeLinejoin: 'round',
                    strokeLinecap: 'round',
                  }}
                />
              )}
            </>
          )}
          {variant === 'live' && last !== null && (
            <>
              <circle
                cx={xOf(scale, last.tS)}
                cy={yOfWeight(scale, last.g)}
                r="26"
                style={{ fill: over ? 'var(--warn)' : nowColour, opacity: 0.18 }}
              />
              <circle
                cx={xOf(scale, last.tS)}
                cy={yOfWeight(scale, last.g)}
                r="11"
                style={{
                  fill: over ? 'var(--warn)' : nowColour,
                  stroke: 'var(--panel)',
                  strokeWidth: 5,
                }}
              />
            </>
          )}
        </svg>
        {!small &&
          weightTicks(scale.weightG, targetG).map((g) => (
            <span key={g} class="chart-y" style={{ top: share(yOfWeight(scale, g), PLOT.height) }}>
              {g} g
            </span>
          ))}
        {!small &&
          FLOW_TICKS.map((gps) => (
            <span key={gps} class="chart-flow" style={{ top: flowTop(gps) }}>
              {gps === FLOW_TICKS.at(-1) ? `${gps} g/s` : gps}
            </span>
          ))}
        {targetY !== null && !small && (
          <span class="chart-target" style={{ top: share(targetY, PLOT.height) }}>
            {(Math.round(targetG! * 10) / 10).toFixed(1)} g
          </span>
        )}
        {scrub.at !== null && scrubS !== null && (
          <ScrubReadout
            at={scrub.at}
            tS={scrubS}
            lines={[
              ...(points.length > 0
                ? [
                    {
                      name: 'Shot',
                      point: pointAt(points, scrubS),
                      colour: STAGE_COLOUR[stageAt(stages, scrubS)],
                    },
                  ]
                : []),
              ...(ref.length > 0
                ? [{ name: 'Reference', point: pointAt(ref, scrubS), colour: 'var(--line-b)' }]
                : []),
            ]}
            notes={stageNotes(stages, points, scrubS).map((note) => ({
              text: note.text,
              colour: STAGE_COLOUR[note.stage],
            }))}
          />
        )}
      </div>
      {variant !== 'empty' && <StageStrip markers={stages} scale={scale} />}
      <div class="chart-x">
        <span style={{ left: 0 }}>0</span>
        {quarterTicks(scale.timeS).map((t, i) => (
          <span
            key={t}
            class={i === 3 ? 'chart-x-last' : undefined}
            style={i === 3 ? undefined : { left: `${(i + 1) * 25}%` }}
          >
            {i === 3 ? `${t} s` : t}
          </span>
        ))}
      </div>
    </div>
  );
}
