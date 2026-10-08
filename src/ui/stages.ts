/**
 * A shot's three stages, colour-coded on its charts in place of the marker lines (T3.16,
 * D-109): preinfusion (pump on to the first drip), extraction (the first drip to pump off) and
 * the tail (pump off to its end). The live chart and a finished shot's chart both draw them
 * (T3.17, D-110). Display only: the live chart's markers are its own, never stored.
 */

import { pointAt, type ChartPoint, type ChartScale } from './brew/chart';

export const STAGES = ['preinfusion', 'extraction', 'tail'] as const;
export type Stage = (typeof STAGES)[number];

/** Each stage's colour, as a CSS value (`--stage-…` in theme.css). */
export const STAGE_COLOUR: Readonly<Record<Stage, string>> = {
  preinfusion: 'var(--stage-pre)',
  extraction: 'var(--stage-ext)',
  tail: 'var(--stage-tail)',
};

/** A shot's markers on its chart, s from its zero; null when unknown. */
export interface StageMarkers {
  /**
   * The Start tap, or the pump's sound or vibration. Without it the shot was found by its weight
   * alone, from the first drip: it has no preinfusion (T3.17).
   */
  readonly pumpOnS: number | null;
  readonly firstDripS: number | null;
  readonly pumpOffS: number | null;
  /**
   * Where the shot's data ends: the tail's end (it settled) on a finished shot, the latest
   * reading on a live one. No stage runs past it. Null: to the chart's edge.
   */
  readonly endS: number | null;
}

/**
 * The stage at `tS`, s from the chart's zero: with pump on, the preinfusion until the first drip
 * (until pump off, or for good, before one is found); then the extraction until pump off; then
 * the tail. Without pump on there is no preinfusion: the extraction from the start.
 */
export function stageAt(markers: StageMarkers, tS: number): Stage {
  const { pumpOnS, firstDripS, pumpOffS } = markers;
  const preEnd = firstDripS ?? pumpOffS ?? Infinity;
  if (pumpOnS !== null && tS < preEnd) return 'preinfusion';
  if (pumpOffS === null || tS < pumpOffS) return 'extraction';
  return 'tail';
}

/**
 * The points by stage, each run holding the point where the next starts too, so the coloured
 * line has no gap. A stage with no points has an empty run.
 */
export function stageRuns(
  markers: StageMarkers,
  points: readonly ChartPoint[],
): Readonly<Record<Stage, readonly ChartPoint[]>> {
  const runs: Record<Stage, ChartPoint[]> = { preinfusion: [], extraction: [], tail: [] };
  let previous: Stage | null = null;
  for (const point of points) {
    const stage = stageAt(markers, point.tS);
    if (previous !== null && previous !== stage) runs[previous].push(point);
    runs[stage].push(point);
    previous = stage;
  }
  return runs;
}

/** A stage's span on the time axis, s from the zero, clipped to the chart's. */
export interface StageSpan {
  readonly stage: Stage;
  readonly fromS: number;
  readonly toS: number;
}

/**
 * The stages' spans across the chart, for the strip under it, up to where the shot's data ends;
 * a stage it doesn't reach, none.
 */
export function stageSpans(markers: StageMarkers, scale: ChartScale): StageSpan[] {
  const start = scale.fromS ?? 0;
  const edge = start + scale.timeS;
  const end = markers.endS === null ? edge : Math.min(edge, Math.max(start, markers.endS));
  const clip = (t: number) => Math.min(end, Math.max(start, t));
  const { pumpOnS, firstDripS, pumpOffS } = markers;
  const spans: StageSpan[] = [];
  if (pumpOnS !== null) {
    const toS = firstDripS ?? pumpOffS ?? end;
    spans.push({ stage: 'preinfusion', fromS: clip(pumpOnS), toS: clip(toS) });
  }
  if (firstDripS !== null || pumpOnS === null) {
    const fromS = firstDripS ?? start;
    spans.push({ stage: 'extraction', fromS: clip(fromS), toS: clip(pumpOffS ?? end) });
  }
  if (pumpOffS !== null) spans.push({ stage: 'tail', fromS: clip(pumpOffS), toS: end });
  return spans.filter((span) => span.toS > span.fromS);
}

/** A line of the reading at a moment beyond the time, weight and flow: a stage that has ended. */
export interface StageNote {
  readonly stage: Stage;
  readonly text: string;
}

/**
 * What the finger's moment adds (T3.16): the stages it is past, with how long they lasted
 * (`preinfusion 7.4 s`, `extraction 24.6 s`), and in the tail what has dripped since pump off
 * (`tail +0.3 g`). Without pump on there is no preinfusion, so no note.
 */
export function stageNotes(
  markers: StageMarkers,
  points: readonly ChartPoint[],
  tS: number,
): StageNote[] {
  const notes: StageNote[] = [];
  const { pumpOnS, firstDripS, pumpOffS } = markers;
  if (pumpOnS !== null && firstDripS !== null && tS >= firstDripS) {
    notes.push({
      stage: 'preinfusion',
      text: `preinfusion ${(firstDripS - pumpOnS).toFixed(1)} s`,
    });
  }
  if (pumpOffS !== null && tS >= pumpOffS) {
    const from = firstDripS ?? pumpOnS;
    if (from !== null) {
      notes.push({ stage: 'extraction', text: `extraction ${(pumpOffS - from).toFixed(1)} s` });
    }
    const atOff = pointAt(points, pumpOffS);
    const now = pointAt(points, tS);
    if (atOff !== null && now !== null) {
      const dripped = Math.max(0, now.g - atOff.g);
      notes.push({ stage: 'tail', text: `tail +${dripped.toFixed(1)} g` });
    }
  }
  return notes;
}
