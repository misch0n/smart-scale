/**
 * Every marker of a shot window (T1.12, T1.13): first_drip, then the pump markers that start from
 * it, then the liquid markers with the pump_off they found. T1.14's metrics read from here.
 */

import { findFirstDrip } from './first-drip';
import { liquidMarkers, type LiquidMarkers } from './liquid-markers';
import { windowLiquid } from './liquid';
import { resolveLiquidParams, type LiquidParams, type PumpParams } from './params';
import { pumpMarkers, type PumpMarkers } from './pump-markers';
import type { Segmentation } from './segment';
import type { ShotWindow } from './shot-windows';

export interface ShotMarkers {
  readonly pump: PumpMarkers;
  readonly liquid: LiquidMarkers;
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
  const liquid = liquidMarkers(
    segmentation,
    window,
    { pumpOffT: pump.pumpOff?.t ?? null },
    overrides.liquid,
  );
  return { pump, liquid };
}
