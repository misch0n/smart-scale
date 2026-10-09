// Smoke test of the history (T1.19) in headless Chromium, in a phone-sized window on UTC: the
// user's real recording of hardware session 2 (fixtures/real/, two shots and a bean pour) is
// imported on the probe, and the history then lists its two shots, post-hoc, with their small
// graphs; a shot's page shows its staged chart, summary and phases, and keeps a grade across a
// reload; there is no Compare (T3.6); a shot is deleted from its page (T3.20). It serves dist/ under /smart-scale/, as GitHub Pages does.
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
  await byTestId(page, 'tab-history').click();
  await byTestId(page, 'history-row').nth(1).waitFor({ timeout: 20_000 });
  const rows = await byTestId(page, 'history-row').allTextContents();
  check(
    'History lists the two shots, newest first, timed from their taps',
    rows.length === 2 && /Mon 5 Oct06:12/.test(rows[0]) && /Mon 5 Oct06:07/.test(rows[1]),
    rows.join(' | '),
  );
  // The rule, the flow (T3.13) and the weight, each row: post-hoc shots have no target.
  // Each row has its extraction's time (T3.15): shot B's is 32.0 s.
  const extractions = await page.locator('[data-testid="row-extraction"]').allTextContents();
  check(
    'each row has its extraction time',
    extractions.length === 2 && extractions[0] === '32.0' && /^\d+\.\d$/.test(extractions[1]),
    extractions.join(' | '),
  );
  check('each row has its small graph', (await page.locator('.hrow .spark path').count()) >= 6);

  // Shot B: the 35.1 g one, 3.7 s to the first drip.
  await byTestId(page, 'history-row').first().click();
  await byTestId(page, 'metrics').waitFor();
  check('the shot’s page names it', (await text(page, 'shot-title')) === 'Mon 5 Oct · 06:12');
  // Under the chart (T3.16): the extraction's time over the total, the yield over the ratio, the
  // average flow. Shot B has no dose, so no ratio, which it says.
  const summary = {};
  for (const id of ['extraction', 'total', 'yield', 'ratio', 'flow']) {
    summary[id] = await text(page, `summary-${id}`);
  }
  check(
    'it sums the shot up under the chart',
    summary.extraction === '32.0' &&
      summary.total === '35.7' &&
      summary.yield === '35.1' &&
      summary.ratio === 'no dose' &&
      /^\d\.\d\d$/.test(summary.flow),
    JSON.stringify(summary),
  );
  check(
    'its chart colours the stages, with no marker lines',
    (await page.locator('path[data-testid^="stage-"]').count()) === 3 &&
      (await page.locator('.stage-strip span').count()) === 3 &&
      (await page.locator('.hchart-mark').count()) === 0 &&
      (await page.locator('.stage-legend').textContent()).startsWith(
        'preinfusionextractiontailflow',
      ),
    await page.locator('.stage-legend').textContent(),
  );
  // The chart ends where the tail did (T3.17): pump off at 35.7 s, the drips soon after, not 40.
  const timeLabels = await page.locator('.hchart-x span').allTextContents();
  check(
    'its time axis ends with the tail, not at a round 40 s',
    timeLabels.join(',') === '0,10,20,30 s' &&
      (await page.locator('.stage-strip span[data-stage="tail"]').count()) === 1,
    timeLabels.join(','),
  );
  check('its extraction is the only phase so far', (await page.locator('.prow').count()) === 1);

  // Held, the chart reads at the finger (T3.10): with a mouse, a press; with a finger, a hold.
  const plot = page.locator('.hchart-plot');
  const box = await plot.boundingBox();
  const atX = (share) => box.x + box.width * share;
  const midY = box.y + box.height / 2;
  await page.mouse.move(atX(0.5), midY);
  await page.mouse.down();
  await byTestId(page, 'chart-scrub').waitFor();
  const atHalf = await text(page, 'chart-scrub');
  await page.mouse.move(atX(0.99), midY);
  await page.waitForFunction(
    (before) => document.querySelector('[data-testid="chart-scrub"]')?.textContent !== before,
    atHalf,
  );
  const atEnd = await text(page, 'chart-scrub');
  await page.mouse.up();
  await byTestId(page, 'chart-scrub').waitFor({ state: 'detached' });
  check(
    'past the pump, it says how long the extraction lasted, and the tail',
    /preinfusion 3\.7 sextraction 32\.0 stail \+\d+\.\d g$/.test(atEnd),
    atEnd,
  );
  check(
    'a press on the chart reads the moment, and follows the pointer',
    /^\d+\.\d s\d+\.\d g · \d+\.\d g\/spreinfusion 3\.7 s$/.test(atHalf) &&
      parseFloat(atEnd) > parseFloat(atHalf) &&
      parseFloat(atEnd.split('s')[1]) > parseFloat(atHalf.split('s')[1]),
    `${atHalf} → ${atEnd}`,
  );
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const touch = (type, share) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x: atX(share), y: midY }],
    });
  await touch('touchStart', 0.3);
  await page.waitForTimeout(80);
  check('a touch alone reads nothing', (await byTestId(page, 'chart-scrub').count()) === 0);
  await page.waitForTimeout(400);
  await byTestId(page, 'chart-scrub').waitFor();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await touch('touchMove', 0.6);
  await page.waitForTimeout(100);
  const held = await text(page, 'chart-scrub');
  check(
    'held, it reads, and a slide moves the reading, not the page',
    parseFloat(held) > 15 && (await page.evaluate(() => window.scrollY)) === scrollBefore,
    held,
  );
  await touch('touchEnd', 0.6);
  await byTestId(page, 'chart-scrub').waitFor({ state: 'detached' });
  check('letting go hides it', true);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });

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

  // No Compare (T3.6): neither on the shot's page nor in the list.
  await page.goto(page.url().replace('?debug', ''));
  await byTestId(page, 'metrics').waitFor();
  check(
    'the shot has no "Compare with…"',
    (await byTestId(page, 'compare-with').count()) === 0 &&
      (await page.getByText('Compare with').count()) === 0,
  );

  // Back in the list, the graded shot shows its taste.
  await page.goto(`${BASE}#/history`);
  await byTestId(page, 'history-row').first().waitFor();
  check(
    'the list has no Compare',
    (await page.getByRole('button', { name: 'Compare', exact: true }).count()) === 0,
  );
  check(
    'the list shows the new grade',
    (await byTestId(page, 'history-row').first().textContent()).includes('Sour'),
  );

  // Deleting a shot from its page (T3.20): asked once more, then gone from the list.
  await byTestId(page, 'history-row').nth(1).click();
  await byTestId(page, 'shot-title').waitFor();
  check('the shot is not asked about yet', (await byTestId(page, 'delete-confirm').count()) === 0);
  await byTestId(page, 'delete-shot').click();
  await byTestId(page, 'delete-confirm').waitFor();
  await button(page, 'Cancel').click();
  check(
    'Delete shot asks first, and Cancel keeps it',
    (await byTestId(page, 'delete-confirm').count()) === 0 &&
      (await byTestId(page, 'delete-shot').count()) === 1,
  );
  await byTestId(page, 'delete-shot').click();
  await byTestId(page, 'delete-yes').click();
  await page.waitForFunction(
    () => location.hash.startsWith('#/history') && !location.hash.includes('shot'),
  );
  await byTestId(page, 'history-row').first().waitFor();
  const left = await byTestId(page, 'history-row').allTextContents();
  check(
    'Delete takes it back to History, without the shot',
    left.length === 1 && left[0].includes('Sour'),
    left.join(' | '),
  );
  await page.reload();
  await byTestId(page, 'history-row').first().waitFor();
  check('it stays deleted after a reload', (await byTestId(page, 'history-row').count()) === 1);

  check('no page errors', errors.length === 0, errors.join(' | '));
}

await main(run);
