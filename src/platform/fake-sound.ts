/**
 * Test support, for tests only: a microphone and Web Audio for `startSoundMeter`, since Node
 * has neither. The audio's spectrum is whatever the test sets.
 */

import type { SoundAudio, SoundDevicesLike, SoundStreamLike } from './sound-meter';

export class FakeAudio implements SoundAudio {
  state = 'running';
  sampleRateHz = 48000;
  readonly listened: { stream: SoundStreamLike; fftSize: number }[] = [];
  resumed = 0;
  closed = 0;
  /** Fills each spectrum: by default one bin, at 105 Hz, at −20 dB, and silence elsewhere. */
  spectrum = (binDb: Float32Array): void => {
    binDb.fill(-Infinity);
    binDb[9] = -20;
  };

  listen(stream: SoundStreamLike, fftSize: number): void {
    this.listened.push({ stream, fftSize });
  }

  read(binDb: Float32Array<ArrayBuffer>): void {
    this.spectrum(binDb);
  }

  resume(): Promise<void> {
    this.resumed++;
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closed++;
    return Promise.resolve();
  }
}

export class FakeTrack {
  readonly label = 'iPhone Microphone';
  muted = false;
  readyState = 'live';
  stopped = 0;

  stop(): void {
    this.stopped++;
    this.readyState = 'ended';
  }
}

/** A microphone that grants every request, with one track, and the audio to go with it. */
export function fakeMicrophone() {
  const audio = new FakeAudio();
  const track = new FakeTrack();
  const stream: SoundStreamLike = { getTracks: () => [track] };
  /** The constraints of each `getUserMedia`. */
  const asked: MediaStreamConstraints[] = [];
  const mediaDevices: SoundDevicesLike = {
    getUserMedia: (constraints) => {
      asked.push(constraints);
      return Promise.resolve(stream);
    },
  };
  return { audio, track, stream, asked, mediaDevices, createAudio: () => audio };
}
