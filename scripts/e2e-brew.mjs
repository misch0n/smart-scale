// Smoke test of the brew flow (T1.18) in headless Chromium, with the mock transport at 10× and a
// phone-sized window: the one-tap connect, the cup's tare, the dose, the Tare + start tap, the
// live view, "shot done" and the shot card with its analysis, the grades and Save, and that the
// last-used values persist. The export then shows what the flow recorded: the commands it sent
// (D-066), the tap, the live shot with its grades and context (format version 3), and the
// settings. It serves dist/ under /smart-scale/, as GitHub Pages does.
//
// Run: npm run e2e (builds first). It needs Playwright and Chromium, which the agent environment
// has installed globally; it isn't part of `npm run check` or CI.

import { BASE, byTestId, check, download, main, text, waitForText, watch } from './e2e-lib.mjs';

/** Waits until the brew screen's `data-<name>` is `value`. */
async function waitForScreen(page, name, value, timeout = 30_000) {
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
    acceptDownloads: true,
  });
  const page = await context.newPage();
  watch(page, errors);

  // The demo session (src/core/sim): a 110 g cup at 3 s, the pump at 10 s, its first drip at
  // 16 s, the pump off at 38 s. At 10× that is 0.3, 1.0, 1.6 and 3.8 s after the connect.
  await page.goto(`${BASE}#/brew?mock&speed=10`);
  await byTestId(page, 'brew').waitFor();
  check(
    '#/brew shows the brew flow',
    (await byTestId(page, 'brew').getAttribute('data-view')) === 'ready',
  );
  check(
    'the scale is not connected yet',
    (await text(page, 'scale-status')).includes('Not connected'),
  );
  check('Start waits for the scale', await byTestId(page, 'start').isDisabled());
  check('the target is the dose × the ratio: 18.0 × 2', (await text(page, 'target')) === '36.0');

  // The dose, in place: + steps 0.1 g, and the target follows.
  await byTestId(page, 'dose').click();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await waitForText(page, 'dose-value', '18.1');
  check('the dose steps by 0.1 g, and the target follows', (await text(page, 'target')) === '36.2');
  await byTestId(page, 'dose').click();

  // One tap connects; the cup goes on and is tared.
  await page.getByRole('button', { name: 'Connect scale', exact: true }).click();
  await waitForScreen(page, 'phase', 'ready');
  check(
    'the cup is seen and tared',
    (await text(page, 'cup')).includes('on the scale'),
    await text(page, 'cup'),
  );
  check('the scale shows its battery', /Scale · \d+%/.test(await text(page, 'scale-status')));

  // The Tare + start tap, before the pump; the live view follows the shot.
  await byTestId(page, 'start').click();
  await waitForScreen(page, 'view', 'live');
  check('the tap opens the live view', true);
  await page.waitForFunction(() =>
    /^\d+\.\d$/.test(document.querySelector('[data-testid="time"]')?.textContent ?? ''),
  );
  check('the live view counts the time from the tap', true, await text(page, 'time'));
  await page.waitForFunction(() =>
    ['pouring', 'reached', 'over'].includes(
      document.querySelector('[data-testid="readout"]')?.dataset.state,
    ),
  );
  check(
    'the live view shows the remaining to target',
    /\d/.test(await text(page, 'remaining')),
    await text(page, 'remaining'),
  );

  // "Shot done": the shot card, with the analysis's results.
  await waitForScreen(page, 'view', 'card');
  check(
    '"shot done" opens the shot card',
    (await text(page, 'card-title')).includes('Espresso'),
    await text(page, 'card-title'),
  );
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="extraction-row"]')?.textContent?.includes('g in'),
  );
  const row = await text(page, 'extraction-row');
  check(
    'the card shows the yield, the time and the ratio against the target',
    /1:2\.\d\d/.test(row) && row.includes('target 36.2'),
    row,
  );
  check(
    'the card shows the first drip',
    /^\d+\.\d$/.test(await text(page, 'result-first-drip')),
    await text(page, 'result-first-drip'),
  );
  check(
    'the card shows the average flow',
    /^\d\.\d\d$/.test(await text(page, 'result-flow')),
    await text(page, 'result-flow'),
  );

  // The grades: one tap for the taste, a tag on, a tag added; then Save.
  await page.getByRole('button', { name: 'Balanced', exact: true }).click();
  await page.getByRole('button', { name: 'RDT', exact: true }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByLabel('New tag').fill('Bottomless');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  // The screen redraws at most every 100 ms: wait for it.
  const pressed = (name) =>
    page.waitForFunction(
      (name) =>
        [...document.querySelectorAll('button[aria-pressed="true"]')].some(
          (b) => b.textContent.trim() === name,
        ),
      name,
    );
  await Promise.all(['Balanced', 'RDT', 'Bottomless', 'WDT', 'Puck screen'].map(pressed));
  check('the taste and the tags are on, the default tags too', true);
  await byTestId(page, 'save').click();
  await waitForScreen(page, 'view', 'ready');
  check('Save closes the card', true);

  // The last-used dose stays after a reload.
  await page.reload();
  await byTestId(page, 'brew').waitFor();
  check(
    'the dose is kept as the default',
    (await text(page, 'dose')) === '18.1',
    await text(page, 'dose'),
  );

  // The export shows what the flow recorded.
  await page.goto(`${BASE}#/probe?mock&speed=10`);
  await page.getByRole('button', { name: 'Export all', exact: true }).click();
  await waitForText(page, 'export-ready', '_all.json');
  const all = await download(page, page.getByRole('link', { name: 'Download' }));
  check('the export is format version 3', all.json.formatVersion === 3);
  const live = all.json.shots.find((shot) => shot.source === 'live');
  check(
    'the live shot carries its grades and what the brew used',
    live?.direction === 'balanced' &&
      live.channelled === false &&
      JSON.stringify(live.tags) === JSON.stringify(['WDT', 'Puck screen', 'RDT', 'Bottomless']) &&
      live.doseG === 18.1 &&
      live.targetRatio === 2 &&
      live.recipeName === 'Espresso' &&
      live.milkRatio === null &&
      live.packId === null &&
      live.beansPhase === null,
    JSON.stringify(live),
  );
  const entry = all.json.recordings.find((r) => r.recording.id === live?.recordingId);
  const sent = (entry?.events ?? []).flatMap((e) =>
    e.type === 'command-sent'
      ? [`${e.data.command} ${e.data.reason}`]
      : e.type === 'ui-action'
        ? [`ui ${e.data.action}`]
        : [],
  );
  for (const expected of [
    'stopTimer auto-tare',
    'resetTimer auto-tare',
    'tare auto-tare',
    'ui manual-start',
    'tareAndStartTimer manual-start',
    'stopTimer shot-done',
  ]) {
    check(`the recording has "${expected}"`, sent.includes(expected));
  }
  const anchor = live?.anchorTMs ?? 0;
  const tap = (entry?.events ?? []).find(
    (e) => e.type === 'ui-action' && e.data.action === 'manual-start',
  );
  check(
    'the live shot is anchored after the tap, inside its shot',
    tap !== undefined && anchor > tap.tMs + 20_000,
    `${tap?.tMs} → ${anchor}`,
  );
  check(
    'the settings keep the dose and the tag list',
    all.json.settings['lastUsed.doseG'] === 18.1 &&
      all.json.settings.tags.some((tag) => tag.name === 'Bottomless' && tag.isDefault === false),
    JSON.stringify(all.json.settings),
  );

  check('no page errors', errors.length === 0, errors.join(' | '));
}

await main(run);
