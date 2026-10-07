import { describe, expect, it } from 'vitest';
import { simulatedEntry } from '../history/test-entries';
import { referenceOf } from './reference';

describe('referenceOf (T3.7)', () => {
  const tapped = simulatedEntry({ seed: 1, shot: { preInfusionMs: 7400, extractionMs: 24_600 } });

  it('takes a tapped shot: its curve from pump_on, and its day, time, yield and time', () => {
    const reference = referenceOf(tapped.entry)!;
    expect(reference.shotId).toBe(tapped.entry.shot.id);
    expect(reference.points[1].tS).toBeGreaterThan(0);
    // Sunday 7 am, local time, with its yield and pump_on → pump_off.
    expect(reference.label).toMatch(/^Sun \d\d:\d\d · \d+\.\d g in \d+\.\d s$/);
  });

  it('takes none for a shot gone, deleted, unmatched or without the tap', () => {
    expect(referenceOf(null)).toBeNull();
    const deleted = { ...tapped.entry.shot, discardedAtEpochMs: 1 };
    expect(referenceOf({ ...tapped.entry, shot: deleted })).toBeNull();
    expect(referenceOf({ ...tapped.entry, segment: null })).toBeNull();
    expect(referenceOf(simulatedEntry({ seed: 3, manualStartMs: null }).entry)).toBeNull();
  });
});
