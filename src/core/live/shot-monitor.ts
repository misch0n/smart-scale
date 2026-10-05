/**
 * The shot's live display (T1.17): the extraction as it happens, for the screen that is read
 * from about a metre away (spec v2 "Live display"). It reads every frame and app event of the
 * recording in progress (the recorder's `onFrame` and `onEvent`), says what to show, and says
 * when the app should act.
 *
 *     idle ── a vessel put on, stable ──▶ ready ── the Tare + start tap ──▶ running
 *     running ── the flow falls away ──▶ tail ── the weight holds still ──▶ done
 *     running or tail, after the first drip ── the cup lifted ──▶ done, then idle
 *
 * - **The arm-once tare** (spec "Tare arming"). Entering `ready` asks for a tare (a `tare`
 *   event, which the app answers with `scaleCommandsFor`: a plain tare, D-066) and disarms.
 *   Only the cup's removal or `reset()` re-arms it, so the tail settling never zeroes the
 *   display. The net weight is measured from the cup's own level, so it reads right whether or
 *   not the scale took the tare (D-038: in another mode it doesn't).
 * - **The pump start** is the Tare + start tap (Q4, D-048), read off the log (`isManualStart`),
 *   so the display and the analysis count the same taps; T3.1's microphone will add its own.
 *   Nothing else starts a shot: the cup can wait on the scale, and beans poured or ground into a
 *   cup look like a pour too (spec v2 "Brew phases"; hardware session 2). While `ready`, the net
 *   weight and the progress towards the target still show.
 * - **The first drip**: two readings running at least `dripG` above the level before them.
 * - **The tail** (the live pump_off): once `minPourG` has poured, the flow falls below a share of
 *   the pour's fastest. Then **shot done** once the weight holds still, or once the cup comes
 *   off: the app opens the shot card and runs the analysis (T1.18).
 * - **A lift is a pause** (spec v2 "Brew phases"): a cup lifted after its shot and put back at
 *   the level it left is the same cup, so no tare and the shot stays.
 * - **The display:** the net weight, the flow, remaining to target with the over-target warning
 *   (`pourProgress`), the times, and a series of weight and flow from the pump start for the
 *   graph, with the first drip.
 *
 * Display-only (hard rule 3): nothing here is stored, and if it misfires the recording is
 * untouched and the analysis reads the shot right anyway.
 */

import { isManualStart, isTareCommand, type AppEvent, type Id, type RawFrame } from '../model';
import { hasTrustedWeight, type DecodedFrame } from '../protocol';
import { LiveWeight, type LiveSample } from './live-weight';
import type { LiveParams } from './params';
import { pourProgress, type PourProgress } from './pour';
import { pourEndMs, type PourReading } from './pour-end';

export type ShotPhase = 'idle' | 'ready' | 'running' | 'tail' | 'done';

/** Why a shot is done: its tail settled, or its cup came off first. */
export type ShotDoneReason = 'settled' | 'cup-removed';

/**
 * What the monitor tells the app, each with its time on the recording's timeline: the moment
 * it was decided, or for `first-drip` and `pump-off` the moment it estimates. `scaleCommandsFor`
 * says what to send the scale for each (D-066).
 * - `tare`: tare the scale now.
 * - `shot-done`: open the shot card and run the analysis. Once per shot.
 * - `pump-lapsed`: a tap with no liquid within `maxPreInfusionMs` wasn't the pump; the view is
 *   back to waiting, quietly (D-049).
 * - The rest say what changed: a vessel on (`cup-on`), the tap (`pump-on`), the first drip, the
 *   flow falling away (`pump-off`; again if it was only a dip), the cup off, and the same cup
 *   back after its shot.
 */
export type ShotMonitorEvent =
  | { readonly type: 'cup-on'; readonly tMs: number }
  | { readonly type: 'tare'; readonly tMs: number }
  | { readonly type: 'pump-on'; readonly tMs: number }
  | { readonly type: 'first-drip'; readonly tMs: number }
  | { readonly type: 'pump-off'; readonly tMs: number }
  | { readonly type: 'shot-done'; readonly tMs: number; readonly reason: ShotDoneReason }
  | { readonly type: 'pump-lapsed'; readonly tMs: number }
  | { readonly type: 'cup-off'; readonly tMs: number }
  | { readonly type: 'cup-back'; readonly tMs: number };

