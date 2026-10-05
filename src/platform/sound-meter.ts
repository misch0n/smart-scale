/**
 * The microphone's sound levels, live (T1.24, D-049, D-050). Web Audio's `AnalyserNode` on the
 * microphone gives a spectrum, and every 50 ms it becomes the levels of a `SoundLayout`
 * (src/core/sound). The probe's sound capture (src/app/sound-capture.ts) records them as `mic`
 * frames. Only levels leave here: the audio itself is never kept.
 *
 * Open it once and keep it open: each `getUserMedia` holds the scale's notifications back for
 * 0.5–0.7 s on the phone (D-037).
 *
 * Levels are read only while audio reaches the analyser: while the audio context is `running`
 * and the input isn't muted. Safari suspends or interrupts the context, and mutes the input,
 * when the page goes to the background or a call takes the microphone (B4). Each change is
 * reported, so the gap it leaves in the levels is explained.
 */

import type { SoundStopReason } from '../core/model';
import { SOUND_LAYOUT, soundLevels, type SoundLayout } from '../core/sound';
import { mediaFailure } from './microphone';

/**
 * The spectrum's size, samples. At 48 kHz its bins are 11.7 Hz wide, fine enough to tell the
 * 50 Hz harmonics from the 60 Hz ones, and it spans the last 85 ms.
 */
export const SOUND_FFT_SIZE = 4096;

/** How often the levels are read, ms: about 20 times a second. */
export const SOUND_INTERVAL_MS = 50;

/** How often a suspended audio context is asked to resume, in readings: about once a second. */
const RESUME_EVERY = 20;

/** What the meter measures: what `sound-started` records. */
export interface SoundMeterDescription {
  readonly layout: SoundLayout;
  readonly sampleRateHz: number;
  readonly fftSize: number;
  readonly intervalMs: number;
  /** The input's label, like "iPhone Microphone"; null when the browser doesn't give one. */
  readonly input: string | null;
}

/** Whether audio reaches the meter. Levels are read only while it is `running` and not muted. */
export interface SoundInputState {
  /** The audio context's state: `running`, `suspended`, `closed`, or Safari's `interrupted`. */
  readonly contextState: string;
  /** Whether the input track is muted. */
  readonly muted: boolean;
}

/** Whether levels are read in `input`. */
export function soundFlows(input: SoundInputState): boolean {
  return input.contextState === 'running' && !input.muted;
}

export type SoundMeterEvent =
  /** One reading: a level per measure of the layout, dB. */
  | { readonly kind: 'levels'; readonly levelsDb: readonly number[] }
  /** The input changed state. */
  | ({ readonly kind: 'input' } & SoundInputState)
  /** The meter stopped, for good, and let go of the microphone. */
  | {
      readonly kind: 'stopped';
      readonly reason: SoundStopReason;
      readonly message: string | null;
    };

export interface SoundMeter {
  readonly description: SoundMeterDescription;
  /** The input's state as last seen. */
  readonly input: SoundInputState;
  readonly stopped: boolean;
  /** Stops reading and lets go of the microphone. Reports `stopped` with the reason `user`. */
  stop(): void;
}

export type SoundMeterStart =
  | { readonly outcome: 'granted'; readonly meter: SoundMeter; readonly error: null }
  | {
      /** As `tryMicrophone` reports it; `unsupported` when there's no microphone API or Web Audio. */
      readonly outcome: 'denied' | 'error' | 'unsupported';
      readonly meter: null;
      readonly error: string | null;
    };

/** A microphone track, as far as the meter uses it. Loose, so tests can pass fakes. */
export interface SoundTrackLike {
  readonly label?: string;
  readonly muted?: boolean;
  /** `live`, or `ended` once the input is gone. */
  readonly readyState?: string;
  stop(): void;
}

/** A `MediaStream`, as far as the meter uses it. */
export interface SoundStreamLike {
  getTracks(): readonly SoundTrackLike[];
}

/** `navigator.mediaDevices`, as far as the meter uses it. */
export interface SoundDevicesLike {
  readonly getUserMedia?: (constraints: MediaStreamConstraints) => Promise<SoundStreamLike>;
}

