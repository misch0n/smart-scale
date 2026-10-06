/**
 * A simulated scale session: the physics on the platform (`weighing-platform.ts`), the scale's
 * firmware as hardware session 1 showed it and D-021 assumes it, and the BLE link (`link.ts`),
 * stepped through time in order. It produces encoded frames with arrival times, exactly as a
 * transport would deliver them, and the ground truth behind them.
 *
 * The firmware works sample by sample. Each sample it reads the weight and advances the timer
 * by one tick if it runs, then sends the frame. A command acts at once, except that a tare or a
 * timer start waits until the next frame is out, and `07` starts the timer a frame after its
 * tare (S1). Then, in the automatic mode, the scale acts on what it has seen: a vessel put on,
 * or the first liquid.
 *
 * The simulator reacts to command bytes the way the scale would, so it serves two callers:
 * `simulateSession` runs a whole scripted session in one go, and `MockTransport` steps it in
 * real or accelerated time while the app sends commands. A session is the same whichever way
 * it is stepped (`advanceTo` in one call or in many), given the same commands at the same times.
 *
 * Time is ms since the session started, which is the moment the app connected.
 */

import type { CharacteristicName } from '../model';
import {
  COMMAND_FRAME_LENGTH,
  encodeEventFrame,
  encodeWeightFrame,
  FRAME_TYPE,
  hasValidChecksum,
  PRODUCT_BYTE,
  toHex,
  U16_MAX,
  U24_MAX,
} from '../protocol';
import { Link, type ArrivedFrame, type Corruption, type LossReason } from './link';
import {
  resolveLinkParams,
  resolveScaleParams,
  type LinkParams,
  type ScaleMode,
  type ScaleParams,
} from './params';
import { WeighingPlatform } from './weighing-platform';
import { Rng } from './random';
import {
  compileScript,
  sortEvents,
  type CompiledScript,
  type ScriptAction,
  type ScriptEvent,
  type TruthEvent,
} from './script';
import { deliveredG, finalDeliveredG, settledAtMs } from './shot';

/** Everything that defines a simulated session. */
export interface Scenario {
  /** Seeds every random draw: the same scenario always gives the same session. */
  readonly seed: number;
  /** How long `simulateSession` runs, ms. The simulator itself and the mock run on. */
  readonly durationMs: number;
  readonly script: readonly ScriptEvent[];
  readonly scale?: Partial<ScaleParams>;
  readonly link?: Partial<LinkParams>;
}

/**
 * Ground truth for one shot. Masses are liquid from this shot, so they don't depend on tares:
 * they are what zero-tracking must recover. Times are ms on the session timeline.
 */
export interface ShotTruth {
  readonly index: number;
  readonly doseG: number;
  readonly pumpOnMs: number;
  readonly firstDripMs: number;
  readonly pumpOffMs: number;
  /** When the delivered liquid came within `SETTLED_TOLERANCE_G` of its final value. */
  readonly settledMs: number;
  /** The first `cup-off` at or after `pump_on`, or null if the cup stays on. */
  readonly cupRemovedMs: number | null;
  /** `pump_on` → `first_drip`. */
  readonly preInfusionMs: number;
  /** `first_drip` → `pump_off`. */
  readonly extractionMs: number;
  /** `pump_on` → `pump_off`. */
  readonly totalMs: number;
  /** w(pump_off): liquid delivered by `pump_off`, g. */
  readonly weightAtPumpOffG: number;
  /** ẇ(pump_off), g/s. */
  readonly flowAtPumpOffGps: number;
  readonly tailTauMs: number;
  /**
   * w(settled): all the liquid the shot delivers, g, the spec's yield. With `dropG` 0 it equals
   * w(pump_off) + ẇ(pump_off)·τ exactly; with drops, to within one drop.
   */
  readonly yieldG: number;
  /** Yield minus w(pump_off), g. */
  readonly tailMassG: number;
  /** w(cup_removed): liquid in the cup when it came off, g, or null. Assumes the cup was on. */
  readonly honestYieldG: number | null;
  /** w(pump_off) / extraction time (spec "Average flow"), g/s. */
  readonly averageFlowGps: number;
  /** Yield / dose, or null with no dose. */
  readonly ratio: number | null;
}

