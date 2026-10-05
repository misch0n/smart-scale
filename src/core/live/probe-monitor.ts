/**
 * What the probe screen shows about the frames and events of the recording in progress (T1.8),
 * beyond the recorder's own stats: the last frames of each characteristic as hex, the spacing
 * of the scale's timer and of arrivals, the weight's spread over short windows, the smallest
 * weight step, and the byte values seen. Each serves a hardware test in docs/hardware-tests.md.
 *
 * Display-only: it never feeds analysis or storage (CLAUDE.md hard rule 3). The recordings
 * themselves hold every frame, so anything shown here can be recomputed from them.
 */

import type { AppEvent, CharacteristicName, Id, RawFrame } from '../model';
import {
  hasTrustedWeight,
  toHex,
  type DecodedFrame,
  type EventFrame,
  type WeightFrame,
} from '../protocol';
import { RecentValues, summarise, TimeWindow, type Summary } from './window-stats';

/** Frames kept per characteristic for the hex log. */
export const PROBE_FRAME_LOG_SIZE = 20;
/** App events kept for the event log. */
export const PROBE_EVENT_LOG_SIZE = 30;
/** How many of the latest gaps the timer and arrival statistics cover. */
export const PROBE_GAP_COUNT = 100;
/** The windows of the weight statistics, ms: 0.5 s and 2 s for A2, 10 s for A11. */
export const PROBE_WEIGHT_WINDOWS_MS: readonly number[] = [500, 2000, 10_000];

export interface ProbeMonitorOptions {
  readonly frameLogSize?: number;
  readonly eventLogSize?: number;
  readonly gapCount?: number;
  readonly weightWindowsMs?: readonly number[];
}

/** A frame in the hex log. */
export interface LoggedFrame {
  readonly seq: number;
  /** Arrival, ms since the recording started. */
  readonly tMs: number;
  /** Spaced upper-case hex, as the docs write bytes. */
  readonly hex: string;
  readonly decoded: DecodedFrame;
}

/**
 * The change of the scale's timer (frame bytes 3–5, the ms field) between consecutive weight
 * frames with a valid checksum (hardware test A1).
 */
export interface TimerGaps {
  /** The gaps where the timer advanced: the scale's sampling interval while it runs. */
  readonly advancing: Summary | null;
  /** How many gaps were 0: the timer wasn't running. */
  readonly still: number;
  /** How many gaps were negative: the timer was reset or restarted. */
  readonly backwards: number;
}

export interface WeightWindow {
  readonly windowMs: number;
  /** Mean and σ of the trusted weights in the window, g; null with none. */
  readonly summary: Summary | null;
}

/** The longest silence between two frames since connect (hardware test B4). */
export interface FrameGap {
  readonly ms: number;
  /** When the frame that ended it arrived, ms since the recording started. */
  readonly endTMs: number;
}

/** The distinct values seen in weight frames, sorted (hardware tests A9, A10, A13). */
export interface ByteValuesSeen {
  readonly unit: readonly number[];
  readonly weightSign: readonly number[];
  readonly flowSign: readonly number[];
  readonly smoothing: readonly number[];
}

export interface ProbeSnapshot {
  /** The recording the figures belong to; null before its first frame or event. */
  readonly recordingId: Id | null;
  readonly counts: { readonly [K in CharacteristicName]: number };
  /** The latest frames of each characteristic, newest first. */
  readonly frames: { readonly [K in CharacteristicName]: readonly LoggedFrame[] };
  readonly timerGaps: TimerGaps;
  /** Gaps between arrivals of consecutive FF11 frames, ms. */
  readonly arrivalGaps: Summary | null;
  readonly longestGap: FrameGap | null;
  readonly weightWindows: readonly WeightWindow[];
  /** The smallest change between consecutive trusted weights, g; null until one changed. */
  readonly smallestWeightStepG: number | null;
  /**
   * Weight frames whose unit or sign byte isn't recognised (D-005, D-014). They are left out
   * of the weight statistics.
   */
  readonly untrustedWeights: number;
  readonly seen: ByteValuesSeen;
  /** The latest `03 0D` event frame, from either characteristic. */
  readonly lastEventFrame: { readonly tMs: number; readonly frame: EventFrame } | null;
  /** The latest app events, newest first. */
  readonly events: readonly AppEvent[];
}

/**
 * Feed it every frame with its decoding (the recorder's `onFrame`) and every app event
 * (`onEvent`). A frame or event of another recording starts the figures afresh.
 */
export class ProbeMonitor {
  readonly #frameLogSize: number;
  readonly #eventLogSize: number;
  readonly #gapCount: number;
  readonly #windowsMs: readonly number[];
  #state: State;

