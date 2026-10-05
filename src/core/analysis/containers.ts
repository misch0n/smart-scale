/**
 * Which container each segment's vessel was (T2.4; spec v2 "Brew phases"): what it weighed as it
 * was put on, matched against the containers by the model's `matchContainer`, which the live
 * display uses too (they share no state, hard rule 3). The weight is the segment's baseline (the
 * level it held before the pour, zero-tracked) less the level before the step that put it on:
 * the step's own size is measured mid-transition, short of a vessel the scale's smoothing still
 * brings up (105 g for the simulator's 110 g cup).
 *
 * Worked out after the cache, like the shots' matching: the containers are metadata, so learning
 * or changing one never makes a cached analysis stale, and `ANALYSIS_VERSION` doesn't move.
 */

import { matchContainer, type Container, type ContainerMatch } from '../model';
import type { RecordingAnalysis, SegmentAnalysis } from './recording-analysis';

/** What the segment's vessel weighed as it was put on, in tenths, g; null when not seen. */
export function segmentVesselG(
  analysis: Pick<RecordingAnalysis, 'steps'>,
  segment: Pick<SegmentAnalysis, 'window'>,
): number | null {
  const placedT = segment.window.cupPlacedT;
  if (placedT === null) return null;
  const step = analysis.steps.find((s) => s.kind === 'cup-placed' && s.startT === placedT);
  if (step === undefined) return null;
  return Math.round((segment.window.baseline.levelG - step.levelBeforeG) * 10) / 10;
}

/** Each segment's container by its vessel's mass; null where the vessel wasn't seen put on. */
export function segmentContainers(
  analysis: Pick<RecordingAnalysis, 'steps' | 'segments'>,
  containers: readonly Container[],
): (ContainerMatch | null)[] {
  return analysis.segments.map((segment) => {
    const massG = segmentVesselG(analysis, segment);
    return massG === null ? null : matchContainer(massG, containers);
  });
}

/**
 * Whether the vessel is known to be something other than a cup: the bean or grind cup, or the
 * milk jug. Its segment is beans, ground coffee or milk, and gets no post-hoc shot, whatever it
 * looks like (a grinder whose vibration reaches the scale could pass for a pump).
 */
export function knownNotCup(match: ContainerMatch | null): boolean {
  return match?.kind === 'known' && !match.container.roles.includes('cup');
}
