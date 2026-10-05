/**
 * The scale's mode, read off what it sends (T1.25; D-038, D-057, D-073). Only the timer mode
 * keeps the scale's timer in step with the app. The scale doesn't report its mode, but the wrong
 * one shows:
 *
 * - **A start that doesn't come.** A `04` or `07` sent with the timer at 0 starts it within half
 *   a second in the timer mode, and never in the others: the flow-rate mode has no timer, and
 *   the automatic mode ignores both between its runs (hardware session 1). `timerStartVerdict`
 *   reads the frames after one. The app's check on connect sends a `04` for it
 *   (`src/app/scale-mode.ts`); the Tare + start tap and the probe's buttons count as well.
 * - **`03 0D` frames.** Only the automatic mode sends them, on FF12, as its runs start and end
 *   (session 1).
 *
 * Two things prove nothing. A timer that starts with no command from the app: the scale has a
 * timer key, which the user may press (D-073). And a `07` sent while the timer runs, or stands
 * at a shot's time (D-066): it can't start a timer that isn't at 0.
 *
 * The latest evidence decides, so the verdict follows the user switching modes: once a start
 * comes, it is the timer mode again. Display-only (hard rule 3): nothing here is stored, and the
 * analysis doesn't depend on the mode (D-038).
 */

import type { AppEvent, Id, RawFrame } from '../model';
import {
  resetTimer,
  startTimer,
  stopTimer,
  type CommandName,
  type DecodedFrame,
  type EventState,
} from '../protocol';
import type { ScaleCommandToSend } from './scale-commands';

/** The reason the mode check's commands are logged with (D-057). */
export const MODE_CHECK_REASON = 'mode-check';

/**
 * In the timer mode, the timer starts within this of a `04` or `07` sent with it at 0, ms
 * (D-057). Session 1's first ticking frame arrived 0.14–0.21 s after the command was logged.
 */
export const TIMER_START_WINDOW_MS = 500; // PROVISIONAL(U1.1: T1.25 check)
/**
 * Before saying a start didn't come, this many weight frames must have arrived since the
 * command: the scale's samples in the window. A stall holds frames back and then delivers them
 * in a burst (B8), so the time alone could pass before they show anything.
 */
export const TIMER_START_MIN_FRAMES = 5;
/**
 * A start later than the window, but within this of the command, is still the command's: frames
 * held back 0.5–0.7 s by a stall (B8). A later one isn't: it may be the scale's timer key.
 */
export const TIMER_START_LATE_MS = 1500; // PROVISIONAL(U1.1: T1.25 check)

/** The commands that start the timer from 0 in the timer mode: `04` and `07`. */
export type TimerStartCommand = Extract<CommandName, 'startTimer' | 'tareAndStartTimer'>;

const START_COMMANDS: ReadonlySet<CommandName> = new Set(['startTimer', 'tareAndStartTimer']);

/** The commands that act on the timer: a start awaited can't be told apart from what they do. */
const TIMER_COMMANDS: ReadonlySet<CommandName> = new Set([
  'startTimer',
  'stopTimer',
  'resetTimer',
  'tareAndStartTimer',
]);

/** A weight frame's timer, as it arrived. */
export interface TimerReading {
  /** Arrival, ms on the recording's timeline. */
  readonly tMs: number;
  /** The timer field, ms. */
  readonly timerMs: number;
}

/** What the frames after a start command say. */
export type TimerStartVerdict =
  /** The timer started: the timer mode. */
  | 'started'
  /** It didn't within the window: not the timer mode. */
  | 'not-started'
  /** Too soon to say: too few frames, or too little time. */
  | 'unknown';

/**
 * Whether a `04` or `07`, logged as sent at `sentTMs` with the timer at 0, started the timer.
 * `readings` are the weight frames that arrived after it, in order. A timer above 0 in one that
 * arrived within `TIMER_START_LATE_MS` is the start. Without one, the timer didn't start once
 * `TIMER_START_MIN_FRAMES` have arrived, the latest at least `TIMER_START_WINDOW_MS` after the
 * command; before that, it is too soon to say.
 */
