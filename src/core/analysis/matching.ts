/**
 * Shots and segments (T1.14; D-007, D-019, D-047). A shot is user metadata anchored at a time in
 * its recording; a segment is a shot window the analysis found, with its markers. They meet by
 * time, and re-running the analysis never touches a shot: it only matches again.
 *
 * - **A segment's shot** runs from its start, `pump_on` (else `first_drip`, else the baseline's
 *   end), to its end: the window's end, or, when the next shot pours into the same cup, the
 *   moment this one settled (else `pump_off`). A shot's anchor is inside its shot (D-019): the
 *   capture flow's "shot done", the manual start, or a post-hoc shot's start.
 * - **Each shot looks at the nearest segment only**, by how far its anchor lies outside that
 *   segment's shot, and only within `MATCH_SLACK_S`. Further away, it's unmatched (`no-segment`).
 * - **Several shots for one segment:** the one the user made (live or manual) before a post-hoc
 *   one, a standing one before a discarded one, then the nearer, the earlier, the lower id. The
 *   others are unmatched (`claimed`); none moves on to another segment.
 * - **A discarded shot still claims its segment** (D-019), so its segment gets no new shot.
 * - **A segment no shot claims** gets a post-hoc shot when it looks like espresso (D-047: a
 *   `pump_on`, or a `pump_off` with a draining tail), anchored at its start. Anything else, such
 *   as beans, ground coffee or milk poured onto the scale, stays an unlabelled segment until
 *   containers label it (T2.4, T2.5).
 *
 * Anchors are ms on the recorder's clock; segments are timeline seconds, which follow the arrival
 * clock to within the link's latency (T1.9), far inside the slack.
 */

import type { Id, Shot } from '../model';
import type { SegmentMarkers } from './metrics';
import type { ShotWindowEnd } from './shot-windows';

/**
 * A shot's anchor may lie this far outside its segment's shot and still match it, s: clock
 * offsets, markers moving between analysis versions, and a "shot done" a little after the cup
 * came off. Further would let a shot whose segment wasn't found take a neighbour's.
 */
export const MATCH_SLACK_S = 10;

/** What matching needs of a segment (`SegmentAnalysis` has it). */
export interface MatchableSegment {
  readonly window: {
    readonly endT: number;
    readonly end: ShotWindowEnd;
    readonly baseline: { readonly endT: number };
  };
  readonly markers: SegmentMarkers;
  readonly metrics: { readonly yieldG: number | null };
  /** Whether it looks like espresso, so that it gets a post-hoc shot when no shot claims it. */
  readonly espresso: boolean;
}

/** Why a shot has no segment: none near enough, or another shot claims the nearest. */
export type UnmatchedReason = 'no-segment' | 'claimed';

export interface ShotMatch {
  readonly shotId: Id;
  /** The index of the segment it claims, or null. */
  readonly segment: number | null;
  /** How far its anchor lies outside that segment's shot, s: 0 inside. Null when unmatched. */
  readonly distanceS: number | null;
  readonly unmatched: UnmatchedReason | null;
  /** The segment's yield over the shot's dose, when both are known. */
  readonly ratio: number | null;
}

export interface PostHocShot {
  /** The index of the segment it is for. */
  readonly segment: number;
  /** Where to anchor it: the segment's start, `pump_on` (else `first_drip`), ms. */
  readonly anchorTMs: number;
}

export interface ShotMatching {
  /** One per shot given, in the same order. */
  readonly shots: readonly ShotMatch[];
  /** One per segment, in order: the id of the shot that claims it, or null. */
  readonly claims: readonly (Id | null)[];
  /** The espresso-like segments no shot claims: each needs a post-hoc shot (D-007). */
  readonly postHoc: readonly PostHocShot[];
}

/** The span of a segment's shot, s: see the module comment. */
export function shotSpan(segment: MatchableSegment): { startT: number; endT: number } {
  const { markers, window } = segment;
  const startT = markers.pumpOn?.t ?? markers.firstDrip?.t ?? window.baseline.endT;
  const end =
    window.end === 'next-shot'
      ? (markers.settled?.t ?? markers.pumpOff?.t ?? window.endT)
      : window.endT;
  return { startT, endT: Math.max(startT, Math.min(end, window.endT)) };
}

/**
 * Matches a recording's shots (discarded ones too) to its segments. Pure, and cheap next to the
 * analysis, so it runs on every read: metadata never makes a cached result stale.
 */
export function matchShots(
  segments: readonly MatchableSegment[],
  shots: readonly Shot[],
): ShotMatching {
  const spans = segments.map(shotSpan);
  const nearest = shots.map((shot): Nearest | null => {
    const a = shot.anchorTMs / 1000;
    let best: Nearest | null = null;
    for (let segment = 0; segment < spans.length; segment++) {
      const { startT, endT } = spans[segment];
      const distanceS = Math.max(0, startT - a, a - endT);
      if (distanceS <= MATCH_SLACK_S && (best === null || distanceS < best.distanceS)) {
        best = { segment, distanceS };
      }
    }
    return best;
  });

  // Each segment goes to the first of the shots nearest it, in claiming order.
  const claimants: Claimant[] = [];
  shots.forEach((shot, i) => {
    const near = nearest[i];
    if (near !== null) claimants.push({ shot, i, near });
  });
  claimants.sort(claimingOrder);
  const claims: (Id | null)[] = segments.map(() => null);
  const won = new Set<number>();
  for (const { shot, i, near } of claimants) {
    if (claims[near.segment] !== null) continue;
    claims[near.segment] = shot.id;
    won.add(i);
  }

  return {
    shots: shots.map((shot, i): ShotMatch => {
      const near = nearest[i];
      if (near === null || !won.has(i)) {
        return {
          shotId: shot.id,
          segment: null,
          distanceS: null,
          unmatched: near === null ? 'no-segment' : 'claimed',
          ratio: null,
        };
      }
      const { yieldG } = segments[near.segment].metrics;
      const { doseG } = shot;
      return {
        shotId: shot.id,
        segment: near.segment,
        distanceS: near.distanceS,
        unmatched: null,
        ratio: yieldG !== null && doseG !== null && doseG > 0 ? yieldG / doseG : null,
      };
    }),
    claims,
    postHoc: segments.flatMap((segment, i) =>
      claims[i] === null && segment.espresso
        ? [{ segment: i, anchorTMs: Math.round(spans[i].startT * 1000) }]
        : [],
    ),
  };
}

interface Nearest {
  readonly segment: number;
  readonly distanceS: number;
}

interface Claimant {
  readonly shot: Shot;
  /** Its place among the shots given. */
  readonly i: number;
  readonly near: Nearest;
}

/**
 * Who gets a segment that several shots are nearest: one the user made before a post-hoc one,
 * a standing one before a discarded one, then the nearer, the earlier anchor, the lower id.
 */
function claimingOrder(a: Claimant, b: Claimant): number {
  const postHoc = (c: Claimant) => Number(c.shot.source === 'post-hoc');
  const discarded = (c: Claimant) => Number(c.shot.discardedAtEpochMs !== null);
  return (
    postHoc(a) - postHoc(b) ||
    discarded(a) - discarded(b) ||
    a.near.distanceS - b.near.distanceS ||
    a.shot.anchorTMs - b.shot.anchorTMs ||
    (a.shot.id < b.shot.id ? -1 : a.shot.id > b.shot.id ? 1 : 0)
  );
}
