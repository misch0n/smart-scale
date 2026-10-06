/**
 * The script of a simulated session: what happens physically, plus any commands the app sends,
 * in ms since the session started (connect). `compileScript` validates it and turns it into the
 * timeline the simulator runs, plus the ground-truth event list.
 */

import type { ScaleCommand } from '../protocol';
import { SCALE_MODES, type ScaleMode } from './params';
import { DEFAULT_SHOT_PARAMS, ShotModel, type ShotParams } from './shot';

/** A vessel is put on the empty platform. */
export interface CupOnEvent {
  readonly type: 'cup-on';
  readonly atMs: number;
  /** The empty vessel, g. */
  readonly massG: number;
  /** Already in it, such as beans, g. Default 0. */
  readonly contentsG?: number;
}

/**
 * A scale accessory, like the silicone mat that protects the scale, goes on the empty platform
 * and stays there: vessels are put on top of it (T2.17).
 */
export interface MatOnEvent {
  readonly type: 'mat-on';
  readonly atMs: number;
  readonly massG: number;
}

/** The vessel on the platform is lifted off, with its contents. */
export interface CupOffEvent {
  readonly type: 'cup-off';
  readonly atMs: number;
}

/** The vessel lifted last goes back on, with what it held. */
export interface CupBackEvent {
  readonly type: 'cup-back';
  readonly atMs: number;
}

/**
 * Someone presses the tare button on the scale and lets it go at `atMs`. The scale sends
 * nothing for it (D-021), and tares once its next frame is out. The button is on the platform,
 * so a press can weigh on it: `pressG` from `pressMs` before `atMs` until the scale tares, which
 * shows the press gone and the tare done in one jump, as hardware session 1's did at 118.5 s
 * (D-051).
 */
export interface TareButtonEvent {
  readonly type: 'tare-button';
  readonly atMs: number;
  /** The press's weight on the platform, g. Default 0: a press too light to show. */
  readonly pressG?: number;
  /** How long before `atMs` the press starts to weigh, ms. Default 0. */
  readonly pressMs?: number;
}

/** A press on the tare button, weighing on the platform until the scale takes its tare. */
export interface ButtonPress {
  /** When it starts to weigh, ms. */
  readonly fromMs: number;
  /** When the button is let go, ms: the scale tares once its next frame is out. */
  readonly atMs: number;
  readonly pressG: number;
}

/**
 * A shot. `atMs` is `pump_on`; `first_drip` and `pump_off` follow from the parameters, and any
 * parameter left out takes its `DEFAULT_SHOT_PARAMS` value. Liquid lands in the vessel on the
 * platform, or on the platform itself when there is none.
 */
export interface ShotEvent extends Partial<ShotParams> {
  readonly type: 'shot';
  readonly atMs: number;
}

/**
 * The pump runs, and nothing reaches the scale: a flush, or a shot into a cup elsewhere. Only
 * the vibration shows.
 */
export interface PumpEvent {
  readonly type: 'pump';
  readonly atMs: number;
  readonly durationMs: number;
}

/**
 * The counter or the scale gets knocked: a half-sine push peaking at `peakG`. It moves the mean
 * and the variance together, which is what the spec's `pump_on` rule must reject.
 */
export interface BumpEvent {
  readonly type: 'bump';
  readonly atMs: number;
  readonly durationMs: number;
  /** Peak extra force in grams; negative for a lift. */
  readonly peakG: number;
}

/** The app writes a command to the scale, exactly as a transport's `send()` would. */
export interface CommandEvent {
  readonly type: 'command';
  readonly atMs: number;
  readonly command: ScaleCommand;
  /** What the app would log as the reason, like `manual-start`. */
  readonly reason?: string;
}

/**
 * Someone switches the scale to another mode on the scale itself (no command can, D-038). The
 * scale sends nothing for it. What its timer does then is unknown: the simulator stops it at 0
 * (T1.25, D-073).
 */
export interface ModeEvent {
  readonly type: 'mode';
  readonly atMs: number;
  readonly mode: ScaleMode;
}

/** The scale switches off. Nothing may follow it in the script. */
export interface PowerOffEvent {
  readonly type: 'power-off';
  readonly atMs: number;
}

