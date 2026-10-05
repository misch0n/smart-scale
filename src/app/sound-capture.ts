/**
 * The microphone's sound levels, recorded into every recording in progress (T1.24, D-049,
 * D-050). There is one for the app: there is one microphone, and each `getUserMedia` holds the
 * scale's notifications back for 0.5–0.7 s (D-037). So it is opened once, by the probe's
 * **Record sound** tap, and stays on across recordings until it is stopped or the input ends.
 * Tapped before Connect, it records from the start of the next recording.
 *
 * Into each recording, through its recorder:
 * - `ui-action` `record-sound` with the tap's outcome, as `try-microphone` has;
 * - `sound-started` before the first level frame: `continued` is false when the tap started it
 *   during this recording, true when it was already on as the recording began;
 * - a `mic` frame per reading (`encodeSoundFrame`), about 20 a second;
 * - `sound-input` when the levels pause or resume (B4), and after `sound-started` when they
 *   start paused;
 * - `sound-stopped`, with the reason, when it stops during the recording.
 *
 * The levels it keeps are for display (CLAUDE.md hard rule 3): what is stored is the frames.
 */

import type { Id } from '../core/model';
import { encodeSoundFrame } from '../core/sound';
import {
  soundFlows,
  startSoundMeter,
  type SoundInputState,
  type SoundMeter,
  type SoundMeterDescription,
  type SoundMeterEvent,
  type SoundMeterStart,
} from '../platform/sound-meter';
import { Emitter, type Unsubscribe } from '../transport/emitter';
import type { Recorder } from './recorder';

/** A recorder, as far as the sound capture uses it. */
export type SoundRecorder = Pick<
  Recorder,
  | 'recording'
  | 'recordSound'
  | 'logUiAction'
  | 'logSoundStarted'
  | 'logSoundInput'
  | 'logSoundStopped'
>;

/** Starts the meter: `startSoundMeter` (src/platform), or a fake. */
export type StartSoundMeter = (options: {
  readonly listener: (event: SoundMeterEvent) => void;
}) => Promise<SoundMeterStart>;

export type SoundCaptureStatus = 'off' | 'starting' | 'on';

export interface SoundCaptureState {
  readonly status: SoundCaptureStatus;
  /** What the meter measures, while on. */
  readonly description: SoundMeterDescription | null;
  /** Whether audio reaches the meter, while on. */
  readonly input: SoundInputState | null;
  /** The latest reading while on, a level per measure of the layout in dB; null before one. */
  readonly levelsDb: readonly number[] | null;
  /** Readings since it was started. */
  readonly readings: number;
  /** Why it is off: a failed start, or a stop nobody asked for. Null otherwise. */
  readonly problem: string | null;
}

export interface SoundCaptureOptions {
  /** Default `startSoundMeter`. */
  readonly startMeter?: StartSoundMeter;
}

export class SoundCapture {
  readonly #startMeter: StartSoundMeter;
  readonly #recorders: SoundRecorder[] = [];
  /** For each recorder, the recording `sound-started` was logged in while this meter runs. */
  readonly #startedIn = new Map<SoundRecorder, Id>();
  readonly #changes = new Emitter<void>();
  #status: SoundCaptureStatus = 'off';
  #starting: Promise<void> | null = null;
  /** `stop()` came while starting: the meter is stopped as soon as it is there. */
  #cancelled = false;
  #meter: SoundMeter | null = null;
  #levels: readonly number[] | null = null;
  #readings = 0;
  #problem: string | null = null;

  constructor(options: SoundCaptureOptions = {}) {
    this.#startMeter = options.startMeter ?? startSoundMeter;
  }

  get state(): SoundCaptureState {
    const meter = this.#meter;
    return {
      status: this.#status,
      description: meter?.description ?? null,
      input: meter?.input ?? null,
      levelsDb: this.#levels,
      readings: this.#readings,
      problem: this.#problem,
    };
  }

  /** Calls `listener` after every change, with every reading too: about 20 a second while on. */
  onChange(listener: () => void): Unsubscribe {
    return this.#changes.on(listener);
  }