/** The Web Audio side: an audio context and an analyser on the input. */
export interface SoundAudio {
  /** The context's state (`SoundInputState.contextState`). */
  readonly state: string;
  readonly sampleRateHz: number;
  /** Starts analysing `stream`'s audio, `fftSize` samples at a time. */
  listen(stream: SoundStreamLike, fftSize: number): void;
  /** Writes the latest spectrum into `binDb`, `fftSize / 2` levels in dB, bin i at i · rate / size. */
  read(binDb: Float32Array<ArrayBuffer>): void;
  resume(): Promise<void>;
  close(): Promise<void>;
}

/** Timers, injected so tests can run on virtual time. `ManualClock` (src/transport) fits. */
export interface SoundMeterTimers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export interface SoundMeterOptions {
  /** Gets every reading, every change of the input's state, and the stop. */
  readonly listener: (event: SoundMeterEvent) => void;
  /** Default `navigator.mediaDevices`. */
  readonly mediaDevices?: SoundDevicesLike;
  /** Makes the audio side. Default: Web Audio; null where the runtime has none. */
  readonly createAudio?: (() => SoundAudio) | null;
  readonly timers?: SoundMeterTimers;
  readonly layout?: SoundLayout;
}

/**
 * The input as the meter wants it: no echo cancellation, noise suppression or automatic gain,
 * so that levels from different moments compare. A runtime that can't turn one off ignores it.
 */
export const SOUND_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
};

/**
 * Opens the microphone and starts reading its levels. Call it straight from a tap handler,
 * with nothing awaited before it: the audio context is made at once, since browsers let it
 * start only with the tap's user activation, and some ask for the microphone only then too.
 * Never throws.
 */
export async function startSoundMeter(options: SoundMeterOptions): Promise<SoundMeterStart> {
  const devices =
    'mediaDevices' in options ? options.mediaDevices : globalThis.navigator?.mediaDevices;
  const getUserMedia = devices?.getUserMedia?.bind(devices);
  const createAudio = options.createAudio === undefined ? defaultAudio() : options.createAudio;
  if (!getUserMedia || !createAudio) return { outcome: 'unsupported', meter: null, error: null };
  let audio: SoundAudio;
  try {
    audio = createAudio();
  } catch (error) {
    return { outcome: 'error', meter: null, error: errorText(error) };
  }
  let stream: SoundStreamLike;
  try {
    stream = await getUserMedia(SOUND_CONSTRAINTS);
  } catch (error) {
    closeQuietly(audio);
    return { ...mediaFailure(error), meter: null };
  }
  const tracks = stream.getTracks();
  try {
    audio.listen(stream, SOUND_FFT_SIZE);
  } catch (error) {
    for (const track of tracks) track.stop();
    closeQuietly(audio);
    return { outcome: 'error', meter: null, error: errorText(error) };
  }
  const meter = new RunningMeter(audio, tracks, options);
  return { outcome: 'granted', meter, error: null };
}

class RunningMeter implements SoundMeter {
  readonly description: SoundMeterDescription;
  #input: SoundInputState;
  #stopped = false;
  readonly #audio: SoundAudio;
  readonly #tracks: readonly SoundTrackLike[];
  readonly #listener: (event: SoundMeterEvent) => void;
  readonly #timers: SoundMeterTimers;
  readonly #bins = new Float32Array(SOUND_FFT_SIZE / 2);
  #timer: unknown = null;
  /** Readings in a row that found the context suspended. */
  #suspendedFor = 0;

  constructor(audio: SoundAudio, tracks: readonly SoundTrackLike[], options: SoundMeterOptions) {
    this.#audio = audio;
    this.#tracks = tracks;
    this.#listener = options.listener;
    this.#timers = options.timers ?? GLOBAL_TIMERS;
    this.description = {
      layout: options.layout ?? SOUND_LAYOUT,
      sampleRateHz: audio.sampleRateHz,
      fftSize: SOUND_FFT_SIZE,
      intervalMs: SOUND_INTERVAL_MS,
      input: tracks.find((track) => track.label)?.label ?? null,
    };
    // Taken as flowing: the first reading reports it if it isn't.
    this.#input = { contextState: 'running', muted: false };
    // Without a tap's activation the context can stay suspended until the microphone runs.
    if (audio.state === 'suspended') this.#resume();
    this.#schedule();
  }

