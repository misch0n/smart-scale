/**
 * The scale-mode check (T1.25; D-057, D-073): whether the scale is in its timer mode, the only
 * one that keeps its timer in step with the app (D-038). There is one per link, made with it and
 * kept, and it runs whichever screen is open.
 *
 * - **On connect**, once the scale is idle (its timer at 0, so stopped, and no cup put on the
 *   scale for the live shot), it sends `04` (reason `mode-check`). If the timer starts within
 *   half a second, it is the timer mode, and `05` and `06` put the timer back. If it doesn't,
 *   the scale isn't in its timer mode, and the screens warn.
 * - **While it isn't known to be the timer mode** (the warning stands, or no check could tell),
 *   it checks again every 5 s while the scale is idle (the user's answer, D-073): the warning
 *   clears within about 5 s of the user switching the mode on the scale. Once it is the timer
 *   mode, it checks no more on this connection.
 * - **It keeps watching** (`ScaleModeMonitor`): the automatic mode's `03 0D` frames, and every
 *   `04` or `07` sent with the timer at 0, a Tare + start tap's or the probe's, tell it too. The
 *   latest evidence decides.
 * - **Never during a shot.** A reconnect while the timer runs sends nothing, since it isn't at
 *   0. A check whose start comes after the Tare + start tap leaves the timer running for the
 *   shot.
 *
 * It sends through the recorder, so every command is logged on the recording. Display-only: the
 * recording goes on whatever the mode, and nothing decided here is stored (hard rule 3).
 */

import {
  modeCheckPutBack,
  modeCheckStart,
  MODE_CHECK_REASON,
  ScaleModeMonitor,
  type ScaleModeEvidence,
  type ScaleModeVerdict,
  type ShotPhase,
} from '../core/live';
import type { Id } from '../core/model';
import type { ScaleCommand } from '../core/protocol';
import { Emitter, type Unsubscribe } from '../transport/emitter';
import type { Recorder } from './recorder';

/** How often to check again while the scale isn't known to be in its timer mode, ms (D-073). */
export const MODE_RECHECK_MS = 5000;

export interface ScaleModeState {
  /**
   * What the scale's frames say of its mode on this connection: `not-timer` is the warning.
   * `unknown` before any evidence, and while not connected.
   */
  readonly verdict: ScaleModeVerdict;
  /** What the verdict rests on, for the probe; null while unknown. */
  readonly evidence: ScaleModeEvidence | null;
  /** A check's `04` is out, and its outcome not known yet. */
  readonly checking: boolean;
  /** The checks sent on this connection. */
  readonly checks: number;
  /** Why the latest check's commands didn't reach the scale, or null. */
  readonly error: string | null;
}

export interface ScaleModeCheckOptions {
  readonly recorder: Pick<Recorder, 'onFrame' | 'onEvent' | 'sendCommand'>;
  /** The link's live shot: no check while a cup is on the scale or a shot is under way. */
  readonly shot: { readonly phase: ShotPhase };
  /** Default `MODE_RECHECK_MS`. */
  readonly recheckMs?: number;
}

const DISCONNECTED: ScaleModeState = {
  verdict: 'unknown',
  evidence: null,
  checking: false,
  checks: 0,
  error: null,
};

export class ScaleModeCheck {
  readonly #recorder: ScaleModeCheckOptions['recorder'];
  readonly #shot: ScaleModeCheckOptions['shot'];
  readonly #recheckMs: number;
  readonly #monitor = new ScaleModeMonitor();
  readonly #changes = new Emitter<ScaleModeState>();
  #recordingId: Id | null = null;
  /** The recording is in progress: from its first record to its `disconnected`. */
  #open = false;
  #checks = 0;
  /** When the latest check was sent, ms on the recording's timeline. */
  #lastCheckTMs: number | null = null;
  /** A check's `04` is on its way to the scale. */
  #sending = false;
  #error: string | null = null;
  #last: ScaleModeState = DISCONNECTED;

