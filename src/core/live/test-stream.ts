/**
 * Streams a simulated session through the live pipeline, frame by frame as a transport would
 * deliver it, with the test standing in for the app (test support only): it sends the tare the
 * monitor asks for, logs every command it sends, and makes the user's taps.
 */

import {
  AUTO_TARE_REASON,
  commandEventData,
  MANUAL_START,
  RecordingSequence,
  type AppEvent,
  type Id,
  type RawFrame,
} from '../model';
import { decodeFrame, tareAndStartTimer, type ScaleCommand } from '../protocol';
import { ScaleSimulator, type Scenario, type SessionTruth, type SimFrame } from '../sim';
import type { LiveParams } from './params';
import { ShotMonitor, type ShotMonitorEvent } from './shot-monitor';

/** A recording id for streamed sessions. */
export const STREAM_RECORDING_ID: Id = '01a10000-0000-7000-8000-000000000001';

/** Something the app does at a time on the session timeline. */
export type StreamAction =
  /** The Tare + start tap with the pump: a `manual-start` UI action, then its `07`. */
  | { readonly atMs: number; readonly type: 'tap' }
  /** The user's manual reset of the live view. */
  | { readonly atMs: number; readonly type: 'reset' }
  /** Any other command the app sends, logged with `reason`. */
  | {
      readonly atMs: number;
      readonly type: 'send';
      readonly command: ScaleCommand;
      readonly reason: string;
    };

export interface StreamOptions {
  readonly targetG?: number | null;
  readonly params?: Partial<LiveParams>;
  /** What the app sends for the monitor's `tare`; null sends nothing. Default `07`. */
  readonly tareCommand?: (() => ScaleCommand) | null;
  readonly actions?: readonly StreamAction[];
  /** Called after every frame the monitor has taken. */
  readonly onFrame?: (frame: SimFrame, monitor: ShotMonitor) => void;
}

/** One of the monitor's events, with when it gave it: the arrival of the frame, or the action. */
export interface StreamEvent {
  readonly atMs: number;
  readonly event: ShotMonitorEvent;
}

export interface StreamRun {
  readonly monitor: ShotMonitor;
  readonly events: readonly StreamEvent[];
  /** The app events the test logged as the app: its commands and taps. */
  readonly log: readonly AppEvent[];
  readonly truth: SessionTruth;
  /** Every frame that arrived, in order. */
  readonly frames: readonly SimFrame[];
}

/** Runs `scenario` to its `durationMs`, the frames and the app's actions in time order. */
export function streamLive(scenario: Scenario, options: StreamOptions = {}): StreamRun {
  const simulator = new ScaleSimulator(scenario);
  const monitor = new ShotMonitor({ targetG: options.targetG ?? null, params: options.params });
  const sequence = new RecordingSequence(STREAM_RECORDING_ID);
  const tareCommand = options.tareCommand === undefined ? tareAndStartTimer : options.tareCommand;
  const actions = [...(options.actions ?? [])].sort((a, b) => a.atMs - b.atMs);
  const events: StreamEvent[] = [];
  const log: AppEvent[] = [];
  const frames: SimFrame[] = [];
  const logged = <E extends AppEvent>(event: E): E => {
    log.push(event);
    return event;
  };

  // Commands go out once the simulator has run to the moment they are sent.
  const send = (command: ScaleCommand, reason: string): void => {
    const tMs = simulator.nowMs;
    simulator.write(command.bytes, tMs);
    take(
      tMs,
      monitor.addEvent(
        logged(sequence.event(tMs, 'command-sent', commandEventData(command, reason))),
      ),
    );
  };
  const take = (atMs: number, list: readonly ShotMonitorEvent[]): void => {
    for (const event of list) {
      events.push({ atMs, event });
      if (event.type === 'tare' && tareCommand !== null) send(tareCommand(), AUTO_TARE_REASON);
    }
  };

  let next = 0;
  for (;;) {
    const tMs = Math.min(
      simulator.nextWakeMs() ?? Infinity,
      actions[next]?.atMs ?? Infinity,
      scenario.durationMs,
    );
    for (const frame of simulator.advanceTo(tMs)) {
      frames.push(frame);
      const raw = sequence.frame(frame.tArrival, frame.source, frame.bytes);
      take(frame.tArrival, monitor.addFrame(raw, decodeFrame(frame.bytes)));
      options.onFrame?.(frame, monitor);
    }
    while (next < actions.length && actions[next].atMs <= tMs) {
      const action = actions[next++];
      if (action.type === 'tap') {
        const tap = sequence.event(tMs, 'ui-action', { action: MANUAL_START, detail: null });
        take(tMs, monitor.addEvent(logged(tap)));
        send(tareAndStartTimer(), MANUAL_START);
      } else if (action.type === 'reset') {
        take(tMs, monitor.reset());
      } else {
        send(action.command, action.reason);
      }
    }
    if (tMs >= scenario.durationMs) break;
  }
  return { monitor, events, log, truth: simulator.truth(), frames };
}

/** The events of one type, in order. */
export function eventsOf<K extends ShotMonitorEvent['type']>(
  run: { readonly events: readonly StreamEvent[] },
  type: K,
): (StreamEvent & { readonly event: Extract<ShotMonitorEvent, { type: K }> })[] {
  return run.events.filter(
    (entry): entry is StreamEvent & { readonly event: Extract<ShotMonitorEvent, { type: K }> } =>
      entry.event.type === type,
  );
}

/**
 * Feeds a recording to a monitor as the app would have, frames and events in the order they
 * were recorded (`seq`): real recordings from `fixtures/real/`. Nothing is sent back: the
 * recording holds the commands that were.
 */
export function replayLive(
  frames: readonly RawFrame[],
  appEvents: readonly AppEvent[],
  options: Pick<StreamOptions, 'targetG' | 'params'> & {
    readonly onFrame?: (frame: RawFrame, monitor: ShotMonitor) => void;
  } = {},
): { readonly monitor: ShotMonitor; readonly events: readonly StreamEvent[] } {
  const monitor = new ShotMonitor({ targetG: options.targetG ?? null, params: options.params });
  const records = [
    ...frames.map((frame) => ({ seq: frame.seq, frame, event: null })),
    ...appEvents.map((event) => ({ seq: event.seq, frame: null, event })),
  ].sort((a, b) => a.seq - b.seq);
  const events: StreamEvent[] = [];
  for (const { frame, event } of records) {
    if (frame !== null) {
      for (const out of monitor.addFrame(frame, decodeFrame(frame.bytes))) {
        events.push({ atMs: frame.tMs, event: out });
      }
      options.onFrame?.(frame, monitor);
    } else if (event !== null) {
      for (const out of monitor.addEvent(event)) events.push({ atMs: event.tMs, event: out });
    }
  }
  return { monitor, events };
}
