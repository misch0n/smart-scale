/**
 * Shot windows (T1.11, D-034): from a vessel placed and stable to its removal, or the end of the
 * recording, around a sustained rise. Each carries its baseline, the stable level before the
 * pump, with that level's noise: what T1.12 and T1.13 measure the markers against.
 *
 * - **Vessel intervals** run between vessel steps. One that starts with a vessel lifted holds
 *   nothing to pour into, so it holds no shot. Before the first vessel step a vessel may already
 *   be on, unless that first step puts one on.
 * - **Plateaus:** consecutive stable stretches at the same level (within the stability
 *   tolerance) with no step between them. Noise splits a stable stretch now and then, and a pump
 *   that runs with nothing reaching the cup (a flush) interrupts one without moving the level.
 * - **Anchors:** a plateau can be a shot's baseline, or end its rise, only when one of its
 *   stretches lasts `minBaselineS`. The pump's vibration lets five samples in a row fall within
 *   the tolerance now and then (about one window in 300 at the simulator's 0.1 g), so short
 *   stable fragments turn up during the pre-infusion, each at a level off by the noise. A stable
 *   second during the pump is vanishingly rare.
 * - **A shot** rises at least `minRiseG` from an anchor, over at least `minRiseS`, to the next
 *   anchor or to the interval's end. Steps between them (a spoon, a sugar cube) don't count
 *   towards the rise. A second shot into the same cup rises from the first one's settled level.
 * - **The baseline** is the last `baselineS` of the anchor's last long stretch. Its end is where
 *   the level stopped holding still: about `pump_on` when the pump's vibration shows, else
 *   `first_drip`. Short fragments after it don't move it.
 */

import type { UniformSeries } from '../signal';
import type { SegmentationParams } from './params';
import type { WeightSamples } from './samples';
import { noiseBetween, type NoiseStats, type StableStretch } from './stability';
import { WEIGHT_EPSILON_G, type Step } from './steps';

/** How a shot window ends. */
export type ShotWindowEnd = 'cup-removed' | 'cup-placed' | 'next-shot' | 'recording-end';

/** The stable level a shot rises from. */
export interface Baseline extends NoiseStats {
  /** The span the level and σ come from, s. */
  readonly startT: number;
  /** Where the level stopped holding still, s: about `pump_on`, else `first_drip`. */
  readonly endT: number;
}

export interface ShotWindow {
  /** The window's first and last time, s. The baseline's plateau starts it. */
  readonly startT: number;
  readonly endT: number;
  /** Its samples on the grid: `startIndex` … `endIndex − 1`. */
  readonly startIndex: number;
  readonly endIndex: number;
  readonly baseline: Baseline;
  /** The step that put the vessel on, or null when it was on as the recording started. */
  readonly cupPlaced: Step | null;
  /** The step that lifted it, when that ends the window. Honest yield is its level before. */
  readonly cupRemoved: Step | null;
  readonly end: ShotWindowEnd;
  /**
   * How far the level rose from the baseline to the window's end, net of other steps, g: about
   * the honest yield when the cup's removal ends it. A diagnostic; T1.12 measures the yield.
   */
  readonly riseG: number;
}

export interface ShotWindowOptions {
  readonly params: SegmentationParams;
  /** The stability tolerance, g: levels this close are the same. */
  readonly toleranceG: number;
  /** The least σ to report, g (`StabilityOptions.sigmaFloorG`). */
  readonly sigmaFloorG: number;
  /** Grid samples per stability window. */
  readonly window: number;
}

interface Interval {
  readonly startT: number;
  /** Whether a vessel can be on: it holds shots. */
  readonly eligible: boolean;
  readonly cupPlaced: Step | null;
  /** The vessel step that ends it, or null at the end of the recording. */
  readonly endStep: Step | null;
}

interface Plateau {
  readonly startT: number;
  readonly endT: number;
  /** Its stretches that last at least `minBaselineS`, in order. */
  readonly long: readonly StableStretch[];
}