  get input(): SoundInputState {
    return this.#input;
  }

  get stopped(): boolean {
    return this.#stopped;
  }

  stop(): void {
    this.#finish('user', null);
  }

  #schedule(): void {
    this.#timer = this.#timers.setTimeout(() => {
      this.#timer = null;
      this.#read();
      if (!this.#stopped) this.#schedule();
    }, SOUND_INTERVAL_MS);
  }

  #read(): void {
    try {
      if (this.#tracks.every((track) => track.readyState === 'ended')) {
        this.#finish('ended', 'The microphone input ended');
        return;
      }
      const contextState = this.#audio.state;
      if (contextState === 'closed') {
        this.#finish('ended', 'The audio context closed');
        return;
      }
      const muted = this.#tracks.some((track) => track.muted === true);
      if (contextState !== this.#input.contextState || muted !== this.#input.muted) {
        this.#input = { contextState, muted };
        this.#emit({ kind: 'input', contextState, muted });
      }
      if (contextState === 'suspended') {
        if (this.#suspendedFor++ % RESUME_EVERY === 0) this.#resume();
      } else {
        this.#suspendedFor = 0;
      }
      if (!soundFlows(this.#input)) return;
      this.#audio.read(this.#bins);
      const { sampleRateHz, fftSize, layout } = this.description;
      this.#emit({
        kind: 'levels',
        levelsDb: soundLevels(this.#bins, sampleRateHz, fftSize, layout),
      });
    } catch (error) {
      this.#finish('error', errorText(error));
    }
  }

  #resume(): void {
    // Refused without user activation in some runtimes: the next attempt may be allowed.
    try {
      this.#audio.resume().catch(() => {});
    } catch {
      // As refused.
    }
  }

  #finish(reason: SoundStopReason, message: string | null): void {
    if (this.#stopped) return;
    this.#stopped = true;
    if (this.#timer !== null) this.#timers.clearTimeout(this.#timer);
    this.#timer = null;
    for (const track of this.#tracks) {
      try {
        track.stop();
      } catch {
        // Already stopped, or gone with the input.
      }
    }
    closeQuietly(this.#audio);
    this.#emit({ kind: 'stopped', reason, message });
  }

  #emit(event: SoundMeterEvent): void {
    try {
      this.#listener(event);
    } catch (error) {
      // The listener's failure is its own: report it, and keep measuring.
      queueMicrotask(() => {
        throw error;
      });
    }
  }
}

/** Web Audio, where the runtime has it. */
function defaultAudio(): (() => SoundAudio) | null {
  return typeof globalThis.AudioContext === 'function' ? webAudio : null;
}

function webAudio(): SoundAudio {
  const context = new AudioContext();
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  return {
    get state() {
      return context.state as string;
    },
    get sampleRateHz() {
      return context.sampleRate;
    },
    listen(stream, fftSize) {
      analyser = context.createAnalyser();
      analyser.fftSize = fftSize;
      // Each reading its own spectrum, not averaged with the ones before.
      analyser.smoothingTimeConstant = 0;
      // Not connected to the output, so nothing is played: an analyser runs without it.
      source = context.createMediaStreamSource(stream as MediaStream);
      source.connect(analyser);
    },
    read(binDb) {
      analyser?.getFloatFrequencyData(binDb);
    },
    resume: () => context.resume(),
    close() {
      source?.disconnect();
      return context.close();
    },
  };
}

function closeQuietly(audio: SoundAudio): void {
  try {
    audio.close().catch(() => {});
  } catch {
    // Closing is tidying up: a failure changes nothing.
  }
}

type GlobalTimerId = ReturnType<typeof globalThis.setTimeout>;

const GLOBAL_TIMERS: SoundMeterTimers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as GlobalTimerId),
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