export function timerStartVerdict(
  sentTMs: number,
  readings: readonly TimerReading[],
): TimerStartVerdict {
  for (const reading of readings) {
    if (reading.tMs - sentTMs > TIMER_START_LATE_MS) break;
    if (reading.timerMs > 0) return 'started';
  }
  const last = readings.at(-1);
  return readings.length >= TIMER_START_MIN_FRAMES &&
    last !== undefined &&
    last.tMs - sentTMs >= TIMER_START_WINDOW_MS
    ? 'not-started'
    : 'unknown';
}

/**
 * The mode check's command: a `04`, sent with the timer at 0 while no shot is under way. Its
 * start shows the timer mode (D-057).
 */
export function modeCheckStart(): ScaleCommandToSend {
  return { command: startTimer(), reason: MODE_CHECK_REASON };
}

/**
 * What to send once `evidence` comes in: when it says the mode check's own `04` started the
 * timer, a stop and a reset (`05`, `06`), which put it back at 0. Nothing otherwise: a check
 * whose timer didn't start has nothing to put back.
 */
export function modeCheckPutBack(evidence: ScaleModeEvidence): ScaleCommandToSend[] {
  if (
    evidence.kind !== 'started' ||
    evidence.command !== 'startTimer' ||
    evidence.reason !== MODE_CHECK_REASON
  ) {
    return [];
  }
  return [
    { command: stopTimer(), reason: MODE_CHECK_REASON },
    { command: resetTimer(), reason: MODE_CHECK_REASON },
  ];
}

/** A start command, as the log has it. */
export interface StartCommandSent {
  readonly command: TimerStartCommand;
  /** The reason it was logged with, like `mode-check` or `manual-start`. */
  readonly reason: string | null;
  /** When it was logged as sent, ms on the recording's timeline. */
  readonly sentTMs: number;
}

/** What the monitor has learnt of the scale's mode, as it comes. */
export type ScaleModeEvidence =
  /** A `04` or `07` sent with the timer at 0 started it: the timer mode. */
  | (StartCommandSent & {
      readonly kind: 'started';
      /** When the start showed: the arrival of the frame, ms. */
      readonly tMs: number;
    })
  /** One didn't start it within the window: not the timer mode. */
  | (StartCommandSent & {
      readonly kind: 'not-started';
      /** When that was clear: the arrival of the frame, ms. */
      readonly tMs: number;
    })
  /** An `03 0D` frame: the automatic mode's run started or ended. */
  | {
      readonly kind: 'scale-event';
      /** Its arrival, ms. */
      readonly tMs: number;
      /** `started` or `stopped` on the Mini (S1); null for a state the decoder doesn't know. */
      readonly state: EventState | null;
    };

/** The scale's mode by the latest evidence: `unknown` before any. */
export type ScaleModeVerdict = 'unknown' | 'timer' | 'not-timer';

/** A start command whose start is awaited. */
export interface AwaitedStart extends StartCommandSent {
  /**
   * `pending` within the window; `not-started` after it, while a late start could still come
   * (`TIMER_START_LATE_MS`).
   */
  readonly verdict: 'pending' | 'not-started';
}

export interface ScaleModeSnapshot {
  /** The recording the figures belong to; null before its first frame or event. */
  readonly recordingId: Id | null;
  readonly verdict: ScaleModeVerdict;
  /** The evidence the verdict rests on; null while unknown. */
  readonly evidence: ScaleModeEvidence | null;
  /** The latest weight frame's timer, ms; null before one. A running timer never reads 0. */
  readonly timerMs: number | null;
  /** The start command awaited, or null. */
  readonly awaiting: AwaitedStart | null;
}

