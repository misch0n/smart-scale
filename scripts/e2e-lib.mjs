// Shared by the smoke tests (scripts/e2e-*.mjs): Playwright from the agent environment, the
// production build served under /smart-scale/ as GitHub Pages does, and PASS/FAIL checks.
//
// Set PLAYWRIGHT_MODULE (the playwright package's path) or CHROMIUM_PATH to override where
// Playwright and Chromium come from.

import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const PORT = 4175;
export const ORIGIN = `http://localhost:${PORT}`;
export const BASE = `${ORIGIN}/smart-scale/`;
export const OUT = mkdtempSync(join(tmpdir(), 'smart-scale-e2e-'));

function loadPlaywright() {
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
  console.error('Playwright not found: set PLAYWRIGHT_MODULE, or install it globally.');
  process.exit(2);
}

const results = [];
export function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

export const byTestId = (page, id) => page.getByTestId(id);
export const text = async (page, id) => (await byTestId(page, id).textContent()) ?? '';
export const button = (page, name) => page.getByRole('button', { name, exact: true });

/** Waits until the element's text satisfies `test` (a string to include, or a RegExp). */
export async function waitForText(page, id, test) {
  await page.waitForFunction(
    ([id, source, isRegExp]) => {
      const content = document.querySelector(`[data-testid="${id}"]`)?.textContent ?? '';
      return isRegExp ? new RegExp(source).test(content) : content.includes(source);
    },
    [id, test instanceof RegExp ? test.source : test, test instanceof RegExp],
  );
}

export async function download(page, trigger) {
  const [file] = await Promise.all([page.waitForEvent('download'), trigger.click()]);
  const path = join(OUT, file.suggestedFilename());
  await file.saveAs(path);
  return { path, json: JSON.parse(readFileSync(path, 'utf8')) };
}

/**
 * Collects the page's errors and console errors into `errors`. `expected(url)` says which
 * resources may fail to load on purpose: Chromium logs every answer that isn't a success.
 */
export function watch(page, errors, expected = () => false) {
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    const url = message.location().url;
    // A missing favicon is the server's 404, not the app's.
    if (message.type() !== 'error' || url.endsWith('/favicon.ico')) return;
    if (message.text().startsWith('Failed to load resource') && expected(url)) return;
    errors.push(message.text());
  });
}

async function startServer() {
  const server = spawn(
    join('node_modules', '.bin', 'vite'),
    ['preview', '--port', String(PORT), '--strictPort', '--base', '/smart-scale/'],
    { stdio: 'ignore' },
  );
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE)).ok) return server;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  server.kill();
  throw new Error(`vite preview didn't start on ${BASE}; run npm run build first`);
}

/**
 * Serves the build, runs `run(browser)` in headless Chromium, prints the results and exits with
 * 0 if every check passed.
 */
export async function main(run) {
  const { chromium } = loadPlaywright();
  const executablePath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
  const server = await startServer();
  const browser = await chromium.launch({
    executablePath: existsSync(executablePath) ? executablePath : undefined,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  try {
    await run(browser);
  } catch (error) {
    check('the run finished', false, String(error));
  } finally {
    await browser.close();
    server.kill();
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
}
