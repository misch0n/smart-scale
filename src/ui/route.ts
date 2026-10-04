/**
 * Hash routing (D-009). Until the shot capture flow (T1.18) there is one screen, the probe, at
 * `#/probe`, and every other hash shows it too. `#/probe?mock` swaps the scale for the
 * simulator (`MockTransport`), and `&speed=N` runs it N times faster than real time.
 */

import { useEffect, useState } from 'preact/hooks';

export interface Route {
  /** The mock's options with `?mock`; null for the real scale. */
  readonly mock: { readonly speed: number } | null;
  /** What in the hash was ignored, and why, to show on the screen. */
  readonly problems: readonly string[];
}

/** The fastest mock speed accepted. */
export const MAX_MOCK_SPEED = 1000;

export function parseRoute(hash: string): Route {
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  const query = text.indexOf('?');
  const path = query === -1 ? text : text.slice(0, query);
  const params = new URLSearchParams(query === -1 ? '' : text.slice(query + 1));
  const problems: string[] = [];
  if (!['', '/', '/probe'].includes(path)) {
    problems.push(`There is no page ${path}; this is the probe.`);
  }
  if (!params.has('mock')) return { mock: null, problems };
  let speed = 1;
  const given = params.get('speed');
  if (given !== null) {
    const parsed = Number(given);
    if (parsed > 0 && parsed <= MAX_MOCK_SPEED)
      speed = parsed; // Number('') is 0: refused
    else problems.push(`Speed ${given} isn't a number from 0 to ${MAX_MOCK_SPEED}; using 1.`);
  }
  return { mock: { speed }, problems };
}

/** The hash of the probe, on the real scale or the mock. */
export function probeHash(mock: { readonly speed: number } | null): string {
  if (mock === null) return '#/probe';
  return mock.speed === 1 ? '#/probe?mock' : `#/probe?mock&speed=${mock.speed}`;
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
