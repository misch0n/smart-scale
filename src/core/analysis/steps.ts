/**
 * Steps in the weight, and zero-tracking (T1.11, D-034). Found on the trusted samples before
 * resampling, so that a tare's single-sample jump stays one sample.
 *
 * - **Transitions:** runs of jumps, where consecutive samples differ by more than liquid could
 *   flow in the time between them. Jumps at most one quiet sample apart are one transition. A
 *   tare takes one jump; a vessel settles in or out over several. Up to two samples either side
 *   join a run when they're already, or still, off the level beyond them: a vessel lifted just
 *   before a sample (D-035), a knock falling back by less than a jump (T1.13). A vessel's run
 *   takes them in either way: a hand presses a cup down before it lifts it (D-059). So does any
 *   run a sample that moved faster than liquid could, though by less than a jump, and runs that
 *   then touch are one: a knock rising right after a tare (D-062).
 * - **Tares:** the step within `tareSearchS` after a logged tare command (`tare` or
 *   `tareAndStartTimer`), when the reading lands on 0, nearer to it than it was (D-059): one
 *   jump, or the largest in a run with a knock in it, which can land it off 0 by the knock's
 *   force (D-062). Every tare applies from the sample after its own jump. A tare of a reading
 *   already near 0 makes no jump; its step is applied only when it stands out of the noise by
 *   `quietTareSigmas`, as most such commands are a manual start right after the auto-tare, with
 *   nothing to take off. A press of the scale's tare button sends nothing (D-021; hardware
 *   tests A7, C4), so a transition of exactly one jump that lands on 0 is a tare too. A vessel
 *   lifted from a scale that wasn't tared also ends near 0, but it settles out over several
 *   samples. The button is on the platform, so the press weighs on it until it's let go, when
 *   the scale tares; when both show in one frame, the jump to 0 starts from the press's level.
 *   A step up of one jump just before (`pressTareS`) is that press: the tare is measured from
 *   the level before it, and the press is a transient (D-051).
 * - **Other steps:** by their size, a vessel placed or lifted (`minVesselG`), or something else.
 * - **Transients:** a transition whose net change is below `minStepG` is no step: a knock, a
 *   push, the scale lifted and put back (the user's surf, D-049). Its span is kept, so that the
 *   readings inside it can be left out of a shot's liquid. A push long enough to linger at its
 *   deepest breaks into two runs of jumps, which would read as a cup lifted and put back; runs
 *   at most `REVERSAL_GAP_SAMPLES` apart whose changes cancel are taken as one.
 * - **Levels** either side come from straight lines fitted to the samples next to the
 *   transition, up to `stepFitS` of them and never across another transition, so a step during a
 *   shot or its tail is measured net of the flow.
 * - **Zero-tracking** takes every tare's step off the samples from it on: net weight
 *   w(t) − w(baseline) then holds across tares (spec "Schema rules").
 */

import { isTareCommand, type AppEvent } from '../model';
import { fitLine, mean } from '../signal';
import type { SegmentationParams } from './params';
import { FRAME_RESOLUTION_G, type WeightSamples } from './samples';

/** Comparisons of weights allow this much rounding, g: far below the frames' 0.01 g. */
export const WEIGHT_EPSILON_G = 1e-6;

/** Times this close are the same, s. */
const TIME_EPSILON_S = 1e-9;

export const STEP_KINDS = ['tare', 'cup-placed', 'cup-removed', 'other'] as const;
export type StepKind = (typeof STEP_KINDS)[number];

/** What showed a tare: a logged tare command, or a jump to 0 with no command (the button). */
export const TARE_SOURCES = ['command', 'jump'] as const;
export type TareSource = (typeof TARE_SOURCES)[number];

