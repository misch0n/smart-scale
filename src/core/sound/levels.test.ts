import { describe, expect, it } from 'vitest';
import {
  decodeSoundFrame,
  encodeSoundFrame,
  SOUND_FLOOR_DB,
  SOUND_LAYOUT,
  SOUND_LAYOUT_1,
  SOUND_LAYOUTS,
  soundLevelByte,
  soundLevels,
  type SoundLayout,
} from './levels';

const SAMPLE_RATE = 48000;
const FFT_SIZE = 4096;
const BIN_HZ = SAMPLE_RATE / FFT_SIZE; // 11.72 Hz

/** A spectrum of `fftSize / 2` bins, all at `floorDb`, with `peaks` (Hz → dB) on their nearest bin. */
function spectrum(peaks: Readonly<Record<number, number>> = {}, floorDb = -Infinity): Float32Array {
  const bins = new Float32Array(FFT_SIZE / 2).fill(floorDb);
  for (const [hz, db] of Object.entries(peaks)) bins[Math.round(Number(hz) / BIN_HZ)] = db;
  return bins;
}

const indexOf = (name: string) => SOUND_LAYOUT.measures.findIndex((m) => m.name === name);

describe('soundLevels', () => {
  it('sums power within a band, and gives −Infinity for silence', () => {
    // Two bins at −60 dB inside 260–520 Hz: twice the power, +3 dB.
    const levels = soundLevels(spectrum({ 300: -60, 400: -60 }), SAMPLE_RATE, FFT_SIZE);
    expect(levels[indexOf('260-520 Hz')]).toBeCloseTo(-60 + 10 * Math.log10(2), 6);
    expect(levels[indexOf('all')]).toBeCloseTo(-60 + 10 * Math.log10(2), 6);
    expect(levels[indexOf('8-16 kHz')]).toBe(-Infinity);
  });

  it('puts the mains hum in the first band and its harmonics in the 50 Hz comb', () => {
    // A vibratory pump on 50 Hz mains: 50 Hz and its harmonics.
    const pump = spectrum({ 50: -50, 100: -45, 150: -48, 200: -52, 250: -55 }, -100);
    const levels = soundLevels(pump, SAMPLE_RATE, FFT_SIZE);
    expect(levels[indexOf('40-70 Hz')]).toBeGreaterThan(-51);
    const comb50 = levels[indexOf('50 Hz harmonics')];
    const comb60 = levels[indexOf('60 Hz harmonics')];
    // The 50 Hz comb catches every harmonic. The 60 Hz one only shares bins near 300 Hz and up.
    expect(comb50).toBeGreaterThan(-43);
    expect(comb50 - comb60).toBeGreaterThan(3);
  });

  it('tells a tonal hum from broadband noise of the same power', () => {
    const hum = soundLevels(spectrum({ 100: -40 }, -120), SAMPLE_RATE, FFT_SIZE);
    const noise = soundLevels(spectrum({}, -40 - 10 * Math.log10(80)), SAMPLE_RATE, FFT_SIZE);
    const comb = indexOf('50 Hz harmonics');
    const band = indexOf('70-130 Hz');
    // The hum is all in the comb; the noise is spread, so the comb holds a small share of it.
    expect(hum[comb] - hum[band]).toBeGreaterThan(-0.1);
    expect(noise[comb] - noise[indexOf('all')]).toBeLessThan(-10);
  });

  it('works at 44.1 kHz too, and refuses a bad sample rate or FFT size', () => {
    const bins = new Float32Array(FFT_SIZE / 2).fill(-Infinity);
    bins[Math.round(100 / (44100 / FFT_SIZE))] = -30;
    expect(soundLevels(bins, 44100, FFT_SIZE)[indexOf('70-130 Hz')]).toBeCloseTo(-30, 6);
    expect(() => soundLevels(bins, 0, FFT_SIZE)).toThrow(RangeError);
    expect(() => soundLevels(bins, 44100, Number.NaN)).toThrow(RangeError);
  });

  it('takes a custom layout', () => {
    const layout: SoundLayout = {
      id: 99,
      measures: [{ kind: 'band', name: 'low', fromHz: 0, toHz: 100 }],
    };
    expect(soundLevels(spectrum({ 50: -20 }), SAMPLE_RATE, FFT_SIZE, layout)).toEqual([-20]);
  });
});

describe('mic frames', () => {
  it('stores each level in half-dB steps, clamped to 0 … −127.5 dB', () => {
    expect(soundLevelByte(0)).toBe(0);
    expect(soundLevelByte(3)).toBe(0);
    expect(soundLevelByte(-42.26)).toBe(85);
    expect(soundLevelByte(-127.5)).toBe(255);
    expect(soundLevelByte(-200)).toBe(255);
    expect(soundLevelByte(-Infinity)).toBe(255);
    expect(soundLevelByte(Number.NaN)).toBe(255);
  });

  it('round-trips through the layout id and one byte per level', () => {
    const levels = SOUND_LAYOUT.measures.map((_, i) => -10 - 7.5 * i);
    const bytes = encodeSoundFrame(levels);
    expect(bytes).toHaveLength(1 + SOUND_LAYOUT.measures.length);
    expect(bytes[0]).toBe(SOUND_LAYOUT.id);
    const decoded = decodeSoundFrame(bytes)!;
    expect(decoded.layout).toBe(SOUND_LAYOUT_1);
    expect(decoded.levelsDb).toEqual(levels);
    expect(
      decodeSoundFrame(encodeSoundFrame(SOUND_LAYOUT.measures.map(() => -Infinity)))!.levelsDb,
    ).toEqual(SOUND_LAYOUT.measures.map(() => SOUND_FLOOR_DB));
  });

  it('refuses an unknown layout, the wrong length, or levels that don’t fit the layout', () => {
    const bytes = encodeSoundFrame(SOUND_LAYOUT.measures.map(() => -60));
    expect(decodeSoundFrame(bytes.subarray(0, bytes.length - 1))).toBeNull();
    expect(decodeSoundFrame(Uint8Array.from([2, ...bytes.subarray(1)]))).toBeNull();
    expect(decodeSoundFrame(new Uint8Array(0))).toBeNull();
    expect(() => encodeSoundFrame([-60])).toThrow(RangeError);
  });

  it('knows layout 1 by its id', () => {
    expect(SOUND_LAYOUTS.get(1)).toBe(SOUND_LAYOUT_1);
    expect(SOUND_LAYOUT_1.measures).toHaveLength(12);
  });
});