  /** @throws RangeError on a size or window that isn't positive. */
  constructor(options: ProbeMonitorOptions = {}) {
    this.#frameLogSize = positiveInteger(
      'frameLogSize',
      options.frameLogSize,
      PROBE_FRAME_LOG_SIZE,
    );
    this.#eventLogSize = positiveInteger(
      'eventLogSize',
      options.eventLogSize,
      PROBE_EVENT_LOG_SIZE,
    );
    this.#gapCount = positiveInteger('gapCount', options.gapCount, PROBE_GAP_COUNT);
    this.#windowsMs = options.weightWindowsMs ?? PROBE_WEIGHT_WINDOWS_MS;
    this.#state = this.#fresh(null);
  }

  /** Forgets everything, and expects the frames and events of `recordingId` next. */
  reset(recordingId: Id | null = null): void {
    this.#state = this.#fresh(recordingId);
  }

  addFrame(frame: RawFrame, decoded: DecodedFrame): void {
    // The scale's frames only: the microphone's levels (T1.24) have their own display.
    if (frame.source === 'mic') return;
    const state = this.#own(frame.recordingId);
    state.counts[frame.source]++;
    const log = state.frames[frame.source];
    log.push({ seq: frame.seq, tMs: frame.tMs, hex: toHex(frame.bytes), decoded });
    if (log.length > this.#frameLogSize) log.shift();

    if (state.lastFrameTMs !== null) {
      const gap = frame.tMs - state.lastFrameTMs;
      if (state.longestGap === null || gap > state.longestGap.ms) {
        state.longestGap = { ms: gap, endTMs: frame.tMs };
      }
    }
    state.lastFrameTMs = frame.tMs;

    if (frame.source === 'ff11') {
      if (state.lastFf11TMs !== null) state.arrivalGaps.add(frame.tMs - state.lastFf11TMs);
      state.lastFf11TMs = frame.tMs;
    }
    if (decoded.kind === 'weight') this.#addWeight(state, frame.tMs, decoded);
    else if (decoded.kind === 'event') state.lastEventFrame = { tMs: frame.tMs, frame: decoded };
  }

  addEvent(event: AppEvent): void {
    const state = this.#own(event.recordingId);
    state.events.push(event);
    if (state.events.length > this.#eventLogSize) state.events.shift();
  }

  snapshot(): ProbeSnapshot {
    const state = this.#state;
    const timerGaps = state.timerGaps.values();
    return {
      recordingId: state.recordingId,
      counts: { ...state.counts },
      frames: { ff11: [...state.frames.ff11].reverse(), ff12: [...state.frames.ff12].reverse() },
      timerGaps: {
        advancing: summarise(timerGaps.filter((gap) => gap > 0)),
        still: timerGaps.filter((gap) => gap === 0).length,
        backwards: timerGaps.filter((gap) => gap < 0).length,
      },
      arrivalGaps: summarise(state.arrivalGaps.values()),
      longestGap: state.longestGap,
      weightWindows: state.windows.map((window) => ({
        windowMs: window.windowMs,
        summary: window.summary(),
      })),
      smallestWeightStepG:
        state.smallestStepHundredths === null ? null : state.smallestStepHundredths / 100,
      untrustedWeights: state.untrustedWeights,
      seen: {
        unit: sorted(state.seen.unit),
        weightSign: sorted(state.seen.weightSign),
        flowSign: sorted(state.seen.flowSign),
        smoothing: sorted(state.seen.smoothing),
      },
      lastEventFrame: state.lastEventFrame,
      events: [...state.events].reverse(),
    };
  }

  #addWeight(state: State, tMs: number, weight: WeightFrame): void {
    state.seen.unit.add(weight.unitByte);
    state.seen.weightSign.add(weight.weightSignByte);
    state.seen.flowSign.add(weight.flowSignByte);
    state.seen.smoothing.add(weight.flowSmoothing);
    if (state.lastTimerMs !== null) state.timerGaps.add(weight.timerMs - state.lastTimerMs);
    state.lastTimerMs = weight.timerMs;

    if (!hasTrustedWeight(weight)) {
      state.untrustedWeights++;
      return;
    }
    for (const window of state.windows) window.add(tMs, weight.weightG);
    if (state.lastWeightG !== null) {
      // In hundredths, the field's unit, so float noise can't make a step of 0.01 g look smaller.
      const step = Math.round(Math.abs(weight.weightG - state.lastWeightG) * 100);
      if (
        step > 0 &&
        (state.smallestStepHundredths === null || step < state.smallestStepHundredths)
      ) {
        state.smallestStepHundredths = step;
      }
    }
    state.lastWeightG = weight.weightG;
  }

  /** The state for `recordingId`, started afresh if the figures belong to another recording. */
  #own(recordingId: Id): State {
    if (this.#state.recordingId !== recordingId) this.#state = this.#fresh(recordingId);
    return this.#state;
  }

  #fresh(recordingId: Id | null): State {
    return {
      recordingId,
      counts: { ff11: 0, ff12: 0 },
      frames: { ff11: [], ff12: [] },
      lastFrameTMs: null,
      longestGap: null,
      lastFf11TMs: null,
      arrivalGaps: new RecentValues(this.#gapCount),
      lastTimerMs: null,
      timerGaps: new RecentValues(this.#gapCount),
      windows: this.#windowsMs.map((ms) => new TimeWindow(ms)),
      lastWeightG: null,
      smallestStepHundredths: null,
      untrustedWeights: 0,
      seen: { unit: new Set(), weightSign: new Set(), flowSign: new Set(), smoothing: new Set() },
      lastEventFrame: null,
      events: [],
    };
  }
}

interface State {
  readonly recordingId: Id | null;
  readonly counts: { [K in CharacteristicName]: number };
  /** Oldest first. */
  readonly frames: { readonly [K in CharacteristicName]: LoggedFrame[] };
  lastFrameTMs: number | null;
  longestGap: FrameGap | null;
  lastFf11TMs: number | null;
  readonly arrivalGaps: RecentValues;
  lastTimerMs: number | null;
  readonly timerGaps: RecentValues;
  readonly windows: readonly TimeWindow[];
  lastWeightG: number | null;
  smallestStepHundredths: number | null;
  untrustedWeights: number;
  readonly seen: { readonly [K in keyof ByteValuesSeen]: Set<number> };
  lastEventFrame: { readonly tMs: number; readonly frame: EventFrame } | null;
  /** Oldest first. */
  readonly events: AppEvent[];
}

function positiveInteger(name: string, value: number | undefined, fallback: number): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < 1) {
    throw new RangeError(`ProbeMonitor: ${name} ${result} is not a positive integer`);
  }
  return result;
}

function sorted(values: ReadonlySet<number>): number[] {
  return [...values].sort((a, b) => a - b);
}
