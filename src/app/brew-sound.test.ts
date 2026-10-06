import { describe, expect, it } from 'vitest';
import type { JsonValue } from '../core/model';
import { SOUND_LAYOUT } from '../core/sound';
import type { SoundMeter, SoundMeterEvent, SoundMeterStart } from '../platform/sound-meter';
import { BREW_SOUND_KEY, BrewSound } from './brew-sound';
import { SoundCapture, type StartSoundMeter } from './sound-capture';

/** `storage.local`, in memory; `failing` makes every call fail. */
class FakeLocal {
  readonly values = new Map<string, JsonValue>();
  failing = false;

  get(key: string): Promise<JsonValue | undefined> {
    if (this.failing) return Promise.reject(new Error('unreadable'));
    return Promise.resolve(this.values.get(key));
  }

  set(key: string, value: JsonValue): Promise<void> {
    if (this.failing) return Promise.reject(new Error('disk full'));
    this.values.set(key, value);
    return Promise.resolve();
  }
}

/** A meter that stops when asked, as the real one does. */
function meter(listener: (event: SoundMeterEvent) => void): SoundMeter {
  const running = {
    description: {
      layout: SOUND_LAYOUT,
      sampleRateHz: 48000,
      fftSize: 4096,
      intervalMs: 50,
      input: 'Test microphone',
    },
    input: { contextState: 'running', muted: false },
    stopped: false,
    stop() {
      if (running.stopped) return;
      running.stopped = true;
      listener({ kind: 'stopped', reason: 'user', message: null });
    },
  };
  return running;
}

/** A sound capture whose starts the test answers. */
function capture() {
  const starts: {
    listener: (event: SoundMeterEvent) => void;
    resolve: (result: SoundMeterStart) => void;
  }[] = [];
  const startMeter: StartSoundMeter = ({ listener }) =>
    new Promise((resolve) => starts.push({ listener, resolve }));
  const sound = new SoundCapture({ startMeter });
  const answer = async (outcome: SoundMeterStart['outcome']) => {
    const start = starts.at(-1)!;
    start.resolve(
      outcome === 'granted'
        ? { outcome, meter: meter(start.listener), error: null }
        : { outcome, meter: null, error: null },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { sound, starts, answer };
}

describe('BrewSound (T2.18)', () => {
  it('is on by default, and keeps its switch on the device', async () => {
    const local = new FakeLocal();
    const { sound } = capture();
    const brewSound = await BrewSound.load(local, sound);
    expect(brewSound.enabled).toBe(true);
    let changes = 0;
    brewSound.onChange(() => changes++);
    await brewSound.setEnabled(false);
    expect(brewSound.enabled).toBe(false);
    expect(changes).toBe(1);
    expect(local.values.get(BREW_SOUND_KEY)).toBe(false);
    expect((await BrewSound.load(local, sound)).enabled).toBe(false);
    // A switch that can't be read or stored is on, and kept for the session.
    local.failing = true;
    expect((await BrewSound.load(local, sound)).enabled).toBe(true);
    await brewSound.setEnabled(true);
    expect(brewSound.enabled).toBe(true);
  });

  it('turns the levels on at a tap, once', async () => {
    const { sound, starts, answer } = capture();
    const brewSound = await BrewSound.load(new FakeLocal(), sound);
    brewSound.tap();
    expect(starts).toHaveLength(1);
    expect(sound.state.status).toBe('starting');
    brewSound.tap();
    expect(starts).toHaveLength(1);
    await answer('granted');
    expect(sound.state.status).toBe('on');
    brewSound.tap();
    expect(starts).toHaveLength(1);
  });

  it('does nothing when switched off', async () => {
    const { sound, starts } = capture();
    const brewSound = await BrewSound.load(new FakeLocal(), sound);
    await brewSound.setEnabled(false);
    brewSound.tap();
    expect(starts).toHaveLength(0);
  });

  it('asks no more once the microphone was refused or there is none; again after an error', async () => {
    for (const outcome of ['denied', 'unsupported'] as const) {
      const { sound, starts, answer } = capture();
      const brewSound = await BrewSound.load(new FakeLocal(), sound);
      brewSound.tap();
      await answer(outcome);
      brewSound.tap();
      expect(starts).toHaveLength(1);
    }
    const { sound, starts, answer } = capture();
    const brewSound = await BrewSound.load(new FakeLocal(), sound);
    brewSound.tap();
    await answer('error');
    brewSound.tap();
    expect(starts).toHaveLength(2);
  });

  it('turns off the levels it turned on when switched off, not the probe’s', async () => {
    const mine = capture();
    const brewSound = await BrewSound.load(new FakeLocal(), mine.sound);
    brewSound.tap();
    await mine.answer('granted');
    await brewSound.setEnabled(false);
    expect(mine.sound.state.status).toBe('off');

    const probe = capture();
    const other = await BrewSound.load(new FakeLocal(), probe.sound);
    void probe.sound.start();
    await probe.answer('granted');
    await other.setEnabled(false);
    expect(probe.sound.state.status).toBe('on');
  });
});