export interface Step {
  readonly kind: StepKind;
  /** For a tare, what showed it; null for other steps. */
  readonly tareSource: TareSource | null;
  /** The last sample before the change, s. */
  readonly startT: number;
  /**
   * The first sample after the change, s. After a transition of several jumps (a vessel
   * settling), the first sample `settleS` after its last jump.
   */
  readonly endT: number;
  /**
   * How much the reading changed, net of the trend, g: the difference of the fitted levels at the
   * middle of the transition. Zero-tracking takes a tare's off the samples after it.
   */
  readonly sizeG: number;
  /** The zero-tracked level at `startT` and at `endT`, g. Across a tare they agree. */
  readonly levelBeforeG: number;
  readonly levelAfterG: number;
  /**
   * How many jumps the change took: 1 for a tare, or for something set down or lifted at once;
   * more for a vessel settling, a burst of beans, or the scale moved. 0 for a logged tare too
   * small to jump; 2 for the button's tare with its press, from the press on (D-051).
   */
  readonly jumps: number;
}

/** A transition that is no step: the reading jumped and came back. */
export interface Transient {
  /** The last sample before it, s. */
  readonly startT: number;
  /** The first sample after it, s (after settling, as for a step). */
  readonly endT: number;
  readonly jumps: number;
}

export interface ZeroTracked {
  /** The samples with every tare taken off: one continuous series across tares. */
  readonly samples: WeightSamples;
  /** Every step, in time order. */
  readonly steps: Step[];
  /** Every transient, in time order. */
  readonly transients: Transient[];
}

/** Runs of jumps taken together, as sample indexes. */
interface Run {
  /** The last sample before the first jump. */
  readonly first: number;
  /** The first sample after the last jump. */
  readonly last: number;
  readonly jumps: number;
  /** The first clean sample after it. */
  readonly settled: number;
}

/**
 * Runs of jumps at most this many quiet samples apart are one disturbance when their changes
 * cancel (`zeroTrack`).
 */
const REVERSAL_GAP_SAMPLES = 2;

/** A run of jumps, as sample indexes. */
interface Transition {
  /** The last sample before the first jump. */
  readonly first: number;
  /** The first sample after the last jump. */
  readonly last: number;
  readonly jumps: number;
  /**
   * The first clean sample after it: `last`, or after several jumps (a vessel settling)
   * `settleS` later, though not past the next transition's start.
   */
  readonly settled: number;
}

interface Tare {
  /** The last sample before the step. */
  readonly before: number;
  /** The first sample after it. */
  readonly after: number;
  /** The tare applies from here: `after`, or the sample after the tare's own jump in a run. */
  readonly from: number;
  readonly source: TareSource;
  /** The step in the reading, net of the trend: from before the press, when there was one. */
  readonly sizeG: number;
  /**
   * Its transition's jumps: 1, 0 for a logged tare too small to jump, more with a press or a
   * knock.
   */
  readonly jumps: number;
  /** The last sample before the press on the tare button that came with it, or null. */
  readonly pressFirst: number | null;
}

/** A line fitted to samples, to evaluate anywhere. */
interface Level {
  readonly at: (t: number) => number;
  /** The variance of `at(t)` from the residuals' scatter, g²; Infinity from a single sample. */
  readonly variance: (t: number) => number;
  /** Squared residuals, summed. */
  readonly sse: number;
  readonly count: number;
}

interface StepAcross {
  readonly before: Level;
  readonly after: Level;
  /** Where the levels are compared, s. */
  readonly middleT: number;
  /** after − before at `middleT`, g. */
  readonly sizeG: number;
  /** The standard error of `sizeG`, g. */
  readonly sizeErrorG: number;
}

/**
 * Finds the steps in `samples` and takes every tare off. `events` are the recording's app
 * events, for the tare commands; `intervalS` is the nominal sample interval, which turns the
 * spans in `params` into sample counts.
 */
