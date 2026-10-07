/**
 * What the brew's phases weighed (T2.5, D-079): the beans, the grounds and the milk, measured
 * inside the phases the capture flow logged (`phase` actions, `phaseChangeOf`) on the
 * zero-tracked stable levels (T1.11). The live display shows them as they pour; this is the
 * record (hard rule 3: live values are never stored).
 *
 * - **A phase's span** runs from its `open` to the next phase's `open`, or its own `done` or
 *   `skipped`, or the recording's end. Opening the phase it is in changes nothing. A `done` or
 *   `skipped` logged as a vessel put on opens another phase is that open's (version 12, T2.21).
 * - **Its vessel** is the one on the scale as it opened (put on before, not lifted since), or put
 *   on during it. A vessel's empty weight is the stable level after it went on less the level
 *   before it: it is put on empty.
 * - **What it held** is the last stable level while its vessel was on, less the level it was put
 *   on from, less the vessel's empty weight. The vessel is read until it is lifted, even past
 *   the phase's own `done` (up to the next phase's `open`): the milk's Done is often tapped as
 *   the pour ends, before the scale settles (T2.11). A rise while it stays on is what goes into
 *   it, however fast: a quick pour can look like a vessel put on. A lift is a pause: the vessel
 *   put back during the phase (weighing its empty weight and up to what it held, and a gram
 *   more) counts from where it was put on. Another vessel ends what the phase can measure.
 * - **The grind's vessel** is often the bean cup, put back with its grounds in it (spec v2 "Brew
 *   phases"): one that comes on weighing the beans' vessel plus up to the beans and a gram more
 *   is that vessel, so the grounds are what it carried; since version 13 (T2.24, D-100) up to a
 *   dose, whatever the beans weighed, and the last grounds stand when it comes back empty. Any
 *   other vessel is put on empty. A grind
 *   opened with the beans still in their vessel (not lifted since they were weighed) holds the
 *   beans then, not grounds: only what that vessel comes back with after a lift counts (version
 *   12, T2.21).
 *
 * A phase with no vessel, or with less than `MIN_RESULT_G` in it, holds nothing (null).
 */

import {
  MEASURED_PHASES,
  phaseChangeOf,
  type AppEvent,
  type Id,
  type MeasuredPhase,
  type PhaseState,
} from '../model';
import type { StableStretch } from './stability';
import type { Step } from './steps';

/** A measured phase, as the cache keeps it. */
export interface PhaseMeasurement {
  readonly phase: MeasuredPhase;
  /** When it opened, and when it ended, s. */
  readonly startT: number;
  readonly endT: number;
  /** Its vessel's empty weight, g; null without a vessel. */
  readonly vesselG: number | null;
  /** What it held: the beans, the grounds or the milk, g; null when nothing. */
  readonly resultG: number | null;
}

/** Less than this is nothing in it, g: three of the scale's steps. */
export const MIN_RESULT_G = 0.3;

/** A vessel put back may weigh this much less than it did empty and still be it, g. */
const SAME_VESSEL_G = 0.5;

/** And this much more than it held: beans or grounds clinging, a drop of milk, g. */
const CARRIED_EXTRA_G = 1;

/** The most a bean or grind cup carries back: a dose, g (the live router's `doseMaxG`). */
const DOSE_MAX_G = 30;

/** A phase's end and another's open logged this close are one change, s (the router's: 1 ms). */
const TOGETHER_S = 0.05;

/** What the measurement reads of the segmentation (`Segmentation` has it). */
export interface PhaseLevels {
  readonly steps: readonly Step[];
  readonly stretches: readonly StableStretch[];
}

/** Every logged beans, grind and milk phase, in order, with what it held. */
export function measurePhases(
  levels: PhaseLevels,
  events: readonly AppEvent[],
  endT: number,
): PhaseMeasurement[] {
  const changes = events
    .flatMap((event) => {
      const change = phaseChangeOf(event);
      return change === null ? [] : [{ ...change, t: event.tMs / 1000 }];
    })
    .sort((a, b) => a.t - b.t);
  const spans: Span[] = [];
  const close = (
    open: { readonly phase: string; readonly startT: number } | null,
    t: number,
    endedByNext: boolean,
  ) => {
    if (open !== null && isMeasured(open.phase)) {
      const spanEndT = Math.max(open.startT, t);
      // Its vessel is read up to the next phase's open, past its own done.
      const next = changes.find((change) => change.state === 'open' && change.t >= spanEndT);
      spans.push({
        phase: open.phase,
        startT: open.startT,
        endT: spanEndT,
        readUntilT: Math.max(spanEndT, next?.t ?? endT),
        endedByNext,
      });
    }
  };
  // A phase done or skipped as a vessel put on opens the next: the router logs both together,
  // and that vessel is the next phase's (the bean cup back with its grounds, T2.21). Not at a
  // tap: the vessel on then is the phase's own, its beans poured into it.
  const vesselOpensNext = (i: number) =>
    changes
      .slice(i + 1)
      .some(
        (change) =>
          change.state === 'open' &&
          change.by === 'container' &&
          change.phase !== changes[i].phase &&
          change.t - changes[i].t <= TOGETHER_S,
      );
  type Open = { readonly phase: string; readonly startT: number } | null;
  let open = null as Open;
  for (const [i, change] of changes.entries()) {
    if (change.state === 'open') {
      if (open?.phase === change.phase) continue;
      close(open, change.t, true);
      open = { phase: change.phase, startT: change.t };
    } else if (open?.phase === change.phase) {
      close(open, change.t, vesselOpensNext(i));
      open = null;
    }
  }
  close(open, endT, false);

  const measured: PhaseMeasurement[] = [];
  let beans: Measured | null = null;
  for (const span of spans) {
    const result = measure(levels, span, span.phase === 'grind' ? beans : null);
    if (span.phase === 'beans') beans = result;
    measured.push(result.measurement);
  }
  return measured;
}

