import { describe, expect, it } from 'vitest';
import { parseRoute, probeHash } from './route';

describe('parseRoute', () => {
  it.each(['', '#', '#/', '#/probe'])('shows the probe on the real scale for %j', (hash) => {
    expect(parseRoute(hash)).toEqual({ mock: null, problems: [] });
  });

  it('uses the mock with ?mock, at real time unless a speed is given', () => {
    expect(parseRoute('#/probe?mock')).toEqual({ mock: { speed: 1 }, problems: [] });
    expect(parseRoute('#/probe?mock&speed=20')).toEqual({ mock: { speed: 20 }, problems: [] });
    expect(parseRoute('#/probe?speed=0.5&mock=1')).toEqual({ mock: { speed: 0.5 }, problems: [] });
    expect(parseRoute('#/probe?speed=20')).toEqual({ mock: null, problems: [] });
  });

  it.each(['0', '-2', 'fast', '', '5000', 'Infinity'])(
    'falls back to speed 1, and says so, for speed=%j',
    (speed) => {
      const route = parseRoute(`#/probe?mock&speed=${speed}`);
      expect(route.mock).toEqual({ speed: 1 });
      expect(route.problems).toHaveLength(1);
    },
  );

  it('shows the probe for an unknown page, and says so', () => {
    const route = parseRoute('#/history?mock');
    expect(route.mock).toEqual({ speed: 1 });
    expect(route.problems).toEqual(['There is no page /history; this is the probe.']);
  });
});

describe('probeHash', () => {
  it('round-trips through parseRoute', () => {
    for (const mock of [null, { speed: 1 }, { speed: 10 }, { speed: 0.25 }]) {
      expect(parseRoute(probeHash(mock)).mock).toEqual(mock);
    }
    expect(probeHash({ speed: 1 })).toBe('#/probe?mock');
  });
});