/** What the scale did with one command write. */
export type CommandEffect =
  | 'pending'
  | 'tare'
  | 'buzzer'
  | 'auto-off'
  | 'timer-start'
  | 'timer-stop'
  | 'timer-reset'
  | 'tare-and-start'
  | 'run-ended'
  | 'smoothing-off'
  | 'smoothing-on'
  | 'keep-alive'
  | 'no-op'
  | 'ignored-malformed'
  | 'ignored-unknown'
  | 'ignored-powered-off';

export interface CommandTruth {
  /** When the app wrote it. */
  readonly sentAtMs: number;
  /**
   * When the scale took it (`sentAtMs + commandLatencyMs`), or null if it never did. A tare or a
   * timer start then waits for the next frame to go out: `tares` and `timer` say when.
   */
  readonly appliedAtMs: number | null;
  /** The bytes, packed upper-case hex like `030A0700000E`. */
  readonly hex: string;
  /** The reason a script gave for it, else null. */
  readonly reason: string | null;
  readonly effect: CommandEffect;
}

/** A change of the scale's zero. */
export interface TareTruth {
  readonly atMs: number;
  /**
   * What asked for it: a command (`01`, `07`, or `05` ending the automatic mode's run), the
   * scale's button, or the automatic mode taring a vessel by itself.
   */
  readonly source: 'command' | 'button' | 'auto';
  /** The new zero: the gross mass the scale subtracts from now on, g. */
  readonly offsetG: number;
}

/** A change of the scale's stopwatch (the timer field, D-006). */
export interface TimerTruth {
  readonly atMs: number;
  /**
   * `start` runs it from `valueMs`, and the next sample reads one tick more. `stop` freezes it.
   * `reset` puts it back to 0, stopped: `06`, or `05` ending the automatic mode's run.
   */
  readonly change: 'start' | 'stop' | 'reset';
  /** The timer value right after the change, ms on the scale's clock. */
  readonly valueMs: number;
}

/** The truth behind one frame. */
export interface FrameTruth {
  readonly kind: 'weight' | 'event';
  /** The scale's sample counter for weight frames, 0, 1, 2…; null for event frames. */
  readonly sampleIndex: number | null;
  /** When the scale took the sample, or sent the event, ms on the session timeline. */
  readonly sampleTMs: number;
  /** The noise-free mass on the platform then, g. */
  readonly grossG: number;
  /** The scale's zero then, g. */
  readonly offsetG: number;
  /** Noise added to this sample (base noise plus vibration), g; 0 for event frames. */
  readonly noiseG: number;
  readonly pumpOn: boolean;
  /** The weight the frame carries, after smoothing and quantisation, as `decodeFrame` reads it. */
  readonly weightG: number;
  /** The timer field the frame carries. */
  readonly timerMs: number;
  readonly smoothing: boolean;
  /** How the link damaged the frame, or null when it arrived intact. */
  readonly corruption: Corruption | null;
}

/** A frame as a transport would deliver it, with the truth behind it. */
export interface SimFrame {
  readonly source: CharacteristicName;
  readonly bytes: Uint8Array<ArrayBuffer>;
  /** Arrival time, ms on the session timeline. */
  readonly tArrival: number;
  readonly truth: FrameTruth;
}

/** A frame the scale sent that never arrived. */
export interface LostFrameTruth {
  readonly source: CharacteristicName;
  readonly reason: LossReason;
  readonly truth: Omit<FrameTruth, 'corruption'>;
}

export interface SessionTruth {
  readonly shots: readonly ShotTruth[];
  /** Physical events and shot markers, in time order. */
  readonly events: readonly TruthEvent[];
  /** Every command written, in the order written. */
  readonly commands: readonly CommandTruth[];
  readonly tares: readonly TareTruth[];
  readonly timer: readonly TimerTruth[];
  readonly lostFrames: readonly LostFrameTruth[];
  /** When the phone noticed the scale had gone (power-off + supervision timeout), or null. */
  readonly linkLostAtMs: number | null;
}

/**
 * The tolerance for `settled`: the spec's stability band ("no sample range greater than
 * 0.05 g").
 */
export const SETTLED_TOLERANCE_G = 0.05;

/**
 * How the simulated automatic mode decides (D-021). It reads the weight before noise and
 * rounding, relative to its zero: the real scale decides on its own signal, which no frame shows.
 */
