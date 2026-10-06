// The history's trend (T3.3, D-085; no board draws it, Q29): over the filtered shots, a figure
// (first drip, time, ratio, yield) against the grind setting, the days off roast or the day, a
// dot per shot in its taste's colour (a tap opens it), with the straight line fitted through
// them and what it says per step. Shown once the history is filtered. Built from the boards'
// segmented controls and the charts' look; T3.5's design pass revisits it.

import type { GrindSettingKind } from '../../core/model';
import { shotHash, type Mock } from '../route';
import {
  MIN_FIT_POINTS,
  singleGrinder,
  slopeText,
  trend,
  trendChart,
  TREND_BOX,
  TREND_X,
  TREND_X_LABEL,
  TREND_Y,
  TREND_Y_LABEL,
  xText,
  yText,
  type TrendEntry,
  type TrendX,
  type TrendY,
} from './trends';

export function TrendCard({
  entries,
  x,
  y,
  onAxes,
  mock,
}: {
  /** The filtered shots, newest first. */
  entries: readonly TrendEntry[];
  x: TrendX;
  y: TrendY;
  onAxes: (axes: { readonly x: TrendX; readonly y: TrendY }) => void;
  mock: Mock;
}) {
  // Grind settings of different grinders share no axis.
  const grinderShared = singleGrinder(entries) !== null;
  const t = trend(entries, x, y);
  const kind: GrindSettingKind =
    entries.find((e) => e.shot.grindSetting !== null)?.shot.grindSetting?.kind ?? 'stepless';
  const chart =
    x === 'grind' && !grinderShared
      ? null
      : trendChart(
          t,
          (v) => xText(x, v, kind),
          (v) => yText(y, v),
        );
  const { width, height, left, right, top, bottom } = TREND_BOX;
  return (
    <section class="card trend" aria-label="Trend" data-testid="trend">
      <div class="trend-head">
        <span class="lbl">Trend</span>
        <span class="muted">
          <span class="num">{chart === null ? 0 : t.points.length}</span>{' '}
          {t.points.length === 1 ? 'shot' : 'shots'}
        </span>
      </div>
      <div class="seg" role="group" aria-label="Figure">
        {TREND_Y.map((option) => (
          <button
            key={option}
            type="button"
            class={option === y ? 'on' : ''}
            aria-pressed={option === y}
            onClick={() => onAxes({ x, y: option })}
          >
            {TREND_Y_LABEL[option]}
          </button>
        ))}
      </div>
      {chart === null ? (
        <p class="muted trend-empty" data-testid="trend-empty">
          {x === 'grind' && !grinderShared
            ? 'These shots are from more than one grinder: pick one in the filter to see the grind.'
            : `No shot here has both the ${TREND_Y_LABEL[y].toLowerCase()} and the ${TREND_X_LABEL[x].toLowerCase()}.`}
        </p>
      ) : (
        <svg
          class="trend-chart"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${TREND_Y_LABEL[y]} against ${TREND_X_LABEL[x].toLowerCase()}, ${t.points.length} shots`}
          data-testid="trend-chart"
        >
          <path class="trend-axis" d={`M${left} ${top}V${height - bottom}H${width - right}`} />
          {chart.yTicks.map((tick) => (
            <text
              key={`y${tick.label}`}
              class="trend-tick"
              x={left - 6}
              y={tick.at}
              text-anchor="end"
              dominant-baseline="middle"
            >
              {tick.label}
            </text>
          ))}
          {chart.xTicks.map((tick) => (
            <text
              key={`x${tick.label}`}
              class="trend-tick"
              x={tick.at}
              y={height - bottom + 16}
              text-anchor="middle"
            >
              {tick.label}
            </text>
          ))}
          {chart.line !== null && (
            <line
              class="trend-fit"
              x1={chart.line.x1}
              y1={chart.line.y1}
              x2={chart.line.x2}
              y2={chart.line.y2}
            />
          )}
          {chart.dots.map((dot) => (
            <a key={dot.shotId} href={shotHash(dot.shotId, mock)} aria-label="Open the shot">
              <circle class="trend-hit" cx={dot.cx} cy={dot.cy} r={12} />
              <circle
                class={
                  dot.taste === null
                    ? 'trend-dot trend-dot-ungraded'
                    : `trend-dot trend-dot-${dot.taste}`
                }
                cx={dot.cx}
                cy={dot.cy}
                r={5}
              />
            </a>
          ))}
        </svg>
      )}
      <div class="seg" role="group" aria-label="Across">
        {TREND_X.map((option) => (
          <button
            key={option}
            type="button"
            class={option === x ? 'on' : ''}
            aria-pressed={option === x}
            onClick={() => onAxes({ x: option, y })}
          >
            {TREND_X_LABEL[option]}
          </button>
        ))}
      </div>
      {chart !== null && (
        <p class="muted trend-note" data-testid="trend-note">
          {slopeText(t, kind) ??
            `A line needs ${MIN_FIT_POINTS} shots at more than one ${TREND_X_LABEL[x].toLowerCase()}.`}
        </p>
      )}
    </section>
  );
}
