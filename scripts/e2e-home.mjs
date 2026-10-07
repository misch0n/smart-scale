// Smoke test of Home and the tab bar (T1.23) in headless Chromium, in a phone-sized window on
// UTC, with the clock at the morning of hardware session 2: Home with no shots; the four tabs
// (the brew flow in focus mode without the bar, its ✕ back Home, Setup with the probe a row in
// it, T2.9); the mock
// connected from Home, with its weight, battery, Tare (`01`, logged) and the timer button
// (T2.27: `04`, `05`, `06`), its name renamed with a tap (T2.30), and the mode check
// finding the timer mode (T1.25); then Home with one shot, brewed on the mock and graded,
// opening its page; and with three, once the user's real recording is imported. Last, the mock
// in its flow-rate mode: the mode warning on Home, the brew screen and the probe (T1.25), and the
// scale's name still there after a reload, then cleared (T2.30). It serves dist/ under /smart-scale/, as GitHub Pages does.
//
// Run: npm run e2e (builds first). It needs Playwright and Chromium, which the agent environment
// has installed globally; it isn't part of `npm run check` or CI.

import { BASE, button, byTestId, check, main, text, waitForText, watch } from './e2e-lib.mjs';

const FIXTURE = 'fixtures/real/2026-10-05_two-shots_0a69da56.json';

/** The tab bar's tabs, and which is the current page's. */
async function tabs(page) {
  const bar = byTestId(page, 'tabbar');
  return {
    names: (await bar.getByRole('link').allTextContents()).join(','),
    current: (await bar.locator('[aria-current="page"]').textContent()) ?? null,
  };
}

/** Opens the probe: the Setup tab, then its Probe row (T2.9). */
async function openProbe(page) {
  await byTestId(page, 'tab-setup').click();
  await byTestId(page, 'setup-probe').click();
  await page.getByRole('heading', { name: 'Probe', exact: true }).waitFor();
}

/** Waits until the brew screen's `data-<name>` is `value`. */
async function waitForBrew(page, name, value, timeout = 30_000) {
  await page.waitForFunction(
    ([name, value]) => document.querySelector('[data-testid="brew"]')?.dataset[name] === value,
    [name, value],
    { timeout },
  );
}