export function zeroTrack(
  samples: WeightSamples,
  events: readonly AppEvent[],
  params: SegmentationParams,
  intervalS: number,
): ZeroTracked {
  const { t, weightG: w } = samples;
  const fitCount = Math.max(2, Math.round(params.stepFitS / intervalS));
  const fits = new SideFits(
    t,
    findTransitions(t, w, params, Math.round(params.settleS / intervalS), fitCount),
    fitCount,
  );
  // A tare zeroes the reading: it lands on 0, and nearer to it than it was. A reading that
  // moves from 0 to −0.2 g right after a Tare + start is the pump, not a tare (D-059). A knock
  // as the scale tares is zeroed with the rest and lands it off 0 once it's over, by as much as
  // it moved the reading just before (`slackG`, D-062).
  const lands = (step: StepAcross, slackG = 0) => {
    const after = Math.abs(step.after.at(step.middleT));
    return (
      after <= params.tareZeroG + slackG + WEIGHT_EPSILON_G &&
      after < Math.abs(step.before.at(step.middleT))
    );
  };

  // Tares: each logged command's step, then single jumps that land on 0.
  const tares: Tare[] = [];
  const claimed = new Set<Transition>();
  for (const event of events) {
    if (!isTareCommand(event)) continue;
    const tare = loggedTare(event.tMs / 1000, w, fits, claimed, params, lands);
    if (tare && !tares.some((other) => other.after === tare.after)) tares.push(tare);
  }
  // The press on the tare button that a jump to 0 at transition k let go, if it shows: a step up
  // of one jump, at most `pressTareS` before, with nothing between (D-051). Hardware session 1's
  // read 13.1 g for 0.9 s, then the release and the tare came in one frame; measured from the
  // press's level, the tare kept those 13.1 g in every later level.
  const pressBefore = (k: number): Transition | null => {
    const press = fits.transitions[k - 1];
    if (press === undefined || press.jumps !== 1 || claimed.has(press)) return null;
    if (t[fits.transitions[k].last] - t[press.last] > params.pressTareS + TIME_EPSILON_S) {
      return null;
    }
    const step = fits.across(w, press.first, press.last);
    return step.sizeG >= params.minStepG - WEIGHT_EPSILON_G ? press : null;
  };
  fits.transitions.forEach((transition, k) => {
    if (transition.jumps !== 1 || claimed.has(transition)) return;
    const step = fits.across(w, transition.first, transition.last);
    if (!lands(step) || Math.abs(step.sizeG) < params.minStepG - WEIGHT_EPSILON_G) return;
    claimed.add(transition);
    const press = pressBefore(k);
    if (press) claimed.add(press);
    tares.push({
      before: transition.first,
      after: transition.last,
      from: tareJumpAt(w, transition, step.sizeG) ?? transition.last,
      source: 'jump',
      // From the level before the press to the one after the tare, at the tare.
      sizeG: press ? fits.across(w, press.first, transition.last, step.middleT).sizeG : step.sizeG,
      jumps: press ? press.jumps + 1 : 1,
      pressFirst: press?.first ?? null,
    });
  });
  tares.sort((a, b) => a.from - b.from);

  const corrected = w.slice();
  let offset = 0;
  for (let i = 0, next = 0; i < corrected.length; i++) {
    while (next < tares.length && tares[next].from === i) offset -= tares[next++].sizeG;
    corrected[i] += offset;
  }

  const steps: Step[] = tares.map((tare) => {
    const first = tare.pressFirst ?? tare.before;
    const step = fits.across(corrected, first, tare.after);
    return {
      kind: 'tare',
      tareSource: tare.source,
      startT: t[first],
      endT: t[tare.after],
      sizeG: tare.sizeG,
      levelBeforeG: step.before.at(t[first]),
      levelAfterG: step.after.at(t[tare.after]),
      jumps: tare.jumps,
    };
  });
  // A press let go with its tare, or a knock as the tare came, came and went: the readings in
  // the tare's run but for its own jump belong to neither level.
  const transients: Transient[] = tares.flatMap((tare) => {
    const first = tare.pressFirst ?? tare.before;
    return first < tare.from - 1 || tare.after > tare.from
      ? [{ startT: t[first], endT: t[tare.after], jumps: tare.jumps }]
      : [];
  });
  const across = (run: Run) =>
    fits.across(corrected, run.first, run.settled, (t[run.first] + t[run.last]) / 2);
  const { transitions } = fits;
  for (let k = 0; k < transitions.length; k++) {
    if (claimed.has(transitions[k])) continue;
    let run: Run = transitions[k];
    let step = across(run);
    // A change reversed at once is one disturbance: a push that lingered at its deepest, or a
    // cup lifted and put straight back.
    while (k + 1 < transitions.length && !claimed.has(transitions[k + 1])) {
      const next = transitions[k + 1];
      if (next.first > run.settled + REVERSAL_GAP_SAMPLES) break;
      const merged: Run = {
        first: run.first,
        last: next.last,
        settled: next.settled,
        jumps: run.jumps + next.jumps,
      };
      const mergedStep = across(merged);
      const smaller = Math.min(Math.abs(step.sizeG), Math.abs(across(next).sizeG));
      if (!(Math.abs(mergedStep.sizeG) < smaller)) break;
      run = merged;
      step = mergedStep;
      k++;
    }
    const { first, settled, jumps } = run;
    if (Math.abs(step.sizeG) < params.minStepG - WEIGHT_EPSILON_G) {
      transients.push({ startT: t[first], endT: t[settled], jumps });
      continue;
    }
    steps.push({
      kind: classify(step.sizeG, params),
      tareSource: null,
      startT: t[first],
      endT: t[settled],
      sizeG: step.sizeG,
      levelBeforeG: step.before.at(t[first]),
      levelAfterG: step.after.at(t[settled]),
      jumps,
    });
  }
  steps.sort((a, b) => a.startT - b.startT || a.endT - b.endT);
  transients.sort((a, b) => a.startT - b.startT);
  return { samples: { seq: samples.seq, t, weightG: corrected }, steps, transients };
}

