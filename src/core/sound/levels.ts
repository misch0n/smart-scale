/**
 * The microphone's sound levels (T1.24, D-049): what a `mic` frame holds, and how a spectrum
 * becomes one. Pure: the platform's sound meter (src/platform/sound-meter.ts) supplies spectra,
 * and the recorder stores the bytes `encodeSoundFrame` makes.
 *
 * The scale can't see the pump (A2, D-048), so these levels are recorded for T3.1 to find the
 * pump in. A vibratory pump hums at the mains frequency and its harmonics, and a grinder is
 * broadband and high (spec v2 "Audio viability"). So a layout has octave bands for the spectrum's
 * shape, and combs that collect the 50 and 60 Hz harmonics for its tonality. Levels only: they
 * can't be played back, so nothing said in the room is kept.
 */

/** One of a layout's levels: a band of frequencies, or a comb on a fundamental's harmonics. */
export type SoundMeasure =
  /** The bins whose centre frequency is from `fromHz` up to, but not including, `toHz`. */
  | { readonly kind: 'band'; readonly name: string; readonly fromHz: number; readonly toHz: number }
  /**
   * For each harmonic `k · fundamentalHz`, k from 1 to `harmonics`, the bin nearest it. Only that
   * bin: at the meter's 11.7 Hz bins, the 50 Hz and 60 Hz combs' low harmonics are a bin apart,
   * and their neighbours would overlap. A comb is an indicator, compared over time.
   */
  | {
      readonly kind: 'comb';
      readonly name: string;
      readonly fundamentalHz: number;
      readonly harmonics: number;
    };

/** The levels a `mic` frame carries, in order. Its id is the frame's first byte. */
export interface SoundLayout {
  readonly id: number;
  readonly measures: readonly SoundMeasure[];
}

/**
 * Layout 1. Octave bands from 40 Hz to 16 kHz, with the mains hum's fundamental (50 and 60 Hz)
 * in the first; the 50 Hz and 60 Hz harmonic combs up to about 1 kHz; and the overall level.
 */
export const SOUND_LAYOUT_1: SoundLayout = {
  id: 1,
  measures: [
    { kind: 'band', name: '40-70 Hz', fromHz: 40, toHz: 70 },
    { kind: 'band', name: '70-130 Hz', fromHz: 70, toHz: 130 },
    { kind: 'band', name: '130-260 Hz', fromHz: 130, toHz: 260 },
    { kind: 'band', name: '260-520 Hz', fromHz: 260, toHz: 520 },
    { kind: 'band', name: '520-1000 Hz', fromHz: 520, toHz: 1000 },
    { kind: 'band', name: '1-2 kHz', fromHz: 1000, toHz: 2000 },
    { kind: 'band', name: '2-4 kHz', fromHz: 2000, toHz: 4000 },
    { kind: 'band', name: '4-8 kHz', fromHz: 4000, toHz: 8000 },
    { kind: 'band', name: '8-16 kHz', fromHz: 8000, toHz: 16000 },
    { kind: 'comb', name: '50 Hz harmonics', fundamentalHz: 50, harmonics: 20 },
    { kind: 'comb', name: '60 Hz harmonics', fundamentalHz: 60, harmonics: 16 },
    { kind: 'band', name: 'all', fromHz: 40, toHz: 16000 },
  ],
};

/** Every layout a `mic` frame may name, by id. A new layout gets a new id; none is ever changed. */
export const SOUND_LAYOUTS: ReadonlyMap<number, SoundLayout> = new Map([
  [SOUND_LAYOUT_1.id, SOUND_LAYOUT_1],
]);

/** The layout the app records with. */
export const SOUND_LAYOUT = SOUND_LAYOUT_1;

/** The quietest level a frame can carry, dB: anything quieter is stored as this. */
export const SOUND_FLOOR_DB = -127.5;

/** A level is stored in steps of this, dB. */
export const SOUND_STEP_DB = 0.5;

/**
 * A spectrum's levels in `layout`, dB relative to full scale. `binDb[i]` is bin i's level in dB,
 * as an `AnalyserNode`'s `getFloatFrequencyData` gives it, and bin i is centred on
 * `i · sampleRateHz / fftSize`. Power is summed: a band of two bins at −60 dB reads −57 dB.
 * A measure with no power, or no bins, is −Infinity.
 *
 * @throws RangeError for a sample rate or FFT size that isn't positive.
 */
export function soundLevels(
  binDb: ArrayLike<number>,
  sampleRateHz: number,
  fftSize: number,
  layout: SoundLayout = SOUND_LAYOUT,
): number[] {
  if (!(sampleRateHz > 0) || !(fftSize > 0)) {
    throw new RangeError(`soundLevels: bad sample rate ${sampleRateHz} or FFT size ${fftSize}`);
  }
  const binHz = sampleRateHz / fftSize;
  const power = (i: number): number => {
    const db = binDb[i];
    return Number.isFinite(db) ? 10 ** (db / 10) : 0;
  };
  return layout.measures.map((measure) => {
    let sum = 0;
    if (measure.kind === 'band') {
      const first = Math.max(0, Math.ceil(measure.fromHz / binHz));
      for (let i = first; i < binDb.length && i * binHz < measure.toHz; i++) sum += power(i);
    } else {
      for (let k = 1; k <= measure.harmonics; k++) {
        const nearest = Math.round((k * measure.fundamentalHz) / binHz);
        if (nearest < binDb.length) sum += power(nearest);
      }
    }
    return sum > 0 ? 10 * Math.log10(sum) : -Infinity;
  });
}

/** A level as one byte: −dB in half-dB steps, so 0 is 0 dB and 255 is −127.5 dB or quieter. */
export function soundLevelByte(db: number): number {
  if (Number.isNaN(db)) return 255;
  const steps = Math.round(-db / SOUND_STEP_DB);
  return Math.min(255, Math.max(0, steps));
}

/**
 * A `mic` frame's bytes: the layout's id, then one byte per level (`soundLevelByte`).
 *
 * @throws RangeError when the levels don't match the layout's measures.
 */
export function encodeSoundFrame(
  levelsDb: readonly number[],
  layout: SoundLayout = SOUND_LAYOUT,
): Uint8Array<ArrayBuffer> {
  if (levelsDb.length !== layout.measures.length) {
    throw new RangeError(
      `encodeSoundFrame: ${levelsDb.length} levels for layout ${layout.id}'s ${layout.measures.length}`,
    );
  }
  return Uint8Array.from([layout.id, ...levelsDb.map(soundLevelByte)]);
}

/** A `mic` frame, decoded. */
export interface SoundFrame {
  readonly layout: SoundLayout;
  /** One per measure, dB. `SOUND_FLOOR_DB` means that level or quieter. */
  readonly levelsDb: readonly number[];
}

/** Decodes a `mic` frame's bytes, or null for an unknown layout or the wrong length. */
export function decodeSoundFrame(bytes: Uint8Array): SoundFrame | null {
  const layout = bytes.length > 0 ? SOUND_LAYOUTS.get(bytes[0]) : undefined;
  if (!layout || bytes.length !== 1 + layout.measures.length) return null;
  const levelsDb = Array.from(bytes.subarray(1), (byte) =>
    byte === 0 ? 0 : -byte * SOUND_STEP_DB,
  );
  return { layout, levelsDb };
}
