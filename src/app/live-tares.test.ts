/**
 * The live views and the app's own tares (T2.19): the scale's reading of a tare can arrive
 * before its `command-sent` is logged (session 4's `07`). The live shot and the vessel monitor
 * take the step for the app's tare from when it is sent (`Recorder.onSending`), or for a `07`
 * from the Start tap logged before it.
 */

import { describe, expect, it } from 'vitest';
import { STREAM_RECORDING_ID } from '../core/live/test-stream';
import {
  commandEventData,
  MANUAL_START,
  RecordingSequence,
  type AppEvent,
  type RawFrame,
} from '../core/model';
import {
  decodeFrame,
  encodeWeightFrame,
  tare,
  tareAndStartTimer,
  type DecodedFrame,
  type ScaleCommand,
} from '../core/protocol';
import { Emitter } from '../transport/emitter';
import { LiveShot } from './live-shot';
import { LiveVessel } from './live-vessel';
import type { SendingCommand } from './recorder';

/** A recorder's three streams, fed by the test at 10 readings a second. */
function feed({ hook = true } = {}) {
  const frames = new Emitter<{ frame: RawFrame; decoded: DecodedFrame }>();
  const events = new Emitter<AppEvent>();
  const sending = new Emitter<SendingCommand>();
  const sequence = new RecordingSequence(STREAM_RECORDING_ID);
  let tMs = 0;
  return {
    recorder: {
      onFrame: frames.on.bind(frames),
      onEvent: events.on.bind(events),
      ...(hook ? { onSending: sending.on.bind(sending) } : {}),
    },
    /** Readings of `g` for `ms`. */
    hold(g: number, ms: number) {
      for (const end = tMs + ms; tMs < end; tMs += 100) {
        const bytes = encodeWeightFrame({ timerMs: 0, weightG: g });
        frames.emit({ frame: sequence.frame(tMs, 'ff11', bytes), decoded: decodeFrame(bytes) });
      }
    },
    send(command: ScaleCommand) {
      sending.emit({ command, tMs });
    },
    logTap() {
      events.emit(sequence.event(tMs, 'ui-action', { action: MANUAL_START, detail: null }));
    },
    logSent(command: ScaleCommand, reason: string) {
      events.emit(sequence.event(tMs, 'command-sent', commandEventData(command, reason)));
    },
  };
}

describe('the live views and the app’s own tares (T2.19)', () => {
  it('take a tare whose reading comes before it is logged for the app’s, from when it is sent', () => {
    const scale = feed();
    const vessel = new LiveVessel(scale.recorder, () => []);
    scale.hold(0, 2000);
    scale.hold(110, 4000);
    expect(vessel.onScale).toMatchObject({ vessel: { massG: 110 }, contentsG: 0 });
    scale.send(tare());
    scale.hold(0, 300);
    scale.logSent(tare(), 'auto-tare');
    scale.hold(0, 2000);
    // The cup is still on, holding nothing: the step was the tare, not the cup lifted.
    expect(vessel.onScale).toMatchObject({ vessel: { massG: 110 }, contentsG: 0 });

    // Without the hook, the same readings look like the cup lifted.
    const unhooked = feed({ hook: false });
    const blind = new LiveVessel(unhooked.recorder, () => []);
    unhooked.hold(0, 2000);
    unhooked.hold(110, 4000);
    unhooked.hold(0, 300);
    unhooked.logSent(tare(), 'auto-tare');
    unhooked.hold(0, 2000);
    expect(blind.onScale).toBeNull();
  });

  it('take Start’s 07 for the app’s from the tap, so the shot reads from the cup', () => {
    const scale = feed({ hook: false });
    const shot = new LiveShot(scale.recorder);
    const vessel = new LiveVessel(scale.recorder, () => []);
    scale.hold(0, 2000);
    // A cup at 128 g on the scale, which wasn't tared (a quick swap, session 4).
    scale.hold(128, 4000);
    scale.logTap();
    scale.hold(0, 200);
    scale.logSent(tareAndStartTimer(), MANUAL_START);
    scale.hold(0, 1000);
    expect(shot.snapshot()).toMatchObject({ phase: 'running' });
    expect(Math.abs(shot.snapshot().netG!)).toBeLessThan(0.2);
    expect(vessel.onScale).toMatchObject({ vessel: { massG: 128 }, contentsG: 0 });
  });
});
