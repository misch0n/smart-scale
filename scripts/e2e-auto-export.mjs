// Smoke test of automatic export (T1.20) in headless Chromium, against a stand-in for
// api.github.com (Playwright's routing): the settings and the Test button, the write-only
// token, an upload after an import, a refused token that stops it and Retry, a server failure
// that waits, and that the token reaches neither the page nor the export. Simulator recordings
// must stay on the phone, so the uploaded recording is an imported copy of one, made to look
// like a real scale's.
//
// Run: npm run e2e (builds first, then runs scripts/e2e-probe.mjs and this). It needs the
// agent environment's Playwright and Chromium (scripts/e2e-lib.mjs).

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BASE,
  OUT,
  button,
  byTestId,
  check,
  download,
  main,
  text,
  waitForText,
  watch,
} from './e2e-lib.mjs';

const OWNER = 'someone';
const REPO = 'smart-scale-data';
const TOKEN = 'github_pat_11E2E0000000000_e2esecrete2esecrete2esecret';

/**
 * What GitHub does for the requests the app makes, with its CORS headers. `failNext` answers
 * the next request matching a method with a given status instead.
 */
function fakeGitHub() {
  const files = new Map();
  const requests = [];
  const failures = [];
  let shas = 0;
  const state = { isPrivate: true };
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-expose-headers':
      'ETag, Link, Location, Retry-After, X-GitHub-OTP, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Used, X-RateLimit-Resource, X-RateLimit-Reset',
  };
  const reply = (route, status, body) =>
    route.fulfill({
      status,
      headers: cors,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

  async function handle(route) {
    const request = route.request();
    const method = request.method();
    if (method === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          ...cors,
          'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE',
          'access-control-allow-headers':
            'Authorization, Content-Type, If-Match, If-Modified-Since, If-None-Match, If-Unmodified-Since, X-Requested-With',
        },
      });
    }
    const headers = request.headers();
    const url = new URL(request.url());
    const path = decodeURIComponent(url.pathname);
    const body = request.postData() ? JSON.parse(request.postData()) : null;
    requests.push({ method, path, headers, body });
    // GitHub's preflight allows no X- header: a browser would refuse the request.
    if (Object.keys(headers).some((name) => name.startsWith('x-'))) return route.abort('failed');
    const failure = failures.findIndex((f) => f.method === method);
    if (failure !== -1) {
      const [{ status, message }] = failures.splice(failure, 1);
      return reply(route, status, { message });
    }
    if (headers.authorization !== `Bearer ${TOKEN}`) {
      return reply(route, 401, { message: 'Bad credentials' });
    }
    const repoPath = `/repos/${OWNER}/${REPO}`;
    if (method === 'GET' && path === repoPath) {
      return reply(route, 200, {
        full_name: `${OWNER}/${REPO}`,
        private: state.isPrivate,
        visibility: state.isPrivate ? 'private' : 'public',
        default_branch: 'main',
        archived: false,
      });
    }
    const prefix = `${repoPath}/contents/`;
    if (!path.startsWith(prefix)) return reply(route, 404, { message: 'Not Found' });
    const filePath = path.slice(prefix.length);
    const file = files.get(filePath);
    if (method === 'GET') {
      if (!file) return reply(route, 404, { message: 'Not Found' });
      return reply(route, 200, {
        type: 'file',
        sha: file.sha,
        encoding: 'base64',
        content: Buffer.from(file.text, 'utf8').toString('base64'),
      });
    }
    if (method === 'PUT') {
      if (file && body.sha !== file.sha) return reply(route, 409, { message: 'does not match' });
      const sha = String(++shas).padStart(40, '0');
      files.set(filePath, {
        text: Buffer.from(body.content, 'base64').toString('utf8'),
        sha,
        message: body.message,
      });
      return reply(route, file ? 200 : 201, { content: { path: filePath, sha } });
    }
    return reply(route, 404, { message: 'Not Found' });
  }

  return {
    files,
    requests,
    state,
    handle,
    failNext: (method, status, message) => failures.push({ method, status, message }),
  };
}

