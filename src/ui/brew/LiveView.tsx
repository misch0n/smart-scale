// The extraction as it pours (board Brew-Shot), read from about a metre away: remaining to target
// with its progress, or the over-target warning; the flow and the time since the pump started;
// the chart from the pump start. Display-only (hard rule 3): the live shot's figures, never stored.

import type { VesselOnScale } from '../../app/live-vessel';
import type { Container, Recipe } from '../../core/model';
import type { ShotDisplay } from '../../core/live';
import { CheckIcon, WarningIcon } from '../icons';
import type { ChartPoint } from './chart';
import { readout, recipeRatio, seconds, tenths } from './format';
import { CUP_PROMPT, VesselCard } from './phases';
import { ShotChart } from './ShotChart';

export function LiveView({
  display,
  recipe,
  onScale,
  container,
  onPick,
}: {
  display: ShotDisplay;
  recipe: Recipe;
  onScale: VesselOnScale | null;
  container: Container | null;
  onPick: (id: string) => void;
}) {
  const points = chartPoints(display);
  const r = display.progress === null ? null : readout(display.progress);
  const pumpOffS = sinceTap(display, display.pumpOffMs);

  return (
    <>
      <VesselCard onScale={onScale} container={container} prompt={CUP_PROMPT} onPick={onPick} />
      <section class="card recipe-row" aria-label="Equipment">
        <span class="lbl">Recipe</span>
        {/* The coffee ratio only: the shot pours against it (board Brew-Shot). */}
        <span>
          {recipe.name} · {recipeRatio(recipe.coffeeRatio)}
        </span>
      </section>

      <section
        aria-label="Live readout"
        class={`readout ${r?.state ?? 'pouring'}`}
        data-testid="readout"
        data-state={r?.state ?? 'none'}
      >
        {r === null ? (
          <div class="big big-live">
            <span class="num">{tenths(display.netG ?? 0)}</span>
            <span class="unit">g</span>
          </div>
        ) : (
          <>
            <div class="readout-head">
              {r.state === 'pouring' ? (
                <span class="lbl">Remaining</span>
              ) : r.state === 'reached' ? (
                <span class="badge" style={{ gap: '5px', color: 'var(--ok)' }}>
                  <CheckIcon size={12} strokeWidth={3} />
                  Target reached
                </span>
              ) : (
                <span class="badge warn" style={{ gap: '5px' }}>
                  <WarningIcon size={13} strokeWidth={2.5} />
                  Over target
                </span>
              )}
              <span class="muted">
                <span class="num">{r.poured}</span> of <span class="num">{r.target}</span> g
              </span>
            </div>
            <div class={r.big.replace(/\D/g, '').length > 2 ? 'big big-live long' : 'big big-live'}>
              <span class="num" data-testid="remaining">
                {r.big}
              </span>
              <span class="unit">g</span>
              {r.state === 'pouring' && <span class="big-word">to go</span>}
            </div>
            <div class="readout-bar">
              <span
                class="bar"
                role="progressbar"
                aria-label="Yield towards the target"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={r.barPct}
              >
                <span style={{ width: `${r.barPct}%` }} />
              </span>
              {r.state === 'over' && <span class="over-block bg-warn" />}
              <span class={r.state === 'over' ? 'num c-warn' : 'num muted'}>{r.percent}</span>
            </div>
          </>
        )}
        {pumpOffS !== null && (
          <span class="muted readout-note">
            Pump off at <span class="num">{seconds(pumpOffS * 1000)}</span> s
            {display.phase === 'tail' ? ' · drips still falling' : ''}
          </span>
        )}
      </section>

      <div class="card tiles">
        <div class="tile">
          <span class="lbl">Flow</span>
          <span>
            <span class="num" data-testid="flow">
              {display.flowGps === null ? '–' : Math.max(0, display.flowGps).toFixed(1)}
            </span>
            <span class="unit"> g/s</span>
          </span>
        </div>
        <div class="tile">
          <span class="lbl">Time</span>
          <span>
            <span class="num" data-testid="time">
              {display.elapsedMs === null ? '–' : seconds(display.elapsedMs)}
            </span>
            <span class="unit"> s</span>
          </span>
        </div>
      </div>

      <div class="card brew-chart">
        <ShotChart
          variant="live"
          points={points}
          targetG={display.targetG}
          firstDripS={sinceTap(display, display.firstDripMs)}
          pumpOffS={pumpOffS}
          over={r?.state === 'over'}
        />
      </div>
    </>
  );
}

/** The live shot's series as the chart takes it: from the tap, in s. */
export function chartPoints(display: ShotDisplay): ChartPoint[] {
  const start = display.pumpOnMs;
  if (start === null) return [];
  return display.series.map((point) => ({
    tS: (point.tMs - start) / 1000,
    g: point.netG,
    flowGps: point.flowGps,
  }));
}

/** A time of the shot, in s from the tap; null when either is unknown. */
export function sinceTap(display: ShotDisplay, tMs: number | null): number | null {
  return tMs === null || display.pumpOnMs === null ? null : (tMs - display.pumpOnMs) / 1000;
}