export const AUTOMATIC_MODE = {
  /** A rise of at least this much, g, settled, is a vessel put on: the scale tares it. */
  vesselG: 5, // PROVISIONAL(U1.1: A4)
  /** Two samples in a row at least this far above zero, g, but below a vessel, start a run. */
  liquidG: 0.3, // PROVISIONAL(U1.1: A4)
  /** Samples this close, g, count as settled. */
  settledG: 0.05,
  /** Where the run's timer starts, ms: its first frame read 1.1 s in session 1. */
  runStartMs: 1000, // PROVISIONAL(U1.1: A4)
} as const;

type FrameTag = Omit<FrameTruth, 'corruption'>;

interface PendingCommand {
  readonly applyAtMs: number;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly truthIndex: number;
}

type MutableCommandTruth = { -readonly [K in keyof CommandTruth]: CommandTruth[K] };

const FORBIDDEN_SUBS: ReadonlyMap<number, string> = new Map([
  [0x09, 'calibration'],
  [0x15, 'shutdown'],
]);

const MAX_FLOW_GPS = U16_MAX / 100;

/** Where the automatic mode sends its `03 0D` frames (S1, D-037). */
const EVENT_FRAME_SOURCE: CharacteristicName = 'ff12';

export class ScaleSimulator {
  readonly seed: number;
  readonly scale: ScaleParams;
  readonly link: LinkParams;
  /** When the scale switches off (script `power-off`), or null. */
  readonly powerOffMs: number | null;
  /** When the phone notices the link is gone: power-off plus the supervision timeout, or null. */
  readonly linkLostAtMs: number | null;

  readonly #script: CompiledScript;
  readonly #platform: WeighingPlatform;
  readonly #link: Link<FrameTag>;
  readonly #noiseRng: Rng;
  readonly #vibrationRng: Rng;
  readonly #jitterRng: Rng;
  readonly #shots: readonly ShotTruth[];
  readonly #events: readonly TruthEvent[];
  /** Sample `k` is due at `#phaseMs + k × #periodMs`, plus jitter. */
  readonly #phaseMs: number;
  readonly #periodMs: number;

  #nowMs = 0;
  #actionIndex = 0;
  #pumpIndex = 0;
  #poweredOff = false;
  #pending: PendingCommand[] = [];
  readonly #commands: MutableCommandTruth[] = [];
  readonly #tares: TareTruth[] = [];
  readonly #timerChanges: TimerTruth[] = [];

  // The scale's state.
  /** The mode now: `scale.mode` until a script `mode` switches it. */
  #mode: ScaleMode;
  #offsetG = 0;
  /** A tare the scale does once its next frame is out. */
  #pendingTare: TareTruth['source'] | null = null;
  /** A timer start the scale does once this many more frames are out, or null. */
  #startAfterFrames: number | null = null;
  #smoothing: boolean;
  /** The smoothing filter's output; tracks the raw reading while smoothing is off. */
  #filteredG: number | null = null;
  #timerRunning = false;
  /** The timer's value, ms on the scale's clock: a whole number of ticks. */
  #timerMs = 0;
  #buzzerGear: number;
  #autoOffMin: number;
  #sampleIndex = 0;
  #nextSampleMs: number;
  #lastSampleMs: number | null = null;
  /** Recent readings before rounding, for the scale's own flow figure. */
  #history: { readonly tMs: number; readonly weightG: number }[] = [];
  /** The automatic mode: the last sample's reading before noise, and the last settled one. */
  #autoLastG = 0;
  #autoLevelG = 0;

  /** @throws RangeError on an invalid scenario: bad parameters or an impossible script. */
  constructor(scenario: Scenario) {
    const rng = new Rng(scenario.seed);
    this.seed = scenario.seed;
    this.scale = resolveScaleParams(scenario.scale);
    this.link = resolveLinkParams(scenario.link);
    this.#script = compileScript(scenario.script);
    this.powerOffMs = this.#script.powerOffMs;
    this.linkLostAtMs =
      this.powerOffMs === null ? null : this.powerOffMs + this.scale.supervisionTimeoutMs;

    this.#platform = new WeighingPlatform(
      this.#script.shots,
      this.#script.bumps,
      this.scale.settleTauMs,
      this.scale.dropG,
      this.#script.presses,
    );
    this.#link = new Link(this.link, rng.fork('link'));
    this.#noiseRng = rng.fork('noise');
    this.#vibrationRng = rng.fork('vibration');
    this.#jitterRng = rng.fork('sample-jitter');
    this.#periodMs = this.scale.samplePeriodMs / (1 + this.scale.clockDriftPpm * 1e-6);
    // Starting one jitter in keeps the first sample at or after time 0.
    this.#phaseMs = this.scale.sampleJitterMs + rng.fork('sample-phase').next() * this.#periodMs;
    this.#nextSampleMs = this.#sampleTimeMs(0);

