/**
 * The BLE link and the receiving browser: when each frame the scale sends reaches the app, and
 * whether it arrives intact. Frames arrive in the order they were sent, as BLE notifications
 * do, with non-decreasing arrival times.
 *
 * A frame's arrival is its send time, plus `minLatencyMs`, rounded up to the next connection
 * event, plus any events it misses (a retransmission), plus an exponential delay. A stall holds
 * every frame until it ends, then they arrive together: a burst. Each effect draws from its own
 * random stream with a fixed number of draws per frame, so switching one on doesn't change the
 * others.
 */

import type { CharacteristicName } from '../model';
import type { LinkParams } from './params';
import type { Rng } from './random';

/** How the link damaged a frame. */
export type Corruption = 'bit-flip' | 'truncated';

/** Why a frame never arrived. */
export type LossReason = 'dropped' | 'link-lost';

/** A frame as the scale sent it. */
export interface OutgoingFrame<T> {
  readonly source: CharacteristicName;
  readonly bytes: Uint8Array<ArrayBuffer>;
  /** When the scale sent it, ms on the session timeline. */
  readonly sentMs: number;
  /** Whatever the caller wants back with the frame. */
  readonly tag: T;
}

/** A frame as the app receives it. */
export interface ArrivedFrame<T> extends OutgoingFrame<T> {
  /** The bytes as received: a copy of the sent ones, damaged if `corruption` says so. */
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly tArrival: number;
  readonly corruption: Corruption | null;
}

/** A frame that never arrived. */
export interface LostFrame<T> {
  readonly source: CharacteristicName;
  readonly sentMs: number;
  readonly tag: T;
  readonly reason: LossReason;
}

export class Link<T> {
  readonly #params: LinkParams;
  readonly #dropRng: Rng;
  readonly #damageRng: Rng;
  readonly #delayRng: Rng;
  readonly #stallRng: Rng;
  readonly #retransmitRng: Rng;
  /** Where connection events fall: at `#phaseMs + k × connectionIntervalMs`. */
  readonly #phaseMs: number;
  #queue: ArrivedFrame<T>[] = [];
  #lost: LostFrame<T>[] = [];
  #lastArrivalMs = -Infinity;
  #stallEndMs = -Infinity;
  #cutAtMs: number | null = null;

  constructor(params: LinkParams, rng: Rng) {
    this.#params = params;
    this.#dropRng = rng.fork('drop');
    this.#damageRng = rng.fork('damage');
    this.#delayRng = rng.fork('delay');
    this.#stallRng = rng.fork('stall');
    this.#retransmitRng = rng.fork('retransmit');
    this.#phaseMs = rng.fork('phase').next() * params.connectionIntervalMs;
  }

  /** Frames that never arrived, in the order they were sent. */
  get lost(): readonly LostFrame<T>[] {
    return this.#lost;
  }

  /** Sends one frame. Frames must be sent in time order. */
  send(frame: OutgoingFrame<T>): void {
    const p = this.#params;
    // Every stream takes the same number of draws for every frame (see the module comment).
    const dropDraw = this.#dropRng.next();
    const damageDraw = this.#damageRng.next();
    const positionDraw = this.#damageRng.next();
    const bitDraw = this.#damageRng.next();
    const delayDraw = this.#delayRng.exponential(1);
    const stallDraw = this.#stallRng.next();
    const stallLengthDraw = this.#stallRng.next();
    const retransmitDraw = this.#retransmitRng.next();

    if (dropDraw < p.dropProbability) {
      this.#lose(frame, 'dropped');
      return;
    }

    let bytes = frame.bytes.slice();
    let corruption: Corruption | null = null;
    if (damageDraw < p.corruptProbability && bytes.length > 0) {
      bytes[Math.floor(positionDraw * bytes.length)] ^= 1 << Math.floor(bitDraw * 8);
      corruption = 'bit-flip';
    } else if (damageDraw < p.corruptProbability + p.truncateProbability && bytes.length > 1) {
      bytes = bytes.slice(0, 1 + Math.floor(positionDraw * (bytes.length - 1)));
      corruption = 'truncated';
    }

    const eventMs =
      this.#nextConnectionEvent(frame.sentMs + p.minLatencyMs) +
      this.#missedEvents(retransmitDraw) * p.connectionIntervalMs;
    if (eventMs >= this.#stallEndMs && stallDraw < p.stallProbability) {
      this.#stallEndMs = eventMs + p.stallMinMs + stallLengthDraw * (p.stallMaxMs - p.stallMinMs);
    }
    let arrival = eventMs + delayDraw * p.jitterMeanMs;
    if (eventMs < this.#stallEndMs) arrival = Math.max(arrival, this.#stallEndMs);
    arrival = Math.max(arrival, this.#lastArrivalMs);

    if (this.#cutAtMs !== null && arrival > this.#cutAtMs) {
      this.#lose(frame, 'link-lost');
      return;
    }
    this.#lastArrivalMs = arrival;
    this.#queue.push({ ...frame, bytes, tArrival: arrival, corruption });
  }

  /** Frames that have arrived by `tMs`, in order. Each is returned once. */
  receive(tMs: number): ArrivedFrame<T>[] {
    let n = 0;
    while (n < this.#queue.length && this.#queue[n].tArrival <= tMs) n++;
    return this.#queue.splice(0, n);
  }

  /** When the next frame arrives, or null if none is on the way. */
  nextArrivalMs(): number | null {
    return this.#queue.length > 0 ? this.#queue[0].tArrival : null;
  }

  /**
   * The link died at `tMs`: frames that would arrive after it are lost, and so is everything
   * sent from now on.
   */
  cut(tMs: number): void {
    this.#cutAtMs = tMs;
    // The queue is in arrival order, so the frames to keep are a prefix.
    const kept = this.#queue.filter((frame) => frame.tArrival <= tMs);
    for (const frame of this.#queue.slice(kept.length)) this.#lose(frame, 'link-lost');
    this.#queue = kept;
  }

  #lose(frame: OutgoingFrame<T>, reason: LossReason): void {
    this.#lost.push({ source: frame.source, sentMs: frame.sentMs, tag: frame.tag, reason });
  }

  /** How many connection events a frame misses: P(k or more) = retransmitProbability^k. */
  #missedEvents(draw: number): number {
    const p = this.#params.retransmitProbability;
    if (p === 0 || this.#params.connectionIntervalMs === 0) return 0;
    // 1 − draw is in (0, 1], so the log is finite.
    return Math.floor(Math.log(1 - draw) / Math.log(p));
  }

  #nextConnectionEvent(readyMs: number): number {
    const interval = this.#params.connectionIntervalMs;
    if (interval === 0) return readyMs;
    return this.#phaseMs + Math.ceil((readyMs - this.#phaseMs) / interval) * interval;
  }
}