export type ScriptEvent =
  | CupOnEvent
  | MatOnEvent
  | CupOffEvent
  | CupBackEvent
  | TareButtonEvent
  | ShotEvent
  | PumpEvent
  | BumpEvent
  | CommandEvent
  | ModeEvent
  | PowerOffEvent;

/** The script's discrete actions, which the simulator applies at their times. */
export type ScriptAction =
  CupOnEvent | MatOnEvent | CupOffEvent | CupBackEvent | TareButtonEvent | CommandEvent | ModeEvent;

export const TRUTH_EVENT_TYPES = [
  'cup-on',
  'cup-off',
  'cup-back',
  'tare-button',
  'bump',
  'pump-on',
  'first-drip',
  'pump-off',
  'settled',
  'power-off',
  'mat-on',
] as const;
export type TruthEventType = (typeof TRUTH_EVENT_TYPES)[number];

/** Something that happened physically, at its exact time. */
export interface TruthEvent {
  readonly tMs: number;
  readonly type: TruthEventType;
  /** The shot it belongs to (`pump-on`, `first-drip`, `pump-off`, `settled`), else null. */
  readonly shotIndex: number | null;
}

export interface CompiledScript {
  /** Discrete actions, in time order. */
  readonly actions: readonly ScriptAction[];
  /** Shots, in time order. */
  readonly shots: readonly ShotModel[];
  /** When the pump runs: `[start, end)` intervals in time order, not overlapping. */
  readonly pumpIntervals: readonly (readonly [startMs: number, endMs: number])[];
  readonly bumps: readonly BumpEvent[];
  /** Presses on the tare button that weigh on the platform, in time order. */
  readonly presses: readonly ButtonPress[];
  /** When the scale switches off, or null. */
  readonly powerOffMs: number | null;
  /** The physical events in time order, without `settled` (the simulator adds it). */
  readonly events: readonly TruthEvent[];
}

/**
 * Validates a script and sorts it into a timeline. Events at the same time keep their script
 * order.
 *
 * @throws RangeError on a bad time or parameter, a vessel put on an occupied platform or lifted
 *   from an empty one, overlapping pump runs, or anything after `power-off`.
 */
