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

const HOME: Route = {
  page: 'home',
  shotIds: [],
  mock: null,
  debug: false,
  pick: null,
  problems: [],
};

const PROBE: Route = { ...HOME, page: 'probe' };

describe('parseRoute', () => {
  it.each(['', '#', '#/'])('shows Home on the real scale for %j (T1.23)', (hash) => {
    expect(parseRoute(hash)).toEqual(HOME);
  });

  it.each(['#/probe', '#/probe/'])('shows the probe on the real scale for %j', (hash) => {
    expect(parseRoute(hash)).toEqual(PROBE);
  });

  it('shows Home on the mock with ?mock', () => {
    expect(parseRoute('#/?mock&speed=10')).toEqual({ ...HOME, mock: { speed: 10 } });
  });

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

  it('leaves the mock’s scale in the mode asked for, the timer mode by default (T1.25)', () => {
    expect(parseRoute('#/?mock&mode=flow-rate').mock).toEqual({ speed: 1, mode: 'flow-rate' });
    expect(parseRoute('#/brew?mock&speed=10&mode=automatic').mock).toEqual({
      speed: 10,
      mode: 'automatic',
    });
    expect(parseRoute('#/?mock&mode=timer').mock).toEqual({ speed: 1 });
    expect(parseRoute('#/?mode=automatic').mock).toBeNull();
    const route = parseRoute('#/?mock&mode=ratio');
    expect(route.mock).toEqual({ speed: 1 });
    expect(route.problems).toEqual([
      "Mode ratio isn't one of timer, automatic, flow-rate; using timer.",
    ]);
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

  it('shows Home for an unknown page, or one without its shots, and says so', () => {
    const route = parseRoute('#/settings?mock');
    expect(route.page).toBe('home');
    expect(route.mock).toEqual({ speed: 1 });
    expect(route.problems).toEqual(['There is no page /settings; this is Home.']);
    expect(parseRoute('#/constructor').page).toBe('home');
    expect(parseRoute('#/home').page).toBe('home');
    expect(parseRoute('#/home').problems).toHaveLength(1);
    for (const hash of ['#/shot', '#/shot/a/b', '#/compare/a', '#/history/a', '#/shot/%E0%A4']) {
      expect(parseRoute(hash)).toMatchObject({ page: 'home', shotIds: [] });
      expect(parseRoute(hash).problems).toHaveLength(1);
    }
    expect(parseRoute('#/brew?pick=a').pick).toBeNull();
  });
});

describe('the hashes', () => {
  it('round-trip through parseRoute', () => {
    for (const page of ['home', 'probe', 'brew', 'history'] as const) {
      for (const mock of [null, { speed: 1 }, { speed: 10 }, { speed: 0.25 }]) {
        expect(parseRoute(pageHash(page, mock))).toEqual({ ...HOME, page, mock });
      }
    }
    expect(probeHash({ speed: 1 })).toBe('#/probe?mock');
    expect(pageHash('brew', null)).toBe('#/brew');
    expect(pageHash('home', null)).toBe('#/');
    expect(pageHash('home', { speed: 10 })).toBe('#/?mock&speed=10');
    // The mock's mode, kept by the links between pages.
    const automatic = { speed: 10, mode: 'automatic' } as const;
    expect(pageHash('history', automatic)).toBe('#/history?mock&speed=10&mode=automatic');
    expect(parseRoute(pageHash('probe', automatic)).mock).toEqual(automatic);
    expect(pageHash('home', { speed: 1, mode: 'timer' })).toBe('#/?mock');
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
