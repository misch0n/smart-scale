// Smoke test of the brew's phases (T2.5) in headless Chromium, with the mock at 5× in a
// phone-sized window. The demo session puts a 110 g cup on at 3 s, pulls a shot at 10 s, lifts
// it at 60 s, puts a 95 g vessel on at 75 s and pours a second shot into it at 82 s. Learned as
// containers (an espresso cup of 110 g, a bean cup of 95 g, imported on the probe), the first
// opens the extraction, its shot records the beans and grind skipped, and after Save the second
// opens the beans, counting what pours into it. The first shot graded sour, the next brew's
// beans and grind have the taste nudge (T2.12), until it is dismissed. It serves dist/ under
// /smart-scale/, as GitHub Pages does.
//
// Run: npm run e2e (builds first). It needs Playwright and Chromium, which the agent environment
// has installed globally; it isn't part of `npm run check` or CI.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, button, byTestId, check, download, main, OUT, text, watch } from './e2e-lib.mjs';

/** Waits until the brew screen's `data-<name>` is `value`. */
async function waitForScreen(page, name, value, timeout = 60_000) {
  await page.waitForFunction(
    ([name, value]) => document.querySelector('[data-testid="brew"]')?.dataset[name] === value,
    [name, value],
    { timeout },
  );
}

/** A container record, as an export holds it. */
function container(id, name, emptyMassG, roles) {
  const at = Date.UTC(2026, 9, 5, 7);
  return {
    id,
    createdAtEpochMs: at,
    updatedAtEpochMs: at,
    removedAtEpochMs: null,
    name,
    emptyMassG,
    roles,
    dismissedWarningIds: [],
  };
}

