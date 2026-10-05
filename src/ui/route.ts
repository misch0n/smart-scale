/**
 * Hash routing (D-009): Home at `#/` (T1.23), which every unknown hash shows too; the brew flow
 * at `#/brew` (T1.18); the history at `#/history`, a shot at `#/shot/<id>` and two compared at
 * `#/compare/<a>/<b>` (T1.19); and the probe at `#/probe`, the Setup tab until the Setup
 * screens (T2.9, D-072). `?mock` swaps the scale for the simulator (`MockTransport`) on any
 * page, so the links between them keep it, `&speed=N` runs it N times faster than real time,
 * and `&mode=flow-rate` or `&mode=automatic` leaves its scale in another mode than the timer's,
 * for the mode warning (T1.25). `?debug` shows a shot's snapshot on its page (D-056), and
 * `#/history?pick=<id>` opens the history in Compare mode with that shot picked.
 */

import { useEffect, useState } from 'preact/hooks';
import type { LinkSpec } from '../app/links';
import { SCALE_MODES, type ScaleMode } from '../core/sim';

export type Page = 'home' | 'probe' | 'brew' | 'history' | 'shot' | 'compare';

/** The mock's options: its speed, and its scale's mode when it isn't the timer mode. */
export type Mock = { readonly speed: number; readonly mode?: ScaleMode } | null;

export interface Route {
  readonly page: Page;
  /** The shots the page shows: one on `shot`, A and B on `compare`, none elsewhere. */
  readonly shotIds: readonly string[];
  /** The mock's options with `?mock`; null for the real scale. */
  readonly mock: Mock;
  /** `?debug`: views for development, never on the normal screens (D-056). */
  readonly debug: boolean;
  /** `?pick=<id>` on the history: Compare mode, with that shot as A. */
  readonly pick: string | null;
  /** What in the hash was ignored, and why, to show on the screen. */
  readonly problems: readonly string[];
}

/** The fastest mock speed accepted. */
export const MAX_MOCK_SPEED = 1000;

/** Each path's page, and how many shot ids follow it. */
const PAGES: Readonly<Record<string, { readonly page: Page; readonly ids: number }>> = {
  '': { page: 'home', ids: 0 },
  probe: { page: 'probe', ids: 0 },
  brew: { page: 'brew', ids: 0 },
  history: { page: 'history', ids: 0 },
  shot: { page: 'shot', ids: 1 },
  compare: { page: 'compare', ids: 2 },
};

export function parseRoute(hash: string): Route {
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  const query = text.indexOf('?');
  const path = query === -1 ? text : text.slice(0, query);
  const params = new URLSearchParams(query === -1 ? '' : text.slice(query + 1));
  const problems: string[] = [];
  const [name, ...rest] = path.replace(/^\//, '').split('/');
  const known = Object.hasOwn(PAGES, name) ? PAGES[name] : null;
  const ids = rest.filter((part) => part !== '').map(decodePart);
  let page: Page = 'home';
  let shotIds: string[] = [];
  if (known !== null && ids.length === known.ids && ids.every((id) => id !== null)) {
    page = known.page;
    shotIds = ids;
  } else {
    problems.push(`There is no page ${path}; this is Home.`);
  }
  const debug = params.has('debug');
  const pick = page === 'history' ? params.get('pick') || null : null;
  if (!params.has('mock')) return { page, shotIds, mock: null, debug, pick, problems };
  let speed = 1;
  const given = params.get('speed');
  if (given !== null) {
    const parsed = Number(given);
    if (parsed > 0 && parsed <= MAX_MOCK_SPEED)
      speed = parsed; // Number('') is 0: refused
    else problems.push(`Speed ${given} isn't a number from 0 to ${MAX_MOCK_SPEED}; using 1.`);
  }
  const mode = params.get('mode');
  if (mode === null || mode === 'timer') {
    return { page, shotIds, mock: { speed }, debug, pick, problems };
  }
  if (!(SCALE_MODES as readonly string[]).includes(mode)) {
    problems.push(`Mode ${mode} isn't one of ${SCALE_MODES.join(', ')}; using timer.`);
    return { page, shotIds, mock: { speed }, debug, pick, problems };
  }
  return { page, shotIds, mock: { speed, mode: mode as ScaleMode }, debug, pick, problems };
}

/** A path part as written, or null when it isn't valid percent-encoding. */
function decodePart(part: string): string | null {
  try {
    return decodeURIComponent(part);
  } catch {
    return null;
  }
}

/** A hash: the path, then `?mock` (and its speed and mode) and the other parameters. */
function hashOf(path: string, mock: Mock, params: readonly string[] = []): string {
  const query = [...(mock === null ? [] : mockParams(mock)), ...params];
  return query.length === 0 ? `#/${path}` : `#/${path}?${query.join('&')}`;
}

function mockParams({ speed, mode }: NonNullable<Mock>): string[] {
  return [
    'mock',
    ...(speed === 1 ? [] : [`speed=${speed}`]),
    ...(mode === undefined || mode === 'timer' ? [] : [`mode=${mode}`]),
  ];
}

/** The hash of a page without shots, on the real scale or the mock: Home's is `#/`. */
export function pageHash(page: 'home' | 'probe' | 'brew' | 'history', mock: Mock): string {
  return hashOf(page === 'home' ? '' : page, mock);
}

/** The hash of the probe, on the real scale or the mock. */
export function probeHash(mock: Mock): string {
  return pageHash('probe', mock);
}

/** The history in Compare mode, with `shotId` picked as A. */
export function historyPickHash(shotId: string, mock: Mock): string {
  return hashOf('history', mock, [`pick=${encodeURIComponent(shotId)}`]);
}

/** A shot's page, with its snapshot when `debug`. */
export function shotHash(shotId: string, mock: Mock, debug = false): string {
  return hashOf(`shot/${encodeURIComponent(shotId)}`, mock, debug ? ['debug'] : []);
}

/** Shots A and B compared. */
export function compareHash(a: string, b: string, mock: Mock): string {
  return hashOf(`compare/${encodeURIComponent(a)}/${encodeURIComponent(b)}`, mock);
}

/** The link a route asks for: the real scale, or the mock at its speed and in its mode. */
export function linkSpecFor(route: Route): LinkSpec {
  return route.mock
    ? { kind: 'mock', speed: route.mock.speed, mode: route.mock.mode }
    : { kind: 'web-bluetooth' };
}

/** The current route, updated on `hashchange`. */
export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = (): void => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
