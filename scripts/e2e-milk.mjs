// Smoke test of the milk phase (T2.11) in headless Chromium, with the mock at 5× in a
// phone-sized window. The demo session puts a 110 g cup on at 3 s and pulls a shot at 10 s; the
// cup comes off at 60 s, a 95 g vessel goes on at 75 s and a second pour runs into it at 82 s.
// Learned as an espresso cup (110 g), a milk jug (95 g) and a small jug 2 g heavier, with
// Cappuccino the recipe, the shot's card is open when the jug goes down: the milk opens, the
// jug's card warns of the small jug, the milk ratio is picked in place, the pour counts as milk,
// and Done, tapped as it still pours, gives the card its milk row once the pour settles. It
// serves dist/ under /smart-scale/, as GitHub Pages does.
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

  // The containers, imported: the app's own export with three containers added.
  await page.goto(`${BASE}#/probe?mock`);
  await page.getByRole('button', { name: 'Export all', exact: true }).click();
  const { json } = await download(page, page.getByRole('link', { name: 'Download' }));
  json.entities.containers = [
    container('019a0000-0000-7000-8000-0000000c0f11', 'Espresso cup', 110, ['cup']),
    container('019a0000-0000-7000-8000-0000000c0f12', 'Milk jug', 95, ['milk']),
    container('019a0000-0000-7000-8000-0000000c0f13', 'Small jug', 97, ['milk']),
  ];
  const file = join(OUT, 'milk-containers.json');
  writeFileSync(file, JSON.stringify(json));
  await page.getByLabel('Import an export file').setInputFiles(file);
  await byTestId(page, 'import-result').waitFor();

  // A milk drink: the brew offers the milk.
  await page.goto(`${BASE}#/brew?mock&speed=5`);
  await byTestId(page, 'brew').waitFor();
  await byTestId(page, 'recipe').click();
  await page.getByRole('button', { name: /^Cappuccino/ }).click();
  check(
    'no phase tabs: the milk comes with the jug (D-101)',
    (await byTestId(page, 'phase-stepper').count()) === 0,
  );
  await button(page, 'Connect scale').click();

  // The shot into the espresso cup, then its card.
  await page.waitForFunction(
    () => document.querySelector('[data-testid="vessel-name"]')?.textContent === 'Espresso cup',
  );
  await byTestId(page, 'start').click();
  await waitForScreen(page, 'view', 'card');
  check(
    'the card asks for the jug',
    (await text(page, 'card-title')).includes('Cappuccino') &&
      (await text(page, 'milk-row')).includes('Put the jug down to add the milk'),
    await text(page, 'milk-row'),
  );

  // The jug down with the card open: the milk, and the small jug's warning.
  await waitForScreen(page, 'view', 'milk');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="vessel-name"]')?.textContent === 'Milk jug',
  );
  check(
    'the jug opens the milk, with the warning of the jug 2 g heavier',
    (await text(page, 'vessel-near')).includes('Close to Small jug (97.0 g)') &&
      (await text(page, 'not-this')) === 'Not the jug?',
    await text(page, 'vessel'),
  );
  check(
    'the milk ratio is the drink’s',
    (await text(page, 'pick-milk')).includes('Cappuccino · milk 1:3'),
    await text(page, 'pick-milk'),
  );

  // Another milk drink, in place: the default, and the card's shot's.
  await byTestId(page, 'pick-milk').click();
  await page.getByRole('button', { name: /^Flat white/ }).click();
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="pick-milk"]')?.textContent?.includes('Flat white'),
  );
  check(
    'another milk drink picked is the milk ratio, and the default',
    (await text(page, 'pick-milk')).includes('Flat white · milk 1:4') &&
      (await text(page, 'pick-milk')).includes('was Cappuccino · milk 1:3 · now the default') &&
      (await page.getByText('× 4', { exact: false }).count()) === 1,
    await text(page, 'pick-milk'),
  );

  // "Not the jug?" picks the small jug for what is on the scale; the warning goes.
  await byTestId(page, 'not-this').click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="vessel-name"]')?.textContent === 'Small jug',
  );
  check('“Not the jug?” picks the other', (await byTestId(page, 'vessel-near').count()) === 0);

  // The pour into it is the milk, in whole grams.
  await page.waitForFunction(
    () => Number(document.querySelector('[data-testid="milk"]')?.textContent) > 20,
    null,
    { timeout: 30_000 },
  );
  check('the milk counts what pours into the jug', true, await text(page, 'milk'));
  check(
    'the milk is in whole grams',
    /^\d+$/.test(await text(page, 'milk')),
    await text(page, 'milk'),
  );

  // No Done (T2.26): the jug lifted with its milk (150 s of the demo) brings the card back, its
  // milk row and the new drink. The analysis reads the jug until it was lifted.
  check(
    'the milk has no Done, only a quiet Not now',
    (await byTestId(page, 'milk-done').count()) === 0,
  );
  await waitForScreen(page, 'view', 'card', 120_000);
  await page.waitForFunction(
    () => document.querySelector('[data-testid="milk-row"]')?.dataset.state === 'done',
  );
  check(
    'lifting the jug brings the card back with the milk row, and the new drink',
    (await text(page, 'card-title')).includes('Flat white'),
    `${await text(page, 'card-title')} | ${await text(page, 'milk-row')}`,
  );
  await byTestId(page, 'milk-value').waitFor({ timeout: 40_000 });
  const milkG = Number(await text(page, 'milk-value'));
  check(
    'the card’s milk is what the analysis read once the pour settled, in whole grams',
    Number.isInteger(milkG) && milkG >= 30 && milkG <= 40,
    await text(page, 'milk-row'),
  );
  await byTestId(page, 'save').click();
  await waitForScreen(page, 'view', 'ready');

  // The stored shot: the drink, its milk ratio, the milk done.
  await page.goto(`${BASE}#/probe?mock`);
  await page.getByRole('button', { name: 'Export all', exact: true }).click();
  const all = await download(page, page.getByRole('link', { name: 'Download' }));
  const [shot] = all.json.shots;
  check(
    'one shot, storing the drink picked in place and the milk done',
    all.json.shots.length === 1 &&
      shot.recipeName === 'Flat white' &&
      shot.milkRatio === 4 &&
      shot.milkPhase === 'done',
    JSON.stringify(
      all.json.shots.map(({ recipeName, milkRatio, milkPhase }) => ({
        recipeName,
        milkRatio,
        milkPhase,
      })),
    ),
  );

  check('no page errors', errors.length === 0, errors.join(' | '));
}

await main(run);
