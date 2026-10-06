/**
 * A link's live shot (T1.17, T1.18): the `ShotMonitor`, fed every frame and app event of the
 * link's recordings from the link's first use, and its events for whoever answers them. The brew
 * flow listens while its screen is open (`BrewFlow`): it answers the tares and "shot done". The
 * probe doesn't, so a cup put on there is never tared behind the user's back (hardware tests).
 *
 * Display-only (CLAUDE.md hard rule 3): nothing here is stored.
 */

import {
  ShotMonitor,
  type ShotDisplay,
  type ShotMonitorEvent,
  type ShotMonitorOptions,
  type ShotPhase,
} from '../core/live';
import { Emitter, type Unsubscribe } from '../transport/emitter';
import type { Recorder } from './recorder';

export class LiveShot {
  readonly #monitor: ShotMonitor;
  readonly #events = new Emitter<ShotMonitorEvent>();

  /** @throws RangeError on an invalid monitor option. */
  constructor(recorder: Pick<Recorder, 'onFrame' | 'onEvent'>, options: ShotMonitorOptions = {}) {
    this.#monitor = new ShotMonitor(options);
    recorder.onFrame(({ frame, decoded }) => this.#emit(this.#monitor.addFrame(frame, decoded)));
    recorder.onEvent((event) => this.#emit(this.#monitor.addEvent(event)));
  }

  /** What the shot screen shows now. */
  snapshot(): ShotDisplay {
    return this.#monitor.snapshot();
  }

  /** The phase now: `snapshot().phase`, without copying the rest. */
  get phase(): ShotPhase {
    return this.#monitor.phase;
  }

  /** Calls `listener` with each of the monitor's events, in order. */
  onEvent(listener: (event: ShotMonitorEvent) => void): Unsubscribe {
    return this.#events.on(listener);
  }

  /**
   * Sets the yield to aim at, g, or null for none.
   *
   * @throws RangeError unless it is null or a finite number above 0.
   */
  setTargetG(targetG: number | null): void {
    this.#monitor.setTargetG(targetG);
  }

  /** The monitor's manual reset: re-arms the tare and tares what is on the scale. */
  reset(): void {
    this.#emit(this.#monitor.reset());
  }

  /** A scale accessory went on (T2.17): it is no cup, and the next one on it gets its tare. */
  platform(): void {
    this.#monitor.platform();
  }

  /** The brew ended (✕): the monitor forgets the shot under way and waits for the next cup. */
  startOver(): void {
    this.#monitor.startOver();
  }

  #emit(events: readonly ShotMonitorEvent[]): void {
    for (const event of events) this.#events.emit(event);
  }
}