/**
 * An export file holding a copy of `exported`'s recording with a new id, as if a real scale had
 * recorded it: simulator recordings aren't uploaded.
 */
function asRealRecording(exported, id8) {
  const json = structuredClone(exported);
  const recording = json.recordings[0].recording;
  recording.id = `${recording.id.slice(0, -8)}${id8}`;
  recording.transport = 'web-bluetooth';
  json.shots = [];
  const path = join(OUT, `real-${id8}.json`);
  writeFileSync(path, JSON.stringify(json));
  return { path, id: recording.id };
}

async function run(browser) {
  const errors = [];
  const github = fakeGitHub();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    acceptDownloads: true,
  });
  await context.route('https://api.github.com/**', (route) => github.handle(route));
  const page = await context.newPage();
  // The failures the fake answers with on purpose (401, 503, and 422 for a file that exists).
  watch(page, errors, (url) => url.startsWith('https://api.github.com/'));

  await page.goto(`${BASE}#/probe?mock&speed=20`);
  await waitForText(page, 'auto-export-status', 'Off. Set up a private GitHub repo');
  check('off until set up', true);
  await waitForText(page, 'backup-reminder', "Recordings aren't backed up off this phone");
  check('a reminder at the top says recordings are not backed up', true);

  // A simulator recording to copy later. It isn't uploaded once set up.
  await button(page, 'Connect').click();
  await waitForText(page, 'connection-state', /^connected/);
  await page.waitForTimeout(1500);
  await button(page, 'Disconnect').click();
  await waitForText(page, 'connection-state', 'ended: user');
  const recordings = byTestId(page, 'recordings');
  await recordings
    .locator('tr', { hasText: 'user' })
    .first()
    .getByRole('button', { name: 'Export', exact: true })
    .click();
  await byTestId(page, 'export-ready').waitFor();
  const simulated = await download(page, page.getByRole('link', { name: 'Download' }));
  check('nothing was sent while off', github.requests.length === 0);

  const panel = byTestId(page, 'auto-export');
  await panel.getByLabel('Owner').fill(OWNER);
  await panel.getByLabel('Repo').fill(REPO);
  check(
    'the folder defaults to recordings/',
    (await panel.getByLabel('Folder').inputValue()) === 'recordings/',
  );
  await panel.getByLabel('Token').fill(TOKEN);

  github.state.isPrivate = false;
  await button(panel, 'Test').click();
  await waitForText(page, 'auto-export-message', 'is public');
  check('Test refuses a public repo', true, await text(page, 'auto-export-message'));
  github.state.isPrivate = true;
  await button(panel, 'Test').click();
  await waitForText(page, 'auto-export-message', 'It works');
  check('Test passes for a private repo', true, await text(page, 'auto-export-message'));
  check(
    'Test sends the token as a bearer token',
    github.requests.at(-1)?.headers.authorization === `Bearer ${TOKEN}`,
  );

  await button(panel, 'Save').click();
  await waitForText(page, 'auto-export-message', 'Saved.');
  await waitForText(page, 'auto-export-status', 'Up to date');
  check('saved, and up to date', true, await text(page, 'auto-export-status'));
  await byTestId(page, 'backup-reminder').waitFor({ state: 'detached' });
  check('the reminder goes once it is set up', true);
  check(
    'the simulator recording stays on the phone',
    !github.requests.some((r) => r.method === 'PUT'),
  );
  await waitForText(page, 'auto-export-token', 'Token: set');
  check(
    'the token field is write-only once saved',
    (await panel.locator('input[type="password"]').count()) === 0,
  );
  check('the page never shows the token', !(await page.content()).includes(TOKEN));

  // A recording from the scale, imported: uploaded at once.
  const first = asRealRecording(simulated.json, 'e2e00001');
  await page.getByLabel('Import an export file').setInputFiles(first.path);
  await waitForText(page, 'import-result', 'Recordings: 1 added');
  await waitForText(page, 'auto-export-status', 'Last export');
  const [path] = [...github.files.keys()];
  check(
    'the imported recording is uploaded to recordings/YYYY/MM/',
    /^recordings\/\d{4}\/\d{2}\/smart-scale_\d{4}-\d{2}-\d{2}_\d{6}_e2e00001\.json$/.test(
      path ?? '',
    ),
    path,
  );
  const uploaded = JSON.parse(github.files.get(path)?.text ?? '{}');
  check(
    'the upload is the export file of that recording',
    uploaded.format === 'smart-scale-export' && uploaded.recordings?.[0]?.recording.id === first.id,
  );
  check(
    'one commit, saying what it adds',
    github.files.get(path)?.message === `Add ${path.split('/').at(-1)}`,
  );
  check(
    'the token is in no request but its header',
    github.requests.every((r) => {
      const rest = Object.entries(r.headers).filter(([name]) => name !== 'authorization');
      return !JSON.stringify([rest, r.body, r.path]).includes(TOKEN);
    }),
  );

  // A refused token stops it, and says to check the settings; Retry starts it again.
  github.failNext('GET', 401, `Bad credentials: ${TOKEN}`);
  const second = asRealRecording(simulated.json, 'e2e00002');
  await page.getByLabel('Import an export file').setInputFiles(second.path);
  await waitForText(page, 'auto-export-status', 'Stopped.');
  const stopped = await text(page, 'auto-export-status');
  check(
    'a refused token stops it and says to check the settings',
    /check the settings/i.test(stopped),
    stopped,
  );
  check('the error hides the token', !stopped.includes(TOKEN) && stopped.includes('[token]'));
  await waitForText(page, 'backup-reminder', 'automatic export has stopped');
  check('the reminder is back while it is stopped', true, await text(page, 'backup-reminder'));
  await button(page, 'Retry now').click();
  await waitForText(page, 'auto-export-status', 'Up to date');
  check('Retry uploads it', github.files.size === 2);

  // A server failure waits to try again.
  github.failNext('GET', 503, 'Unavailable');
  const third = asRealRecording(simulated.json, 'e2e00003');
  await page.getByLabel('Import an export file').setInputFiles(third.path);
  await waitForText(page, 'auto-export-status', 'Waiting to try again');
  check('a server failure waits to retry', true, await text(page, 'auto-export-status'));
  await button(page, 'Retry now').click();
  await waitForText(page, 'auto-export-status', 'Up to date');
  check('then uploads', github.files.size === 3);

  // The settings and the ledger survive a reload; nothing is uploaded twice.
  const puts = github.requests.filter((r) => r.method === 'PUT').length;
  await page.reload();
  await waitForText(page, 'auto-export-status', 'Up to date');
  await waitForText(page, 'auto-export-token', 'Token: set');
  check(
    'settings survive a reload',
    (await page.getByTestId('auto-export').getByLabel('Owner').inputValue()) === OWNER,
  );
  check(
    'nothing is uploaded twice',
    github.requests.filter((r) => r.method === 'PUT').length === puts,
  );

  // A full export carries no token.
  await button(page, 'Export all').click();
  await waitForText(page, 'export-ready', '_all.json');
  const all = await download(page, page.getByRole('link', { name: 'Download' }));
  check(
    'a full export carries no token',
    !readFileSync(all.path, 'utf8').includes(TOKEN) && JSON.stringify(all.json.settings) === '{}',
  );

  // Removing the token turns it off. The settings are folded away once saved.
  await page.getByTestId('auto-export').getByText('Settings', { exact: true }).click();
  await button(page.getByTestId('auto-export'), 'Remove').click();
  await waitForText(page, 'auto-export-status', 'Off: there is no token');
  check('Remove turns it off', true);

  // The reminder is there each time the page opens, and its button opens the settings.
  await page.reload();
  await waitForText(page, 'backup-reminder', 'automatic export has no token');
  const settings = page.getByTestId('auto-export').locator('details');
  check('the settings are folded away after a reload', !(await settings.evaluate((d) => d.open)));
  await button(byTestId(page, 'backup-reminder'), 'Set it up').click();
  await page.getByTestId('auto-export').getByLabel('Token').waitFor({ state: 'visible' });
  check("the reminder's button opens the settings", await settings.evaluate((d) => d.open));

  check('no page errors', errors.length === 0, errors.join(' | '));
}

await main(run);
