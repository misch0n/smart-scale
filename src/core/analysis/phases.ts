/**
 * What the brew's phases weighed (T2.5, D-079): the beans, the grounds and the milk, measured
 * inside the phases the capture flow logged (`phase` actions, `phaseChangeOf`) on the
 * zero-tracked stable levels (T1.11). The live display shows them as they pour; this is the
 * record (hard rule 3: live values are never stored).
 *
 * - **A phase's span** runs from its `open` to the next phase's `open`, or its own `done` or
 *   `skipped`, or the recording's end. Opening the phase it is in changes nothing.
 * - **Its vessel** is the one on the scale as it opened (put on before, not lifted since), or put
 *   on during it. A vessel's empty weight is the stable level after it went on less the level
 *   before it: it is put on empty.
 * - **What it held** is the last stable level while its vessel was on, less the level it was put
 *   on from, less the vessel's empty weight. A lift is a pause: the vessel put back (weighing
 *   its empty weight and up to what it held, and a gram more) counts from where it was put on.
 *   Another vessel ends what the phase can measure.
 * - **The grind's vessel** is often the bean cup, put back with its grounds in it (spec v2 "Brew
 *   phases"): one that comes on weighing the beans' vessel plus up to the beans and a gram more
 *   is that vessel, so the grounds are what it carried. Any other vessel is put on empty.
 *
 * A phase with no vessel, or with less than `MIN_RESULT_G` in it, holds nothing (null).
 */

import {
  MEASURED_PHASES,
  phaseChangeOf,
  type AppEvent,
  type Id,
  type MeasuredPhase,
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
  const spans: { phase: MeasuredPhase; startT: number; endT: number }[] = [];
  const close = (open: { readonly phase: string; readonly startT: number } | null, t: number) => {
    if (open !== null && isMeasured(open.phase)) {
      spans.push({ phase: open.phase, startT: open.startT, endT: Math.max(open.startT, t) });
    }
  };
  type Open = { readonly phase: string; readonly startT: number } | null;
  let open = null as Open;
  for (const change of changes) {
    if (change.state === 'open') {
      if (open?.phase === change.phase) continue;
      close(open, change.t);
      open = { phase: change.phase, startT: change.t };
    } else if (open?.phase === change.phase) {
      close(open, change.t);
      open = null;
    }
  }
  close(open, endT);

  const measured: PhaseMeasurement[] = [];
  let beans: PhaseMeasurement | null = null;
  for (const span of spans) {
    const measurement = measure(levels, span, span.phase === 'grind' ? beans : null);
    if (span.phase === 'beans') beans = measurement;
    measured.push(measurement);
  }
  return measured;
}

function isMeasured(phase: string): phase is MeasuredPhase {
  return (MEASURED_PHASES as readonly string[]).includes(phase);
}

function measure(
  { steps, stretches }: PhaseLevels,
  span: { readonly phase: MeasuredPhase; readonly startT: number; readonly endT: number },
  beans: PhaseMeasurement | null,
): PhaseMeasurement {
  const { startT, endT } = span;
  const placed = steps.filter((step) => step.kind === 'cup-placed');
  const lifted = steps.filter((step) => step.kind === 'cup-removed');
  const before = placed.filter((step) => step.startT <= startT).at(-1);
  const onAtStart =
    before !== undefined &&
    !lifted.some((step) => step.startT > before.startT && step.startT <= startT)
      ? before
      : null;
  const vessels = [
    ...(onAtStart === null ? [] : [onAtStart]),
    ...placed.filter((step) => step.startT > startT && step.startT < endT),
  ];
  const none = { ...span, vesselG: null, resultG: null };
  if (vessels.length === 0) return none;

  const first = vessels[0];
  const firstG = levelAfter(stretches, steps, first) - first.levelBeforeG;
  // The bean cup back with its grounds: up to the beans and a gram more than it weighed empty.
  const beansVesselG = beans?.vesselG ?? null;
  const carried = beansVesselG === null ? null : firstG - beansVesselG;
  const emptyG =
    span.phase === 'grind' &&
    beansVesselG !== null &&
    carried !== null &&
    carried >= -SAME_VESSEL_G &&
    carried <= (beans?.resultG ?? 0) + CARRIED_EXTRA_G
      ? beansVesselG
      : firstG;

  // Its vessel through the phase: put back, it weighs what it weighed empty, and up to what it
  // held and a gram more. Another vessel ends what the phase can measure.
  let resultG: number | null = null;
  for (const vessel of vessels) {
    const massG = levelAfter(stretches, steps, vessel) - vessel.levelBeforeG;
    if (
      vessel !== first &&
      (massG < emptyG - SAME_VESSEL_G || massG > emptyG + (resultG ?? 0) + CARRIED_EXTRA_G)
    ) {
      break;
    }
    const off = lifted.find((step) => step.startT > vessel.startT);
    const until = Math.min(endT, off?.startT ?? Infinity);
    const level = stretches.filter((s) => s.endT > vessel.endT && s.startT < until).at(-1);
    if (level !== undefined) resultG = hundredths(level.levelG - vessel.levelBeforeG - emptyG);
  }
  return {
    ...span,
    vesselG: hundredths(emptyG),
    resultG: resultG !== null && resultG >= MIN_RESULT_G ? resultG : null,
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

/**
 * Each shot's phases, by its id: the last beans and the last grind phase that opened after the
 * shot before it ended and before this one did (the anchors: "shot done" for a live shot), and
 * the first milk phase that opened after it ended, before the next one did.
 */
export function phasesOfShots(
  phases: readonly PhaseMeasurement[],
  shots: readonly { readonly id: Id; readonly anchorTMs: number }[],
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
    results.set(shot.id, {
      beansG: before('beans')?.resultG ?? null,
      groundG: before('grind')?.resultG ?? null,
      milkG: milk?.resultG ?? null,
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
