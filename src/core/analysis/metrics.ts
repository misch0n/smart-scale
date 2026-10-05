/**
 * A shot's metrics (T1.14; spec "Durations", "Flow and yield"), from its markers alone.
 *
 * - **Durations** all stop at `pump_off` or `first_drip`, never at the last drip: when drips
 *   stop measures the operator's patience, not the shot.
 * - **Flow and yield** take different masses: average flow is w(pump_off) over the extraction
 *   (mass arriving after the clock stopped would inflate it), yield is w(settled), honest yield
 *   w(cup_removed), and the tail mass the difference between yield and w(pump_off).
 *
 * Every metric is null when a marker it needs is (D-035, D-036): without the pump's vibration
 * there's no `pump_on`, so no first-drip time or total until Q4 is answered. The ratio needs the
 * shot's dose, which is metadata, so the shot matching computes it (`matching.ts`).
 */

import type { FirstDrip } from './first-drip';
import type { CupRemoved, Settled } from './liquid-markers';
import type { PumpEvent, PumpOff } from './pump-markers';
import type { ShotMarkers } from './shot-markers';
import type { TailFit } from './tail';

/** pump_off, with the detector that found it and the liquid there. */
export interface SegmentPumpOff extends PumpOff {
  /** w(pump_off), g; null when too few samples follow pump_off to fit it (T1.12). */
  readonly weightG: number | null;
}

/** The spec's five markers of a shot window, as the derived cache keeps them. */
export interface SegmentMarkers {
  /** null without the pump's vibration (Q4), or when the mean moved with it (T1.13). */
  readonly pumpOn: PumpEvent | null;
  readonly firstDrip: FirstDrip | null;
  readonly pumpOff: SegmentPumpOff | null;
  readonly settled: Settled | null;
  readonly cupRemoved: CupRemoved | null;
}

/** Durations in s, masses in g (liquid: net of the baseline and of other steps), flows in g/s. */
export interface ShotMetrics {
  /**
   * pump_on → first_drip: the first-drip time, the headline metric (spec "First-drip time"),
   * which is also the spec's pre-infusion.
   */
  readonly firstDripS: number | null;
  /** first_drip → pump_off. */
  readonly extractionS: number | null;
  /** pump_on → pump_off. */
  readonly totalS: number | null;
  /** w(pump_off) / extraction. */
  readonly averageFlowGps: number | null;
  /** w(pump_off). */
  readonly pumpOffWeightG: number | null;
  /** w(settled): everything the shot delivers had the cup stayed. */
  readonly yieldG: number | null;
  /** w(cup_removed): what actually reached the cup. */
  readonly honestYieldG: number | null;
  /** w(settled) − w(pump_off): the puck's drainage after the pump stopped. */
  readonly tailMassG: number | null;
  /** The tail's time constant τ. */
  readonly tauS: number | null;
}

/** The markers of `shotMarkers` (T1.12, T1.13) as the derived cache keeps them. */
export function segmentMarkers(markers: ShotMarkers): SegmentMarkers {
  const { pump, liquid } = markers;
  return {
    pumpOn: pump.pumpOn && { t: pump.pumpOn.t },
    firstDrip: liquid.firstDrip && { ...liquid.firstDrip },
    pumpOff: pump.pumpOff && {
      t: pump.pumpOff.t,
      detector: pump.pumpOff.detector,
      weightG: liquid.pumpOff?.weightG ?? null,
    },
    settled: liquid.settled && { ...liquid.settled },
    cupRemoved: liquid.cupRemoved && { ...liquid.cupRemoved },
  };
}

/**
 * Whether the markers that are there come in the spec's order: pump_on, first_drip, pump_off.
 * The detectors make sure of it on any ordinary shot. A duration that would come out at 0 or
 * below is null instead, and the analysis flags the shot (`markers-out-of-order`).
 */
export function markersInOrder(markers: SegmentMarkers): boolean {
  const times = [markers.pumpOn?.t, markers.firstDrip?.t, markers.pumpOff?.t].filter(
    (t): t is number => t !== undefined,
  );
  return times.every((t, i) => i === 0 || t > times[i - 1]);
}

/** The metrics of a shot window's markers and tail fit. */
export function shotMetrics(markers: SegmentMarkers, tail: TailFit | null): ShotMetrics {
  const pumpOnT = markers.pumpOn?.t ?? null;
  const firstDripT = markers.firstDrip?.t ?? null;
  const pumpOffT = markers.pumpOff?.t ?? null;
  const extractionS = duration(firstDripT, pumpOffT);
  const pumpOffWeightG = markers.pumpOff?.weightG ?? null;
  const yieldG = markers.settled?.weightG ?? null;
  return {
    firstDripS: duration(pumpOnT, firstDripT),
    extractionS,
    totalS: duration(pumpOnT, pumpOffT),
    averageFlowGps:
      pumpOffWeightG !== null && extractionS !== null ? pumpOffWeightG / extractionS : null,
    pumpOffWeightG,
    yieldG,
    honestYieldG: markers.cupRemoved?.weightG ?? null,
    tailMassG: yieldG !== null && pumpOffWeightG !== null ? yieldG - pumpOffWeightG : null,
    tauS: tail?.tauS ?? null,
  };
}

/** `to − from`, s, or null when either is missing or it doesn't come out above 0. */
function duration(from: number | null, to: number | null): number | null {
  if (from === null || to === null) return null;
  const span = to - from;
  return span > 0 ? span : null;
}
