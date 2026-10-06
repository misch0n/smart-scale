import { describe, expect, it } from 'vitest';
import type { AppEventDataMap, JsonValue, Recording } from '../core/model';
import { decodeSoundFrame, SOUND_LAYOUT } from '../core/sound';
import type {
  SoundMeter,
  SoundMeterEvent,
  SoundMeterStart,
  SoundInputState,
} from '../platform/sound-meter';
import { SoundCapture, type SoundRecorder, type StartSoundMeter } from './sound-capture';

/** A recorder that lists what it is given, by recording, while one is in progress. */
class FakeRecorder implements SoundRecorder {
  recording: Recording | null = null;
  readonly log: [recording: string, type: string, data: JsonValue][] = [];

  begin(id: string): void {
    this.recording = { id } as Recording;
  }

  end(): void {
    this.recording = null;
  }

  /** The log of recording `id`, without its id. */
  of(id: string): [string, JsonValue][] {
    return this.log.filter(([recording]) => recording === id).map(([, type, data]) => [type, data]);
  }

  recordSound(bytes: Uint8Array) {
    this.#add('mic', [...decodeSoundFrame(bytes)!.levelsDb]);
    return null;
  }

  logUiAction(action: string, detail: JsonValue = null) {
    this.#add('ui-action', { action, detail });
    return null;
  }

  logSoundStarted(data: AppEventDataMap['sound-started']) {
    this.#add('sound-started', data);
    return null;
  }

  logSoundInput(data: AppEventDataMap['sound-input']) {
    this.#add('sound-input', data);
    return null;
  }

  logSoundStopped(data: AppEventDataMap['sound-stopped']) {
    this.#add('sound-stopped', data);
    return null;
  }

  #add(type: string, data: JsonValue): void {
    if (this.recording !== null) this.log.push([this.recording.id, type, data]);
  }
}

class FakeMeter implements SoundMeter {
  readonly description = {
    layout: SOUND_LAYOUT,
    sampleRateHz: 48000,
    fftSize: 4096,
    intervalMs: 50,
    input: 'Test microphone',
  };
  input: SoundInputState = { contextState: 'running', muted: false };
  stopped = false;
  readonly #listener: (event: SoundMeterEvent) => void;

  constructor(listener: (event: SoundMeterEvent) => void) {
    this.#listener = listener;
  }

  stop(): void {
    this.end('user', null);
  }

  levels(levelsDb: readonly number[]): void {
    this.#listener({ kind: 'levels', levelsDb });
  }

  setInput(contextState: string, muted = false): void {
    this.input = { contextState, muted };
    this.#listener({ kind: 'input', contextState, muted });
  }

  end(reason: 'user' | 'ended' | 'error', message: string | null): void {
    if (this.stopped) return;
    this.stopped = true;
    this.#listener({ kind: 'stopped', reason, message });
  }
}

function setup() {
  const starts: {
    listener: (event: SoundMeterEvent) => void;
    resolve: (result: SoundMeterStart) => void;
    reject: (error: unknown) => void;
  }[] = [];
  const startMeter: StartSoundMeter = ({ listener }) =>
    new Promise((resolve, reject) => starts.push({ listener, resolve, reject }));
  const capture = new SoundCapture({ startMeter });
  const recorder = new FakeRecorder();
  capture.add(recorder);
  let changes = 0;
  capture.onChange(() => changes++);
  /** Grants the latest start. */
  const grant = (): FakeMeter => {
    const start = starts.at(-1)!;
    const meter = new FakeMeter(start.listener);
    start.resolve({ outcome: 'granted', meter, error: null });
    return meter;
  };
  return { capture, recorder, starts, grant, changes: () => changes };
}

const LEVELS = SOUND_LAYOUT.measures.map((_, i) => -30 - i);
const LEVELS_2 = SOUND_LAYOUT.measures.map((_, i) => -60.5 + i);

const STARTED = {
  layout: 1,
  measures: SOUND_LAYOUT.measures,
  sampleRateHz: 48000,
  fftSize: 4096,
  intervalMs: 50,
  input: 'Test microphone',
};

