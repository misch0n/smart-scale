/**
 * Setup › Containers tares the scale while nothing is on it (T2.20, D-096): a container then goes
 * on from 0, so the scale's display shows what the app learns. A plain `01` (reason
 * `setup-tare`), once per spell with nothing on: a scale that doesn't take it (another mode,
 * D-038) isn't asked again until something has been on it. A scale accessory is part of the
 * platform, so the mat on its own is "nothing on".
 */

import { DEFAULT_LIVE_PARAMS, wantsTare } from '../core/live';
import { tare } from '../core/protocol';
import type { Unsubscribe } from '../transport/emitter';
import type { ScaleLink } from './links';

/** The reason Setup's tare is logged with, on its `command-sent`. */
export const SETUP_TARE_REASON = 'setup-tare';

/** Tares the link's scale whenever nothing is on it and it doesn't read 0. Returns the stop. */
export function tareWhileEmpty(
  link: Pick<ScaleLink, 'transport' | 'recorder' | 'shot' | 'vessel'>,
): Unsubscribe {
  let asked = false;
  const check = (): void => {
    if (link.vessel.vessel !== null) {
      asked = false;
      return;
    }
    if (asked || link.transport.status.state !== 'connected') return;
    const display = link.shot.snapshot();
    const check = {
      readingG: display.readingG,
      stable: display.stable,
      vesselOn: false,
      holdsG: 0,
    };
    if (!wantsTare(check, DEFAULT_LIVE_PARAMS.tareZeroG)) return;
    asked = true;
    // A failure is logged as `command-failed`; the next spell with nothing on tries again.
    link.recorder.sendCommand(tare(), SETUP_TARE_REASON).catch(() => {});
  };
  check();
  // After the live views, which listen first: they have taken the frame.
  return link.recorder.onFrame(check);
}
