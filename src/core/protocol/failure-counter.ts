/**
 * Rolling count of frames that failed to decode, for the "most frames are failing" alarm
 * (protocol-notes, finding 6). Spec parsing rule 1 discards bad frames silently, one by one. If
 * some firmware never sends a valid checksum, that rule would silently discard everything, so
 * the recorder and the probe feed every weight-characteristic frame through this counter and
 * show the alarm. The raw bytes are stored either way (D-004).
 */

/** Frames in the window: the recorder's "more than half of the last 50 frames" (T1.6). */
export const FAILURE_WINDOW_FRAMES = 50;

export class RollingFailureCounter {
  /** How many of the most recent frames the counter looks at. */
  readonly windowSize: number;
  readonly #failed: Uint8Array;
  #next = 0;
  #count = 0;
  #failures = 0;

  constructor(windowSize = FAILURE_WINDOW_FRAMES) {
    if (!Number.isInteger(windowSize) || windowSize < 1) {
      throw new RangeError(`RollingFailureCounter: window size ${windowSize} is not >= 1`);
    }
    this.windowSize = windowSize;
    this.#failed = new Uint8Array(windowSize);
  }

  /** Adds one frame. Pass `decodeFrame(bytes).kind === 'invalid'`. */
  record(failed: boolean): void {
    if (this.#count === this.windowSize) this.#failures -= this.#failed[this.#next];
    else this.#count++;
    const flag = failed ? 1 : 0;
    this.#failed[this.#next] = flag;
    this.#failures += flag;
    this.#next = (this.#next + 1) % this.windowSize;
  }

  /** Frames currently in the window: fewer than `windowSize` until it fills. */
  get count(): number {
    return this.#count;
  }

  /** Failed frames currently in the window. */
  get failures(): number {
    return this.#failures;
  }

  /**
   * True when more than half of a full window has failed. The threshold is fixed against the
   * window size rather than the frames seen so far, so two bad frames out of the first three
   * don't raise it.
   */
  get alarm(): boolean {
    return this.#failures * 2 > this.windowSize;
  }

  reset(): void {
    this.#failed.fill(0);
    this.#next = 0;
    this.#count = 0;
    this.#failures = 0;
  }
}