async function run(browser) {
  const errors = [];
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  watch(page, errors);

  // The containers, imported: the app's own export with two containers added.
  await page.goto(`${BASE}#/probe?mock`);
  await page.getByRole('button', { name: 'Export all', exact: true }).click();
  const { json } = await download(page, page.getByRole('link', { name: 'Download' }));
  json.entities.containers = [
    container('019a0000-0000-7000-8000-0000000c0f01', 'Espresso cup', 110, ['cup']),
    container('019a0000-0000-7000-8000-0000000c0f02', 'Dosing cup', 95, ['bean', 'grind']),
  ];
  // A second basket, and an unopened pack (T2.6, T2.2).
  const [machine] = json.entities.machines;
  machine.baskets.push({
    id: '019a0000-0000-7000-8000-0000000ba5e2',
    name: 'Stock double',
    sizeG: 18,
  });
  machine.updatedAtEpochMs += 1;
  const at = Date.UTC(2026, 9, 5, 7);
  json.entities.packs = [
    {
      id: '019a0000-0000-7000-8000-0000000fac01',
      createdAtEpochMs: at,
      updatedAtEpochMs: at,
      removedAtEpochMs: null,
      brand: 'Local roaster',
      name: 'Kenya Nyeri · Washed',
      weightG: 250,
      roastDate: '2026-09-30',
      openDate: null,
      flavours: [],
      finishedDate: null,
      buyAgain: null,
    },
  ];
  const file = join(OUT, 'containers.json');
  writeFileSync(file, JSON.stringify(json));
  await page.getByLabel('Import an export file').setInputFiles(file);
  await byTestId(page, 'import-result').waitFor();

  // A bean cup is learned, so the brew starts on the beans.
  await page.goto(`${BASE}#/brew?mock&speed=5`);
  await byTestId(page, 'brew').waitFor();
  check(
    'with a bean cup learned, the brew starts on the beans',
    (await byTestId(page, 'brew').getAttribute('data-brew-phase')) === 'beans' &&
      (await byTestId(page, 'step-beans').getAttribute('aria-current')) === 'step',
  );

  // The beans' equipment in place (T2.6): another basket moves the target.
  check(
    'the beans phase has the machine, the basket and the pack, the target the basket',
    (await text(page, 'pick-machine')).includes('Gaggia Classic Pro') &&
      (await text(page, 'pick-basket')).includes('LM 17 g') &&
      (await text(page, 'pick-pack')).includes('None') &&
      (await page.getByText('target 17.0 g').count()) === 1,
  );
  await byTestId(page, 'pick-basket').click();
  await button(page, 'Stock double 18.0 g').click();
  await page.getByText('target 18.0 g').waitFor();
  check(
    'a basket picked is the target, and the default',
    (await text(page, 'pick-basket')).includes('was LM 17 g · now the default'),
    await text(page, 'pick-basket'),
  );
  // An unopened pack picked is opened, and in use; it can be finished from here.
  await byTestId(page, 'pick-pack').click();
  await page.getByRole('button', { name: /Kenya Nyeri/ }).click();
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="pick-pack"]')?.textContent?.includes('Kenya Nyeri ·'),
  );
  check('a pack picked is in use', true, await text(page, 'pick-pack'));
  await byTestId(page, 'pick-pack').click();
  await byTestId(page, 'finish-pack-here').click();
  await button(byTestId(page, 'finish-panel'), 'Would buy again').click();
  await byTestId(page, 'finish-pack').click();
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="pick-pack"]')?.textContent?.includes('None'),
  );
  check('a pack finished here leaves none in use', true);
  // Back to the stock basket for the rest.
  await byTestId(page, 'pick-basket').click();
  await button(page, 'LM 17 g 17.0 g').click();

  // The grind's grinder and setting in place (T2.7, T2.3): a step is the grinder's setting.
  await byTestId(page, 'step-grind').click();
  await byTestId(page, 'grind-equipment').waitFor();
  await button(page, 'Increase grind setting').click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="grind-setting"]')?.textContent === '5.0',
  );
  check(
    'the grind phase has the grinder, and a step sets its setting',
    (await text(page, 'pick-grinder')).includes('ORO Mignon Single Dose Pro') &&
      (await text(page, 'grind-equipment')).includes('was not set · now the default'),
    await text(page, 'grind-equipment'),
  );
  await byTestId(page, 'pick-grinder').click();
  await page.getByRole('button', { name: /C40 MK4 Red Clix/ }).click();
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="pick-grinder"]')?.textContent?.includes('C40'),
  );
  check(
    'another grinder picked is the default, its setting in whole clicks',
    (await text(page, 'pick-grinder')).includes('was ORO Mignon Single Dose Pro'),
    await text(page, 'pick-grinder'),
  );
  await byTestId(page, 'step-beans').click();
  await button(page, 'Connect scale').click();

  // The 110 g cup is the espresso cup: the extraction, the beans and the grind skipped.
  await waitForScreen(page, 'brewPhase', 'extraction');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="vessel"]')?.getAttribute('data-state') === 'known',
  );
  check(
    'the cup opens the extraction, recognised',
    (await text(page, 'vessel-name')) === 'Espresso cup' &&
      (await byTestId(page, 'step-beans').getAttribute('data-status')) === 'skipped',
    await text(page, 'vessel'),
  );
  await byTestId(page, 'start').click();
  await waitForScreen(page, 'view', 'card');
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="extraction-row"]')?.textContent?.includes('g in'),
  );
  check(
    'its card has the beans and the grind skipped',
    (await text(page, 'beans-row')).includes('Skipped') &&
      (await text(page, 'grind-row')).includes('Skipped'),
  );
  // Graded sour, for the next brew's nudge (T2.12).
  await button(page, 'Sour').click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="brew"] .d-sour')?.getAttribute('aria-pressed') ===
      'true',
  );
  await byTestId(page, 'save').click();

  // The next brew: the 95 g vessel is the bean cup, and what pours into it is beans.
  // The cup of the shot just saved stays on until it is lifted, no part of the new brew.
  await waitForScreen(page, 'view', 'beans');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="vessel-name"]')?.textContent === 'Dosing cup',
    null,
    { timeout: 30_000 },
  );
  check(
    'the bean cup opens the beans',
    (await text(page, 'vessel-name')) === 'Dosing cup',
    await text(page, 'vessel'),
  );
  await page.waitForFunction(
    () => Number(document.querySelector('[data-testid="beans"]')?.textContent) > 5,
    null,
    { timeout: 30_000 },
  );
  check('the beans count what pours into it', true, await text(page, 'beans'));

  // The taste nudge (T2.12): the shot just saved was sour, with the same machine, grinder and
  // pack (none), so the next brew's beans and grind say to grind finer, until it is dismissed.
  await byTestId(page, 'nudge').waitFor();
  check(
    'after a sour shot, the beans say to grind finer',
    (await text(page, 'nudge-text')) ===
      'Last time it was sour: grind a little finer for a more balanced cup.',
    await text(page, 'nudge'),
  );
  await byTestId(page, 'step-grind').click();
  await byTestId(page, 'grind-equipment').waitFor();
  await byTestId(page, 'nudge').waitFor();
  check('and so does the grind', true);
  await byTestId(page, 'nudge-dismiss').click();
  await byTestId(page, 'nudge').waitFor({ state: 'detached' });
  check('✕ dismisses it', true);
  await page.reload();
  await byTestId(page, 'brew').waitFor();
  await byTestId(page, 'beans-equipment').waitFor();
  // Long enough for the history to load, which brings a nudge not dismissed.
  await page.waitForTimeout(2000);
  check('dismissed, it stays away after a reload', (await byTestId(page, 'nudge').count()) === 0);

  check('no page errors', errors.length === 0, errors.join(' | '));
}

await main(run);