/** A vessel by its size, else something else. */
function classify(sizeG: number, params: SegmentationParams): StepKind {
  if (sizeG <= -params.minVesselG) return 'cup-removed';
  if (sizeG >= params.minVesselG) return 'cup-placed';
  return 'other';
}

/**
 * A sample before a run of jumps that already lies this many standard errors beyond the line
 * through the samples before it, in the run's direction, belongs to the run.
 */
const LEAD_IN_ERRORS = 4;

/** A run's start moves back over at most this many such samples. */
const LEAD_IN_MAX_SAMPLES = 2;

/**
 * A sample after a run of jumps that lies this many standard errors off the line through the
 * samples after it, either way, is still part of the run: a knock falling back, or a vessel
 * still settling, by less than a jump.
 */
const LEAD_OUT_ERRORS = 4;

/** A run's end moves on over at most this many such samples. */
const LEAD_OUT_MAX_SAMPLES = 2;

/**
 * The runs of jumps in the readings, in order. `fitCount` samples before a run are its level
 * when looking for a lead-in.
 */
function findTransitions(
  t: readonly number[],
  w: readonly number[],
  params: SegmentationParams,
  settleCount: number,
  fitCount: number,
): Transition[] {
  const runs: { first: number; last: number; jumps: number }[] = [];
  for (let i = 1; i < t.length; i++) {
    const allowed = params.jumpG + params.maxFlowGps * Math.max(0, t[i] - t[i - 1]);
    if (Math.abs(w[i] - w[i - 1]) <= allowed + WEIGHT_EPSILON_G) continue;
    const current = runs.at(-1);
    if (current !== undefined && i - current.last <= 2) {
      current.last = i; // at most one quiet sample since the last jump
      current.jumps++;
    } else {
      runs.push({ first: i - 1, last: i, jumps: 1 });
    }
  }
  // A sample that moved faster than liquid could, by less than a jump, is part of a change
  // (D-062): a knock rising or falling by less than a jump a sample.
  const fast = (i: number) =>
    Math.abs(w[i] - w[i - 1]) >
    params.maxFlowGps * Math.max(0, t[i] - t[i - 1]) + params.jumpG / 4 + WEIGHT_EPSILON_G;
  // A knock's reading can fall back by less than a jump, and a vessel can settle the rest of
  // the way in that, so the sample after a run can still be part of it. Without this a knock
  // rising in one jump and falling in two smaller moves was measured as a step (T1.13). A sample
  // that moves on fast is part of it whatever the level after: the next one would tilt that
  // level (D-062). A tare in the run applies from the sample after its own jump (`tareJumpAt`),
  // wherever the run ends.
  runs.forEach((run, k) => {
    const ceiling = k + 1 < runs.length ? runs[k + 1].first : t.length - 1;
    for (let moved = 0; moved < LEAD_OUT_MAX_SAMPLES && run.last < ceiling; moved++) {
      const to = Math.min(ceiling + 1, run.last + 1 + fitCount);
      if (!leadsOut(t, w, run.last, run.last + 1, to) && !fast(run.last + 1)) break;
      run.last++;
    }
  });
  // A vessel lifted or put down just before a sample moves it by less than a jump: that sample
  // is already part of the change, and the level before must leave it out (D-035). For a vessel
  // it can be off either way: a hand grabbing a cup presses it down first (0.5 g before shot
  // B's lift in hardware session 2, D-059). Other runs look the way their first jump goes (a
  // knock or a press that comes back has no net direction, D-061): a line through a level still
  // curving (a cup settling, a drain) is off the other way. The level comes from the samples
  // after the run before has settled out (above): a reading still on its way tilts it (D-061).
  // A sample that moved fast joins whatever the level: a knock can rise by less than a jump a
  // sample and fall back in one, right after a tare, with too few samples between for a level
  // (D-062).
  runs.forEach((run, k) => {
    const floor = k > 0 ? runs[k - 1].last : 0;
    const change = w[run.last] - w[run.first];
    const direction =
      Math.abs(change) >= params.minVesselG ? 0 : Math.sign(w[run.first + 1] - w[run.first]);
    for (let moved = 0; moved < LEAD_IN_MAX_SAMPLES && run.first > floor; moved++) {
      const from = Math.max(floor, run.first - fitCount);
      if (!leadsIn(t, w, run.first, from, run.first, direction) && !fast(run.first)) break;
      run.first--;
    }
  });
  // Runs that now touch, with no quiet sample between, are one change: a knock rising right
  // after a tare, taken in by both (D-062).
  const merged: typeof runs = [];
  for (const run of runs) {
    const previous = merged.at(-1);
    if (previous !== undefined && previous.last >= run.first) {
      previous.last = run.last;
      previous.jumps += run.jumps;
    } else {
      merged.push({ ...run });
    }
  }
  return merged.map((run, k) => {
    const limit = k + 1 < merged.length ? merged[k + 1].first : t.length - 1;
    const settled = run.jumps === 1 ? run.last : Math.min(run.last + settleCount, limit);
    return { ...run, settled: Math.max(run.last, settled) };
  });
}