    this.#mode = this.scale.mode;
    this.#smoothing = this.scale.initialSmoothing;
    this.#buzzerGear = this.scale.buzzerGear;
    this.#autoOffMin = this.scale.autoOffMin;

    this.#shots = this.#shotTruths();
    this.#events = sortEvents([
      ...this.#script.events,
      ...this.#shots.map((shot) => ({
        tMs: shot.settledMs,
        type: 'settled' as const,
        shotIndex: shot.index,
      })),
    ]);
  }

  /** How far the simulation has run, ms. */
  get nowMs(): number {
    return this.#nowMs;
  }

  /** The scale's mode now: `scale.mode`, or what a script `mode` switched it to. */
  get mode(): ScaleMode {
    return this.#mode;
  }

  /**
   * Runs the simulation to `tMs` and returns the frames that have arrived since the last call,
   * in arrival order.
   *
   * @throws RangeError if `tMs` is earlier than the last call.
   */
  advanceTo(tMs: number): SimFrame[] {
    this.#run(tMs);
    return this.#link.receive(tMs).map(toSimFrame);
  }

  /**
   * The app writes `bytes` to the command characteristic at `tMs`. The scale acts on them
   * `commandLatencyMs` later, the way its firmware would: a malformed frame or an unknown
   * sub-command is ignored, and so is a command its mode or state doesn't take. A transport
   * checks the whitelist before writing (D-015); if calibration or shutdown bytes get here
   * anyway, this throws, so the test fails loudly.
   *
   * @throws RangeError if `tMs` is earlier than the simulation has run.
   * @throws Error on calibration (`0x09`) or shutdown (`0x15`) bytes.
   */
  write(bytes: Uint8Array, tMs: number): void {
    this.#run(tMs);
    this.#send(bytes.slice(), tMs, null);
  }

  /**
   * When something next happens (a sample, a script event, a command taking effect or a frame
   * arriving), or null if nothing ever will. A caller stepping in real time sleeps until then.
   */
  nextWakeMs(): number | null {
    const next = Math.min(
      this.#script.actions[this.#actionIndex]?.atMs ?? Infinity,
      this.#pending[0]?.applyAtMs ?? Infinity,
      this.#poweredOff ? Infinity : (this.powerOffMs ?? Infinity),
      this.#poweredOff ? Infinity : this.#nextSampleMs,
      this.#link.nextArrivalMs() ?? Infinity,
    );
    return next === Infinity ? null : next;
  }

  /** The ground truth so far. Shots and events are known in full from the start. */
  truth(): SessionTruth {
    return {
      shots: this.#shots,
      events: this.#events,
      commands: this.#commands.map((command) => ({ ...command })),
      tares: [...this.#tares],
      timer: [...this.#timerChanges],
      lostFrames: this.#link.lost.map(({ source, reason, tag }) => ({
        source,
        reason,
        truth: tag,
      })),
      linkLostAtMs: this.linkLostAtMs,
    };
  }

  /** Processes everything due at or before `tMs`, in time order. */
  #run(tMs: number): void {
    if (!Number.isFinite(tMs) || tMs < this.#nowMs) {
      throw new RangeError(`ScaleSimulator: can't run to ${tMs} ms from ${this.#nowMs} ms`);
    }
    for (;;) {
      const action: ScriptAction | undefined = this.#script.actions[this.#actionIndex];
      const actionMs = action?.atMs ?? Infinity;
      const powerOffMs = this.#poweredOff ? Infinity : (this.powerOffMs ?? Infinity);
      const commandMs = this.#pending[0]?.applyAtMs ?? Infinity;
      const sampleMs = this.#poweredOff ? Infinity : this.#nextSampleMs;
      const next = Math.min(actionMs, powerOffMs, commandMs, sampleMs);
      if (next > tMs) break;
      // At equal times: script actions, then power-off, then commands, then the sample.
      if (action && actionMs === next) {
        this.#actionIndex++;
        this.#runAction(action);
      } else if (powerOffMs === next) {
        this.#powerOff(next);
      } else if (commandMs === next) {
        this.#applyCommand(this.#pending.shift()!);
      } else {
        this.#sample();
      }
    }
    this.#nowMs = tMs;
  }

  #runAction(action: ScriptAction): void {
    const at = action.atMs;
    switch (action.type) {
      case 'cup-on':
        this.#platform.place(at, action.massG, action.contentsG ?? 0);
        break;
      case 'mat-on':
        this.#platform.placeMat(at, action.massG);
        break;
      case 'cup-off':
        this.#platform.lift(at);
        break;
      case 'cup-back':
        this.#platform.placeBack(at);
        break;
      case 'tare-button':
        if (!this.#poweredOff) this.#pendingTare = 'button';
        break;
      case 'command':
        this.#send(action.command.bytes.slice(), at, action.reason ?? null);
        break;
      case 'mode':
        if (!this.#poweredOff) this.#switchMode(at, action.mode);
        break;
    }
  }

  /**
   * The user switches the mode on the scale. Assumed (D-073) until the user checks it on the
   * scale (T1.25): the timer stops at 0, a start the scale waits to do is dropped, and an
   * automatic run ends without an `03 0D`. The automatic mode watches from what is on the
   * platform now, so a vessel already on isn't tared.
   */
  #switchMode(t: number, mode: ScaleMode): void {
    if (mode === this.#mode) return;
    this.#mode = mode;
    this.#startAfterFrames = null;
    if (this.#timerRunning || this.#timerMs !== 0) {
      this.#timerRunning = false;
      this.#timerMs = 0;
      this.#timerChanges.push({ atMs: t, change: 'reset', valueMs: 0 });
    }
    const readingG = this.#platform.grossG(t) - this.#offsetG;
    this.#autoLastG = readingG;
    this.#autoLevelG = readingG;
  }

  #send(bytes: Uint8Array<ArrayBuffer>, sentAtMs: number, reason: string | null): void {
    const forbidden =
      bytes[0] === PRODUCT_BYTE && bytes[1] === FRAME_TYPE.command
        ? FORBIDDEN_SUBS.get(bytes[2])
        : undefined;
    if (forbidden) {
      throw new Error(
        `ScaleSimulator: the app wrote ${forbidden} (${toHex(bytes)}), which must never be ` +
          'sent: a transport skipped the whitelist check (CLAUDE.md hard rule 5, D-015)',
      );
    }
    const truthIndex = this.#commands.length;
    this.#commands.push({
      sentAtMs,
      appliedAtMs: null,
      hex: toHex(bytes, ''),
      reason,
      effect: this.#poweredOff ? 'ignored-powered-off' : 'pending',
    });
    if (this.#poweredOff) return;
    const command = { applyAtMs: sentAtMs + this.scale.commandLatencyMs, bytes, truthIndex };
    // Writes come in time order and the latency is fixed, so this is almost always an append.
    let i = this.#pending.length;
    while (i > 0 && this.#pending[i - 1].applyAtMs > command.applyAtMs) i--;
    this.#pending.splice(i, 0, command);
  }

  #applyCommand(command: PendingCommand): void {
    const t = command.applyAtMs;
    const truth = this.#commands[command.truthIndex];
    truth.appliedAtMs = t;
    truth.effect = this.#commandEffect(command.bytes, t);
  }

  /**
   * Acts on one command, the way the firmware does in the scale's mode (S1; D-021 for what
   * session 1 didn't show), and says what it did.
   */
  #commandEffect(b: Uint8Array, t: number): CommandEffect {
    if (
      b.length !== COMMAND_FRAME_LENGTH ||
      b[0] !== PRODUCT_BYTE ||
      b[1] !== FRAME_TYPE.command ||
      !hasValidChecksum(b)
    ) {
      return 'ignored-malformed';
    }
    const mode = this.#mode;
    switch (b[2]) {
      case 0x01:
        // The automatic mode ignores a tare while its run goes on (S1).
        if (mode === 'automatic' && this.#timerRunning) return 'no-op';
        this.#pendingTare = 'command';
        return 'tare';
      case 0x02:
        this.#buzzerGear = b[4];
        return 'buzzer';
      case 0x03:
        this.#autoOffMin = b[4];
        return 'auto-off';
      case 0x04:
        // Only the timer mode takes it, and only from 0: it doesn't resume a frozen timer (S1).
        if (mode !== 'timer' || !this.#stoppedAtZero() || this.#startAfterFrames !== null) {
          return 'no-op';
        }
        this.#startAfterFrames = 1;
        return 'timer-start';
      case 0x05:
        if (mode === 'automatic' && this.#timerRunning) {
          this.#endRun(t);
          return 'run-ended';
        }
        if (mode !== 'timer' || !this.#timerRunning) return 'no-op';
        this.#timerRunning = false;
        this.#timerChanges.push({ atMs: t, change: 'stop', valueMs: this.#timerMs });
        return 'timer-stop';
      case 0x06:
        // It zeroes only a stopped timer (S1).
        if (mode !== 'timer' || this.#timerRunning) return 'no-op';
        this.#timerMs = 0;
        this.#timerChanges.push({ atMs: t, change: 'reset', valueMs: 0 });
        return 'timer-reset';
      case 0x07:
        if (mode !== 'timer') return 'no-op';
        // A tare, then a start as `04` would: only from 0 (D-021), a frame after the tare (S1).
        this.#pendingTare = 'command';
        if (!this.#stoppedAtZero() || this.#startAfterFrames !== null) return 'tare';
        this.#startAfterFrames = 2;
        return 'tare-and-start';
      case 0x08:
        // Doc revisions disagree on whether the switch is byte 3 or byte 4 (protocol-notes,
        // finding 2). Off is zero in both, which is the only value the whitelist sends.
        this.#smoothing = (b[3] | b[4]) !== 0;
        return this.#smoothing ? 'smoothing-on' : 'smoothing-off';
      case 0x25:
        // Keep-alive: nothing observable, since the auto-off countdown isn't modelled (A6).
        return 'keep-alive';
      default:
        return 'ignored-unknown';
    }
  }

  #stoppedAtZero(): boolean {
    return !this.#timerRunning && this.#timerMs === 0;
  }

  #tare(t: number, source: TareTruth['source']): void {
    // A press on the tare button weighs until the scale tares: it shows in the frame just out,
    // and is gone from the zero (D-051).
    this.#platform.release(t);
    this.#offsetG = this.#platform.grossG(t);
    this.#tares.push({ atMs: t, source, offsetG: this.#offsetG });
  }

  #startTimer(t: number, fromMs: number): void {
    this.#timerMs = fromMs;
    this.#timerRunning = true;
    this.#timerChanges.push({ atMs: t, change: 'start', valueMs: fromMs });
    this.#timerEvent(t, 0x01);
  }

  /** `05` ends the automatic mode's run: the timer reads 0 in the next frame, the weight after. */
  #endRun(t: number): void {
    this.#timerRunning = false;
    this.#timerMs = 0;
    this.#timerChanges.push({ atMs: t, change: 'reset', valueMs: 0 });
    this.#timerEvent(t, 0x00);
    this.#pendingTare = 'command';
  }

  /**
   * The `03 0D` frame the automatic mode sends on FF12 as its run starts or ends: the state, and
   * every other field 0, as the Mini sent them (S1). The timer mode sends none, not even for the
   * app's commands.
   */
  #timerEvent(t: number, stateByte: number): void {
    if (this.#mode !== 'automatic') return;
    const grossG = this.#platform.grossG(t);
    const tag: FrameTag = {
      kind: 'event',
      sampleIndex: null,
      sampleTMs: t,
      grossG,
      offsetG: this.#offsetG,
      noiseG: 0,
      pumpOn: this.#pumpRunning(t),
      weightG: 0,
      timerMs: 0,
      smoothing: this.#smoothing,
    };
    const bytes = encodeEventFrame({
      stateByte,
      timerMs: 0,
      weightG: 0,
      weightSignByte: 0,
      resultSignByte: 0,
    });
    this.#link.send({ source: EVENT_FRAME_SOURCE, bytes, sentMs: t, tag });
  }

  #powerOff(t: number): void {
    this.#poweredOff = true;
    for (const command of this.#pending) {
      this.#commands[command.truthIndex].effect = 'ignored-powered-off';
    }
    this.#pending = [];
    this.#pendingTare = null;
    this.#startAfterFrames = null;
    this.#link.cut(t + this.scale.supervisionTimeoutMs);
  }

  #sample(): void {
    const s = this.scale;
    const t = this.#nextSampleMs;
    const grossG = this.#platform.grossG(t);
    const pumpOn = this.#pumpRunning(t);
    // Both draws happen for every sample, so the base noise doesn't depend on the pump.
    const baseNoise = this.#noiseRng.gaussian() * s.noiseSigmaG;
    const vibration = this.#vibrationRng.gaussian() * s.vibrationSigmaG;
    const noiseG = baseNoise + (pumpOn ? vibration : 0);
    const rawG = grossG + noiseG;

    if (this.#smoothing && this.#filteredG !== null && this.#lastSampleMs !== null) {
      const alpha = 1 - Math.exp(-(t - this.#lastSampleMs) / s.smoothingTauMs);
      this.#filteredG += alpha * (rawG - this.#filteredG);
    } else {
      this.#filteredG = rawG;
    }
    const readingG = this.#filteredG - this.#offsetG;
    const weightG = this.#quantised(readingG);
    const flowGps = this.#flowGps(t, readingG);
    // The timer counts samples: one tick each while it runs, before the frame (S1). The field
    // wraps at 24 bits (after 4.6 hours) rather than failing.
    if (this.#timerRunning) this.#timerMs += s.samplePeriodMs;
    const timerMs = Math.floor(this.#timerMs) % (U24_MAX + 1);

    const tag: FrameTag = {
      kind: 'weight',
      sampleIndex: this.#sampleIndex,
      sampleTMs: t,
      grossG,
      offsetG: this.#offsetG,
      noiseG,
      pumpOn,
      weightG,
      timerMs,
      smoothing: this.#smoothing,
    };
    const bytes = encodeWeightFrame({
      timerMs,
      weightG,
      flowGps,
      unitByte: s.unitByte,
      batteryPct: s.batteryPct,
      standbyMin: this.#autoOffMin,
      buzzerGear: this.#buzzerGear,
      flowSmoothing: this.#smoothing ? 1 : 0,
    });
    this.#link.send({ source: 'ff11', bytes, sentMs: t, tag });

    this.#lastSampleMs = t;
    this.#sampleIndex++;
    this.#nextSampleMs = this.#sampleTimeMs(this.#sampleIndex);
    this.#afterSample(t, grossG - this.#offsetG);
  }

  /**
   * What the scale does once a frame is out. A tare or a timer start it was asked for waits until
   * now (S1: the frame after one never showed it, where a stop or a reset showed at once).
   * `readingG` is the sample's, before noise.
   */
  #afterSample(t: number, readingG: number): void {
    const tare = this.#pendingTare;
    const offsetBefore = this.#offsetG;
    if (tare) {
      this.#pendingTare = null;
      this.#tare(t, tare);
    }
    if (this.#startAfterFrames !== null && --this.#startAfterFrames === 0) {
      this.#startAfterFrames = null;
      if (this.#stoppedAtZero()) this.#startTimer(t, 0);
    }
    if (this.#mode === 'automatic') {
      this.#automatic(t, readingG, tare !== null, this.#offsetG - offsetBefore);
    }
  }

  /**
   * The automatic mode between runs (S1; the thresholds are `AUTOMATIC_MODE`): a vessel put on
   * is tared once it settles, and liquid, or anything light, starts a run. `shiftG` is how far
   * the zero just moved.
   */
  #automatic(t: number, readingG: number, tared: boolean, shiftG: number): void {
    const auto = AUTOMATIC_MODE;
    const lastG = this.#autoLastG;
    const settled = Math.abs(readingG - lastG) <= auto.settledG;
    let levelG = this.#autoLevelG;
    if (!tared && !this.#timerRunning && this.#pendingTare === null) {
      const light = (g: number) => g >= auto.liquidG && g < auto.vesselG;
      if (settled && readingG - levelG >= auto.vesselG) {
        this.#pendingTare = 'auto';
      } else if (light(readingG) && light(lastG)) {
        this.#startTimer(t, auto.runStartMs);
      }
    }
    if (settled) levelG = readingG;
    // Both are kept against the zero now in force.
    this.#autoLastG = readingG - shiftG;
    this.#autoLevelG = levelG - shiftG;
  }

  /**
   * A reading as the frame carries it: at the scale's resolution, held as a float32 in grams,
   * then times 100 in float32 and truncated to whole hundredths. That is how the Themis Mini
   * sends every reading of hardware sessions 1 and 2 (D-058, protocol notes finding 16), so
   * some tenths come a hundredth short: 35.1 as 35.09, −264.8 as −264.79.
   */
  #quantised(readingG: number): number {
    const step = this.scale.resolutionG;
    const held = Math.fround(Math.round(readingG / step) * step);
    return Math.trunc(Math.fround(held * 100)) / 100 + 0;
  }

  /** When sample `k` is taken: the drifted grid plus this sample's jitter. One draw per call. */
  #sampleTimeMs(k: number): number {
    const jitter = (this.#jitterRng.next() * 2 - 1) * this.scale.sampleJitterMs;
    return this.#phaseMs + k * this.#periodMs + jitter;
  }

  /** The scale's own flow figure: the change of the unrounded weight over `flowWindowMs`, g/s. */
  #flowGps(t: number, weightG: number): number {
    const windowStart = t - this.scale.flowWindowMs;
    while (this.#history.length > 1 && this.#history[1].tMs <= windowStart) this.#history.shift();
    const oldest = this.#history[0];
    this.#history.push({ tMs: t, weightG });
    if (!oldest) return 0;
    const flow = (weightG - oldest.weightG) / ((t - oldest.tMs) / 1000);
    return centigrams(Math.max(-MAX_FLOW_GPS, Math.min(MAX_FLOW_GPS, flow)));
  }

  /** Whether the pump runs at `t`. Calls must come in time order. */
  #pumpRunning(t: number): boolean {
    const runs = this.#script.pumpIntervals;
    while (this.#pumpIndex < runs.length && runs[this.#pumpIndex][1] <= t) this.#pumpIndex++;
    return this.#pumpIndex < runs.length && runs[this.#pumpIndex][0] <= t;
  }

  #shotTruths(): ShotTruth[] {
    const dropG = this.scale.dropG;
    return this.#script.shots.map((shot, index) => {
      const cupOff = this.#script.actions.find(
        (action) => action.type === 'cup-off' && action.atMs >= shot.pumpOnMs,
      );
      const cupRemovedMs = cupOff?.atMs ?? null;
      const weightAtPumpOffG = deliveredG(shot, shot.pumpOffMs, dropG);
      const yieldG = finalDeliveredG(shot, dropG);
      const { doseG, preInfusionMs, extractionMs, tailTauMs } = shot.params;
      return {
        index,
        doseG,
        pumpOnMs: shot.pumpOnMs,
        firstDripMs: shot.firstDripMs,
        pumpOffMs: shot.pumpOffMs,
        settledMs: settledAtMs(shot, dropG, SETTLED_TOLERANCE_G),
        cupRemovedMs,
        preInfusionMs,
        extractionMs,
        totalMs: preInfusionMs + extractionMs,
        weightAtPumpOffG,
        flowAtPumpOffGps: shot.flowAtPumpOffGps,
        tailTauMs,
        yieldG,
        tailMassG: yieldG - weightAtPumpOffG,
        honestYieldG: cupRemovedMs === null ? null : deliveredG(shot, cupRemovedMs, dropG),
        averageFlowGps: weightAtPumpOffG / (extractionMs / 1000),
        ratio: doseG > 0 ? yieldG / doseG : null,
      };
    });
  }
}

/** Rounds to 0.01, the frame's resolution, the way the encoder does; never returns -0. */
function centigrams(value: number): number {
  return Math.round(value * 100) / 100 + 0;
}

function toSimFrame(frame: ArrivedFrame<FrameTag>): SimFrame {
  return {
    source: frame.source,
    bytes: frame.bytes,
    tArrival: frame.tArrival,
    truth: { ...frame.tag, corruption: frame.corruption },
  };
}