export function compileScript(script: readonly ScriptEvent[]): CompiledScript {
  const sorted = script
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.atMs - b.event.atMs || a.index - b.index)
    .map(({ event }) => event);

  const actions: ScriptAction[] = [];
  const shots: ShotModel[] = [];
  const pumps: [number, number][] = [];
  const bumps: BumpEvent[] = [];
  const presses: ButtonPress[] = [];
  const events: TruthEvent[] = [];
  let powerOffMs: number | null = null;
  let vesselOn = false;
  let vesselLifted = false;

  for (const event of script) {
    if (typeof event.atMs !== 'number' || !Number.isFinite(event.atMs) || event.atMs < 0) {
      throw new RangeError(`script: ${event.type} at ${event.atMs} ms is not a time`);
    }
  }

  for (const event of sorted) {
    const at = event.atMs;
    if (powerOffMs !== null) {
      throw new RangeError(`script: ${event.type} at ${at} ms comes after power-off`);
    }
    switch (event.type) {
      case 'cup-on':
        if (vesselOn) throw new RangeError(`script: cup-on at ${at} ms, but a vessel is on`);
        positiveMass('cup-on massG', event.massG);
        if (event.contentsG !== undefined) nonNegativeMass('cup-on contentsG', event.contentsG);
        vesselOn = true;
        actions.push(event);
        events.push({ tMs: at, type: 'cup-on', shotIndex: null });
        break;
      case 'mat-on':
        if (vesselOn) throw new RangeError(`script: mat-on at ${at} ms, but a vessel is on`);
        positiveMass('mat-on massG', event.massG);
        actions.push(event);
        events.push({ tMs: at, type: 'mat-on', shotIndex: null });
        break;
      case 'cup-off':
        if (!vesselOn) throw new RangeError(`script: cup-off at ${at} ms, but no vessel is on`);
        vesselOn = false;
        vesselLifted = true;
        actions.push(event);
        events.push({ tMs: at, type: 'cup-off', shotIndex: null });
        break;
      case 'cup-back':
        if (vesselOn) throw new RangeError(`script: cup-back at ${at} ms, but a vessel is on`);
        if (!vesselLifted) {
          throw new RangeError(`script: cup-back at ${at} ms, but no vessel was lifted`);
        }
        vesselOn = true;
        vesselLifted = false;
        actions.push(event);
        events.push({ tMs: at, type: 'cup-back', shotIndex: null });
        break;
      case 'tare-button': {
        const pressG = event.pressG ?? 0;
        const pressMs = event.pressMs ?? 0;
        nonNegativeMass('tare-button pressG', pressG);
        if (!Number.isFinite(pressMs) || pressMs < 0 || pressMs > at) {
          throw new RangeError(`script: tare-button pressMs ${pressMs} is not a time before it`);
        }
        if (pressG > 0) presses.push({ fromMs: at - pressMs, atMs: at, pressG });
        actions.push(event);
        events.push({ tMs: at, type: 'tare-button', shotIndex: null });
        break;
      }
      case 'command':
        actions.push(event);
        break;
      case 'mode':
        if (!SCALE_MODES.includes(event.mode)) {
          throw new RangeError(`script: mode at ${at} ms is ${event.mode}, not a scale mode`);
        }
        actions.push(event);
        break;
      case 'shot': {
        const shot = new ShotModel(at, shotParams(event));
        const shotIndex = shots.length;
        shots.push(shot);
        pumps.push([shot.pumpOnMs, shot.pumpOffMs]);
        events.push(
          { tMs: shot.pumpOnMs, type: 'pump-on', shotIndex },
          { tMs: shot.firstDripMs, type: 'first-drip', shotIndex },
          { tMs: shot.pumpOffMs, type: 'pump-off', shotIndex },
        );
        break;
      }
      case 'pump':
        positiveDuration('pump durationMs', event.durationMs);
        pumps.push([at, at + event.durationMs]);
        events.push(
          { tMs: at, type: 'pump-on', shotIndex: null },
          { tMs: at + event.durationMs, type: 'pump-off', shotIndex: null },
        );
        break;
      case 'bump':
        positiveDuration('bump durationMs', event.durationMs);
        if (!Number.isFinite(event.peakG)) {
          throw new RangeError(`script: bump peakG ${event.peakG} is not a number`);
        }
        bumps.push(event);
        events.push({ tMs: at, type: 'bump', shotIndex: null });
        break;
      case 'power-off':
        powerOffMs = at;
        events.push({ tMs: at, type: 'power-off', shotIndex: null });
        break;
    }
  }

  pumps.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < pumps.length; i++) {
    if (pumps[i][0] < pumps[i - 1][1]) {
      throw new RangeError(`script: the pump run at ${pumps[i][0]} ms overlaps the one before`);
    }
  }

  return {
    actions,
    shots,
    pumpIntervals: pumps,
    bumps,
    presses,
    powerOffMs,
    events: sortEvents(events),
  };
}

/** Time order; at equal times, the order of `TRUTH_EVENT_TYPES`. */
export function sortEvents(events: readonly TruthEvent[]): TruthEvent[] {
  return [...events].sort(
    (a, b) =>
      a.tMs - b.tMs || TRUTH_EVENT_TYPES.indexOf(a.type) - TRUTH_EVENT_TYPES.indexOf(b.type),
  );
}

/** The event's shot parameters, with `DEFAULT_SHOT_PARAMS` for any left out. */
function shotParams(event: ShotEvent): ShotParams {
  const d = DEFAULT_SHOT_PARAMS;
  return {
    doseG: event.doseG ?? d.doseG,
    yieldG: event.yieldG ?? d.yieldG,
    preInfusionMs: event.preInfusionMs ?? d.preInfusionMs,
    extractionMs: event.extractionMs ?? d.extractionMs,
    tailTauMs: event.tailTauMs ?? d.tailTauMs,
    flowProfile: event.flowProfile ?? d.flowProfile,
    firstDropG: event.firstDropG ?? d.firstDropG,
  };
}

function positiveMass(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`script: ${name} ${value} is not a positive mass`);
  }
}

function nonNegativeMass(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`script: ${name} ${value} is not a mass`);
  }
}

function positiveDuration(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`script: ${name} ${value} is not a positive duration`);
  }
}
