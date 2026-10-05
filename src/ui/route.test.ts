import { describe, expect, it } from 'vitest';
import {
  compareHash,
  historyPickHash,
  pageHash,
  parseRoute,
  probeHash,
  shotHash,
  type Route,
} from './route';

const PROBE: Route = {
  page: 'probe',
  shotIds: [],
  mock: null,
  debug: false,
  pick: null,
  problems: [],
};

describe('parseRoute', () => {
  it.each(['', '#', '#/', '#/probe', '#/probe/'])(
    'shows the probe on the real scale for %j',
    (hash) => {
      expect(parseRoute(hash)).toEqual(PROBE);
    },
  );

  it('shows the brew flow at #/brew, on the scale or the mock', () => {
    expect(parseRoute('#/brew')).toEqual({ ...PROBE, page: 'brew' });
    expect(parseRoute('#/brew?mock&speed=10')).toEqual({
      ...PROBE,
      page: 'brew',
      mock: { speed: 10 },
    });
  });

  it('uses the mock with ?mock, at real time unless a speed is given', () => {
    expect(parseRoute('#/probe?mock').mock).toEqual({ speed: 1 });
    expect(parseRoute('#/probe?mock&speed=20').mock).toEqual({ speed: 20 });
    expect(parseRoute('#/probe?speed=0.5&mock=1').mock).toEqual({ speed: 0.5 });
    expect(parseRoute('#/probe?speed=20')).toEqual(PROBE);
  });

  it.each(['0', '-2', 'fast', '', '5000', 'Infinity'])(
    'falls back to speed 1, and says so, for speed=%j',
    (speed) => {
      const route = parseRoute(`#/probe?mock&speed=${speed}`);
      expect(route.mock).toEqual({ speed: 1 });
      expect(route.problems).toHaveLength(1);
    },
  );

  it('shows the history, a shot and two compared, with their ids (T1.19)', () => {
    expect(parseRoute('#/history?mock')).toEqual({
      ...PROBE,
      page: 'history',
      mock: { speed: 1 },
    });
    expect(parseRoute('#/history?pick=abc')).toMatchObject({ page: 'history', pick: 'abc' });
    expect(parseRoute('#/shot/0190a1b2-c3d4?debug')).toMatchObject({
      page: 'shot',
      shotIds: ['0190a1b2-c3d4'],
      debug: true,
    });
    expect(parseRoute('#/compare/a/b')).toMatchObject({ page: 'compare', shotIds: ['a', 'b'] });
    expect(parseRoute('#/shot/a%20b').shotIds).toEqual(['a b']);
  });

  it('shows the probe for an unknown page, or one without its shots, and says so', () => {
    const route = parseRoute('#/settings?mock');
    expect(route.page).toBe('probe');
    expect(route.mock).toEqual({ speed: 1 });
    expect(route.problems).toEqual(['There is no page /settings; this is the probe.']);
    expect(parseRoute('#/constructor').page).toBe('probe');
    for (const hash of ['#/shot', '#/shot/a/b', '#/compare/a', '#/history/a', '#/shot/%E0%A4']) {
      expect(parseRoute(hash)).toMatchObject({ page: 'probe', shotIds: [] });
      expect(parseRoute(hash).problems).toHaveLength(1);
    }
    expect(parseRoute('#/brew?pick=a').pick).toBeNull();
  });
});

describe('the hashes', () => {
  it('round-trip through parseRoute', () => {
    for (const page of ['probe', 'brew', 'history'] as const) {
      for (const mock of [null, { speed: 1 }, { speed: 10 }, { speed: 0.25 }]) {
        expect(parseRoute(pageHash(page, mock))).toEqual({ ...PROBE, page, mock });
      }
    }
    expect(probeHash({ speed: 1 })).toBe('#/probe?mock');
    expect(pageHash('brew', null)).toBe('#/brew');
  });

  it('carry the shots, the mock and the options', () => {
    expect(shotHash('x/y', { speed: 10 }, true)).toBe('#/shot/x%2Fy?mock&speed=10&debug');
    expect(parseRoute(shotHash('x/y', null))).toMatchObject({ page: 'shot', shotIds: ['x/y'] });
    expect(compareHash('a', 'b', { speed: 1 })).toBe('#/compare/a/b?mock');
    expect(historyPickHash('a', null)).toBe('#/history?pick=a');
    expect(parseRoute(historyPickHash('a', { speed: 1 }))).toMatchObject({
      page: 'history',
      pick: 'a',
      mock: { speed: 1 },
    });
  });
});
