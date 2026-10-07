// Smoke test of the brew flow (T1.18) in headless Chromium, with the mock transport at 10× and a
// phone-sized window: the phase stepper on the extraction (no containers learned, T2.5), the
// target from the basket, the one-tap connect, the cup's tare, the Tare + start tap, the live
// view, "shot done" and the shot card with its phases and its analysis, the grades and Save. The
// export then shows what the flow recorded: the commands it sent (D-066), the tap and the phases
// it logged, the live shot with its grades, the phases skipped and the context from the
// entities (T2.1; format version 5), and the tag list; a Start with no shot then ✕ resets the
// scale (T2.15); History lists the shot (T1.19). It serves
// dist/ under /smart-scale/, as GitHub Pages does.
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
  // No container learned: the brew starts on the extraction (T2.5).
  check(
    'the brew is on the extraction, with no phase tabs (D-101)',
    (await byTestId(page, 'brew').getAttribute('data-brew-phase')) === 'extraction' &&
      (await byTestId(page, 'phase-stepper').count()) === 0,
  );
  check(
    "the target is the basket's dose × the ratio: 17.0 × 2",
    (await text(page, 'target')) === '34.0' && (await text(page, 'dose-source')).includes('basket'),
    `${await text(page, 'target')} ${await text(page, 'dose-source')}`,
  );

  // One tap connects; the cup goes on and is tared.
  await page.getByRole('button', { name: 'Connect scale', exact: true }).click();
  await waitForScreen(page, 'phase', 'ready');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="vessel"]')?.getAttribute('data-state') !== 'none',
  );
  check(
    'the cup is seen, weighed and tared',
    (await text(page, 'vessel')).includes('110.0'),
    await text(page, 'vessel'),
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
    /1:2\.\d\d/.test(row) && row.includes('target 34.0'),
    row,
  );
  check(
    'the card shows the beans skipped, and no grind (D-101)',
    (await text(page, 'beans-row')).includes('Skipped') &&
      (await byTestId(page, 'grind-row').count()) === 0 &&
      (await byTestId(page, 'milk-row').count()) === 0,
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

  // A Start with no shot, then ✕ (T2.15): the brew ends, and the scale is reset.
  await byTestId(page, 'start').click();
  await waitForScreen(page, 'view', 'live');
  await page.getByRole('link', { name: 'End session' }).click();
  await byTestId(page, 'home').waitFor();
  check('✕ ends the brew and goes Home', page.url().endsWith('#/?mock&speed=10'), page.url());

  // The export shows what the flow recorded.
  await page.goto(`${BASE}#/probe?mock&speed=10`);
  await page.getByRole('button', { name: 'Export all', exact: true }).click();
  await waitForText(page, 'export-ready', '_all.json');
  const all = await download(page, page.getByRole('link', { name: 'Download' }));
  check('the export is format version 5', all.json.formatVersion === 5);
  const live = all.json.shots.find((shot) => shot.source === 'live');
  check(
    'the live shot carries its grades and what the brew used',
    live?.direction === 'balanced' &&
      live.channelled === false &&
      JSON.stringify(live.tags) === JSON.stringify(['WDT', 'Puck screen', 'RDT', 'Bottomless']) &&
      // The dose is the analysis's (T2.5): the basket's here.
      live.doseG === null &&
      live.targetRatio === 2 &&
      live.recipeName === 'Espresso' &&
      live.milkRatio === null &&
      live.packId === null &&
      live.beansPhase === 'skipped' &&
      live.grindPhase === null &&
      live.milkPhase === null,
    JSON.stringify(live),
  );
  // The seeded entities (T2.1): the shot names them by id, next to their values.
  const espresso = all.json.entities.recipes.find((recipe) => recipe.name === 'Espresso');
  const gaggia = all.json.entities.machines[0];
  check(
    'the live shot names the recipe, machine, basket and grinder it used',
    live?.recipeId === espresso?.id &&
      live.machineId === gaggia?.id &&
      live.machineName === 'Gaggia Classic Pro' &&
      live.basketSizeG === 17 &&
      live.grinderName === 'Eureka ORO Mignon Single Dose Pro',
    JSON.stringify(live),
  );
  const entry = all.json.recordings.find((r) => r.recording.id === live?.recordingId);
  const sent = (entry?.events ?? []).flatMap((e) =>
    e.type === 'command-sent'
      ? [`${e.data.command} ${e.data.reason}`]
      : e.type === 'ui-action'
        ? [
            e.data.action === 'phase'
              ? `phase ${e.data.detail.phase} ${e.data.detail.state} ${e.data.detail.by}`
              : `ui ${e.data.action}`,
          ]
        : [],
  );
  for (const expected of [
    // The mode check on connect, which finds the timer mode (T1.25).
    'startTimer mode-check',
    'stopTimer mode-check',
    'resetTimer mode-check',
    'stopTimer auto-tare',
    'resetTimer auto-tare',
    'tare auto-tare',
    'ui manual-start',
    'tareAndStartTimer manual-start',
    'stopTimer shot-done',
    // The phases (T2.5): the cup's extraction, the beans skipped, the shot done; no grind.
    'phase beans skipped container',
    'phase extraction open container',
    'phase extraction done shot',
  ]) {
    check(`the recording has "${expected}"`, sent.includes(expected));
  }
  const afterTap = sent.slice(sent.lastIndexOf('ui manual-start'));
  check(
    '✕ after a Start with no shot stops and zeroes the timer, then tares (T2.15)',
    JSON.stringify(afterTap.filter((line) => !line.startsWith('phase '))) ===
      JSON.stringify([
        'ui manual-start',
        'tareAndStartTimer manual-start',
        'stopTimer end-session',
        'resetTimer end-session',
        'tare end-session',
      ]),
    afterTap.join(', '),
  );
  check(
    '…and stores no shot for it',
    all.json.shots.filter((shot) => shot.source === 'live').length === 1,
  );
  // The Connect tap turned the sound levels on (T2.18): the fake microphone's, from the start.
  const types = (entry?.events ?? []).map((e) => e.type);
  check(
    'the brew records the sound levels from the Connect tap (T2.18)',
    sent.includes('ui record-sound') &&
      types.includes('sound-started') &&
      (entry?.frames ?? []).some((row) => row[2] === 'mic'),
    `${types.filter((type) => type.startsWith('sound-')).join(', ')}`,
  );
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
    'the tags keep the added one, off by default',
    all.json.entities.tags.some((tag) => tag.name === 'Bottomless' && tag.isDefault === false),
  );

  // History lists the saved shot with its taste and drink (T1.19). The demo's second shot, made
  // with no brew screen to tap Start, may be there too once its recording ends: post-hoc.
  await page.goto(`${BASE}#/history?mock&speed=10`);
  await byTestId(page, 'history-row').first().waitFor({ timeout: 20_000 });
  const graded = byTestId(page, 'history-row').filter({ hasText: 'Balanced' });
  check(
    'History lists the shot with its taste and drink',
    (await graded.count()) === 1 && /Espresso/.test((await graded.textContent()) ?? ''),
    (await byTestId(page, 'history-row').allTextContents()).join(' | '),
  );
  await graded.click();
  await byTestId(page, 'metrics').waitFor();
  check(
    'its detail shows the yield against the target',
    (await text(page, 'phase-extraction')).includes('target: 17.0 g × 2') &&
      /^\d+\.\d$/.test(await text(page, 'metric-yield')),
    await text(page, 'phase-extraction'),
  );

  check('no page errors', errors.length === 0, errors.join(' | '));
}

await main(run);
