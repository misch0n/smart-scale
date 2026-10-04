/**
 * first_drip (T1.12, D-035; spec "Markers"): when the first liquid reached the cup.
 *
 * 1. **The rise.** The smoothed liquid first reaches `riseFitG` (or three quarters of its
 *    highest, for a smaller shot), searching from `onsetScanBackS` before the baseline ends:
 *    without the pump's vibration the baseline runs on to about first_drip, at times past it.
 * 2. **Detection:** a one-sided CUSUM on the liquid, the weight less the baseline (spec: slack
 *    about 0.5σ, alarm about 4–5σ), σ the noise of the pre-infusion: the pump's vibration when
 *    it shows. It scans up to the rise and reports the run still under way there, so false
 *    starts that died away don't count. Its retrospective change point says where the rise
 *    began to within about a second, no closer: the small slack lets noise before the change
 *    keep the sum from emptying (D-033), and a slow start is slow to build it.
 * 3. **Timing**, to the millisecond (spec: "fit the initial rise and extrapolate back to its
 *    intersection with baseline"): the samples from `riseLookbackS` before the change point up
 *    to the rise are fitted with a curve that is nothing until its start and half a drop plus a
 *    power of the time since then after it. The start is first_drip.
 *    - The power is 2, a parabola: flow ramping up from nothing, the leading term of any smooth
 *      start. A line (power 1: the flow there at once) is taken only when it fits better by
 *      `linearOnsetMargin` σ², because at the pump's vibration a parabola can pass for a line.
 *    - The half drop is the drops' average lead over the stream (`dropG`). Without it the fit
 *      starts about 0.07 s early.
 *
 * Simulated (D-035): at the default vibration (σ 0.1 g) within about ±0.1 s, the information
 * limit for a rise whose shape isn't known; within 0.1 s without vibration.
 */

import { cusum } from '../signal';
import { quadraticSG, sgWindowSamples, type WindowLiquid } from './liquid';
import type { LiquidParams } from './params';
import type { ShotWindow } from './shot-windows';

/** How the flow began, as the rise fit reads it. */
export type OnsetShape = 'gradual' | 'abrupt';

export interface FirstDrip {
  /** When the first liquid reached the cup, s: the start of the fitted rise. */
  readonly t: number;
  /**
   * `gradual`: the flow ramped up from nothing, so the liquid rose as a parabola. `abrupt`: it
   * was there at once, a line.
   */
  readonly onset: OnsetShape;
  /** The CUSUM's retrospective change point and its alarm, s: the detection before the fit. */
  readonly changeT: number;
  readonly alarmT: number;
  /** The noise the CUSUM ran with, g: the pre-infusion's σ. */
  readonly sigmaG: number;
  /** Samples in the rise fit; 0 when there were too few, and `t` is the change point. */
  readonly fitPoints: number;
  /** The rise fit's RMS residual, g. */
  readonly fitRmsG: number;
}

export interface FirstDripOptions {
  readonly params: LiquidParams;
  /** The least σ to use, g: the quantisation's (`Segmentation.sigmaFloorG`). */
  readonly sigmaFloorG: number;
}

/** The pre-infusion's noise needs at least this many samples; else the baseline's σ. */
const MIN_NOISE_SAMPLES = 10;

/** The rise fit tries starts this far apart, s. */
const ONSET_RESOLUTION_S = 0.001;

/** The rise fit needs this many samples. */
const MIN_FIT_SAMPLES = 4;

/**
 * The first drip in `window`, from its liquid. Null when the liquid never rises clearly above
 * the baseline's noise after it: not past the CUSUM's alarm.
 */
