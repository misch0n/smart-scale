import { describe, expect, it } from 'vitest';
import { SOUND_LAYOUT } from '../core/sound';
import { ManualClock } from '../transport/scheduler';
import { fakeMicrophone } from './fake-sound';
import {
  SOUND_CONSTRAINTS,
  startSoundMeter,
  type SoundDevicesLike,
  type SoundMeterEvent,
  type SoundMeterOptions,
} from './sound-meter';

function setup(overrides: Partial<SoundMeterOptions> = {}) {
  const clock = new ManualClock(1000);
  const mic = fakeMicrophone();
  const calls: string[] = [];
  const events: SoundMeterEvent[] = [];
  const mediaDevices: SoundDevicesLike = {
    getUserMedia: (constraints) => {
      calls.push('getUserMedia');
      return mic.mediaDevices.getUserMedia!(constraints);
    },
  };
  const start = () =>
    startSoundMeter({
      listener: (event) => events.push(event),
      mediaDevices,
      createAudio: () => {
        calls.push('createAudio');
        return mic.audio;
      },
      timers: clock,
      ...overrides,
    });
  const kinds = () => events.map((event) => event.kind);
  const levels = () => events.filter((event) => event.kind === 'levels');
  return { ...mic, clock, calls, events, start, kinds, levels };
}

const index = (name: string) => SOUND_LAYOUT.measures.findIndex((m) => m.name === name);

