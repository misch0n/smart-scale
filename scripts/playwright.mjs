// Playwright and Chromium from the agent environment, for the scripts that drive a browser: the
// smoke tests (scripts/e2e-*.mjs) and the inspection CLI's PNGs (scripts/analyze.mjs). Neither
// is a dependency of the project.
//
// Set PLAYWRIGHT_MODULE (the playwright package's path) or CHROMIUM_PATH to override where
// Playwright and Chromium come from.

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

/** The playwright module: PLAYWRIGHT_MODULE, a local install or a global one; null if none. */
export function findPlaywright() {
  const require = createRequire(import.meta.url);
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright'].filter(Boolean);
  let globalRoot = null;
  try {
    globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
  } catch {
    // no npm on the path: only PLAYWRIGHT_MODULE or a local install can work
  }
  for (const candidate of candidates) {
    try {
      return require(require.resolve(candidate, { paths: [process.cwd(), globalRoot ?? '.'] }));
    } catch {
      // try the next
    }
  }
  return null;
}

/** CHROMIUM_PATH, or the agent environment's Chromium; undefined for Playwright's own. */
export function chromiumPath() {
  const path = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
  return existsSync(path) ? path : undefined;
}