export function findFirstDrip(
  liquid: WindowLiquid,
  window: ShotWindow,
  options: FirstDripOptions,
): FirstDrip | null {
  const { params, sigmaFloorG } = options;
  const { start, step, values } = liquid.grid;
  const timeAt = (k: number) => start + k * step;
  const smooth = quadraticSG(values, sgWindowSamples(params.sgWindowS, step), step);
  const from = Math.max(
    0,
    Math.ceil((window.baseline.endT - params.onsetScanBackS - start) / step - 1e-9),
  );

  // 1. The rise: where the smoothed liquid first reaches the level.
  let highest = -Infinity;
  for (let k = from; k < values.length; k++) if (smooth[k] > highest) highest = smooth[k];
  if (!(highest > 0)) return null;
  const reachG = Math.min(params.riseFitG, 0.75 * highest);
  let rise = from;
  while (rise < values.length && !(smooth[rise] >= reachG)) rise++;
  if (rise === values.length) return null;
  const riseT = timeAt(rise);

  // 2. Detection, with σ from the pre-infusion. A rise that doesn't clear the alarm is noise.
  const sigmaG = Math.max(
    sigmaFloorG,
    noiseSigma(liquid, window.baseline.endT, riseT - params.riseLookbackS) ??
      window.baseline.sigmaG,
  );
  const threshold = params.cusumAlarmSigmas * sigmaG;
  if (reachG <= threshold) return null;
  const alarm = cusum(
    values.map((value) => (Number.isNaN(value) ? 0 : value)),
    {
      reference: 0,
      slack: params.cusumSlackSigmas * sigmaG,
      threshold,
      from,
      to: rise + 1,
      lastRun: true,
    },
  );
  if (alarm === null) return null;
  const changeT = timeAt(alarm.changeIndex);
  const alarmT = timeAt(alarm.alarmIndex);

  // 3. Timing: the rise fit.
  const fromT = Math.max(start, changeT - params.riseLookbackS);
  const times: number[] = [];
  const grams: number[] = [];
  liquid.t.forEach((t, i) => {
    if (t >= fromT && t <= riseT) {
      times.push(t);
      grams.push(liquid.g[i]);
    }
  });
  const detected = { changeT, alarmT, sigmaG };
  if (times.length < MIN_FIT_SAMPLES) {
    return { t: changeT, onset: 'gradual', ...detected, fitPoints: 0, fitRmsG: 0 };
  }
  const fit = (power: number) =>
    fitOnset(times, grams, {
      power,
      offset: params.dropG / 2,
      from: fromT,
      to: riseT,
      resolution: ONSET_RESOLUTION_S,
    });
  const parabola = fit(2);
  const line = fit(1);
  const abrupt = line.sse < parabola.sse - params.linearOnsetMargin * sigmaG ** 2;
  const best = abrupt ? line : parabola;
  return {
    t: best.t0,
    onset: abrupt ? 'abrupt' : 'gradual',
    ...detected,
    fitPoints: times.length,
    fitRmsG: Math.sqrt(best.sse / times.length),
  };
}

export interface OnsetFitOptions {
  /** The power of the time since the start: 1 a line, 2 a parabola. */
  readonly power: number;
  /** The jump at the start, fixed (0 for none). */
  readonly offset: number;
  /** The starts tried: `from`, then every `resolution` up to `to`. */
  readonly from: number;
  readonly to: number;
  readonly resolution: number;
}

export interface OnsetFit {
  /** The start. */
  readonly t0: number;
  /** The coefficient of the power, at least 0. */
  readonly amplitude: number;
  /** The squared residuals, summed. */
  readonly sse: number;
}

/**
 * Fits y = 0 up to a start t0 and y = offset + amplitude × (t − t0)^power after it, with the
 * amplitude at least 0, by trying every start on a grid and fitting the amplitude by least
 * squares for each. A scan rather than a descent: the squared residuals have a kink at every
 * sample as the start moves past it. The earliest of equally good starts wins.
 *
 * @throws RangeError when the arrays differ in length, or the starts aren't a finite range
 *   with a positive resolution.
 */
export function fitOnset(
  times: readonly number[],
  values: readonly number[],
  options: OnsetFitOptions,
): OnsetFit {
  const { power, offset, from, to, resolution } = options;
  if (times.length !== values.length) {
    throw new RangeError(`fitOnset: ${times.length} times but ${values.length} values`);
  }
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || !(resolution > 0)) {
    throw new RangeError(`fitOnset: starts ${from} … ${to} every ${resolution} are no range`);
  }
  let squares = 0;
  for (const value of values) squares += value * value;
  let best: OnsetFit = { t0: from, amplitude: 0, sse: Infinity };
  const count = Math.floor((to - from) / resolution + 1e-9);
  for (let j = 0; j <= count; j++) {
    const t0 = from + j * resolution;
    let after = 0; // samples after the start
    let sumY = 0; // Σ y, Σ u, Σ u², Σ y·u over them, u = (t − t0)^power
    let sumU = 0;
    let sumUU = 0;
    let sumYU = 0;
    for (let i = 0; i < times.length; i++) {
      if (times[i] <= t0) continue;
      const u = (times[i] - t0) ** power;
      after++;
      sumY += values[i];
      sumU += u;
      sumUU += u * u;
      sumYU += values[i] * u;
    }
    const amplitude = sumUU > 0 ? Math.max(0, (sumYU - offset * sumU) / sumUU) : 0;
    // Σ before y² + Σ after (y − offset − amplitude·u)², expanded.
    const sse =
      squares -
      2 * offset * sumY -
      2 * amplitude * sumYU +
      after * offset * offset +
      2 * offset * amplitude * sumU +
      amplitude * amplitude * sumUU;
    if (sse < best.sse) best = { t0, amplitude, sse: Math.max(0, sse) };
  }
  return best;
}

/**
 * The samples' noise from `fromT` to `toT`, g: the RMS of their second differences over √6,
 * which a smooth trend barely touches. Null with fewer than `MIN_NOISE_SAMPLES` samples.
 */
function noiseSigma(liquid: WindowLiquid, fromT: number, toT: number): number | null {
  const g = liquid.g.filter((_, i) => liquid.t[i] >= fromT && liquid.t[i] <= toT);
  if (g.length < MIN_NOISE_SAMPLES) return null;
  let squares = 0;
  for (let i = 1; i + 1 < g.length; i++) squares += (g[i + 1] - 2 * g[i] + g[i - 1]) ** 2;
  return Math.sqrt(squares / (g.length - 2) / 6);
}
