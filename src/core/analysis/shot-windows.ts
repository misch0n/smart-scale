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
 * - **Anchors:** a plateau can be a shot's baseline, or end its rise, only when its firm
 *   stretches, each lasting `FIRM_STRETCH_S`, together last `minBaselineS`. Where the pump's
 *   vibration shows, it lets five samples in a row fall within the tolerance now and then (about
 *   one window in 300 at the simulator's 0.1 g), so short stable fragments turn up during the
 *   pre-infusion, each at a level off by the noise: they never count. Without the vibration (the
 *   real scale, D-048), a slow start pours in drops and the 0.1 g reading holds still between
 *   them, for 1.3 s in a real shot: a pause, not a baseline. Noise can split a long stretch,
 *   which is why the firm ones add up.
 * - **A shot** rises at least `minRiseG` from an anchor, over at least `minRiseS`, to the next
 *   anchor or to the interval's end, net of every step between them: something set down is no
 *   pour. A second shot into the same cup rises from the first one's settled level.
 * - **Steps inside a shot's rise** (`pourStep`): one jump between two samples is something set
 *   down, a spoon or a sugar cube, and is taken out of the liquid. A change over several jumps
 *   is the pour itself: beans landing in bursts, or the scale or cup moved as the shot runs,
 *   which swung shot A of hardware session 2 between −57 and +30 g (D-048). It stays in.
 * - **The baseline** is the last `baselineS` of the anchor's last firm stretch. Its end is where
 *   the level stopped holding still: about `pump_on` when the pump's vibration shows, else
 *   `first_drip`. Fragments after it don't move it.
 */

import type { UniformSeries } from '../signal';
import type { SegmentationParams } from './params';
import type { WeightSamples } from './samples';
import { noiseBetween, type NoiseStats, type StableStretch } from './stability';
import { WEIGHT_EPSILON_G, type Step } from './steps';

/** How a shot window ends. */
export const SHOT_WINDOW_ENDS = [
  'cup-removed',
  'cup-placed',
  'next-shot',
  'recording-end',
] as const;
export type ShotWindowEnd = (typeof SHOT_WINDOW_ENDS)[number];

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
   * Where the rise ends, s: the start of the plateau it rises to, or the window's end. Other
   * steps from the baseline's end to here are part of the pour unless they took a single jump
   * (`pourStep`).
   */
  readonly riseEndT: number;
  /**
   * How far the level rose from the baseline to the window's end, net of the other steps taken
   * out, g: about the honest yield when the cup's removal ends it. A diagnostic; T1.12 measures
   * the yield.
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
  /** Its stretches that last `FIRM_STRETCH_S`, in order: an anchor has at least one. */
  readonly firm: readonly StableStretch[];
  /** How long its firm stretches last together, s. */
  readonly firmS: number;
}

/**
 * A stretch this long counts towards an anchor, and gives baselines and rises their levels, s:
 * the pump's vibration, where it shows, leaves shorter fragments.
 */
export const FIRM_STRETCH_S = 1;

/**
 * Whether an other step in a rise from `fromT` to `toT` (its middle between them) is part of the
 * pour: it took more than one jump (`Step.jumps`). A single jump is something set down, to be
 * taken out of the liquid; anything else is the pour landing in bursts, or the scale or cup
 * moved as it runs. A burst that starts the pour can start a sample before the baseline's end,
 * which the stability windows place on the grid.
 */
export function pourStep(step: Step, fromT: number, toT: number): boolean {
  const middle = (step.startT + step.endT) / 2;
  return step.kind === 'other' && step.jumps > 1 && middle > fromT && middle < toT;
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
    /**
     * The sizes of the other steps from `fromT` to `toT`, by their middles, summed: all of them,
     * or with `pour` (a rise's start and end) all but those that are the pour itself.
     */
    const stepsBetween = (fromT: number, toT: number, pour?: readonly [number, number]) =>
      others
        .filter((step) => {
          const middle = (step.startT + step.endT) / 2;
          return middle > fromT && middle < toT && !(pour && pourStep(step, ...pour));
        })
        .reduce((total, step) => total + step.sizeG, 0);
    const anchors = mergePlateaus(
      stretches.filter((stretch) => inside(stretch.startT, stretch.endT)),
      others,
      options.toleranceG,
    ).filter(
      (plateau) =>
        plateau.firm.length > 0 && plateau.firmS >= params.minBaselineS - WEIGHT_EPSILON_G,
    );
    const endLevelG = interval.endStep
      ? interval.endStep.levelBeforeG
      : meanOf(values, Math.max(0, values.length - options.window), values.length);
    const riseEnds = anchors.map((_, j) => (j + 1 < anchors.length ? anchors[j + 1].startT : endT));

    // A shot rises from an anchor's last firm stretch to the next anchor, or the interval's end.
    const shots: number[] = [];
    anchors.forEach((anchor, j) => {
      const from = anchor.firm[anchor.firm.length - 1];
      const next = anchors[j + 1];
      const riseEndT = riseEnds[j];
      const riseG =
        (next ? next.firm[0].levelG : endLevelG) - from.levelG - stepsBetween(from.endT, riseEndT);
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
      const riseEndT = Math.min(riseEnds[j], windowEndT);
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
        riseEndT,
        riseG:
          windowEndLevelG -
          baseline.levelG -
          stepsBetween(baseline.endT, windowEndT, [baseline.endT, riseEndT]),
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
): Plateau[] {
  const plateaus: { startT: number; endT: number; firm: StableStretch[]; firmS: number }[] = [];
  let previous: StableStretch | null = null;
  for (const stretch of stretches) {
    const current = plateaus.at(-1);
    const before = previous;
    const joins =
      current !== undefined &&
      before !== null &&
      Math.abs(stretch.levelG - before.levelG) <= toleranceG + WEIGHT_EPSILON_G &&
      !steps.some((step) => step.startT >= before.endT && step.endT <= stretch.startT);
    const lasts = stretch.endT - stretch.startT;
    const firm = lasts >= FIRM_STRETCH_S - WEIGHT_EPSILON_G;
    if (joins) {
      current.endT = stretch.endT;
      if (firm) {
        current.firm.push(stretch);
        current.firmS += lasts;
      }
    } else {
      plateaus.push({
        startT: stretch.startT,
        endT: stretch.endT,
        firm: firm ? [stretch] : [],
        firmS: firm ? lasts : 0,
      });
    }
    previous = stretch;
  }
  return plateaus;
}

/** The last `baselineS` of an anchor's last firm stretch: its level and noise. */
function baselineOf(
  series: UniformSeries,
  samples: WeightSamples,
  anchor: Plateau,
  options: ShotWindowOptions,
): Baseline {
  const stretch = anchor.firm[anchor.firm.length - 1];
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
