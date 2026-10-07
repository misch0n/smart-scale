import { describe, expect, it } from 'vitest';
import {
  pageHash,
  parseRoute,
  probeHash,
  setupHash,
  SETUP_SECTIONS,
  shotHash,
  type Route,
} from './route';

const HOME: Route = {
  page: 'home',
  shotIds: [],
  setup: null,
  mock: null,
  debug: false,
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
    expect(parseRoute('#/history')).toMatchObject({ page: 'history' });
    expect(parseRoute('#/shot/0190a1b2-c3d4?debug')).toMatchObject({
      page: 'shot',
      shotIds: ['0190a1b2-c3d4'],
      debug: true,
    });
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
    // No Compare since T3.6: an old link to it shows Home.
    const hashes = ['#/shot', '#/shot/a/b', '#/compare/a/b', '#/history/a', '#/shot/%E0%A4'];
    for (const hash of hashes) {
      expect(parseRoute(hash)).toMatchObject({ page: 'home', shotIds: [] });
      expect(parseRoute(hash).problems).toHaveLength(1);
    }
  });

  it('shows Setup, its sections and a coffee pack (T2.9)', () => {
    expect(parseRoute('#/setup')).toEqual({ ...HOME, page: 'setup', setup: { section: 'list' } });
    expect(parseRoute('#/setup/')).toMatchObject({ page: 'setup', setup: { section: 'list' } });
    for (const section of SETUP_SECTIONS) {
      expect(parseRoute(`#/setup/${section}?mock`)).toMatchObject({
        page: 'setup',
        setup: { section },
        mock: { speed: 1 },
        problems: [],
      });
    }
    expect(parseRoute('#/setup/pack/new').setup).toEqual({ section: 'pack', packId: null });
    expect(parseRoute('#/setup/pack/a%2Fb').setup).toEqual({ section: 'pack', packId: 'a/b' });
    for (const hash of ['#/setup/espresso', '#/setup/pack', '#/setup/pack/a/b', '#/setup/tags/x']) {
      expect(parseRoute(hash)).toMatchObject({ page: 'home', setup: null });
      expect(parseRoute(hash).problems).toHaveLength(1);
    }
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

  it('name Setup’s screens', () => {
    expect(setupHash({ section: 'list' }, null)).toBe('#/setup');
    expect(setupHash({ section: 'tags' }, { speed: 10 })).toBe('#/setup/tags?mock&speed=10');
    expect(setupHash({ section: 'pack', packId: null }, null)).toBe('#/setup/pack/new');
    expect(setupHash({ section: 'pack', packId: 'x/y' }, null)).toBe('#/setup/pack/x%2Fy');
    for (const view of [
      { section: 'list' },
      { section: 'machine' },
      { section: 'pack', packId: 'abc' },
      { section: 'pack', packId: null },
    ] as const) {
      expect(parseRoute(setupHash(view, { speed: 1 })).setup).toEqual(view);
    }
  });

  it('carry the shots, the mock and the options', () => {
    expect(shotHash('x/y', { speed: 10 }, true)).toBe('#/shot/x%2Fy?mock&speed=10&debug');
    expect(parseRoute(shotHash('x/y', null))).toMatchObject({ page: 'shot', shotIds: ['x/y'] });
  });
});
