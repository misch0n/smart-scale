/**
 * Time and timers for transports and the services above them, injected so tests can run on
 * virtual time. `systemScheduler` is the real thing. `ManualClock` is a test double whose time
 * moves only when the test moves it.
 */

/** Whatever `setTimeout` returns: a number in browsers, an object in Node. */
export type TimerId = unknown;

export interface Scheduler {
  /** A monotonic clock in ms, like `performance.now()`. */
  now(): number;
  setTimeout(callback: () => void, ms: number): TimerId;
  clearTimeout(id: TimerId): void;
}

type GlobalTimerId = ReturnType<typeof globalThis.setTimeout>;

/** `performance.now()` and the global timers. */
export const systemScheduler: Scheduler = {
  now: () => performance.now(),
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as GlobalTimerId),
};

interface ManualTimer {
  readonly id: number;
  readonly dueMs: number;
  readonly callback: () => void;
}

/** A guard against a timer that keeps scheduling another one due at once. */
const MAX_TIMERS_PER_ADVANCE = 1_000_000;

/**
 * A scheduler on virtual time, for tests. Time stands still until `advance()`, which runs each
 * timer at its due time, in order (timers due at the same time run in the order they were set).
 * Callbacks run synchronously inside `advance()`. Promise continuations don't: await between
 * advances when the code under test chains promises.
 */
export class ManualClock implements Scheduler {
  #nowMs: number;
  #timers: ManualTimer[] = [];
  #nextId = 1;

  constructor(startMs = 0) {
    this.#nowMs = startMs;
  }

  now(): number {
    return this.#nowMs;
  }

  setTimeout(callback: () => void, ms: number): number {
    const id = this.#nextId++;
    const dueMs = this.#nowMs + (ms > 0 ? ms : 0); // like browsers: negative or NaN means now
    let i = this.#timers.length;
    while (i > 0 && this.#timers[i - 1].dueMs > dueMs) i--;
    this.#timers.splice(i, 0, { id, dueMs, callback });
    return id;
  }

  clearTimeout(id: TimerId): void {
    this.#timers = this.#timers.filter((timer) => timer.id !== id);
  }

  /** How many timers are waiting. */
  get pendingTimers(): number {
    return this.#timers.length;
  }

  /** Moves time forward by `ms`; see `advanceTo`. */
  advance(ms: number): void {
    this.advanceTo(this.#nowMs + ms);
  }

  /**
   * Moves time forward to `tMs`, running every timer that falls due on the way at its due
   * time, including timers those callbacks set. A callback that throws stops the advance there.
   *
   * @throws RangeError if `tMs` is in the past.
   */
  advanceTo(tMs: number): void {
    if (!(tMs >= this.#nowMs)) {
      throw new RangeError(`ManualClock: can't go from ${this.#nowMs} ms to ${tMs} ms`);
    }
    for (let runs = 0; this.#timers.length > 0 && this.#timers[0].dueMs <= tMs; runs++) {
      if (runs >= MAX_TIMERS_PER_ADVANCE) {
        throw new Error('ManualClock: timers keep setting timers that are due at once');
      }
      const timer = this.#timers.shift()!;
      this.#nowMs = timer.dueMs;
      timer.callback();
    }
    this.#nowMs = tMs;
  }
}
