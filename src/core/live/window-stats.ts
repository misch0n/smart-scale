/**
 * Small statistics for live displays: a summary of some numbers, the latest stretch of a signal
 * by time, and the last N values. The probe shows the weight's spread over short windows
 * (hardware tests A2 and A11) and the spacing of frames (A1, B4) with them (T1.8).
 *
 * Display-only, like everything in `src/core/live`: nothing here is stored, and analysis never
 * uses it (CLAUDE.md hard rule 3). Analysis gets its own rolling statistics (T1.10).
 */

export interface Summary {
  readonly count: number;
  readonly mean: number;
  /** Sample standard deviation (divides by n − 1); 0 for a single value. */
  readonly sd: number;
  readonly min: number;
  readonly max: number;
}

/** Count, mean, σ, min and max of `values`, or null when there are none. Two passes, for accuracy. */
export function summarise(values: readonly number[]): Summary | null {
  const count = values.length;
  if (count === 0) return null;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    sum += value;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const mean = sum / count;
  let squares = 0;
  for (const value of values) squares += (value - mean) ** 2;
  return { count, mean, sd: count > 1 ? Math.sqrt(squares / (count - 1)) : 0, min, max };
}

/**
 * The samples of a signal that lie within `windowMs` of the newest one: those with a time after
 * `newest − windowMs`. Over 0.5 s at 10 Hz that is 5 samples. The window follows the newest
 * sample, not the clock, so it holds its last contents when samples stop.
 */
export class TimeWindow {
  readonly windowMs: number;
  #times: number[] = [];
  #values: number[] = [];
  /** Index of the oldest sample still in the window. */
  #head = 0;

  /** @throws RangeError unless `windowMs` is a positive number. */
  constructor(windowMs: number) {
    if (!(windowMs > 0) || !Number.isFinite(windowMs)) {
      throw new RangeError(`TimeWindow: window ${windowMs} ms is not a positive number`);
    }
    this.windowMs = windowMs;
  }

  /**
   * Adds a sample. Times should not decrease (a transport delivers frames in order, D-020). One
   * that does is kept, and doesn't move the window back: the scan from the oldest sample stops
   * at the newest one, which is still in the window.
   */
  add(tMs: number, value: number): void {
    this.#times.push(tMs);
    this.#values.push(value);
    const from = tMs - this.windowMs;
    while (this.#head < this.#times.length && this.#times[this.#head] <= from) this.#head++;
    // Drop the samples that left the window once they are the larger part of the arrays.
    if (this.#head > 64 && this.#head * 2 > this.#times.length) {
      this.#times = this.#times.slice(this.#head);
      this.#values = this.#values.slice(this.#head);
      this.#head = 0;
    }
  }

  /** The values in the window, oldest first. */
  values(): number[] {
    return this.#values.slice(this.#head);
  }

  summary(): Summary | null {
    return summarise(this.values());
  }

  clear(): void {
    this.#times = [];
    this.#values = [];
    this.#head = 0;
  }
}

/** The last `capacity` values added. */
export class RecentValues {
  readonly capacity: number;
  readonly #ring: number[] = [];
  #next = 0;

  /** @throws RangeError unless `capacity` is a positive integer. */
  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`RecentValues: capacity ${capacity} is not a positive integer`);
    }
    this.capacity = capacity;
  }

  add(value: number): void {
    if (this.#ring.length < this.capacity) this.#ring.push(value);
    else this.#ring[this.#next] = value;
    this.#next = (this.#next + 1) % this.capacity;
  }

  /** The values, oldest first. */
  values(): number[] {
    if (this.#ring.length < this.capacity) return this.#ring.slice();
    return [...this.#ring.slice(this.#next), ...this.#ring.slice(0, this.#next)];
  }

  get count(): number {
    return this.#ring.length;
  }

  clear(): void {
    this.#ring.length = 0;
    this.#next = 0;
  }
}