/** A point of the live graph. */
export interface ShotPoint {
  readonly tMs: number;
  /** In the cup, as the display shows it, g. */
  readonly netG: number;
  readonly flowGps: number | null;
}

/** What the shot screen shows. */
export interface ShotDisplay {
  /** The recording the figures belong to; null before its first frame or event. */
  readonly recordingId: Id | null;
  readonly phase: ShotPhase;
  /** The latest reading's time, ms on the recording's timeline; null before the first. */
  readonly tMs: number | null;
  /** The scale's latest trusted reading, g. */
  readonly readingG: number | null;
  /** In the cup since its level (the tare), smoothed; null while idle, g. */
  readonly netG: number | null;
  readonly flowGps: number | null;
  readonly stable: boolean;
  /** The tare fires on the next vessel put on. */
  readonly tareArmed: boolean;
  readonly targetG: number | null;
  /** Towards the target: null while idle or without a target. */
  readonly progress: PourProgress | null;
  /** The Tare + start tap; null before it. */
  readonly pumpOnMs: number | null;
  readonly firstDripMs: number | null;
  /** When the flow fell away: the live pump_off, an estimate for the display. */
  readonly pumpOffMs: number | null;
  readonly doneMs: number | null;
  readonly doneReason: ShotDoneReason | null;
  /** From the pump start to now, or to done, ms. */
  readonly elapsedMs: number | null;
  /** Weight and flow from the pump start, oldest first. */
  readonly series: readonly ShotPoint[];
  /** Weight frames refused: not grams, or a sign byte not known (D-005, D-014). */
  readonly refusedFrames: number;
}

export interface ShotMonitorOptions {
  readonly params?: Partial<LiveParams>;
  /** The yield to aim at, g (`yieldTargetG`); null for none. Default null. */
  readonly targetG?: number | null;
}

/** The vessel the net weight is measured from. */
interface Cup {
  /** Its level, on the live signal's `grossG` scale, g. */
  levelG: number;
  /** What it added when it was put on; 0 when not seen, g. */
  readonly massG: number;
}

interface Shot {
  readonly pumpOnMs: number;
  /** The tap came with a cup on the scale (`ready`, `done`), not before one was seen (`idle`). */
  readonly cupSeen: boolean;
  firstDripMs: number | null;
  pumpOffMs: number | null;
  doneMs: number | null;
  doneReason: ShotDoneReason | null;
  /** The level before the first drip, net, g. */
  baselineG: number;
  /** The tap came while the weight moved: the first stable reading sets the cup's level. */
  rezero: boolean;
  peakFlowGps: number;
  /** The latest undisturbed readings after the first drip, for when the pour ended. */
  readonly pour: PourReading[];
  readonly series: ShotPoint[];
}

export class ShotMonitor {
  readonly #weight: LiveWeight;
  readonly #p: LiveParams;
  #targetG: number | null;
  #recordingId: Id | null = null;
  #refused = 0;
  #phase: ShotPhase = 'idle';
  #armed = true;
  /** After `reset()`, the tare fires on the first stable reading. */
  #tareOnStable = false;
  /** While idle: the platform's level, g. */
  #idleLevelG: number | null = null;
  #cup: Cup | null = null;
  #shot: Shot | null = null;
  /** A cup lifted after its shot, with the level it left at: put back there, it's the same. */
  #lifted: { readonly levelG: number; readonly cup: Cup; readonly shot: Shot } | null = null;
  #previous: LiveSample | null = null;
  /** The weight just before the latest disturbance began: where a lifted cup left from, g. */
  #beforeDisturbanceG: number | null = null;

  /** @throws RangeError on an invalid parameter or target. */
  constructor(options: ShotMonitorOptions = {}) {
    this.#weight = new LiveWeight(options.params);
    this.#p = this.#weight.params;
    this.#targetG = checkedTarget(options.targetG ?? null);
  }

  get params(): LiveParams {
    return this.#p;
  }

  /**
   * Sets the yield to aim at, g, or null for none. It can change at any time, as the recipe or
   * the dose does.
   *
   * @throws RangeError unless it is null or a finite number above 0.
   */
  setTargetG(targetG: number | null): void {
    this.#targetG = checkedTarget(targetG);
  }

  /**
   * Feed it every frame with its decoding (`recorder.onFrame`), in order. A frame of another
   * recording starts everything afresh.
   */
  addFrame(frame: RawFrame, decoded: DecodedFrame): ShotMonitorEvent[] {
    if (frame.source === 'mic') return [];
    this.#own(frame.recordingId);
    if (decoded.kind !== 'weight') return [];
    if (!hasTrustedWeight(decoded)) {
      this.#refused++;
      return [];
    }
    return this.#step(this.#weight.add(frame.tMs, decoded.weightG));
  }

