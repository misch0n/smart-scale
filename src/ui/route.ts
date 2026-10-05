/**
 * Hash routing (D-009). Two pages until Home (T1.23): the brew flow at `#/brew` (T1.18) and the
 * probe at `#/probe`, which every other hash shows too. `?mock` swaps the scale for the simulator
 * (`MockTransport`) on either, and `&speed=N` runs it N times faster than real time.
 */

import { useEffect, useState } from 'preact/hooks';
import type { LinkSpec } from '../app/links';

export type Page = 'probe' | 'brew';

export interface Route {
  readonly page: Page;
  /** The mock's options with `?mock`; null for the real scale. */
  readonly mock: { readonly speed: number } | null;
  /** What in the hash was ignored, and why, to show on the screen. */
  readonly problems: readonly string[];
}

/** The fastest mock speed accepted. */
export const MAX_MOCK_SPEED = 1000;

const PAGES: Readonly<Record<string, Page>> = {
  '': 'probe',
  '/': 'probe',
  '/probe': 'probe',
  '/brew': 'brew',
};

export function parseRoute(hash: string): Route {
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  const query = text.indexOf('?');
  const path = query === -1 ? text : text.slice(0, query);
  const params = new URLSearchParams(query === -1 ? '' : text.slice(query + 1));
  const problems: string[] = [];
  const page = Object.hasOwn(PAGES, path) ? PAGES[path] : 'probe';
  if (!Object.hasOwn(PAGES, path)) {
    problems.push(`There is no page ${path}; this is the probe.`);
  }
  if (!params.has('mock')) return { page, mock: null, problems };
  let speed = 1;
  const given = params.get('speed');
  if (given !== null) {
    const parsed = Number(given);
    if (parsed > 0 && parsed <= MAX_MOCK_SPEED)
      speed = parsed; // Number('') is 0: refused
    else problems.push(`Speed ${given} isn't a number from 0 to ${MAX_MOCK_SPEED}; using 1.`);
  }
  return { page, mock: { speed }, problems };
}

/** The hash of a page, on the real scale or the mock. */
export function pageHash(page: Page, mock: { readonly speed: number } | null): string {
  const path = `#/${page}`;
  if (mock === null) return path;
  return mock.speed === 1 ? `${path}?mock` : `${path}?mock&speed=${mock.speed}`;
}

/** The hash of the probe, on the real scale or the mock. */
export function probeHash(mock: { readonly speed: number } | null): string {
  return pageHash('probe', mock);
}

/** The link a route asks for: the real scale, or the mock at its speed. */
export function linkSpecFor(route: Route): LinkSpec {
  return route.mock ? { kind: 'mock', speed: route.mock.speed } : { kind: 'web-bluetooth' };
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
