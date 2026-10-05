import { describe, expect, it } from 'vitest';
import { pourProgress, yieldTargetG } from './pour';

describe('yieldTargetG', () => {
  it('is the dose times the ratio', () => {
    expect(yieldTargetG(16.9, 2)).toBeCloseTo(33.8, 10);
    expect(yieldTargetG(18, 1.5)).toBe(27);
  });

  it('refuses a dose or ratio that is not a finite number above 0', () => {
    expect(() => yieldTargetG(0, 2)).toThrow(/dose 0/);
    expect(() => yieldTargetG(18, NaN)).toThrow(/ratio NaN/);
  });
});

describe('pourProgress', () => {
  it('says how much is to go, and how far along it is (the mockup: 27.8 of 33.8 g)', () => {
    const progress = pourProgress(27.8, 33.8, 1);
    expect(progress.remainingG).toBeCloseTo(6.0, 10);
    expect(progress.progress).toBeCloseTo(0.822, 3);
    expect(progress.overTarget).toBe(false);
  });

  it('warns once past the target by more than the margin, not before', () => {
    expect(pourProgress(34.8, 33.8, 1).overTarget).toBe(false);
    const over = pourProgress(35.0, 33.8, 1);
    expect(over.overTarget).toBe(true);
    expect(over.remainingG).toBeCloseTo(-1.2, 10);
    expect(over.progress).toBeCloseTo(1.036, 3);
    expect(pourProgress(33.9, 33.8, 0).overTarget).toBe(true);
  });

  it('never goes below no progress, as when the reading dips at the pump start', () => {
    expect(pourProgress(-0.2, 36, 1)).toEqual({
      targetG: 36,
      remainingG: 36.2,
      progress: 0,
      overTarget: false,
    });
  });

  it('refuses a target or margin it cannot use', () => {
    expect(() => pourProgress(1, 0, 1)).toThrow(/target 0/);
    expect(() => pourProgress(1, 36, -1)).toThrow(/margin -1/);
  });
});