  /** Records into `recorder`'s recordings from now on. */
  add(recorder: SoundRecorder): void {
    if (!this.#recorders.includes(recorder)) this.#recorders.push(recorder);
  }

  /**
   * Call once `recorder` has started a recording, after its opening events: while on, the
   * levels continue into it, opening with `sound-started`.
   */
  recordingStarted(recorder: SoundRecorder): void {
    if (this.#meter !== null && this.#recorders.includes(recorder)) {
      this.#logStarted(recorder, true);
    }
  }

  /**
   * Opens the microphone and starts recording its levels. Call it straight from a tap
   * handler, with nothing awaited before it (`startSoundMeter`). Resolves once it is on, or
   * has failed (`state.problem`); never rejects.
   */
  start(): Promise<void> {
    if (this.#starting !== null) return this.#starting;
    if (this.#status === 'on') return Promise.resolve();
    // Called before anything else, inside the tap.
    let starting: Promise<SoundMeterStart>;
    try {
      starting = this.#startMeter({ listener: (event) => this.#onMeter(event) });
    } catch (error) {
      starting = Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    this.#status = 'starting';
    this.#problem = null;
    this.#cancelled = false;
    this.#emit();
    this.#starting = starting
      .catch((error: unknown): SoundMeterStart => ({
        outcome: 'error',
        meter: null,
        error: errorText(error),
      }))
      .then((result) => {
        this.#starting = null;
        this.#started(result);
      });
    return this.#starting;
  }

  /** Stops the levels, and lets go of the microphone. */
  stop(): void {
    if (this.#starting !== null) this.#cancelled = true;
    else this.#meter?.stop();
  }

  #started(result: SoundMeterStart): void {
    for (const recorder of this.#recorders) {
      recorder.logUiAction('record-sound', { outcome: result.outcome, error: result.error });
    }
    if (result.meter === null) {
      this.#status = 'off';
      this.#problem = startProblem(result);
    } else if (this.#cancelled) {
      this.#status = 'off';
      result.meter.stop(); // its `stopped` is ignored: it never became the meter
    } else {
      this.#meter = result.meter;
      this.#status = 'on';
      this.#levels = null;
      this.#readings = 0;
      for (const recorder of this.#recorders) this.#logStarted(recorder, false);
    }
    this.#emit();
  }

  #onMeter(event: SoundMeterEvent): void {
    const meter = this.#meter;
    if (meter === null) return;
    if (event.kind === 'levels') {
      this.#levels = event.levelsDb;
      this.#readings++;
      const bytes = encodeSoundFrame(event.levelsDb, meter.description.layout);
      for (const recorder of this.#recorders) {
        this.#logStarted(recorder, true);
        recorder.recordSound(bytes);
      }
    } else if (event.kind === 'input') {
      const { contextState, muted } = event;
      for (const recorder of this.#recorders) {
        // A recording that opens now gets the input's state with its `sound-started`.
        if (!this.#logStarted(recorder, true)) recorder.logSoundInput({ contextState, muted });
      }
    } else {
      const { reason, message } = event;
      for (const recorder of this.#recorders) {
        const recording = recorder.recording;
        if (recording !== null && this.#startedIn.get(recorder) === recording.id) {
          recorder.logSoundStopped({ reason, message });
        }
      }
      this.#startedIn.clear();
      this.#meter = null;
      this.#status = 'off';
      this.#levels = null;
      this.#problem = reason === 'user' ? null : (message ?? `It stopped (${reason})`);
    }
    this.#emit();
  }

  /**
   * Logs `sound-started` in `recorder`'s recording, unless it has been already, and the input's
   * state after it when the levels are paused.
   *
   * @returns whether it logged it now.
   */
  #logStarted(recorder: SoundRecorder, continued: boolean): boolean {
    const meter = this.#meter;
    const recording = recorder.recording;
    if (meter === null || recording === null || this.#startedIn.get(recorder) === recording.id) {
      return false;
    }
    this.#startedIn.set(recorder, recording.id);
    const { layout, sampleRateHz, fftSize, intervalMs, input } = meter.description;
    recorder.logSoundStarted({
      layout: layout.id,
      measures: layout.measures,
      sampleRateHz,
      fftSize,
      intervalMs,
      input,
      continued,
    });
    if (!soundFlows(meter.input)) recorder.logSoundInput({ ...meter.input });
    return true;
  }

  #emit(): void {
    this.#changes.emit();
  }
}

function startProblem(result: SoundMeterStart): string {
  switch (result.outcome) {
    case 'denied':
      return `The microphone was refused${result.error ? ` (${result.error})` : ''}.`;
    case 'unsupported':
      return 'This browser has no microphone access or Web Audio.';
    default:
      return `The microphone didn't start${result.error ? `: ${result.error}` : '.'}`;
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
