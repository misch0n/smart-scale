import { describe, expect, it } from 'vitest';
import { pourProgress } from '../../core/live';
import {
  minutesSeconds,
  percent,
  readout,
  recipeLabel,
  recipeRatio,
  seconds,
  shotRatio,
  signedTenths,
  tenths,
  timeOfDay,
} from './format';

describe('numbers', () => {
  it('writes grams in tenths, with a real minus and no negative zero', () => {
    expect(tenths(35.44)).toBe('35.4');
    expect(tenths(35.45)).toBe('35.5');
    expect(tenths(-0.04)).toBe('0.0');
    expect(tenths(-1.26)).toBe('−1.3');
  });

  it('writes differences with their sign', () => {
    expect(signedTenths(1.6)).toBe('+1.6');
    expect(signedTenths(-0.64)).toBe('−0.6');
    expect(signedTenths(0.04)).toBe('±0.0');
  });

  it('writes seconds, waits, ratios and percentages', () => {
    expect(seconds(24_560)).toBe('24.6');
    expect(seconds(-5)).toBe('0.0');
    expect(minutesSeconds(42_900)).toBe('0:42');
    expect(minutesSeconds(725_000)).toBe('12:05');
    expect(shotRatio(35.4 / 16.9)).toBe('1:2.09');
    expect(recipeRatio(2)).toBe('1:2');
    expect(recipeRatio(1.5)).toBe('1:1.5');
    expect(percent(0.823)).toBe('82 %');
    expect(percent(-0.1)).toBe('0 %');
  });

  it('names a recipe with its ratios', () => {
    expect(recipeLabel({ name: 'Espresso', coffeeRatio: 2, milkRatio: null })).toBe(
      'Espresso · 1:2',
    );
    expect(recipeLabel({ name: 'Cappuccino', coffeeRatio: 2, milkRatio: 3 })).toBe(
      'Cappuccino · 1:2 + milk 1:3',
    );
  });

  it('writes the time of day in 24 h', () => {
    const at = new Date(2026, 9, 4, 7, 5, 59).getTime();
    expect(timeOfDay(at)).toBe('07:05');
  });
});

describe('readout', () => {
  it('counts down to the target', () => {
    expect(readout(pourProgress(27.8, 33.8, 1))).toEqual({
      state: 'pouring',
      big: '6.0',
      poured: '27.8',
      target: '33.8',
      barPct: 82,
      percent: '82 %',
    });
  });

  it('is reached from the target up to the margin over it', () => {
    expect(readout(pourProgress(33.8, 33.8, 1))).toMatchObject({ state: 'reached', big: '±0.0' });
    expect(readout(pourProgress(34.6, 33.8, 1))).toMatchObject({
      state: 'reached',
      big: '+0.8',
      barPct: 100,
    });
    // 0.04 g short rounds to the target.
    expect(readout(pourProgress(33.76, 33.8, 1)).state).toBe('reached');
  });

  it('warns past the margin', () => {
    expect(readout(pourProgress(35.0, 33.8, 1))).toEqual({
      state: 'over',
      big: '+1.2',
      poured: '35.0',
      target: '33.8',
      barPct: 100,
      percent: '104 %',
    });
  });

  it('shows nothing poured as 0.0 when the net weight dips below 0', () => {
    expect(readout(pourProgress(-0.2, 36, 1))).toMatchObject({ poured: '0.0', barPct: 0 });
  });
});