describe('SoundCapture', () => {
  it('starts the meter from the tap, and records its levels into the recording', async () => {
    const env = setup();
    env.recorder.begin('rec-1');
    const starting = env.capture.start();
    // Inside the tap, with nothing awaited first.
    expect(env.starts).toHaveLength(1);
    expect(env.capture.state.status).toBe('starting');
    const meter = env.grant();
    await starting;
    expect(env.capture.state).toEqual({
      status: 'on',
      description: meter.description,
      input: { contextState: 'running', muted: false },
      levelsDb: null,
      readings: 0,
      problem: null,
      lastStart: 'granted',
    });
    meter.levels(LEVELS);
    meter.levels(LEVELS_2);
    expect(env.capture.state.levelsDb).toEqual(LEVELS_2);
    expect(env.capture.state.readings).toBe(2);
    env.capture.stop();
    expect(meter.stopped).toBe(true);
    expect(env.capture.state).toMatchObject({ status: 'off', levelsDb: null, problem: null });
    expect(env.recorder.of('rec-1')).toEqual([
      ['ui-action', { action: 'record-sound', detail: { outcome: 'granted', error: null } }],
      ['sound-started', { ...STARTED, continued: false }],
      ['mic', LEVELS],
      ['mic', LEVELS_2],
      ['sound-stopped', { reason: 'user', message: null }],
    ]);
    expect(env.changes()).toBe(5); // starting, on, two readings, off
  });

  it('started before a recording, continues into each recording that begins', async () => {
    const env = setup();
    const starting = env.capture.start();
    const meter = env.grant();
    await starting;
    meter.levels(LEVELS); // nothing is recording
    env.recorder.begin('rec-1');
    env.capture.recordingStarted(env.recorder);
    meter.levels(LEVELS);
    env.recorder.end();
    meter.levels(LEVELS);
    env.recorder.begin('rec-2');
    // Without being told, it still opens the recording before the first level.
    meter.levels(LEVELS_2);
    env.capture.recordingStarted(env.recorder);
    expect(env.recorder.of('rec-1')).toEqual([
      ['sound-started', { ...STARTED, continued: true }],
      ['mic', LEVELS],
    ]);
    expect(env.recorder.of('rec-2')).toEqual([
      ['sound-started', { ...STARTED, continued: true }],
      ['mic', LEVELS_2],
    ]);
    expect(env.capture.state.readings).toBe(4);
  });

  it('logs the levels pausing and resuming, and opens a recording paused when they are', async () => {
    const env = setup();
    env.recorder.begin('rec-1');
    const starting = env.capture.start();
    const meter = env.grant();
    await starting;
    meter.setInput('interrupted');
    meter.setInput('running', true);
    meter.setInput('running');
    meter.setInput('suspended');
    expect(env.capture.state.input).toEqual({ contextState: 'suspended', muted: false });
    env.recorder.end();
    env.recorder.begin('rec-2');
    env.capture.recordingStarted(env.recorder);
    meter.setInput('running');
    meter.levels(LEVELS);
    expect(env.recorder.of('rec-1').slice(2)).toEqual([
      ['sound-input', { contextState: 'interrupted', muted: false }],
      ['sound-input', { contextState: 'running', muted: true }],
      ['sound-input', { contextState: 'running', muted: false }],
      ['sound-input', { contextState: 'suspended', muted: false }],
    ]);
    expect(env.recorder.of('rec-2')).toEqual([
      ['sound-started', { ...STARTED, continued: true }],
      ['sound-input', { contextState: 'suspended', muted: false }],
      ['sound-input', { contextState: 'running', muted: false }],
      ['mic', LEVELS],
    ]);
  });

  it('logs a stop it did not ask for, says why, and can start again', async () => {
    const env = setup();
    env.recorder.begin('rec-1');
    const starting = env.capture.start();
    const meter = env.grant();
    await starting;
    expect(env.capture.state.status).toBe('on');
    meter.end('ended', 'The microphone input ended');
    expect(env.capture.state).toMatchObject({
      status: 'off',
      description: null,
      input: null,
      problem: 'The microphone input ended',
    });
    meter.levels(LEVELS); // a stopped meter's last word changes nothing
    const again = env.capture.start();
    expect(env.capture.state.problem).toBeNull();
    env.grant();
    await again;
    expect(
      env.recorder
        .of('rec-1')
        .map(([type, data]) => [type, (data as { continued?: boolean }).continued]),
    ).toEqual([
      ['ui-action', undefined],
      ['sound-started', false],
      ['sound-stopped', undefined],
      ['ui-action', undefined],
      ['sound-started', false],
    ]);
    expect(env.recorder.of('rec-1')[2]).toEqual([
      'sound-stopped',
      { reason: 'ended', message: 'The microphone input ended' },
    ]);
  });

  it('reports a start that fails, and logs the outcome of the tap', async () => {
    const env = setup();
    env.recorder.begin('rec-1');
    const cases: [(start: (typeof env.starts)[number]) => void, string][] = [
      [
        (start) =>
          start.resolve({
            outcome: 'denied',
            meter: null,
            error: 'NotAllowedError: Permission denied',
          }),
        'The microphone was refused (NotAllowedError: Permission denied).',
      ],
      [
        (start) => start.resolve({ outcome: 'unsupported', meter: null, error: null }),
        'This browser has no microphone access or Web Audio.',
      ],
      [
        (start) => start.resolve({ outcome: 'error', meter: null, error: 'NotFoundError: none' }),
        "The microphone didn't start: NotFoundError: none",
      ],
      [(start) => start.reject(new Error('meter bug')), "The microphone didn't start: meter bug"],
    ];
    for (const [settle, problem] of cases) {
      const starting = env.capture.start();
      settle(env.starts.at(-1)!);
      await starting;
      expect(env.capture.state).toMatchObject({ status: 'off', problem });
    }
    expect(env.recorder.of('rec-1')).toEqual([
      [
        'ui-action',
        {
          action: 'record-sound',
          detail: { outcome: 'denied', error: 'NotAllowedError: Permission denied' },
        },
      ],
      ['ui-action', { action: 'record-sound', detail: { outcome: 'unsupported', error: null } }],
      [
        'ui-action',
        { action: 'record-sound', detail: { outcome: 'error', error: 'NotFoundError: none' } },
      ],
      ['ui-action', { action: 'record-sound', detail: { outcome: 'error', error: 'meter bug' } }],
    ]);
  });

  it('reports a meter that throws instead of starting', async () => {
    const capture = new SoundCapture({
      startMeter: () => {
        throw new Error('no meter');
      },
    });
    await capture.start();
    expect(capture.state).toMatchObject({
      status: 'off',
      problem: "The microphone didn't start: no meter",
      lastStart: 'error',
    });
  });

  it('opens the microphone once: a second tap while starting or on does nothing', async () => {
    const env = setup();
    const first = env.capture.start();
    expect(env.capture.start()).toBe(first);
    env.grant();
    await first;
    await env.capture.start();
    expect(env.starts).toHaveLength(1);
  });

  it('stopped while starting, stops the meter as soon as it is there', async () => {
    const env = setup();
    env.recorder.begin('rec-1');
    const starting = env.capture.start();
    env.capture.stop();
    expect(env.capture.state.status).toBe('starting');
    const meter = env.grant();
    await starting;
    expect(meter.stopped).toBe(true);
    expect(env.capture.state).toMatchObject({ status: 'off', problem: null });
    expect(env.recorder.of('rec-1')).toEqual([
      ['ui-action', { action: 'record-sound', detail: { outcome: 'granted', error: null } }],
    ]);
  });

  it('records into every recorder added, once each', async () => {
    const env = setup();
    const other = new FakeRecorder();
    env.capture.add(other);
    env.capture.add(other);
    env.recorder.begin('rec-1');
    other.begin('rec-2');
    const starting = env.capture.start();
    const meter = env.grant();
    await starting;
    meter.levels(LEVELS);
    for (const [recorder, id] of [
      [env.recorder, 'rec-1'],
      [other, 'rec-2'],
    ] as const) {
      expect(recorder.of(id).map(([type]) => type)).toEqual(['ui-action', 'sound-started', 'mic']);
    }
    // A recorder never added isn't told.
    const stranger = new FakeRecorder();
    stranger.begin('rec-3');
    env.capture.recordingStarted(stranger);
    expect(stranger.log).toEqual([]);
  });
});
