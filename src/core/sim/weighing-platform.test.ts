import { describe, expect, it } from 'vitest';
import { ShotModel, DEFAULT_SHOT_PARAMS } from './shot';
import { WeighingPlatform } from './weighing-platform';

const TAU = 100;

describe('WeighingPlatform', () => {
  it('weighs nothing when empty', () => {
    expect(new WeighingPlatform([], [], TAU, 0).grossG(1000)).toBe(0);
  });

  it('shows a vessel settling in exponentially', () => {
    const platform = new WeighingPlatform([], [], TAU, 0);
    platform.place(1000, 100, 20);
    expect(platform.hasVessel).toBe(true);
    expect(platform.grossG(1000)).toBe(0);
    expect(platform.grossG(1000 + TAU)).toBeCloseTo(120 * (1 - Math.exp(-1)), 9);
    expect(platform.grossG(1000 + 20 * TAU)).toBeCloseTo(120, 6);
  });

  it('settles at once with a time constant of 0', () => {
    const platform = new WeighingPlatform([], [], 0, 0);
    platform.place(1000, 100, 0);
    expect(platform.grossG(1000)).toBe(100);
    platform.lift(2000);
    expect(platform.grossG(2000)).toBe(0);
  });

  it('shows a lifted vessel fading out, and forgets it once gone', () => {
    const platform = new WeighingPlatform([], [], TAU, 0);
    platform.place(0, 100, 0);
    platform.lift(10_000);
    expect(platform.hasVessel).toBe(false);
    expect(platform.grossG(10_000)).toBeCloseTo(100, 6);
    expect(platform.grossG(10_000 + TAU)).toBeCloseTo(100 * Math.exp(-1), 6);
    expect(platform.grossG(10_000 + 60 * TAU)).toBe(0);
  });

  it('routes liquid into the vessel, and onto the platform when there is none', () => {
    const shot = new ShotModel(0, { ...DEFAULT_SHOT_PARAMS, yieldG: 30, tailTauMs: 1000 });
    const platform = new WeighingPlatform([shot], [], 0, 0);
    platform.place(0, 100, 0);
    const liftAt = shot.pumpOffMs + 1000; // during the tail
    platform.lift(liftAt);
    const inCup = shot.liquidAt(liftAt);
    // After the lift, only the drips that missed the cup are on the platform.
    const later = shot.pumpOffMs + 60_000;
    expect(platform.grossG(later)).toBeCloseTo(30 - inCup, 9);
    // Put back, the cup brings its liquid with it.
    platform.placeBack(later);
    expect(platform.grossG(later)).toBeCloseTo(130, 9);
  });

  it('adds a bump as a half-sine push', () => {
    const platform = new WeighingPlatform(
      [],
      [{ type: 'bump', atMs: 1000, durationMs: 400, peakG: 8 }],
      TAU,
      0,
    );
    expect(platform.grossG(999)).toBe(0);
    expect(platform.grossG(1100)).toBeCloseTo(8 * Math.sin(Math.PI / 4), 9);
    expect(platform.grossG(1200)).toBeCloseTo(8, 9);
    expect(platform.grossG(1400)).toBe(0);
  });

  it('refuses to go back in time', () => {
    const platform = new WeighingPlatform([], [], TAU, 0);
    platform.grossG(1000);
    expect(() => platform.grossG(999)).toThrow(RangeError);
  });

  it('refuses impossible vessel moves', () => {
    const platform = new WeighingPlatform([], [], TAU, 0);
    expect(() => platform.lift(0)).toThrow();
    expect(() => platform.placeBack(0)).toThrow();
    platform.place(0, 100, 0);
    expect(() => platform.place(1, 100, 0)).toThrow();
  });
});