/**
 * Whether sample `i` had already left the level of samples `from` … `to − 1` in `direction` (0:
 * either way): it lies beyond the line through them by more than `LEAD_IN_ERRORS` standard
 * errors of a prediction there (never less than the frame's 0.01 g). Needs three samples for the
 * line.
 */
function leadsIn(
  t: readonly number[],
  w: readonly number[],
  i: number,
  from: number,
  to: number,
  direction: number,
): boolean {
  const count = to - from;
  if (count < 3 || !(t[to - 1] > t[from])) return false;
  const level = fitLevel(t, w, from, to);
  const error = Math.max(
    FRAME_RESOLUTION_G,
    Math.sqrt(level.sse / (count - 2) + level.variance(t[i])),
  );
  const off = w[i] - level.at(t[i]);
  return (direction === 0 ? Math.abs(off) : direction * off) > LEAD_IN_ERRORS * error;
}

/**
 * Whether sample `i` is still on its way: it lies off the line through samples `from` …
 * `to − 1`, either way, by more than `LEAD_OUT_ERRORS` standard errors of a prediction there
 * (never less than the frame's 0.01 g). Needs three samples for the line.
 */
function leadsOut(
  t: readonly number[],
  w: readonly number[],
  i: number,
  from: number,
  to: number,
): boolean {
  const count = to - from;
  if (count < 3 || !(t[to - 1] > t[from])) return false;
  const level = fitLevel(t, w, from, to);
  const error = Math.max(
    FRAME_RESOLUTION_G,
    Math.sqrt(level.sse / (count - 2) + level.variance(t[i])),
  );
  return Math.abs(w[i] - level.at(t[i])) > LEAD_OUT_ERRORS * error;
}

