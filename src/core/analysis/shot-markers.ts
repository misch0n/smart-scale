/**
 * Every marker of a shot window (T1.12, T1.13): first_drip, then the pump markers that start from
 * it, then the liquid markers with the pump_off they found. T1.14's metrics read from here.
 *
 * **Two levels** (T1.16, D-059). first_drip is found on the liquid over the window's baseline,
 * the level the pre-infusion holds, since that is what the first drops land on. The yields are
 * measured from the stable level before the pump (spec "Schema rules": "the stable value before
 * the pump"), once pump_on is known. The two differ when the pump's start moves the reading: in
 * shot B of hardware session 2 it dipped 0.2 g as the pump started and held there until the
 * first drip, so a yield measured from the dip read 0.2 g high.
 */

import { findFirstDrip } from './first-drip';
import { liquidMarkers, type LiquidMarkers } from './liquid-markers';
import { windowLiquid } from './liquid';
import { resolveLiquidParams, type LiquidParams, type PumpParams } from './params';
import { pumpMarkers, type PumpMarkers } from './pump-markers';
import type { Segmentation } from './segment';
import type { Baseline, ShotWindow } from './shot-windows';
import { noiseBetween } from './stability';

export interface ShotMarkers {
  readonly pump: PumpMarkers;
  readonly liquid: LiquidMarkers;
  /**
   * The window the liquid markers measured in: the segmentation's, with the baseline taken
   * before the pump when pump_on came before the baseline's end (`prePumpBaseline`), and its
   * `riseG` from that baseline.
   */
  readonly window: ShotWindow;
}

export interface ShotMarkerOverrides {
  readonly pump?: Partial<PumpParams>;
  readonly liquid?: Partial<LiquidParams>;
}

/**
 * The markers of `window`, one of `segmentation.shotWindows`. Pure.
 *
 * @throws RangeError on invalid parameters.
 */
export function shotMarkers(
  segmentation: Segmentation,
  window: ShotWindow,
  overrides: ShotMarkerOverrides = {},
): ShotMarkers {
  const firstDrip = findFirstDrip(windowLiquid(segmentation, window), window, {
    params: resolveLiquidParams(overrides.liquid),
    sigmaFloorG: segmentation.sigmaFloorG,
  });
  const pump = pumpMarkers(segmentation, window, { firstDrip }, overrides.pump);
  const baseline = pump.pumpOn && prePumpBaseline(segmentation, window, pump.pumpOn.t);
  // The yields' baseline is this much below the window's, so liquid reads this much more.
  const shiftG = baseline ? window.baseline.levelG - baseline.levelG : 0;
  const measured: ShotWindow = baseline
    ? { ...window, baseline, riseG: window.riseG + shiftG }
    : window;
  const drain = pump.drain && { ...pump.drain, weightG: pump.drain.weightG + shiftG };
  const liquid = liquidMarkers(
    segmentation,
    measured,
    { pumpOffT: pump.pumpOff?.t ?? null, firstDrip, drain },
    overrides.liquid,
  );
  return { pump, liquid, window: measured };
}

/**
 * The stable level before the pump started at `pumpOnT`, s: the last `baselineS` of readings up
 * to pump_on, from the stable stretch that holds pump_on or ends at most `stableSpanS` before it.
 * The stretch must lie in the window's vessel interval, with no step between it and pump_on,
 * and give at least `stableSpanS` of readings. Null otherwise, or when the window's baseline
 * already ends by pump_on: then that one is it.
 */
export function prePumpBaseline(
  segmentation: Segmentation,
  window: ShotWindow,
  pumpOnT: number,
): Baseline | null {
  const { params, stretches, steps, samples, series, sigmaFloorG } = segmentation;
  if (!(pumpOnT < window.baseline.endT)) return null;
  const cupOnT = window.cupPlaced?.startT ?? -Infinity;
  let holding = null;
  for (const stretch of stretches) {
    if (stretch.startT >= pumpOnT) break;
    if (stretch.startT >= cupOnT && stretch.endT >= pumpOnT - params.stableSpanS) {
      holding = stretch;
    }
  }
  if (holding === null) return null;
  const startT = Math.max(holding.startT, pumpOnT - params.baselineS);
  const endT = Math.min(holding.endT, pumpOnT);
  if (endT - startT < params.stableSpanS - TIME_EPSILON_S) return null;
  if (steps.some((step) => step.kind !== 'tare' && step.endT > endT && step.startT < pumpOnT)) {
    return null;
  }
  const from = Math.max(0, Math.ceil((startT - series.start) / series.step - TIME_EPSILON_S));
  const to = Math.min(series.values.length, Math.floor((endT - series.start) / series.step) + 1);
  return {
    startT,
    endT,
    ...noiseBetween(samples, startT, endT, sigmaFloorG, series.values.slice(from, to)),
  };
}

/** Times this close are the same, s. */
const TIME_EPSILON_S = 1e-9;