/** The shot windows of a segmented recording, in order. */
export function shotWindows(
  series: UniformSeries,
  samples: WeightSamples,
  stretches: readonly StableStretch[],
  steps: readonly Step[],
  options: ShotWindowOptions,
): ShotWindow[] {
  const { params } = options;
  const values = series.values;
  if (values.length === 0) return [];
  const lastT = series.start + (values.length - 1) * series.step;
  const windows: ShotWindow[] = [];
  for (const interval of vesselIntervals(steps)) {
    if (!interval.eligible) continue;
    const endT = interval.endStep ? interval.endStep.startT : lastT;
    const inside = (fromT: number, toT: number) => {
      const middle = (fromT + toT) / 2;
      return middle > interval.startT && middle < endT;
    };
    const others = steps.filter((step) => step.kind === 'other' && inside(step.startT, step.endT));
    /** The sizes of the other steps from `fromT` to `toT`, summed. */
    const stepsBetween = (fromT: number, toT: number) =>
      others
        .filter((step) => step.startT >= fromT && step.endT <= toT)
        .reduce((total, step) => total + step.sizeG, 0);
    const anchors = mergePlateaus(
      stretches.filter((stretch) => inside(stretch.startT, stretch.endT)),
      others,
      options.toleranceG,
      params.minBaselineS,
    ).filter((plateau) => plateau.long.length > 0);
    const endLevelG = interval.endStep
      ? interval.endStep.levelBeforeG
      : meanOf(values, Math.max(0, values.length - options.window), values.length);

    // A shot rises from an anchor's last long stretch to the next anchor, or the interval's end.
    const shots: number[] = [];
    anchors.forEach((anchor, j) => {
      const from = anchor.long[anchor.long.length - 1];
      const next = anchors[j + 1];
      const riseEndT = next ? next.startT : endT;
      const riseG =
        (next ? next.long[0].levelG : endLevelG) - from.levelG - stepsBetween(from.endT, riseEndT);
      if (
        riseG >= params.minRiseG - WEIGHT_EPSILON_G &&
        riseEndT - from.endT >= params.minRiseS - WEIGHT_EPSILON_G
      ) {
        shots.push(j);
      }
    });

    const baselines = shots.map((j) => baselineOf(series, samples, anchors[j], options));
    shots.forEach((j, k) => {
      const anchor = anchors[j];
      const baseline = baselines[k];
      const following = k + 1 < shots.length ? anchors[shots[k + 1]] : null;
      const windowEndT = following ? baselines[k + 1].endT : endT;
      const windowEndLevelG = following ? baselines[k + 1].levelG : endLevelG;
      windows.push({
        startT: anchor.startT,
        endT: windowEndT,
        startIndex: gridIndexAtOrAfter(series, anchor.startT),
        endIndex: gridIndexAtOrAfter(series, windowEndT, true),
        baseline,
        cupPlaced: interval.cupPlaced,
        cupRemoved:
          !following && interval.endStep?.kind === 'cup-removed' ? interval.endStep : null,
        end: following
          ? 'next-shot'
          : interval.endStep === null
            ? 'recording-end'
            : interval.endStep.kind === 'cup-placed'
              ? 'cup-placed'
              : 'cup-removed',
        riseG: windowEndLevelG - baseline.levelG - stepsBetween(baseline.endT, windowEndT),
      });
    });
  }
  return windows;
}

/** The recording cut at its vessel steps. */
function vesselIntervals(steps: readonly Step[]): Interval[] {
  const vessels = steps.filter((step) => step.kind === 'cup-placed' || step.kind === 'cup-removed');
  const intervals: Interval[] = [];
  let startT = -Infinity;
  let eligible = vessels.length === 0 || vessels[0].kind === 'cup-removed';
  let cupPlaced: Step | null = null;
  for (const step of vessels) {
    intervals.push({ startT, eligible, cupPlaced, endStep: step });
    eligible = step.kind === 'cup-placed';
    cupPlaced = eligible ? step : null;
    startT = step.endT;
  }
  intervals.push({ startT, eligible, cupPlaced, endStep: null });
  return intervals;
}

/**
 * Consecutive stretches at the same level, with no step between them, as one plateau. Each
 * stretch is compared with the one before it.
 */
function mergePlateaus(
  stretches: readonly StableStretch[],
  steps: readonly Step[],
  toleranceG: number,
  minBaselineS: number,
): Plateau[] {
  const plateaus: { startT: number; endT: number; long: StableStretch[] }[] = [];
  let previous: StableStretch | null = null;
  for (const stretch of stretches) {
    const current = plateaus.at(-1);
    const before = previous;
    const joins =
      current !== undefined &&
      before !== null &&
      Math.abs(stretch.levelG - before.levelG) <= toleranceG + WEIGHT_EPSILON_G &&
      !steps.some((step) => step.startT >= before.endT && step.endT <= stretch.startT);
    const long = stretch.endT - stretch.startT >= minBaselineS - WEIGHT_EPSILON_G;
    if (joins) {
      current.endT = stretch.endT;
      if (long) current.long.push(stretch);
    } else {
      plateaus.push({ startT: stretch.startT, endT: stretch.endT, long: long ? [stretch] : [] });
    }
    previous = stretch;
  }
  return plateaus;
}

/** The last `baselineS` of an anchor's last long stretch: its level and noise. */
function baselineOf(
  series: UniformSeries,
  samples: WeightSamples,
  anchor: Plateau,
  options: ShotWindowOptions,
): Baseline {
  const stretch = anchor.long[anchor.long.length - 1];
  const startT = Math.max(stretch.startT, stretch.endT - options.params.baselineS);
  const from = gridIndexAtOrAfter(series, startT);
  const fallback = series.values.slice(from, Math.max(stretch.endIndex, from + 1));
  return {
    startT,
    endT: stretch.endT,
    ...noiseBetween(samples, startT, stretch.endT, options.sigmaFloorG, fallback),
  };
}

/** The first grid index at or after `t` (or, with `after`, beyond it), within the grid. */
function gridIndexAtOrAfter(series: UniformSeries, t: number, after = false): number {
  const position = (t - series.start) / series.step;
  const index = after ? Math.floor(position + 1e-9) + 1 : Math.ceil(position - 1e-9);
  return Math.min(series.values.length, Math.max(0, index));
}

function meanOf(values: readonly number[], from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += values[i];
  return sum / (to - from);
}