  /**
   * Feed it every app event (`recorder.onEvent`): the log says which tares to expect and when
   * the pump started. An event of another recording starts everything afresh.
   */
  addEvent(event: AppEvent): ShotMonitorEvent[] {
    this.#own(event.recordingId);
    if (isTareCommand(event)) this.#weight.expectTare(event.tMs);
    return isManualStart(event) ? this.#manualStart(event.tMs) : [];
  }

  /**
   * A manual reset: forget the shot, re-arm the tare and start over with what is on the scale
   * as the cup. The tare fires at once if the weight is stable, else as soon as it is.
   */
  reset(): ShotMonitorEvent[] {
    const events: ShotMonitorEvent[] = [];
    const last = this.#weight.last;
    this.#shot = null;
    this.#lifted = null;
    this.#armed = true;
    this.#phase = 'ready';
    this.#cup = { levelG: last?.smoothG ?? 0, massG: 0 };
    this.#tareOnStable = true;
    if (last !== null && last.levelG !== null) this.#tareNow(last.tMs, last.levelG, events);
    return events;
  }

  snapshot(): ShotDisplay {
    const last = this.#weight.last;
    const cup = this.#cup;
    const shot = this.#shot;
    const netG = last !== null && cup !== null ? last.smoothG - cup.levelG : null;
    const endMs = shot?.doneMs ?? last?.tMs ?? null;
    return {
      recordingId: this.#recordingId,
      phase: this.#phase,
      tMs: last?.tMs ?? null,
      readingG: last?.readingG ?? null,
      netG,
      flowGps: last?.flowGps ?? null,
      stable: last?.stable ?? false,
      tareArmed: this.#armed,
      targetG: this.#targetG,
      progress:
        netG === null || this.#targetG === null
          ? null
          : pourProgress(netG, this.#targetG, this.#p.overMarginG),
      pumpOnMs: shot?.pumpOnMs ?? null,
      firstDripMs: shot?.firstDripMs ?? null,
      pumpOffMs: shot?.pumpOffMs ?? null,
      doneMs: shot?.doneMs ?? null,
      doneReason: shot?.doneReason ?? null,
      elapsedMs: shot === null || endMs === null ? null : Math.max(0, endMs - shot.pumpOnMs),
      series: shot === null ? [] : [...shot.series],
      refusedFrames: this.#refused,
    };
  }

  /** Starts afresh for a frame or event of another recording. */
  #own(recordingId: Id): void {
    if (this.#recordingId === recordingId) return;
    this.#recordingId = recordingId;
    this.#weight.reset();
    this.#refused = 0;
    this.#phase = 'idle';
    this.#armed = true;
    this.#tareOnStable = false;
    this.#idleLevelG = null;
    this.#cup = null;
    this.#shot = null;
    this.#lifted = null;
    this.#previous = null;
    this.#beforeDisturbanceG = null;
  }

  #step(s: LiveSample): ShotMonitorEvent[] {
    const events: ShotMonitorEvent[] = [];
    const pouringBefore = this.#pouring();
    const previous = this.#previous;
    if (s.jump && previous !== null && !previous.disturbed) {
      this.#beforeDisturbanceG = previous.grossG;
    }
    switch (this.#phase) {
      case 'idle':
        this.#whileIdle(s, events);
        break;
      case 'ready':
        this.#whileReady(s, events);
        break;
      case 'running':
      case 'tail':
        this.#whilePouring(s, events);
        break;
      case 'done':
        this.#whileDone(s, events);
        break;
    }
    this.#record(s, pouringBefore);
    this.#previous = s;
    return events;
  }

  #whileIdle(s: LiveSample, events: ShotMonitorEvent[]): void {
    if (s.levelG === null) return;
    const idleLevelG = this.#idleLevelG;
    this.#idleLevelG = s.levelG;
    if (idleLevelG === null || s.levelG < idleLevelG + this.#p.cupMinG) return;
    const lifted = this.#lifted;
    this.#lifted = null;
    if (lifted !== null && Math.abs(s.levelG - lifted.levelG) <= this.#p.cupBackG) {
      // The same cup, back at the level it left: a lift is a pause. Its shot stays, unarmed.
      this.#cup = lifted.cup;
      this.#shot = lifted.shot;
      this.#phase = 'done';
      this.#armed = false;
      events.push({ type: 'cup-back', tMs: s.tMs });
      return;
    }
    this.#phase = 'ready';
    this.#cup = { levelG: s.levelG, massG: s.levelG - idleLevelG };
    this.#shot = null;
    events.push({ type: 'cup-on', tMs: s.tMs });
    this.#tareNow(s.tMs, s.levelG, events);
  }