  constructor(options: ScaleModeCheckOptions) {
    this.#recorder = options.recorder;
    this.#shot = options.shot;
    this.#recheckMs = options.recheckMs ?? MODE_RECHECK_MS;
    this.#recorder.onFrame(({ frame, decoded }) => {
      if (frame.source === 'mic') return;
      this.#own(frame.recordingId);
      this.#answer(this.#monitor.addFrame(frame, decoded));
      this.#maybeCheck(frame.tMs);
      this.#emitIfChanged();
    });
    this.#recorder.onEvent((event) => {
      this.#own(event.recordingId);
      this.#answer(this.#monitor.addEvent(event));
      if (event.type === 'disconnected') this.#open = false;
      this.#emitIfChanged();
    });
  }

  get state(): ScaleModeState {
    if (!this.#open) return DISCONNECTED;
    const snapshot = this.#monitor.snapshot();
    const awaiting = snapshot.awaiting;
    return {
      verdict: snapshot.verdict,
      evidence: snapshot.evidence,
      checking:
        this.#sending || (awaiting?.reason === MODE_CHECK_REASON && awaiting.verdict === 'pending'),
      checks: this.#checks,
      error: this.#error,
    };
  }

  /** Calls `listener` after every change of `state`. */
  onChange(listener: (state: ScaleModeState) => void): Unsubscribe {
    return this.#changes.on(listener);
  }

  /** Sends what the evidence asks for: the timer put back after the check's own start. */
  #answer(evidence: readonly ScaleModeEvidence[]): void {
    for (const item of evidence) {
      const putBack = modeCheckPutBack(item);
      // A tap or a cup since the check: the timer is the shot's now, or the cup's tare zeroes it.
      if (putBack.length === 0 || this.#shot.phase !== 'idle') continue;
      for (const { command, reason } of putBack) this.#send(command, reason);
    }
  }

  /** Sends the check's `04` when it is due and the scale is idle. */
  #maybeCheck(nowTMs: number): void {
    if (!this.#open || this.#sending) return;
    const { verdict, awaiting, timerMs } = this.#monitor.snapshot();
    if (verdict === 'timer' || awaiting !== null || timerMs !== 0) return;
    if (this.#lastCheckTMs !== null && nowTMs - this.#lastCheckTMs < this.#recheckMs) return;
    if (this.#shot.phase !== 'idle') return;
    this.#lastCheckTMs = nowTMs;
    this.#checks++;
    this.#sending = true;
    const { command, reason } = modeCheckStart();
    const recordingId = this.#recordingId;
    const settled = (error: string | null): void => {
      if (this.#recordingId !== recordingId) return; // a new connection since
      this.#sending = false;
      this.#error = error;
      this.#emitIfChanged();
    };
    this.#recorder.sendCommand(command, reason).then(
      () => settled(null),
      (error: unknown) => settled(errorText(error)),
    );
  }

  #send(command: ScaleCommand, reason: string): void {
    // The recorder logs it: command-sent, or command-failed with the error.
    const recordingId = this.#recordingId;
    this.#recorder.sendCommand(command, reason).catch((error: unknown) => {
      if (this.#recordingId !== recordingId) return;
      this.#error = errorText(error);
      this.#emitIfChanged();
    });
  }

  /** Starts afresh for the first record of another recording: a new connection. */
  #own(recordingId: Id): void {
    if (this.#recordingId === recordingId) return;
    this.#recordingId = recordingId;
    this.#open = true;
    this.#checks = 0;
    this.#lastCheckTMs = null;
    this.#sending = false;
    this.#error = null;
  }

  #emitIfChanged(): void {
    const state = this.state;
    const last = this.#last;
    if (
      state.verdict === last.verdict &&
      state.evidence === last.evidence &&
      state.checking === last.checking &&
      state.checks === last.checks &&
      state.error === last.error
    ) {
      return;
    }
    this.#last = state;
    this.#changes.emit(state);
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