/**
 * Lines fitted to the clean samples either side of a split: up to `count` of them, never
 * reaching into another transition or the settling after one. Transitions are in order and
 * don't overlap, and neither do their settling stretches.
 */
class SideFits {
  readonly t: readonly number[];
  readonly transitions: readonly Transition[];
  readonly #count: number;

  constructor(t: readonly number[], transitions: readonly Transition[], count: number) {
    this.t = t;
    this.transitions = transitions;
    this.#count = count;
  }

  /**
   * The levels either side of samples `before` and `after` (`after` > `before`), compared at
   * `middleT`, by default halfway between them. A transition whose single jump is that split is
   * the step being measured, so it doesn't bound the fits.
   */
  across(w: readonly number[], before: number, after: number, middleT?: number): StepAcross {
    const t = this.t;
    const own = this.#singleJumpAt(before, after);
    // The fit before starts where the latest transition that ended by `before` settled (or at
    // `before` itself, when that settling isn't over); the fit after stops at the next one.
    let k = this.#lastEndingBy(before);
    if (k >= 0 && this.transitions[k] === own) k--;
    const lowest = k < 0 ? 0 : Math.min(this.transitions[k].settled, before);
    let j = k + 1;
    while (
      j < this.transitions.length &&
      (this.transitions[j].first < after || this.transitions[j] === own)
    )
      j++;
    const highest = j < this.transitions.length ? this.transitions[j].first + 1 : t.length;

    const levelBefore = fitLevel(t, w, Math.max(lowest, before - this.#count + 1), before + 1);
    const levelAfter = fitLevel(t, w, after, Math.min(highest, after + this.#count));
    const middle = middleT ?? (t[before] + t[after]) / 2;
    return {
      before: levelBefore,
      after: levelAfter,
      middleT: middle,
      sizeG: levelAfter.at(middle) - levelBefore.at(middle),
      sizeErrorG: Math.sqrt(levelBefore.variance(middle) + levelAfter.variance(middle)),
    };
  }

  /** The transitions overlapping the samples with times in (`fromT`, `toT`]. */
  overlapping(fromT: number, toT: number): Transition[] {
    return this.transitions.filter(
      (transition) => this.t[transition.first + 1] <= toT && this.t[transition.last] > fromT,
    );
  }

  /** The transition whose single jump is the split `before` → `after`, if there is one. */
  #singleJumpAt(before: number, after: number): Transition | null {
    const k = this.#lastEndingBy(after);
    const transition = k >= 0 ? this.transitions[k] : undefined;
    return transition?.jumps === 1 && transition.first === before ? transition : null;
  }

  /** The index of the last transition whose last jump is at most at `index`, or −1. */
  #lastEndingBy(index: number): number {
    let lo = 0;
    let hi = this.transitions.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.transitions[mid].last <= index) lo = mid + 1;
      else hi = mid;
    }
    return lo - 1;
  }
}

/**
 * A straight line through samples `from` … `to − 1` against time, or their mean when they
 * share one time (a single sample, or a burst).
 */
function fitLevel(t: readonly number[], w: readonly number[], from: number, to: number): Level {
  const count = to - from;
  if (count >= 2 && t[to - 1] > t[from]) {
    const times = t.slice(from, to);
    const fit = fitLine(times, w.slice(from, to));
    const meanT = mean(times);
    const spread = times.reduce((total, x) => total + (x - meanT) ** 2, 0);
    // The residual variance has count − 2 degrees of freedom: none from two samples.
    const scatter = count > 2 ? fit.sse / (count - 2) : Infinity;
    return {
      at: (x) => fit.intercept + fit.slope * x,
      variance: (x) => scatter * (1 / count + (x - meanT) ** 2 / spread),
      sse: fit.sse,
      count,
    };
  }
  const level = mean(w, from, to);
  let sse = 0;
  for (let i = from; i < to; i++) sse += (w[i] - level) ** 2;
  const scatter = count > 1 ? sse / (count - 1) : Infinity;
  return { at: () => level, variance: () => scatter / count, sse, count };
}

