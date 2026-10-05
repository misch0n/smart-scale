// Smoke test of the history (T1.19) in headless Chromium, in a phone-sized window on UTC: the
// user's real recording of hardware session 2 (fixtures/real/, two shots and a bean pour) is
// imported on the probe, and the history then lists its two shots, post-hoc, with their small
// graphs; a shot's page shows its chart, metrics and phases, and keeps a grade across a reload;
// Compare picks two shots and aligns them at the first drip or at pump on. It serves dist/ under
// /smart-scale/, as GitHub Pages does.
//
// Run: npm run e2e (builds first). It needs Playwright and Chromium, which the agent environment
// has installed globally; it isn't part of `npm run check` or CI.

import { BASE, button, byTestId, check, main, text, watch } from './e2e-lib.mjs';

const FIXTURE = 'fixtures/real/2026-10-05_two-shots_0a69da56.json';

async function run(browser) {
  const errors = [];
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: 'UTC',
  });
  const page = await context.newPage();
  watch(page, errors);

  await page.goto(`${BASE}#/history`);
  await byTestId(page, 'history-empty').waitFor();
  check('an empty history says so', true);

  // The probe imports the file; the history analyses it and adds a post-hoc shot per shot.
  await page.goto(`${BASE}#/probe`);
  await page.getByLabel('Import an export file').setInputFiles(FIXTURE);
  await byTestId(page, 'import-result').waitFor();
  await byTestId(page, 'to-history').click();
  await byTestId(page, 'history-row').nth(1).waitFor({ timeout: 20_000 });
  const rows = await byTestId(page, 'history-row').allTextContents();
  check(
    'History lists the two shots, newest first, timed from their taps',
    rows.length === 2 && /Mon 5 Oct06:12/.test(rows[0]) && /Mon 5 Oct06:07/.test(rows[1]),
    rows.join(' | '),
  );
  check('each row has its small graph', (await page.locator('.hrow .spark path').count()) >= 4);

  // Shot B: the 35.1 g one, 3.7 s to the first drip.
  await byTestId(page, 'history-row').first().click();
  await byTestId(page, 'metrics').waitFor();
  check('the shot’s page names it', (await text(page, 'shot-title')) === 'Mon 5 Oct · 06:12');
  check(
    'it shows the analysis’s metrics',
    (await text(page, 'metric-first-drip')) === '3.7' &&
      (await text(page, 'metric-yield')) === '35.1' &&
      (await text(page, 'metric-total')) === '35.7',
    [
      await text(page, 'metric-first-drip'),
      await text(page, 'metric-yield'),
      await text(page, 'metric-total'),
    ].join(' '),
  );
  check(
    'its chart is drawn, with the markers labelled',
    (await page.locator('.hchart svg[role="img"] path').count()) >= 4 &&
      (await page.locator('.hchart-mark').allTextContents()).join(',') ===
        'pump on,first drip,pump off',
  );
  check('its extraction is the only phase so far', (await page.locator('.prow').count()) === 1);

  // A grade, stored as it is tapped.
  await button(page, 'Sour').click();
  await button(page, 'WDT').click();
  await page.waitForFunction(() =>
    ['Sour', 'WDT'].every((name) =>
      [...document.querySelectorAll('button[aria-pressed="true"]')].some(
        (b) => b.textContent.trim() === name,
      ),
    ),
  );
  await page.waitForTimeout(300);
  await page.reload();
  await byTestId(page, 'metrics').waitFor();
  const pressed = await page.locator('button[aria-pressed="true"]').allTextContents();
  check(
    'the grades are kept across a reload',
    pressed.map((name) => name.trim()).join(',') === 'Sour,WDT',
    pressed.join(','),
  );

  // ?debug shows what the shot recorded; the normal page doesn't.
  check('no snapshot without ?debug', (await page.locator('.debug').count()) === 0);
  await page.goto(`${page.url()}?debug`);
  await page.locator('.debug').waitFor();
  check(
    '?debug shows the snapshot',
    (await page.locator('.debug pre').textContent()).includes('"packName"'),
  );

  // "Compare with…" picks this shot as A.
  await page.goto(page.url().replace('?debug', ''));
  await byTestId(page, 'compare-with').click();
  await byTestId(page, 'history-pick').first().waitFor();
  check(
    'Compare with… opens Compare mode with the shot as A',
    (await page.locator('.pick-mark.a').count()) === 1 &&
      (await page.locator('[data-testid="history-pick"][aria-pressed="true"]').count()) === 1,
  );
  check(
    'it waits for a second shot',
    (await page.getByRole('status').textContent()) === 'Pick two shots',
  );
  await byTestId(page, 'history-pick').nth(1).click();
  await byTestId(page, 'compare-go').click();
  await byTestId(page, 'compare-table').waitFor();
  check(
    'Compare aligns the shots at the first drip',
    (await byTestId(page, 'overlay').getAttribute('data-zero')) === 'firstDrip',
  );
  check(
    'the table reads A, A − B and B',
    (await text(page, 'compare-first-drip')).replace(/\s+/g, ' ').includes('3.7+0.43.3'),
    await text(page, 'compare-first-drip'),
  );
  await button(page, 'Pump on').click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="overlay"]')?.dataset.zero === 'pumpOn',
  );
  check('a tap aligns them at pump on', true);

  // Back in the list, the graded shot shows its taste.
  await page.goto(`${BASE}#/history`);
  await byTestId(page, 'history-row').first().waitFor();
  check(
    'the list shows the new grade',
    (await byTestId(page, 'history-row').first().textContent()).includes('Sour'),
  );

  check('no page errors', errors.length === 0, errors.join(' | '));
}

await main(run);
