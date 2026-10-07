// Home's one button for the scale's own timer (T2.27, D-101): Start, then Stop, then Reset, its
// label what it will do. The scale's weight frames carry its timer, so the button reads it: a
// timer that moved in the last half second runs; one stopped above 0 waits for its reset.

import { resetTimer, startTimer, stopTimer, type ScaleCommand } from '../../core/protocol';

export type TimerAction = 'start' | 'stop' | 'reset';

/** A timer that hasn't moved for this long has stopped, ms: frames come every ~100 ms. */
export const TIMER_STILL_MS = 500;

/** The button's label for each action. */
export const TIMER_LABEL: Readonly<Record<TimerAction, string>> = {
  start: 'Start timer',
  stop: 'Stop timer',
  reset: 'Reset timer',
};

/** What the button does, from the timer's reading and whether it runs. */
export function timerAction(timerMs: number, running: boolean): TimerAction {
  if (running) return 'stop';
  return timerMs > 0 ? 'reset' : 'start';
}

/** The whitelisted command for an action: `04`, `05` or `06`. */
export function timerCommand(action: TimerAction): ScaleCommand {
  return action === 'start' ? startTimer() : action === 'stop' ? stopTimer() : resetTimer();
}

/**
 * Whether the scale's timer runs, from its frames as they come: it does while its reading
 * changed within `TIMER_STILL_MS` of the latest frame.
 */
export class TimerWatch {
  #timerMs: number | null = null;
  /** When the reading last changed, on the frames' clock, ms. */
  #changedAtMs: number | null = null;
  #latestMs: number | null = null;

  /** Takes a frame: its time (the recording's) and the timer it carried. */
  observe(tMs: number, timerMs: number): void {
    if (this.#latestMs !== null && tMs <= this.#latestMs) return;
    if (this.#timerMs !== null && timerMs !== this.#timerMs) this.#changedAtMs = tMs;
    this.#timerMs = timerMs;
    this.#latestMs = tMs;
  }

  get running(): boolean {
    const changedAtMs = this.#changedAtMs;
    const latestMs = this.#latestMs;
    return changedAtMs !== null && latestMs !== null && latestMs - changedAtMs <= TIMER_STILL_MS;
  }

  /** The timer's latest reading, ms; null before a frame. */
  get timerMs(): number | null {
    return this.#timerMs;
  }
}