interface Awaiting extends StartCommandSent {
  readonly readings: TimerReading[];
  verdict: AwaitedStart['verdict'];
}

/**
 * Reads the scale's mode off the frames and the log of a recording in progress: feed it every
 * frame with its decoding (`recorder.onFrame`) and every app event (`recorder.onEvent`), in
 * order. A frame or event of another recording starts it afresh.
 */
export class ScaleModeMonitor {
  #recordingId: Id | null = null;
  #timerMs: number | null = null;
  #evidence: ScaleModeEvidence | null = null;
  #awaiting: Awaiting | null = null;

  /** Takes a frame; returns the evidence it gives, if any. */
  addFrame(frame: RawFrame, decoded: DecodedFrame): ScaleModeEvidence[] {
    if (frame.source === 'mic') return [];
    this.#own(frame.recordingId);
    if (decoded.kind === 'event') {
      // The automatic mode's own run: a start awaited is moot, and the next start is the run's.
      // Its timer has just started or stopped, and the weight frame that shows it comes next:
      // until then nothing says where it is, so no command sent meanwhile can await a start.
      this.#awaiting = null;
      this.#timerMs = null;
      return [this.#found({ kind: 'scale-event', tMs: frame.tMs, state: decoded.state })];
    }
    if (decoded.kind !== 'weight') return [];
    this.#timerMs = decoded.timerMs;
    const awaiting = this.#awaiting;
    if (awaiting === null) return [];
    awaiting.readings.push({ tMs: frame.tMs, timerMs: decoded.timerMs });
    const { command, reason, sentTMs } = awaiting;
    switch (timerStartVerdict(sentTMs, awaiting.readings)) {
      case 'started':
        this.#awaiting = null;
        return [this.#found({ kind: 'started', tMs: frame.tMs, command, reason, sentTMs })];
      case 'not-started': {
        // It stays awaited until a late start can't come any more.
        if (frame.tMs - sentTMs > TIMER_START_LATE_MS) this.#awaiting = null;
        if (awaiting.verdict === 'not-started') return [];
        awaiting.verdict = 'not-started';
        return [this.#found({ kind: 'not-started', tMs: frame.tMs, command, reason, sentTMs })];
      }
      case 'unknown':
        return [];
    }
  }

  /** Takes an app event: the commands sent say which start to await. */
  addEvent(event: AppEvent): ScaleModeEvidence[] {
    this.#own(event.recordingId);
    if (event.type !== 'command-sent' || !TIMER_COMMANDS.has(event.data.command)) return [];
    // A start awaited can't be told apart from what this one does.
    this.#awaiting = null;
    const { command, reason } = event.data;
    if (START_COMMANDS.has(command) && this.#timerMs === 0) {
      this.#awaiting = {
        command: command as TimerStartCommand,
        reason,
        sentTMs: event.tMs,
        readings: [],
        verdict: 'pending',
      };
    }
    return [];
  }

  snapshot(): ScaleModeSnapshot {
    const awaiting = this.#awaiting;
    const evidence = this.#evidence;
    return {
      recordingId: this.#recordingId,
      verdict: evidence === null ? 'unknown' : evidence.kind === 'started' ? 'timer' : 'not-timer',
      evidence,
      timerMs: this.#timerMs,
      awaiting:
        awaiting === null
          ? null
          : {
              command: awaiting.command,
              reason: awaiting.reason,
              sentTMs: awaiting.sentTMs,
              verdict: awaiting.verdict,
            },
    };
  }

  #found(evidence: ScaleModeEvidence): ScaleModeEvidence {
    this.#evidence = evidence;
    return evidence;
  }

  /** Starts afresh for a frame or event of another recording. */
  #own(recordingId: Id): void {
    if (this.#recordingId === recordingId) return;
    this.#recordingId = recordingId;
    this.#timerMs = null;
    this.#evidence = null;
    this.#awaiting = null;
  }
}