/** A logged phase, from its open to its end, and how long its vessel may be read. */
interface Span {
  readonly phase: MeasuredPhase;
  readonly startT: number;
  readonly endT: number;
  /** The next phase's open, else the recording's end, s: never before `endT`. */
  readonly readUntilT: number;
  /** The next phase's open ended it: a vessel on then is that phase's. */
  readonly endedByNext: boolean;
}

/** A phase measured, and the vessel's placement it was last read on (null without a vessel). */
interface Measured {
  readonly measurement: PhaseMeasurement;
  readonly vessel: Step | null;
}

function isMeasured(phase: string): phase is MeasuredPhase {
  return (MEASURED_PHASES as readonly string[]).includes(phase);
}

function measure(
  { steps, stretches }: PhaseLevels,
  { phase, startT, endT, readUntilT, endedByNext }: Span,
  beans: Measured | null,
): Measured {
  const placed = steps.filter((step) => step.kind === 'cup-placed');
  const lifted = steps.filter((step) => step.kind === 'cup-removed');
  const before = placed.filter((step) => step.startT <= startT).at(-1);
  const onAtStart =
    before !== undefined &&
    !lifted.some((step) => step.startT > before.startT && step.startT <= startT)
      ? before
      : null;
  const first =
    onAtStart ?? placed.find((step) => step.startT > startT && step.startT < endT) ?? null;
  const span = { phase, startT, endT };
  if (first === null) {
    return { measurement: { ...span, vesselG: null, resultG: null }, vessel: null };
  }

  const firstG = levelAfter(stretches, steps, first) - first.levelBeforeG;
  // The bean cup back with its grounds: up to the beans and a gram more than it weighed empty.
  const beansVesselG = beans?.measurement.vesselG ?? null;
  const beansG = beans?.measurement.resultG ?? null;
  const carried = beansVesselG === null ? null : firstG - beansVesselG;
  const emptyG =
    phase === 'grind' &&
    beansVesselG !== null &&
    carried !== null &&
    carried >= -SAME_VESSEL_G &&
    carried <= DOSE_MAX_G + CARRIED_EXTRA_G
      ? beansVesselG
      : firstG;

  // The grind tapped open with the beans still in their vessel (session 4): what it holds then
  // is the beans, not grounds. Only what it comes back with after a lift counts (T2.21).
  const beansStillOn =
    phase === 'grind' && onAtStart !== null && onAtStart === beans?.vessel && beansG !== null;

  // Its vessel through the phase, read until it is lifted: put back during the phase, it weighs
  // what it weighed empty, and up to what it held and a gram more. Another vessel ends what the
  // phase can measure, and so does one still on as the next phase opens: that phase's (the bean
  // cup back with the grounds opens the grind).
  let resultG: number | null = null;
  let heldG: number | null = null;
  let counts = !beansStillOn;
  let vessel: Step = first;
  for (;;) {
    const on = vessel;
    const off = lifted.find((step) => step.startT > on.startT);
    const until = Math.min(readUntilT, off?.startT ?? Infinity);
    const level = stretches.filter((s) => s.endT > on.endT && s.startT < until).at(-1);
    if (level !== undefined) {
      const g = hundredths(level.levelG - on.levelBeforeG - emptyG);
      // The grind's cup put back empty, its grounds tipped out: the last grounds stand.
      const keep = phase === 'grind' && resultG !== null && g < MIN_RESULT_G && vessel !== first;
      if (!keep) heldG = g;
      if (counts && !keep) resultG = heldG;
    }
    if (off === undefined) break;
    const back = placed.find((step) => step.startT > off.startT);
    if (back === undefined || back.startT >= endT) break;
    if (endedByNext && !lifted.some((step) => step.startT > back.startT && step.startT <= endT)) {
      break;
    }
    const massG = levelAfter(stretches, steps, back) - back.levelBeforeG;
    // The grind's cup brings back whatever it brings, up to a dose (T2.24, D-100).
    const most = phase === 'grind' ? Math.max(heldG ?? 0, DOSE_MAX_G) : (heldG ?? 0);
    if (massG < emptyG - SAME_VESSEL_G || massG > emptyG + most + CARRIED_EXTRA_G) {
      break;
    }
    vessel = back;
    counts = true;
  }
  return {
    measurement: {
      ...span,
      vesselG: hundredths(emptyG),
      resultG: resultG !== null && resultG >= MIN_RESULT_G ? resultG : null,
    },
    vessel,
  };
}

