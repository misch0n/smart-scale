/**
 * What the app sends the scale for the live monitor's events (D-066, the user's answer to Q9).
 * The scale's own timer then runs from the Tare + start tap to "shot done", shot after shot, as
 * the user ran it by hand in hardware session 2.
 *
 * - **The cup settles** (`tare`): stop the timer and zero it (`05`, `06`), then tare (`01`). A
 *   plain tare leaves the timer to the tap's `07`, which starts it only from 0 and stopped
 *   (D-037). The stop does nothing unless something left the timer running.
 * - **"Shot done"**: stop it (`05`), so the scale shows the shot's time until the next cup.
 * - **A tap that lapsed** (no liquid within 15 s): stop and zero it, ready for the next tap.
 * - **The brew ended** by its ✕ (T2.15, `endSessionCommands`): stop and zero the timer, then
 *   tare, so the next brew starts from a zeroed scale whatever was left running (session 3: a
 *   Start with no shot left the timer running after the brew was left).
 *
 * Every command is on the whitelist (D-008) and goes out logged, with a reason that names the
 * event. The tap's own `07` is the capture flow's (T1.18), not an answer to an event.
 */

import { AUTO_TARE_REASON } from '../model';
import { resetTimer, stopTimer, tare, type ScaleCommand } from '../protocol';
import type { ShotMonitorEvent } from './shot-monitor';

/** The reason the timer's stop at "shot done" is logged with. */
export const SHOT_DONE_REASON = 'shot-done';
/** The reason the timer's stop and reset after a lapsed tap are logged with. */
export const PUMP_LAPSED_REASON = 'pump-lapsed';
/** The reason the scale's reset at the brew's ✕ is logged with. */
export const END_SESSION_REASON = 'end-session';

/** A command for the app to send, and the reason to log it with. */
export interface ScaleCommandToSend {
  readonly command: ScaleCommand;
  readonly reason: string;
}

/** What to send for `event`, in order: nothing for most events. */
export function scaleCommandsFor(event: ShotMonitorEvent): ScaleCommandToSend[] {
  switch (event.type) {
    case 'tare':
      return [
        { command: stopTimer(), reason: AUTO_TARE_REASON },
        { command: resetTimer(), reason: AUTO_TARE_REASON },
        { command: tare(), reason: AUTO_TARE_REASON },
      ];
    case 'shot-done':
      return [{ command: stopTimer(), reason: SHOT_DONE_REASON }];
    case 'pump-lapsed':
      return [
        { command: stopTimer(), reason: PUMP_LAPSED_REASON },
        { command: resetTimer(), reason: PUMP_LAPSED_REASON },
      ];
    default:
      return [];
  }
}

/** What to send when the brew ends by its ✕, in order: the timer stopped and zeroed, a tare. */
export function endSessionCommands(): ScaleCommandToSend[] {
  return [
    { command: stopTimer(), reason: END_SESSION_REASON },
    { command: resetTimer(), reason: END_SESSION_REASON },
    { command: tare(), reason: END_SESSION_REASON },
  ];
}
