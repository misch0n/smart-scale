import { describe, expect, it } from 'vitest';
import { dotsData, escapeXml, linearScale, logScale, pathData, roundStep, tickLabel } from './svg';

describe('roundStep', () => {
  it('cuts a span into about the parts asked for, on 1, 2 or 5 × 10ⁿ', () => {
    expect(roundStep(45, 12)).toBe(5);
    expect(roundStep(600, 12)).toBe(50);
    expect(roundStep(1, 5)).toBe(0.2);
    expect(roundStep(0.03, 3)).toBeCloseTo(0.01, 12);
    expect(roundStep(70, 7)).toBe(10);
  });

  it('falls back to 1 for an empty or broken span', () => {
    expect(roundStep(0, 5)).toBe(1);
    expect(roundStep(Number.NaN, 5)).toBe(1);
  });
});

describe('linearScale', () => {
  it('maps the range onto the pixels, upwards for a y axis', () => {
    const y = linearScale(0, 10, 100, 0);
    expect(y.at(0)).toBe(100);
    expect(y.at(10)).toBe(0);
    expect(y.at(2.5)).toBe(75);
  });

  it('ticks on round steps inside the range, without float noise', () => {
    const x = linearScale(546.08, 591.73, 0, 1000, { count: 12 });
    expect(x.ticks).toEqual([550, 555, 560, 565, 570, 575, 580, 585, 590]);
    expect(linearScale(0, 0.3, 0, 1, { count: 3 }).ticks).toEqual([0, 0.1, 0.2, 0.3]);
  });

  it('widens to the ticks around the range when asked', () => {
    const y = linearScale(-0.3, 37.4, 0, 1, { count: 4, round: true });
    expect([y.low, y.high]).toEqual([-10, 40]);
    expect(y.ticks).toEqual([-10, 0, 10, 20, 30, 40]);
  });

  it('widens an empty range around its value', () => {
    const y = linearScale(5, 5, 0, 1);
    expect(y.low).toBeLessThan(5);
    expect(y.high).toBeGreaterThan(5);
    expect(Number.isFinite(y.at(5))).toBe(true);
  });
});

describe('logScale', () => {
  it('spans whole decades, with a tick on each', () => {
    const y = logScale(2e-5, 0.3, 100, 0);
    expect(y.ticks).toEqual([1e-5, 1e-4, 1e-3, 0.01, 0.1, 1]);
    expect(y.at(1e-5)).toBe(100);
    expect(y.at(1)).toBe(0);
    expect(y.at(1e-3)).toBeCloseTo(60, 9);
  });

  it('puts 0 and values below the range on its floor, and NaN nowhere', () => {
    const y = logScale(1e-5, 1, 100, 0);
    expect(y.at(0)).toBe(100);
    expect(y.at(1e-9)).toBe(100);
    expect(y.at(-1)).toBe(100);
    expect(y.at(Number.NaN)).toBeNaN();
  });
});

describe('tickLabel', () => {
  it('shows as many decimals as the step needs', () => {
    const scale = linearScale(0, 1, 0, 1, { count: 5 });
    expect(scale.ticks.map((tick) => tickLabel(tick, scale))).toEqual([
      '0.0',
      '0.2',
      '0.4',
      '0.6',
      '0.8',
      '1.0',
    ]);
    const seconds = linearScale(550, 590, 0, 1, { count: 8 });
    expect(tickLabel(550, seconds)).toBe('550');
  });

  it('writes small log ticks as powers of ten', () => {
    const scale = logScale(1e-5, 1, 0, 1);
    expect(scale.ticks.map((tick) => tickLabel(tick, scale))).toEqual([
      '1e-5',
      '1e-4',
      '1e-3',
      '0.01',
      '0.1',
      '1',
    ]);
  });
});

describe('pathData and dotsData', () => {
  const x = linearScale(0, 10, 0, 100);
  const y = linearScale(0, 10, 100, 0);

  it('draws a line through the points, to a tenth of a pixel', () => {
    expect(pathData([0, 1, 2], [0, 5, 2.345], x, y)).toBe('M0 100L10 50L20 76.6');
  });

  it('breaks the line where a value is missing', () => {
    expect(pathData([0, 1, 2, 3, 4], [1, Number.NaN, 2, 3, Infinity], x, y)).toBe(
      'M0 90M20 80L30 70',
    );
    expect(pathData([0, 1], [Number.NaN, Number.NaN], x, y)).toBe('');
  });

  it('draws a dot per point, and none for a missing value', () => {
    expect(dotsData([1, 2, 3], [1, Number.NaN, 3], x, y)).toBe('M10 90h0M30 70h0');
  });
});

describe('escapeXml', () => {
  it('makes text safe for an element or an attribute', () => {
    expect(escapeXml(`<a & 'b'> "c"`)).toBe('&lt;a &amp; &apos;b&apos;&gt; &quot;c&quot;');
    expect(escapeXml('pump_off 586.76, regime-change')).toBe('pump_off 586.76, regime-change');
  });
});
