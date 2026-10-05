/**
 * Manual starts (T1.16; D-048, Q4): the taps that say the pump has just started. The scale can't
 * see the pump (A2), so until the microphone can (T3.1), `pump_on` is the Tare + start tap made
 * with the pump, flagged as manual (spec v2 "Fallback if vibration does not survive").
 *
 * - **What counts:** a `manual-start` UI action (the capture flow's tap, T1.18), or a
 *   Tare + start (`07`) the app sent for any reason but its own auto-tare. The auto-tare goes
 *   out as the cup settles, long before the pump (T1.17); the probe's Tare + start button logs
 *   `probe`, which hardware session 2 tapped at the same moment as the pump.
 * - **One tap, one start:** the capture flow logs the tap, then the `07` it sends once the scale
 *   has the write. Starts within `SAME_TAP_S` of the one before them are that one, at its time.
 * - **Times** are the events' own (`tMs`, the recording's clock): what the frames' arrival is
 *   measured on, so within the link's latency (tens of ms) of the timeline (T1.9). The tap's
 *   human latency, which the spec puts at a few tenths of a second, is far more.
 */

import type { AppEvent } from '../model';

/** Starts this close after the one before them are the same tap, s. */
export const SAME_TAP_S = 1;

/** The reason the live pipeline's arm-once tare gives its `07` (T1.17): no pump start. */
export const AUTO_TARE_REASON = 'auto-tare';

/** The manual starts in `events`, s on the recording's clock, in order. */
export function manualStartTimes(events: readonly AppEvent[]): number[] {
  const times = events
    .filter(
      (event) =>
        (event.type === 'ui-action' && event.data.action === 'manual-start') ||
        (event.type === 'command-sent' &&
          event.data.command === 'tareAndStartTimer' &&
          event.data.reason !== AUTO_TARE_REASON),
    )
    .map((event) => event.tMs / 1000)
    .sort((a, b) => a - b);
  const starts: number[] = [];
  for (const t of times) {
    const last = starts.at(-1);
    if (last === undefined || t - last > SAME_TAP_S) starts.push(t);
  }
  return starts;
}
