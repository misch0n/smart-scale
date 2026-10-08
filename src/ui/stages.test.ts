import { describe, expect, it } from 'vitest';
import { stageAt, stageNotes, stageRuns, stageSpans } from './stages';

describe('the stages (T3.16, T3.17)', () => {
  const markers = { pumpOnS: 0, firstDripS: 7.4, pumpOffS: 32, endS: 36 };
  const untapped = { ...markers, pumpOnS: null };
  const points = [0, 5, 7.4, 10, 20, 32, 34, 36].map((tS) => ({
    tS,
    g: tS < 7.4 ? 0 : Math.min(36, (tS - 7.4) * 1.4),
    flowGps: 1,
  }));
  const scale = { fromS: 0, timeS: 40, weightG: 40 };

  it('tells the stage at a moment: preinfusion, extraction, tail', () => {
    expect(stageAt(markers, 3)).toBe('preinfusion');
    expect(stageAt(markers, 7.4)).toBe('extraction');
    expect(stageAt(markers, 31.9)).toBe('extraction');
    expect(stageAt(markers, 32)).toBe('tail');
    // Without pump_off it is all extraction past the first drip.
    expect(stageAt({ ...markers, pumpOffS: null }, 50)).toBe('extraction');
    // Live, before the first drip: all preinfusion so far.
    expect(stageAt({ ...markers, firstDripS: null, pumpOffS: null }, 5)).toBe('preinfusion');
  });

  it('has no preinfusion for a shot found by its weight (no pump on)', () => {
    expect(stageAt(untapped, -1)).toBe('extraction');
    expect(stageAt(untapped, 3)).toBe('extraction');
    expect(stageSpans(untapped, scale).map((s) => s.stage)).toEqual(['extraction', 'tail']);
    expect(stageNotes(untapped, points, 20)).toEqual([]);
    expect(stageRuns(untapped, points).preinfusion).toEqual([]);
  });

  it('splits the curve by stage, each run joined to the next', () => {
    const runs = stageRuns(markers, points);
    expect(runs.preinfusion.map((p) => p.tS)).toEqual([0, 5, 7.4]);
    expect(runs.extraction.map((p) => p.tS)).toEqual([7.4, 10, 20, 32]);
    expect(runs.tail.map((p) => p.tS)).toEqual([32, 34, 36]);
  });

  it('spans the stages up to where the shot ends, not to the axis’ end', () => {
    expect(stageSpans(markers, scale)).toEqual([
      { stage: 'preinfusion', fromS: 0, toS: 7.4 },
      { stage: 'extraction', fromS: 7.4, toS: 32 },
      { stage: 'tail', fromS: 32, toS: 36 },
    ]);
    // Without an end: to the axis' end.
    expect(stageSpans({ ...markers, endS: null }, scale).at(-1)).toEqual({
      stage: 'tail',
      fromS: 32,
      toS: 40,
    });
    // Live, 20 s in, before pump off: the extraction so far.
    expect(stageSpans({ ...markers, pumpOffS: null, endS: 20 }, scale)).toEqual([
      { stage: 'preinfusion', fromS: 0, toS: 7.4 },
      { stage: 'extraction', fromS: 7.4, toS: 20 },
    ]);
    // Live, 5 s in, before the first drip.
    expect(stageSpans({ ...markers, firstDripS: null, pumpOffS: null, endS: 5 }, scale)).toEqual([
      { stage: 'preinfusion', fromS: 0, toS: 5 },
    ]);
  });

  it('notes the stages ended by the moment, with how long they lasted, and the tail', () => {
    expect(stageNotes(markers, points, 5)).toEqual([]);
    expect(stageNotes(markers, points, 20)).toEqual([
      { stage: 'preinfusion', text: 'preinfusion 7.4 s' },
    ]);
    expect(stageNotes(markers, points, 36)).toEqual([
      { stage: 'preinfusion', text: 'preinfusion 7.4 s' },
      { stage: 'extraction', text: 'extraction 24.6 s' },
      { stage: 'tail', text: 'tail +1.6 g' },
    ]);
  });
});