  #whileReady(s: LiveSample, events: ShotMonitorEvent[]): void {
    const cup = this.#cup!;
    if (s.levelG === null) return;
    if (this.#tareOnStable) {
      this.#tareNow(s.tMs, s.levelG, events);
    } else if (this.#removed(s.levelG, cup)) {
      this.#toIdle(s, events);
    } else if (s.levelG >= cup.levelG + this.#p.cupMinG) {
      // Another vessel on top, before the shot: the net weight starts from it.
      this.#cup = { levelG: s.levelG, massG: cup.massG + s.levelG - cup.levelG };
    }
  }

  #whilePouring(s: LiveSample, events: ShotMonitorEvent[]): void {
    const cup = this.#cup!;
    const shot = this.#shot!;
    const p = this.#p;
    if (s.levelG !== null && this.#removed(s.levelG, cup)) {
      this.#toIdle(s, events);
      return;
    }
    if (shot.firstDripMs === null) {
      if (s.tMs - shot.pumpOnMs > p.maxPreInfusionMs) {
        // No liquid: the tap didn't start a shot. Back to waiting, quietly: for the cup it came
        // with, still tared, or for the first one, armed.
        this.#phase = shot.cupSeen ? 'ready' : 'idle';
        this.#shot = null;
        if (!shot.cupSeen) {
          this.#cup = null;
          this.#idleLevelG = null;
          this.#armed = true;
        }
        events.push({ type: 'pump-lapsed', tMs: s.tMs });
        return;
      }
      if (shot.rezero && s.levelG !== null) {
        cup.levelG = s.levelG;
        shot.rezero = false;
      }
      const early = s.tMs - shot.pumpOnMs < p.minPreInfusionMs;
      const drip = early ? null : this.#drip(s, shot.baselineG);
      if (drip !== null) {
        shot.firstDripMs = drip;
        events.push({ type: 'first-drip', tMs: drip });
      } else if (s.levelG !== null) {
        shot.baselineG = s.levelG - cup.levelG;
      }
      return;
    }
    if (s.disturbed) return;
    shot.pour.push({ tMs: s.tMs, grossG: s.grossG });
    while (shot.pour[0].tMs < s.tMs - p.pourEndSpanMs) shot.pour.shift();
    if (s.flowGps === null) return;
    shot.peakFlowGps = Math.max(shot.peakFlowGps, s.flowGps);
    if (this.#phase === 'running') {
      // A slow start pours in drops, and the reading can hold still between them (hardware
      // session 2, shot B: 0.6 s at 1 g): it can't end before `minPourG` has poured.
      const poured = s.grossG - cup.levelG - shot.baselineG >= p.minPourG;
      if (
        poured &&
        shot.peakFlowGps >= p.minPourFlowGps &&
        s.flowGps < p.tailFlowRatio * shot.peakFlowGps
      ) {
        // The flow is a slope over the last second, so it fell away some time ago: the knee of
        // the latest readings says when, else half the slope's span.
        const endMs = pourEndMs(shot.pour) ?? s.tMs - p.flowSpanMs / 2;
        this.#phase = 'tail';
        shot.pumpOffMs = Math.min(s.tMs, Math.max(shot.firstDripMs, endMs));
        events.push({ type: 'pump-off', tMs: shot.pumpOffMs });
      }
    } else if (s.flowGps > p.resumeFlowRatio * shot.peakFlowGps) {
      // Only a dip: the pour goes on.
      this.#phase = 'running';
      shot.pumpOffMs = null;
    } else if (s.stable) {
      this.#phase = 'done';
      shot.doneMs = s.tMs;
      shot.doneReason = 'settled';
      events.push({ type: 'shot-done', tMs: s.tMs, reason: 'settled' });
    }
  }

  #whileDone(s: LiveSample, events: ShotMonitorEvent[]): void {
    if (s.levelG !== null && this.#removed(s.levelG, this.#cup!)) this.#toIdle(s, events);
  }

  /**
   * The Tare + start tap: the pump has just started. A shot under way ignores it, as the
   * analysis does a tap after the first drip. Otherwise the shot starts now, its net weight from
   * the level at the tap: the yield is what comes after the pump starts.
   */
  #manualStart(tMs: number): ShotMonitorEvent[] {
    if (this.#phase === 'running' || this.#phase === 'tail') return [];
    // The level of the latest half second, unless the weight is moving: then the first stable
    // reading's, before the first drip.
    const last = this.#weight.last;
    const moving = last === null || last.disturbed;
    this.#cup = {
      levelG: last === null ? 0 : moving ? last.smoothG : last.meanG,
      massG: this.#cup?.massG ?? 0,
    };
    const cupSeen = this.#phase !== 'idle';
    this.#lifted = null;
    this.#phase = 'running';
    this.#armed = false;
    this.#tareOnStable = false;
    this.#shot = {
      pumpOnMs: tMs,
      cupSeen,
      firstDripMs: null,
      pumpOffMs: null,
      doneMs: null,
      doneReason: null,
      baselineG: 0,
      rezero: moving,
      peakFlowGps: 0,
      pour: [],
      series: [],
    };
    return [{ type: 'pump-on', tMs }];
  }

  /**
   * The cup is off. After the first drip, that ends the shot if it hadn't ended, and a cup put
   * back at the level it left is the same one. The tare re-arms for the next cup.
   */
  #toIdle(s: LiveSample, events: ShotMonitorEvent[]): void {
    const shot = this.#shot;
    if (shot !== null && shot.firstDripMs !== null) {
      if (shot.doneMs === null) {
        shot.doneMs = s.tMs;
        shot.doneReason = 'cup-removed';
        events.push({ type: 'shot-done', tMs: s.tMs, reason: 'cup-removed' });
      }
      const levelG = this.#beforeDisturbanceG;
      this.#lifted = levelG === null ? null : { levelG, cup: this.#cup!, shot };
    }
    this.#phase = 'idle';
    this.#idleLevelG = s.levelG;
    this.#armed = true;
    this.#tareOnStable = false;
    this.#cup = null;
    this.#shot = null;
    events.push({ type: 'cup-off', tMs: s.tMs });
  }

  /** The cup's level is `levelG` from here on, and the tare fires if it is armed. */
  #tareNow(tMs: number, levelG: number, events: ShotMonitorEvent[]): void {
    this.#tareOnStable = false;
    this.#cup = { levelG, massG: this.#cup?.massG ?? 0 };
    if (!this.#armed) return;
    this.#armed = false;
    this.#weight.expectTare(tMs);
    events.push({ type: 'tare', tMs });
  }

  /**
   * The first drip, if this reading and the one before it are at least `dripG` above
   * `baselineG` (net), clear of the noise and with no jump about them: the time of the first of
   * the two.
   */
  #drip(s: LiveSample, baselineG: number): number | null {
    const previous = this.#previous;
    if (previous === null) return null;
    const cup = this.#cup!;
    const riseG = this.#weight.clearOfNoiseG(this.#p.dripG, previous);
    const above = (sample: LiveSample) =>
      !sample.disturbed && sample.grossG - cup.levelG >= baselineG + riseG;
    return above(previous) && above(s) ? previous.tMs : null;
  }

  /** A stable level this far below the cup's means it is off: half its mass, or of a small one. */
  #removed(levelG: number, cup: Cup): boolean {
    return levelG <= cup.levelG - Math.max(cup.massG, this.#p.cupMinG) / 2;
  }

  #pouring(): boolean {
    return this.#phase === 'running' || this.#phase === 'tail';
  }

  /** Adds the reading to the graph while the shot pours. */
  #record(s: LiveSample, pouringBefore: boolean): void {
    const shot = this.#shot;
    const cup = this.#cup;
    if (shot === null || cup === null || !(pouringBefore || this.#pouring())) return;
    if (s.tMs >= shot.pumpOnMs && shot.series.length < this.#p.maxSeriesPoints) {
      shot.series.push({ tMs: s.tMs, netG: s.smoothG - cup.levelG, flowGps: s.flowGps });
    }
  }
}

function checkedTarget(targetG: number | null): number | null {
  if (targetG !== null && (!(targetG > 0) || !Number.isFinite(targetG))) {
    throw new RangeError(`ShotMonitor: target ${targetG} g is not a finite number above 0`);
  }
  return targetG;
}