describe('startSoundMeter', () => {
  it('opens the raw microphone from the tap, and reads the levels every 50 ms', async () => {
    const env = setup();
    const starting = env.start();
    // Both at once, inside the tap: the audio context first, so it may start.
    expect(env.calls).toEqual(['createAudio', 'getUserMedia']);
    expect(env.asked).toEqual([SOUND_CONSTRAINTS]);
    expect(SOUND_CONSTRAINTS).toEqual({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const result = await starting;
    expect(result.outcome).toBe('granted');
    const meter = result.meter!;
    expect(meter.description).toEqual({
      layout: SOUND_LAYOUT,
      sampleRateHz: 48000,
      fftSize: 4096,
      intervalMs: 50,
      input: 'iPhone Microphone',
    });
    expect(env.audio.listened).toEqual([{ stream: env.stream, fftSize: 4096 }]);
    expect(meter.input).toEqual({ contextState: 'running', muted: false });

    env.clock.advance(49);
    expect(env.events).toEqual([]);
    env.clock.advance(1);
    env.clock.advance(950);
    expect(env.kinds()).toEqual(Array(20).fill('levels'));
    const [first] = env.levels();
    if (first.kind !== 'levels') throw new Error('not levels');
    expect(first.levelsDb).toHaveLength(SOUND_LAYOUT.measures.length);
    expect(first.levelsDb[index('70-130 Hz')]).toBeCloseTo(-20, 9);
    expect(first.levelsDb[index('all')]).toBeCloseTo(-20, 9);
    expect(first.levelsDb[index('40-70 Hz')]).toBe(-Infinity);
    expect(env.audio.resumed).toBe(0);
  });

  it('reads nothing while the input is muted or the audio is interrupted, and says so', async () => {
    const env = setup();
    const meter = (await env.start()).meter!;
    env.clock.advance(50);
    env.track.muted = true;
    env.clock.advance(100);
    env.audio.state = 'interrupted';
    env.track.muted = false;
    env.clock.advance(100);
    env.audio.state = 'running';
    env.clock.advance(50);
    expect(env.events.map((event) => (event.kind === 'levels' ? 'levels' : event))).toEqual([
      'levels',
      { kind: 'input', contextState: 'running', muted: true },
      { kind: 'input', contextState: 'interrupted', muted: false },
      { kind: 'input', contextState: 'running', muted: false },
      'levels',
    ]);
    expect(meter.input).toEqual({ contextState: 'running', muted: false });
  });

  it('asks a suspended audio context to resume, about once a second', async () => {
    const env = setup();
    env.audio.state = 'suspended';
    const meter = (await env.start()).meter!;
    expect(env.audio.resumed).toBe(1);
    env.clock.advance(50);
    expect(env.events).toEqual([{ kind: 'input', contextState: 'suspended', muted: false }]);
    expect(meter.input.contextState).toBe('suspended');
    expect(env.audio.resumed).toBe(2);
    env.clock.advance(19 * 50);
    expect(env.audio.resumed).toBe(2);
    env.clock.advance(50);
    expect(env.audio.resumed).toBe(3);
    env.audio.state = 'running';
    env.clock.advance(50);
    expect(env.kinds().slice(1)).toEqual(['input', 'levels']);
  });

  it('stops for the user: lets go of the microphone and the audio, once', async () => {
    const env = setup();
    const meter = (await env.start()).meter!;
    env.clock.advance(50);
    meter.stop();
    meter.stop();
    env.clock.advance(1000);
    expect(env.kinds()).toEqual(['levels', 'stopped']);
    expect(env.events[1]).toEqual({ kind: 'stopped', reason: 'user', message: null });
    expect(meter.stopped).toBe(true);
    expect(env.track.stopped).toBe(1);
    expect(env.audio.closed).toBe(1);
    expect(env.clock.pendingTimers).toBe(0);
  });

  it('stops by itself when the input ends or the audio context closes', async () => {
    const ended = setup();
    await ended.start();
    ended.track.readyState = 'ended';
    ended.clock.advance(50);
    expect(ended.events).toEqual([
      { kind: 'stopped', reason: 'ended', message: 'The microphone input ended' },
    ]);
    expect(ended.clock.pendingTimers).toBe(0);

    const closed = setup();
    await closed.start();
    closed.audio.state = 'closed';
    closed.clock.advance(50);
    expect(closed.events).toEqual([
      { kind: 'stopped', reason: 'ended', message: 'The audio context closed' },
    ]);
    expect(closed.track.stopped).toBe(1);
  });

  it('stops with an error when a reading fails', async () => {
    const env = setup();
    await env.start();
    env.audio.spectrum = () => {
      throw new Error('analyser gone');
    };
    env.clock.advance(100);
    expect(env.events).toEqual([{ kind: 'stopped', reason: 'error', message: 'analyser gone' }]);
    expect(env.audio.closed).toBe(1);
  });

  it('keeps reading when its listener throws', async () => {
    let calls = 0;
    const env = setup({
      listener: () => {
        calls++;
        throw new Error('listener bug');
      },
    });
    const meter = (await env.start()).meter!;
    const thrown: unknown[] = [];
    const original = globalThis.queueMicrotask;
    globalThis.queueMicrotask = (callback) => {
      try {
        callback();
      } catch (error) {
        thrown.push(error);
      }
    };
    try {
      env.clock.advance(100);
    } finally {
      globalThis.queueMicrotask = original;
    }
    expect(calls).toBe(2);
    expect(thrown).toEqual([new Error('listener bug'), new Error('listener bug')]);
    expect(meter.stopped).toBe(false);
  });

  it('reports a refusal, a failure or a missing API, and leaves nothing open', async () => {
    const denied = setup({
      mediaDevices: {
        getUserMedia: () =>
          Promise.reject(new DOMException('Permission denied', 'NotAllowedError')),
      },
    });
    expect(await denied.start()).toEqual({
      outcome: 'denied',
      meter: null,
      error: 'NotAllowedError: Permission denied',
    });
    expect(denied.audio.closed).toBe(1);

    const noAudio = setup({
      createAudio: () => {
        throw new Error('no audio hardware');
      },
    });
    expect(await noAudio.start()).toEqual({
      outcome: 'error',
      meter: null,
      error: 'no audio hardware',
    });
    expect(noAudio.calls).toEqual([]);

    const unplayable = setup();
    unplayable.audio.listen = () => {
      throw new Error('cannot analyse');
    };
    expect(await unplayable.start()).toEqual({
      outcome: 'error',
      meter: null,
      error: 'cannot analyse',
    });
    expect(unplayable.track.stopped).toBe(1);
    expect(unplayable.audio.closed).toBe(1);
    expect(unplayable.clock.pendingTimers).toBe(0);

    for (const overrides of [
      { mediaDevices: undefined },
      { mediaDevices: {} },
      { createAudio: null },
    ]) {
      const env = setup(overrides);
      expect(await env.start()).toEqual({ outcome: 'unsupported', meter: null, error: null });
      expect(env.calls).toEqual([]);
    }
  });
});