/** The stable level a step settled on: the first stretch after it, else the step's own. */
function levelAfter(
  stretches: readonly StableStretch[],
  steps: readonly Step[],
  step: Step,
): number {
  const next = steps.find((other) => other.startT > step.startT);
  const stretch = stretches.find(
    (s) => s.endT > step.endT && (next === undefined || s.startT < next.startT),
  );
  return stretch?.levelG ?? step.levelAfterG;
}

function hundredths(g: number): number {
  return Math.round(g * 100) / 100;
}

/** What a shot's own phases held, g; null for a phase not measured. */
export interface ShotPhaseResults {
  readonly beansG: number | null;
  readonly groundG: number | null;
  readonly milkG: number | null;
}

export const NO_PHASE_RESULTS: ShotPhaseResults = { beansG: null, groundG: null, milkG: null };

/** What `phasesOfShots` reads of a shot: its anchor, and its phases as its brew recorded them. */
export interface ShotPhaseKeys {
  readonly id: Id;
  readonly anchorTMs: number;
  /** null for a shot whose brew recorded no phases (post-hoc, or before T2.5). */
  readonly beansPhase: PhaseState | null;
  readonly grindPhase: PhaseState | null;
  readonly milkPhase: PhaseState | null;
}

/**
 * Each shot's phases, by its id: the last beans and the last grind phase that opened after the
 * shot before it ended and before this one did (the anchors: "shot done" for a live shot), and
 * the first milk phase that opened after it ended, before the next one did. A phase the shot's
 * brew skipped holds nothing for it, whatever was measured before: a brew ended by its ✕ leaves
 * its phases in the recording, and the next brew may skip them (T2.15).
 */
export function phasesOfShots(
  phases: readonly PhaseMeasurement[],
  shots: readonly ShotPhaseKeys[],
): Map<Id, ShotPhaseResults> {
  const ordered = [...shots].sort((a, b) => a.anchorTMs - b.anchorTMs);
  const results = new Map<Id, ShotPhaseResults>();
  ordered.forEach((shot, i) => {
    const fromT = i === 0 ? -Infinity : ordered[i - 1].anchorTMs / 1000;
    const atT = shot.anchorTMs / 1000;
    const toT = i === ordered.length - 1 ? Infinity : ordered[i + 1].anchorTMs / 1000;
    const before = (phase: MeasuredPhase) =>
      phases.filter((p) => p.phase === phase && p.startT > fromT && p.startT <= atT).at(-1);
    const milk = phases.find((p) => p.phase === 'milk' && p.startT > atT && p.startT <= toT);
    const unlessSkipped = (state: PhaseState | null, g: number | null | undefined) =>
      state === 'skipped' ? null : (g ?? null);
    results.set(shot.id, {
      beansG: unlessSkipped(shot.beansPhase, before('beans')?.resultG),
      groundG: unlessSkipped(shot.grindPhase, before('grind')?.resultG),
      milkG: unlessSkipped(shot.milkPhase, milk?.resultG),
    });
  });
  return results;
}

/** Where a shot's dose came from. */
export type DoseSource = 'ground' | 'beans' | 'set' | 'basket';

export interface ShotDose {
  readonly g: number;
  readonly source: DoseSource;
}

/**
 * A shot's dose (spec v2 "Brew phases": the targets): the grounds weighed, else the beans, else
 * the dose set on the shot (before the phases, T1.18), else its basket's size; null without any.
 */
export function shotDose(
  shot: { readonly doseG: number | null; readonly basketSizeG: number | null },
  phases: ShotPhaseResults | null,
): ShotDose | null {
  if (phases?.groundG != null) return { g: phases.groundG, source: 'ground' };
  if (phases?.beansG != null) return { g: phases.beansG, source: 'beans' };
  if (shot.doseG !== null && shot.doseG > 0) return { g: shot.doseG, source: 'set' };
  if (shot.basketSizeG !== null && shot.basketSizeG > 0) {
    return { g: shot.basketSizeG, source: 'basket' };
  }
  return null;
}