/**
 * The step a tare command logged at `commandT` made, if the reading landed on 0 within
 * `tareSearchS`: a single jump there, or with no transition there, the quiet split that lines
 * either side fit best (a tare of a reading already near 0, too small to jump). Null when there's
 * no such step, or only a longer transition overlaps the search, which makes it ambiguous.
 */
function loggedTare(
  commandT: number,
  w: readonly number[],
  fits: SideFits,
  claimed: Set<Transition>,
  params: SegmentationParams,
  lands: (step: StepAcross, slackG?: number) => boolean,
): Tare | null {
  const t = fits.t;
  const endT = commandT + params.tareSearchS;
  const nearby = fits.overlapping(commandT, endT);
  if (nearby.length > 0) {
    for (const transition of nearby) {
      if (claimed.has(transition)) continue;
      const step = fits.across(w, transition.first, transition.last);
      const from = tareJumpAt(w, transition, step.sizeG);
      if (from === null) continue;
      // How far a knock had moved the reading as the scale tared.
      const knockG = Math.abs(w[from - 1] - step.before.at(t[from - 1]));
      if (!lands(step, knockG)) continue;
      claimed.add(transition);
      return {
        before: transition.first,
        after: transition.last,
        from,
        source: 'command',
        sizeG: step.sizeG,
        jumps: transition.jumps,
        pressFirst: null,
      };
    }
    return null;
  }

  let best: { readonly step: StepAcross; readonly after: number; readonly score: number } | null =
    null;
  for (let i = Math.max(1, firstAfter(t, commandT)); i < t.length && t[i] <= endT; i++) {
    const step = fits.across(w, i - 1, i);
    if (step.before.count < 2 || step.after.count < 2) continue;
    const freedom = Math.max(1, step.before.count + step.after.count - 4);
    const score = (step.before.sse + step.after.sse) / freedom;
    if (best === null || score < best.score) best = { step, after: i, score };
  }
  // Most such commands meet a reading already at 0 (manual start right after the auto-tare,
  // during the pump's vibration), where a fitted step is noise; apply only a clear one.
  if (
    best === null ||
    !lands(best.step) ||
    !(Math.abs(best.step.sizeG) > params.quietTareSigmas * best.step.sizeErrorG)
  ) {
    return null;
  }
  return {
    before: best.after - 1,
    after: best.after,
    from: best.after,
    source: 'command',
    sizeG: best.step.sizeG,
    jumps: 0,
    pressFirst: null,
  };
}

/**
 * A tare is one jump, and applies from the sample after it: a run's last sample can be later,
 * when a knock as the tare came falls back after it (D-062). In a run of several jumps, the
 * largest is the tare when it makes up `TARE_JUMP_SHARE` of the run's change, `sizeG`; a vessel
 * settles out over several jumps, none that large. Null when none is.
 */
function tareJumpAt(w: readonly number[], transition: Transition, sizeG: number): number | null {
  let at = transition.last;
  let largest = 0;
  for (let i = transition.first + 1; i <= transition.last; i++) {
    const jump = Math.abs(w[i] - w[i - 1]);
    if (jump > largest) {
      largest = jump;
      at = i;
    }
  }
  return transition.jumps === 1 || largest >= TARE_JUMP_SHARE * Math.abs(sizeG) ? at : null;
}

/** A logged tare's jump makes up at least this share of a run's change (`tareJumpAt`). */
const TARE_JUMP_SHARE = 0.8;

/** The first index whose time is beyond `t`, by bisection: the times never decrease. */
function firstAfter(times: readonly number[], t: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
