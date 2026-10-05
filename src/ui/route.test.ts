import { describe, expect, it } from 'vitest';
import { pageHash, parseRoute, probeHash } from './route';

describe('parseRoute', () => {
  it.each(['', '#', '#/', '#/probe'])('shows the probe on the real scale for %j', (hash) => {
    expect(parseRoute(hash)).toEqual({ page: 'probe', mock: null, problems: [] });
  });

  it('shows the brew flow at #/brew, on the scale or the mock', () => {
    expect(parseRoute('#/brew')).toEqual({ page: 'brew', mock: null, problems: [] });
    expect(parseRoute('#/brew?mock&speed=10')).toEqual({
      page: 'brew',
      mock: { speed: 10 },
      problems: [],
    });
  });

  it('uses the mock with ?mock, at real time unless a speed is given', () => {
    expect(parseRoute('#/probe?mock').mock).toEqual({ speed: 1 });
    expect(parseRoute('#/probe?mock&speed=20').mock).toEqual({ speed: 20 });
    expect(parseRoute('#/probe?speed=0.5&mock=1').mock).toEqual({ speed: 0.5 });
    expect(parseRoute('#/probe?speed=20')).toEqual({ page: 'probe', mock: null, problems: [] });
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
    expect(route.page).toBe('probe');
    expect(route.mock).toEqual({ speed: 1 });
    expect(route.problems).toEqual(['There is no page /history; this is the probe.']);
    expect(parseRoute('#/constructor').page).toBe('probe');
  });
});

describe('pageHash', () => {
  it('round-trips through parseRoute', () => {
    for (const page of ['probe', 'brew'] as const) {
      for (const mock of [null, { speed: 1 }, { speed: 10 }, { speed: 0.25 }]) {
        expect(parseRoute(pageHash(page, mock))).toEqual({ page, mock, problems: [] });
      }
    }
    expect(probeHash({ speed: 1 })).toBe('#/probe?mock');
    expect(pageHash('brew', null)).toBe('#/brew');
  });
});
