/**
 * What is on a link's scale (T2.4; spec v2 "Brew phases": recognition): the vessel the live
 * pipeline saw put on (`VesselMonitor`), matched against the containers as they are now
 * (`matchContainer`). A known one is recognised; when two could be it, or none, the user can pick
 * which it is, for as long as it stays on. Home shows it, the brew records the cup's container
 * with the shot, and the phases will follow it (T2.5).
 *
 * Display-only (hard rule 3): nothing here is stored but the container a shot records.
 */

import { VesselMonitor, type Vessel, type VesselEvent } from '../core/live';
import {
  containerClashes,
  isListed,
  matchContainer,
  type Container,
  type ContainerMatch,
  type Id,
} from '../core/model';
import { Emitter, type Unsubscribe } from '../transport/emitter';
import type { Recorder } from './recorder';

/** The vessel on the scale, and which container it is. */
export interface VesselOnScale {
  readonly vessel: Vessel;
  /** What is in it now, g. */
  readonly contentsG: number | null;
  /** Which containers it could be, by its mass. */
  readonly match: ContainerMatch;
  /** The container the user picked for it, while it is listed; null when none was picked. */
  readonly picked: Container | null;
  /** The container it is: the one picked, else the one it matched; null when unsure. */
  readonly container: Container | null;
  /**
   * The containers within 3 g of the one it matched, whose warning wasn't dismissed: a wet one
   * could pass for it (board Brew-Milk's "Close to …"). Empty for a pick.
   */
  readonly near: readonly Container[];
}

export class LiveVessel {
  readonly #monitor = new VesselMonitor();
  readonly #containers: () => readonly Container[];
  readonly #changes = new Emitter<void>();
  #pickedId: Id | null = null;
  #changedAtMs: number | null = null;

  /**
   * @param containers the containers as they are now: read at every look, so a container
   *   learned or changed in Setup counts at once.
   */
  constructor(
    recorder: Pick<Recorder, 'onFrame' | 'onEvent'>,
    containers: () => readonly Container[],
  ) {
    this.#containers = containers;
    recorder.onFrame(({ frame, decoded }) => this.#take(this.#monitor.addFrame(frame, decoded)));
    recorder.onEvent((event) => this.#take(this.#monitor.addEvent(event)));
  }

  /** The vessel seen put on and still on, with what it weighed; null when none. */
  get vessel(): Vessel | null {
    return this.#monitor.state.vessel;
  }

  /** The vessel on the scale and which container it is; null when none is on. */
  get onScale(): VesselOnScale | null {
    const { vessel, contentsG } = this.#monitor.state;
    if (vessel === null) return null;
    const containers = this.#containers();
    const match = matchContainer(vessel.massG, containers);
    const picked =
      this.#pickedId === null
        ? null
        : (containers.find((c) => c.id === this.#pickedId && isListed(c)) ?? null);
    const container = picked ?? (match.kind === 'known' ? match.container : null);
    const near =
      picked !== null || container === null
        ? []
        : containerClashes(containers)
            .filter(
              (clash) =>
                clash.kind === 'near' &&
                !clash.dismissed &&
                (clash.a.id === container.id || clash.b.id === container.id),
            )
            .map((clash) => (clash.a.id === container.id ? clash.b : clash.a));
    return { vessel, contentsG, match, picked, container, near };
  }

  /**
   * Says which container the vessel on the scale is (null: none picked), until it comes off.
   * Nothing happens without a vessel on.
   */
  pick(containerId: Id | null): void {
    if (this.#monitor.state.vessel === null || containerId === this.#pickedId) return;
    this.#pickedId = containerId;
    this.#changes.emit();
  }

  /** When a vessel last came on, settled or came off, ms on the recording's timeline. */
  get changedAtMs(): number | null {
    return this.#changedAtMs;
  }

  /** Calls `listener` when a vessel comes on, settles or comes off, and on a pick. */
  onChange(listener: () => void): Unsubscribe {
    return this.#changes.on(listener);
  }

  #take(events: readonly VesselEvent[]): void {
    if (events.length === 0) return;
    this.#changedAtMs = events.at(-1)!.tMs;
    // A pick is for the vessel it was made for.
    if (events.some((event) => event.type !== 'vessel-settled')) this.#pickedId = null;
    this.#changes.emit();
  }
}
