/**
 * A shot window's liquid (T1.12, D-035): the zero-tracked weight less the window's baseline,
 * and less every other step inside the window (a spoon set down, a sugar cube), so that it reads
 * as the liquid that has reached the cup. The liquid markers work on it.
 *
 * - **Samples:** the window's zero-tracked samples, as liquid. Those inside an other step's
 *   transition, after its last sample before the change and before its first after, are left
 *   out: they belong to neither level.
 * - **Grid:** the window's part of the segmentation's grid, as liquid, with NaN inside a
 *   transition. A Savitzky–Golay window that takes in a NaN gives NaN, so the flow and the
 *   smoothed liquid next to a transition drop out by themselves.
 */

import { savitzkyGolay, type UniformSeries } from '../signal';
import type { Segmentation } from './segment';
import type { ShotWindow } from './shot-windows';
import type { Step } from './steps';

export interface WindowLiquid {
  /** The window's samples, in time order: their times, s, and liquid, g. */
  readonly t: readonly number[];
  readonly g: readonly number[];
  /** The window's grid samples (`startIndex` … `endIndex − 1`) as liquid; NaN in a transition. */
  readonly grid: UniformSeries;
  /** The other steps inside the window, in order. Their sizes are taken out after them. */
  readonly otherSteps: readonly Step[];
}

/**
 * Times this close are the same, s: grid times are multiplied out, and a grid time must still
 * meet the sample it was meant to.
 */
const TIME_EPSILON_S = 1e-9;

/** The liquid in `window`, one of `segmentation.shotWindows`. */
export function windowLiquid(segmentation: Segmentation, window: ShotWindow): WindowLiquid {
  const { samples, series } = segmentation;
  const baseline = window.baseline.levelG;
  const otherSteps = segmentation.steps.filter((step) => {
    const middle = (step.startT + step.endT) / 2;
    return step.kind === 'other' && middle > window.startT && middle < window.endT;
  });

  const t: number[] = [];
  const g: number[] = [];
  for (let i = 0; i < samples.t.length; i++) {
    const time = samples.t[i];
    if (time < window.startT - TIME_EPSILON_S) continue;
    if (time > window.endT + TIME_EPSILON_S) break;
    const added = addedByOtherSteps(otherSteps, time);
    if (Number.isNaN(added)) continue;
    t.push(time);
    g.push(samples.weightG[i] - baseline - added);
  }

  const start = series.start + window.startIndex * series.step;
  const values: number[] = [];
  for (let k = window.startIndex; k < window.endIndex; k++) {
    const time = series.start + k * series.step;
    values.push(series.values[k] - baseline - addedByOtherSteps(otherSteps, time));
  }
  return { t, g, grid: { start, step: series.step, values }, otherSteps };
}

/**
 * What `steps` had added to the weight by `t`, g: the sizes of those finished by then. NaN in
 * the middle of one, between its last sample before the change and its first after.
 */
export function addedByOtherSteps(steps: readonly Step[], t: number): number {
  let total = 0;
  for (const step of steps) {
    if (t >= step.endT - TIME_EPSILON_S) total += step.sizeG;
    else if (t > step.startT + TIME_EPSILON_S) return Number.NaN;
  }
  return total;
}

/**
 * Samples in a Savitzky–Golay window of `windowS` at the grid's `step`: the nearest odd count,
 * at least 5 (a parabola through 3 points smooths nothing).
 */
export function sgWindowSamples(windowS: number, step: number): number {
  return Math.max(5, 2 * Math.round((windowS / step - 1) / 2) + 1);
}

/**
 * The quadratic Savitzky–Golay fit of `values` (`derivative` 1: per unit of `step`) in windows
 * of `window`, NaN wherever a window takes in a NaN, and all NaN for a series too short to fit.
 */
export function quadraticSG(
  values: readonly number[],
  window: number,
  step: number,
  derivative: 0 | 1 = 0,
): number[] {
  if (values.length < 3) return values.map(() => Number.NaN);
  return savitzkyGolay(values, { window, order: 2, derivative, step });
}
