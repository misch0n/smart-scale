/**
 * What is on the scale (T2.4; spec v2 "Brew phases": the vessel placed is the declaration of
 * intent): a vessel put on, with what it weighed, until it comes off. The app matches its mass
 * against the containers (`matchContainer`), and the brew's phases will follow it (T2.5).
 *
 * - **Put on:** with nothing on, a stable level at least `vesselMinG` above the stable level
 *   before it. Its mass is the difference, so a scale whose zero isn't the empty platform still
 *   weighs what is put on, and the app's tares change nothing (`LiveWeight.grossG`). The scale's
 *   own smoothing brings the reading up over a second or two: for `vesselSettleMs` a stable
 *   level within `vesselSettleG` of the mass is the vessel settling (`vessel-settled`).
 * - **Contents:** while it is on, whatever comes on top is its contents (beans, ground coffee,
 *   the shot, milk). Vessels stacked on it aren't followed.
 * - **Off:** a stable level less than half its mass above the level it was put on from. A lift
 *   is only that: whether the vessel back on is the same one is for the phases to say.
 * - **The scale's own tare button** sends nothing (A7). With a vessel on, the reading drops to 0
 *   as if it were lifted, so it reads as off; lifted and put back, it is seen again.
 * - **Nothing seen put on:** a vessel already on when the recording starts has no mass to go by;
 *   nothing is on until a stable rise.
 *
 * Display-only (hard rule 3): nothing here is stored, and the analysis labels its own segments.
 */

import { isTareCommand, type AppEvent, type Id, type RawFrame } from '../model';
import { hasTrustedWeight, type DecodedFrame } from '../protocol';
import { LiveWeight, type LiveSample } from './live-weight';
import type { LiveParams } from './params';

/** A vessel on the scale, as it was put on. */
export interface Vessel {
  /** What it added as it was put on, in tenths, g. */
  readonly massG: number;
  /** Its first stable reading, ms on the recording's timeline. */
  readonly onMs: number;
  /** The stable level before it, on `LiveWeight`'s `grossG` scale, g. */
  readonly baseG: number;
}

export type VesselEvent =
  | { readonly type: 'vessel-on'; readonly tMs: number; readonly vessel: Vessel }
  /** Its mass, settled a tenth or more since it was put on. */
  | { readonly type: 'vessel-settled'; readonly tMs: number; readonly vessel: Vessel }
  | { readonly type: 'vessel-off'; readonly tMs: number; readonly vessel: Vessel };

export interface VesselState {
  /** The recording the state belongs to; null before its first frame or event. */
  readonly recordingId: Id | null;
  /** The vessel on the scale; null when none was seen put on, or it came off. */
  readonly vessel: Vessel | null;
  /** What is in it now, smoothed, g; null without a vessel. */
  readonly contentsG: number | null;
  /** The weight holds still. */
  readonly stable: boolean;
}

export interface VesselMonitorOptions {
  readonly params?: Partial<LiveParams>;
}

export class VesselMonitor {
  readonly #weight: LiveWeight;
  readonly #p: LiveParams;
  #recordingId: Id | null = null;
  /** With nothing on: the latest stable level, g. */
  #levelG: number | null = null;
  #vessel: Vessel | null = null;
  #last: LiveSample | null = null;

  /** @throws RangeError on an invalid parameter. */
  constructor(options: VesselMonitorOptions = {}) {
    this.#weight = new LiveWeight(options.params);
    this.#p = this.#weight.params;
  }

  get state(): VesselState {
    const vessel = this.#vessel;
    const last = this.#last;
    return {
      recordingId: this.#recordingId,
      vessel,
      contentsG:
        vessel === null || last === null
          ? null
          : Math.max(0, last.smoothG - vessel.baseG - vessel.massG),
      stable: last?.stable ?? false,
    };
  }

  /**
   * Feed it every frame with its decoding (`recorder.onFrame`), in order. A frame of another
   * recording starts everything afresh.
   */
  addFrame(frame: RawFrame, decoded: DecodedFrame): VesselEvent[] {
    if (frame.source === 'mic') return [];
    this.#own(frame.recordingId);
    if (decoded.kind !== 'weight' || !hasTrustedWeight(decoded)) return [];
    const sample = this.#weight.add(frame.tMs, decoded.weightG);
    this.#last = sample;
    return this.#step(sample);
  }

  /** Feed it every app event (`recorder.onEvent`): the log says which tares to expect. */
  addEvent(event: AppEvent): VesselEvent[] {
    this.#own(event.recordingId);
    if (isTareCommand(event)) this.#weight.expectTare(event.tMs);
    return [];
  }

  #own(recordingId: Id): void {
    if (this.#recordingId === recordingId) return;
    this.#recordingId = recordingId;
    this.#weight.reset();
    this.#levelG = null;
    this.#vessel = null;
    this.#last = null;
  }

  #step(s: LiveSample): VesselEvent[] {
    if (s.levelG === null) return [];
    const vessel = this.#vessel;
    if (vessel !== null) {
      if (s.levelG < vessel.baseG + vessel.massG / 2) {
        this.#vessel = null;
        this.#levelG = s.levelG;
        return [{ type: 'vessel-off', tMs: s.tMs, vessel }];
      }
      const massG = tenths(s.levelG - vessel.baseG);
      if (
        s.tMs - vessel.onMs <= this.#p.vesselSettleMs &&
        massG !== vessel.massG &&
        Math.abs(massG - vessel.massG) <= this.#p.vesselSettleG
      ) {
        this.#vessel = { ...vessel, massG };
        return [{ type: 'vessel-settled', tMs: s.tMs, vessel: this.#vessel }];
      }
      return [];
    }
    const before = this.#levelG;
    this.#levelG = s.levelG;
    if (before === null || s.levelG < before + this.#p.vesselMinG) return [];
    const placed: Vessel = { massG: tenths(s.levelG - before), onMs: s.tMs, baseG: before };
    this.#vessel = placed;
    return [{ type: 'vessel-on', tMs: s.tMs, vessel: placed }];
  }
}

/** In tenths, the scale's step. */
function tenths(g: number): number {
  return Math.round(g * 10) / 10;
}
