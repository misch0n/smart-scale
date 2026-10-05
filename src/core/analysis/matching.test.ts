import { describe, expect, it } from 'vitest';
import { createIdGenerator, createShot, type NewShot, type Shot } from '../model';
import { MATCH_SLACK_S, matchShots, shotSpan, type MatchableSegment } from './matching';
import type { ShotWindowEnd } from './shot-windows';

const START = Date.UTC(2026, 9, 5, 7, 0);
let idMs = START;
const newId = createIdGenerator({ now: () => idMs++ });
const RECORDING = newId();

function shot(overrides: Partial<NewShot> & { readonly anchorTMs: number }): Shot {
  return createShot({ id: newId(), recordingId: RECORDING, source: 'live', ...overrides }, START);
}

interface SegmentOptions {
  readonly startT?: number;
  readonly endT: number;
  readonly end?: ShotWindowEnd;
  readonly pumpOnT?: number | null;
  readonly firstDripT?: number | null;
  readonly pumpOffT?: number | null;
  readonly settledT?: number | null;
  readonly yieldG?: number | null;
  readonly espresso?: boolean;
}

/** A segment with what matching reads; markers default to a shot with pump on at `pumpOnT`. */
function segment(options: SegmentOptions): MatchableSegment {
  const pumpOnT = options.pumpOnT === undefined ? 10 : options.pumpOnT;
  const firstDripT = options.firstDripT === undefined ? (pumpOnT ?? 10) + 6 : options.firstDripT;
  const pumpOffT = options.pumpOffT === undefined ? (firstDripT ?? 16) + 22 : options.pumpOffT;
  const settledT = options.settledT === undefined ? (pumpOffT ?? 38) + 5 : options.settledT;
  return {
    window: {
      endT: options.endT,
      end: options.end ?? 'cup-removed',
      baseline: { endT: (pumpOnT ?? firstDripT ?? 10) - 0.2 },
    },
    markers: {
      pumpOn: pumpOnT === null ? null : { t: pumpOnT },
      firstDrip:
        firstDripT === null
          ? null
          : {
              t: firstDripT,
              onset: 'gradual',
              changeT: firstDripT,
              alarmT: firstDripT,
              sigmaG: 0.1,
              fitPoints: 20,
              fitRmsG: 0.1,
            },
      pumpOff: pumpOffT === null ? null : { t: pumpOffT, detector: 'variance', weightG: 35 },
      settled: settledT === null ? null : { t: settledT, weightG: 38, source: 'measured' },
      cupRemoved: null,
    },
    metrics: { yieldG: options.yieldG === undefined ? 38 : options.yieldG },
    espresso: options.espresso ?? true,
  };
}

/** One shot: pump on at 10 s, off at 38 s, settled at 43 s, cup off at 70 s. */
const single = segment({ endT: 70 });

describe('shotSpan', () => {
  it('runs from pump_on, else first_drip, else the baseline, to the window’s end', () => {
    expect(shotSpan(single)).toEqual({ startT: 10, endT: 70 });
    expect(shotSpan(segment({ endT: 70, pumpOnT: null, firstDripT: 16 }))).toEqual({
      startT: 16,
      endT: 70,
    });
    expect(
      shotSpan(segment({ endT: 70, pumpOnT: null, firstDripT: null, pumpOffT: null })),
    ).toEqual({ startT: 9.8, endT: 70 });
  });

  it('ends at settled (else pump_off) when the next shot pours into the same cup', () => {
    expect(shotSpan(segment({ endT: 80, end: 'next-shot' }))).toEqual({ startT: 10, endT: 43 });
    expect(shotSpan(segment({ endT: 80, end: 'next-shot', settledT: null }))).toEqual({
      startT: 10,
      endT: 38,
    });
    // Never past the window's end.
    expect(shotSpan(segment({ endT: 40, end: 'next-shot', settledT: 50 })).endT).toBe(40);
  });
});