async function run(browser) {
  const errors = [];
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: 'UTC',
  });
  const page = await context.newPage();
  // Monday 5 October 2026, 08:30: session 2's shots (06:07 and 06:12) are this morning's.
  await page.clock.install({ time: new Date('2026-10-05T08:30:00Z') });
  watch(page, errors);

  // Home, with nothing recorded yet.
  await page.goto(`${BASE}#/?mock&speed=20`);
  await byTestId(page, 'home-empty').waitFor();
  check('Home says there are no shots yet', true);
  check(
    'Home names the day',
    (await text(page, 'today')) === 'Mon 5 Oct',
    await text(page, 'today'),
  );
  check(
    'the scale card waits for a tap',
    (await byTestId(page, 'scale').getAttribute('data-view')) === 'disconnected' &&
      (await button(page, 'Connect scale').count()) === 1,
  );
  const home = await tabs(page);
  check(
    'the tab bar has Home, Brew, History and Setup, with Home current',
    home.names === 'Home,Brew,History,Setup' && home.current === 'Home',
    JSON.stringify(home),
  );

  // The tabs, keeping the mock.
  await byTestId(page, 'tab-brew').click();
  await byTestId(page, 'brew').waitFor();
  check(
    'Brew opens the brew flow, in focus mode without the tab bar',
    (await byTestId(page, 'tabbar').count()) === 0 && page.url().endsWith('#/brew?mock&speed=20'),
    page.url(),
  );
  await page.getByRole('link', { name: 'End session' }).click();
  await byTestId(page, 'home').waitFor();
  check('its ✕ goes back Home', page.url().endsWith('#/?mock&speed=20'), page.url());
  await byTestId(page, 'tab-history').click();
  await byTestId(page, 'history-empty').waitFor();
  check('History has the tab bar', (await tabs(page)).current === 'History');
  check(
    'History has no link to the probe any more',
    (await page.getByText('‹ Probe').count()) === 0,
  );
  await byTestId(page, 'tab-setup').click();
  await byTestId(page, 'setup').waitFor();
  check(
    'Setup opens its list, with the tab bar',
    (await tabs(page)).current === 'Setup' && page.url().endsWith('#/setup?mock&speed=20'),
    page.url(),
  );
  await byTestId(page, 'setup-probe').click();
  await page.getByRole('heading', { name: 'Probe', exact: true }).waitFor();
  check(
    'the probe is a row of Setup, its tab still current',
    (await tabs(page)).current === 'Setup',
  );
  check(
    'the probe has no link to History any more',
    (await byTestId(page, 'to-history').count()) === 0,
  );
  await byTestId(page, 'tab-home').click();
  await byTestId(page, 'home').waitFor();

  // Connect from Home: the weight, the battery and the scale's name.
  await button(page, 'Connect scale').click();
  await waitForText(page, 'weight', /\d\.\d/);
  check(
    'connected, Home shows the scale, its battery and its weight',
    (await text(page, 'scale-name')) === 'BOOKOO mock' &&
      /^\d+ %$/.test((await text(page, 'battery')).trim()) &&
      (await text(page, 'scale-state')).includes('Connected'),
    `${await text(page, 'scale-name')} · ${await text(page, 'battery')} · ${await text(page, 'weight')}`,
  );

  // The demo session ends with its cup lifted after the scale's own tare: it reads about −131 g.
  // Tare zeroes it, and the recording logs the command.
  await waitForText(page, 'weight', /^−1[23]\d\.\d$/);
  check('the scale reads the lifted cup', true, await text(page, 'weight'));
  await byTestId(page, 'tare').click();
  await waitForText(page, 'weight', /^0\.0$/);
  check('Tare zeroes the scale', true);
  check(
    'in its timer mode, the scale gets no mode warning',
    (await byTestId(page, 'mode-warning').count()) === 0,
  );
  // The scale's timer, one button (T2.27): Start, Stop, Reset, as the timer goes.
  const timerLabels = [await text(page, 'timer')];
  for (const next of ['stop', 'reset', 'start']) {
    await byTestId(page, 'timer').click();
    await page.waitForFunction(
      (action) => document.querySelector('[data-testid="timer"]')?.dataset.action === action,
      next,
      { timeout: 10_000 },
    );
    timerLabels.push(await text(page, 'timer'));
  }
  check(
    'the timer button starts, stops and resets the scale’s timer',
    timerLabels.join(' → ') === 'Start timer → Stop timer → Reset timer → Start timer',
    timerLabels.join(' → '),
  );
  // The scale's own name (T2.30): a tap renames it; Escape leaves it as it was.
  await byTestId(page, 'scale-name').click();
  await byTestId(page, 'scale-name-input').fill('Themis');
  await byTestId(page, 'scale-name-input').press('Enter');
  await waitForText(page, 'scale-name', 'Themis');
  check('a tap on the scale’s name renames it', true);
  await byTestId(page, 'scale-name').click();
  await byTestId(page, 'scale-name-input').fill('Something else');
  await byTestId(page, 'scale-name-input').press('Escape');
  await waitForText(page, 'scale-name', 'Themis');
  check('Escape leaves the name as it was', true);
  await openProbe(page);
  await byTestId(page, 'events').waitFor();
  const events = await byTestId(page, 'events').textContent();
  check(
    'the tare is logged, with Home as its reason',
    /sent tare \S+ \[home\]/.test(events ?? ''),
    events?.match(/sent tare \S+ \[\w+\]/g)?.join(', ') ?? '',
  );
  check(
    'the timer button’s commands are logged, with their reason',
    ['startTimer', 'stopTimer', 'resetTimer'].every((name) =>
      new RegExp(`sent ${name} \\S+ \\[home-timer\\]`).test(events ?? ''),
    ),
    events?.match(/sent \w+ \S+ \[home-timer\]/g)?.join(', ') ?? '',
  );
  check(
    'the mode check found the timer mode (T1.25; Home’s 04 confirms it too)',
    /^Scale mode \(T1\.25\): Timer mode: the 04 \[(mode-check|home-timer)\]/.test(
      await text(page, 'scale-mode'),
    ),
    await text(page, 'scale-mode'),
  );
  await byTestId(page, 'tab-home').click();
  await byTestId(page, 'home').waitFor();

  // One shot: brewed on the mock at 10×, graded and saved, then back Home.
  await page.goto(`${BASE}#/brew?mock&speed=10`);
  await byTestId(page, 'brew').waitFor();
  await button(page, 'Connect scale').click();
  await waitForBrew(page, 'phase', 'ready');
  await byTestId(page, 'start').click();
  await waitForBrew(page, 'view', 'card');
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="extraction-row"]')?.textContent?.includes('g in'),
  );
  await button(page, 'Balanced').click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('button[aria-pressed="true"]')].some(
      (b) => b.textContent.trim() === 'Balanced',
    ),
  );
  await byTestId(page, 'save').click();
  await waitForBrew(page, 'view', 'ready');
  await page.getByRole('link', { name: 'End session' }).click();
  await byTestId(page, 'last-shot').waitFor({ timeout: 20_000 });
  check(
    'Home shows the shot as the last one, with its drink and taste',
    /Espresso/.test(await text(page, 'last-shot')) &&
      /Balanced/.test(await text(page, 'last-shot')),
    await text(page, 'last-shot'),
  );
  check(
    '…today, at its time',
    /^Mon \d\d:\d\d$/.test((await text(page, 'last-shot-when')).trim()),
    await text(page, 'last-shot-when'),
  );
  const ratio = await text(page, 'last-ratio');
  check(
    '…with its yield, ratio and first drip',
    /^\d+\.\d$/.test(await text(page, 'last-yield')) &&
      /^1:\d\.\d\d$/.test(ratio) &&
      /^\d+\.\d$/.test(await text(page, 'last-first-drip')),
    `${await text(page, 'last-yield')} g · ${ratio} · ${await text(page, 'last-first-drip')} s`,
  );
  check('…and its small graph', (await page.locator('.home-spark path').count()) === 3);
  check(
    'the week counts it, and its ratio is the average',
    (await text(page, 'week-shots')) === '1' && (await text(page, 'week-ratio')) === ratio,
    `${await text(page, 'week-shots')} · ${await text(page, 'week-ratio')}`,
  );
  check(
    'the week counts its taste',
    /0 sour\s*1 balanced\s*0 bitter/.test(await text(page, 'week-taste')),
    await text(page, 'week-taste'),
  );
  await byTestId(page, 'last-shot').click();
  await byTestId(page, 'metrics').waitFor();
  check('the last shot opens its page, with the tab bar', (await tabs(page)).current === 'History');

  // Many: the real recording's two post-hoc shots join it.
  await openProbe(page);
  await page.getByLabel('Import an export file').setInputFiles(FIXTURE);
  await byTestId(page, 'import-result').waitFor();
  await byTestId(page, 'tab-home').click();
  await waitForText(page, 'week-shots', '3');
  check('the week counts the imported shots', true);
  check(
    'the last shot is still the newest',
    /Balanced/.test(await text(page, 'last-shot')),
    await text(page, 'last-shot'),
  );
  // Only the brewed shot has a dose, so only it has a ratio.
  check(
    'the averages take the shots that have each figure',
    (await text(page, 'week-ratio')) === (await text(page, 'last-ratio')) &&
      /^\d+\.\d$/.test(await text(page, 'week-first-drip')) &&
      /^\d+\.\d$/.test(await text(page, 'week-extraction')),
    `${await text(page, 'week-ratio')} · ${await text(page, 'week-first-drip')} · ${await text(page, 'week-extraction')}`,
  );
  await page.getByRole('link', { name: 'History ›' }).click();
  await byTestId(page, 'history-row').nth(2).waitFor();
  check('History › lists the three shots', (await byTestId(page, 'history-row').count()) === 3);

  // Compare mode's bar sits on the tab bar.
  await button(page, 'Compare').click();
  const compareBar = await page.locator('.compare-bar').boundingBox();
  const tabBar = await byTestId(page, 'tabbar').boundingBox();
  check(
    'Compare mode’s bar sits on the tab bar',
    compareBar !== null &&
      tabBar !== null &&
      Math.abs(compareBar.y + compareBar.height - tabBar.y) < 1,
    JSON.stringify({ compareBar, tabBar }),
  );

  // The mock in its flow-rate mode: the mode check's 04 starts nothing, so the warning (T1.25).
  await page.goto(`${BASE}#/?mock&speed=20&mode=flow-rate`);
  await byTestId(page, 'home').waitFor();
  await button(page, 'Connect scale').click();
  await byTestId(page, 'mode-warning').waitFor();
  check(
    'in another mode, Home warns in the scale card',
    (await text(page, 'mode-warning')).includes("The scale isn't in its timer mode") &&
      (await page.locator('.scale [data-testid="mode-warning"]').count()) === 1,
    await text(page, 'mode-warning'),
  );
  await byTestId(page, 'tab-brew').click();
  await byTestId(page, 'brew').waitFor();
  check(
    '…the brew screen too, keeping the mock’s mode',
    page.url().endsWith('#/brew?mock&speed=20&mode=flow-rate') &&
      (await byTestId(page, 'mode-warning').count()) === 1,
    page.url(),
  );
  await page.getByRole('link', { name: 'End session' }).click();
  await openProbe(page);
  await waitForText(page, 'scale-mode', "didn't start the timer");
  check('…and the probe says why', true, await text(page, 'scale-mode'));

  // The scale's name is kept for the next session (T2.30); a blank one gives it its own back.
  await page.goto(`${BASE}#/?mock&speed=20`);
  await page.reload();
  await byTestId(page, 'home').waitFor();
  await button(page, 'Connect scale').click();
  await waitForText(page, 'weight', /\d\.\d/);
  check(
    'the scale’s name is kept after a reload',
    (await text(page, 'scale-name')) === 'Themis',
    await text(page, 'scale-name'),
  );
  await byTestId(page, 'scale-name').click();
  await byTestId(page, 'scale-name-input').fill('');
  await byTestId(page, 'scale-name-input').press('Enter');
  await waitForText(page, 'scale-name', 'BOOKOO mock');
  check('a blank name gives the scale its own back', true);

  check('no page errors', errors.length === 0, errors.join(' | '));
}

await main(run);