describe('matchShots', () => {
  it('matches a shot anchored inside its segment, with the ratio from its dose', () => {
    const live = shot({ anchorTMs: 42_000, doseG: 18 });
    const matching = matchShots([single], [live]);
    expect(matching.shots).toEqual([
      { shotId: live.id, segment: 0, distanceS: 0, unmatched: null, ratio: 38 / 18 },
    ]);
    expect(matching.claims).toEqual([live.id]);
    expect(matching.postHoc).toEqual([]);
  });

  it('matches a manual start before the pump, and a "shot done" after the cup came off', () => {
    const manual = shot({ anchorTMs: 7000, source: 'manual' });
    const done = shot({ anchorTMs: 72_000 });
    expect(matchShots([single], [manual]).shots[0]).toMatchObject({ segment: 0, distanceS: 3 });
    expect(matchShots([single], [done]).shots[0]).toMatchObject({ segment: 0, distanceS: 2 });
  });

  it(`leaves a shot more than ${MATCH_SLACK_S} s from every segment unmatched`, () => {
    const far = shot({ anchorTMs: 70_000 + (MATCH_SLACK_S + 1) * 1000 });
    const matching = matchShots([single], [far]);
    expect(matching.shots[0]).toEqual({
      shotId: far.id,
      segment: null,
      distanceS: null,
      unmatched: 'no-segment',
      ratio: null,
    });
    // The segment is free, so it wants a post-hoc shot, anchored at pump_on.
    expect(matching.postHoc).toEqual([{ segment: 0, anchorTMs: 10_000 }]);
    expect(matchShots([], [far]).shots[0].unmatched).toBe('no-segment');
  });

  it('tells two shots into one cup apart: the pause belongs to the nearer', () => {
    // The first window runs on to the second's baseline; its shot settled at 43 s.
    const first = segment({ endT: 79.5, end: 'next-shot' });
    const second = segment({ endT: 150, pumpOnT: 80 });
    const doneFirst = shot({ anchorTMs: 45_000 });
    const startSecond = shot({ anchorTMs: 77_000, source: 'manual' });
    const matching = matchShots([first, second], [doneFirst, startSecond]);
    expect(matching.shots.map((match) => match.segment)).toEqual([0, 1]);
    expect(matching.postHoc).toEqual([]);
  });

  it('gives a segment to the shot the user made before a post-hoc one, even a nearer one', () => {
    const postHoc = shot({ anchorTMs: 10_000, source: 'post-hoc' });
    const live = shot({ anchorTMs: 75_000 }); // after the window, 5 s out
    const matching = matchShots([single], [postHoc, live]);
    expect(matching.claims).toEqual([live.id]);
    expect(matching.shots.map((match) => match.unmatched)).toEqual(['claimed', null]);
  });

  it('gives it to a standing shot before a discarded one, then the nearer, then the earlier', () => {
    const discarded = shot({ anchorTMs: 20_000, discardedAtEpochMs: START + 1 });
    const standing = shot({ anchorTMs: 72_000 });
    expect(matchShots([single], [discarded, standing]).claims).toEqual([standing.id]);
    const outside = shot({ anchorTMs: 75_000 });
    const inside = shot({ anchorTMs: 30_000 });
    const insideEarlier = shot({ anchorTMs: 20_000 });
    expect(matchShots([single], [outside, inside]).claims).toEqual([inside.id]);
    const matching = matchShots([single], [outside, inside, insideEarlier]);
    expect(matching.claims).toEqual([insideEarlier.id]);
    expect(matching.shots.map((match) => match.unmatched)).toEqual(['claimed', 'claimed', null]);
  });

  it('never moves a shot that lost its segment on to another', () => {
    const next = segment({ endT: 150, pumpOnT: 85 });
    const first = shot({ anchorTMs: 30_000 });
    const second = shot({ anchorTMs: 50_000 });
    const matching = matchShots([single, next], [first, second]);
    expect(matching.shots.map((match) => match.segment)).toEqual([0, null]);
    // The second segment stays free: it wants a post-hoc shot of its own.
    expect(matching.postHoc).toEqual([{ segment: 1, anchorTMs: 85_000 }]);
  });

  it('lets a discarded shot keep its segment, so it gets no post-hoc shot (D-019)', () => {
    const deleted = shot({ anchorTMs: 10_000, source: 'post-hoc', discardedAtEpochMs: START });
    const matching = matchShots([single], [deleted]);
    expect(matching.claims).toEqual([deleted.id]);
    expect(matching.postHoc).toEqual([]);
  });

  it('wants post-hoc shots only for espresso-like segments, at pump_on, else first_drip', () => {
    const noPumpOn = segment({ endT: 200, pumpOnT: null, firstDripT: 150.4567 });
    const pour = segment({ endT: 300, pumpOnT: null, firstDripT: 250, espresso: false });
    const matching = matchShots([single, noPumpOn, pour], []);
    expect(matching.postHoc).toEqual([
      { segment: 0, anchorTMs: 10_000 },
      { segment: 1, anchorTMs: 150_457 },
    ]);
    expect(matching.claims).toEqual([null, null, null]);
  });

  it('matches the post-hoc shots it asked for, so a second round asks for none', () => {
    const segments = [single, segment({ endT: 200, pumpOnT: null, firstDripT: 150.4567 })];
    const first = matchShots(segments, []);
    const created = first.postHoc.map((wanted) =>
      shot({ anchorTMs: wanted.anchorTMs, source: 'post-hoc' }),
    );
    const second = matchShots(segments, created);
    expect(second.postHoc).toEqual([]);
    expect(second.shots.map((match) => match.segment)).toEqual([0, 1]);
  });

  it('gives no ratio without a dose or a yield', () => {
    expect(matchShots([single], [shot({ anchorTMs: 30_000 })]).shots[0].ratio).toBeNull();
    const noYield = segment({ endT: 70, yieldG: null });
    expect(
      matchShots([noYield], [shot({ anchorTMs: 30_000, doseG: 18 })]).shots[0].ratio,
    ).toBeNull();
    expect(matchShots([single], [shot({ anchorTMs: 30_000, doseG: 0 })]).shots[0].ratio).toBeNull();
  });
});
