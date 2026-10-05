// Smoke test of Setup and its screens (T2.9) in headless Chromium, in a phone-sized window on UTC
// with the clock at the morning of hardware session 2: Home's backup reminder opening the
// automatic export in Setup; the list with the seeded setup; the machine (name, pressure, a
// second basket made the default), the grinders (a setting, another made the default, one
// added), the recipes (one added, edited and used next), a coffee pack (added, a flavour, opened,
// finished with "would buy again"), the tags (a default switched on, one added, one renamed), a
// container weighed on the mock, which Home then recognises on the scale (T2.4); then Export all, which holds the entities, and the same file
// with a second container 0.6 g heavier imported on the probe: the warning in Needs attention
// and on the containers page, where it is dismissed. Last, a reload keeps everything, and the
// probe and the microphone are rows of Setup. It serves dist/ under /smart-scale/, as GitHub
// Pages does.
//
// Run: npm run e2e (builds first). It needs Playwright and Chromium, which the agent environment
// has installed globally; it isn't part of `npm run check` or CI.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BASE,
  button,
  byTestId,
  check,
  download,
  main,
  OUT,
  text,
  waitForText,
  watch,
} from './e2e-lib.mjs';

/** Setup's row for `section`: its detail line. */
const row = async (page, section) =>
  (await byTestId(page, `setup-${section}`).locator('.setup-row-detail').textContent()) ?? '';

/** Back to Setup from one of its screens. */
async function backToSetup(page) {
  await page.getByRole('link', { name: '‹ Setup', exact: true }).click();
  await byTestId(page, 'setup').waitFor();
}

async function run(browser) {
  const errors = [];
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: 'UTC',
    acceptDownloads: true,
  });
  const page = await context.newPage();
  // Monday 5 October 2026, 08:30.
  await page.clock.install({ time: new Date('2026-10-05T08:30:00Z') });
  watch(page, errors);

  // Home's reminder that nothing is backed up opens the automatic export, now in Setup.
  await page.goto(`${BASE}#/?mock`);
  await byTestId(page, 'backup-reminder').waitFor();
  await byTestId(page, 'backup-reminder').getByRole('link').click();
  await byTestId(page, 'auto-export').getByLabel('Token').waitFor({ state: 'visible' });
  check(
    "Home's backup reminder opens the automatic export in Setup, its settings open",
    page.url().endsWith('#/setup/backup?mock'),
    page.url(),
  );
  await backToSetup(page);

  // The list, with the seeded setup.
  check(
    'Setup lists the seeded machine, grinder, recipes and tags',
    (await row(page, 'machine')).includes('Gaggia Classic Pro · 6.0 bar · 1 basket') &&
      (await row(page, 'grinders')).includes('ORO Mignon Single Dose Pro (default)') &&
      (await row(page, 'recipes')).includes('7 · last: Espresso') &&
      (await row(page, 'tags')).includes('7 · 2 default'),
    [
      await row(page, 'machine'),
      await row(page, 'grinders'),
      await row(page, 'recipes'),
      await row(page, 'tags'),
    ].join(' | '),
  );
  check(
    'no packs or containers yet, and the microphone not ready',
    (await row(page, 'packs')).includes('None yet') &&
      (await row(page, 'containers')).includes('None yet') &&
      (await row(page, 'microphone')).includes('Off · not ready yet'),
  );
  check('nothing needs attention', (await byTestId(page, 'attention').count()) === 0);
  check(
    'the Setup tab is current',
    (await byTestId(page, 'tabbar').locator('[aria-current="page"]').textContent()) === 'Setup',
  );

  // The machine: its name, its pressure, and a second basket made the default.
  await byTestId(page, 'setup-machine').click();
  await byTestId(page, 'setup-machine-screen').waitFor();
  const machineName = page.locator('#m-name');
  await machineName.fill('Gaggia Classic Pro E24');
  await machineName.press('Enter');
  await button(page, 'Increase pressure').click();
  await waitForText(page, 'pressure', '6.5');
  await byTestId(page, 'add-basket').click();
  const basket = byTestId(page, 'basket').nth(1);
  await basket.getByLabel('Name').fill('Stock double');
  await basket.getByLabel('Name').press('Enter');
  await button(basket, 'Increase basket size').click();
  await button(basket, 'Make default').click();
  await basket.getByText('Default', { exact: true }).waitFor();
  check(
    'the new basket is 18.5 g and the default',
    (await basket.textContent()).includes('18.5') &&
      (await byTestId(page, 'basket').nth(0).getByText('Default', { exact: true }).count()) === 0,
    await basket.textContent(),
  );
  await backToSetup(page);
  check(
    "Setup's machine row follows",
    (await row(page, 'machine')).includes('Gaggia Classic Pro E24 · 6.5 bar · 2 baskets'),
    await row(page, 'machine'),
  );

  // The grinders: the default's setting, another made the default, and one added.
  await byTestId(page, 'setup-grinders').click();
  await byTestId(page, 'setup-grinders-screen').waitFor();
  check('the setting starts not set', (await text(page, 'grinder-setting')) === 'Not set');
  await button(page, 'Increase setting').click();
  await waitForText(page, 'grinder-setting', '5.0');
  check('+ sets it from the stepless start', true);
  const c40 = byTestId(page, 'grinder').nth(1);
  await button(c40, 'Make default').click();
  await c40.getByText('Default', { exact: true }).waitFor();
  await byTestId(page, 'add-grinder').click();
  const form = byTestId(page, 'new-grinder');
  await form.getByLabel('Brand').fill('Niche');
  await form.getByLabel('Model').fill('Zero');
  await button(form, 'Add').click();
  await form.waitFor({ state: 'detached' });
  check(
    'a grinder is added',
    (await byTestId(page, 'grinder').count()) === 3 &&
      (await byTestId(page, 'grinder').nth(2).textContent()).includes('Zero'),
  );
  await backToSetup(page);
  check(
    "Setup's grinders row names the new default",
    (await row(page, 'grinders')).includes('C40 MK4 Red Clix (default)'),
    await row(page, 'grinders'),
  );

  // The recipes: a new one, renamed, its ratio stepped, and used next.
  await byTestId(page, 'setup-recipes').click();
  await byTestId(page, 'new-recipe').click();
  const recipe = byTestId(page, 'recipe').nth(7);
  const recipeName = recipe.getByLabel('Name');
  check('the new recipe opens', (await recipeName.inputValue()) === 'New recipe');
  await recipeName.fill('Long black');
  await recipeName.press('Enter');
  for (let i = 0; i < 5; i++) await button(recipe, 'Increase coffee ratio').click();
  await waitForText(page, 'coffee-ratio', '1:2.5');
  await button(recipe, 'Use next').click();
  await recipe.getByText('Last used', { exact: true }).waitFor();
  check('the recipe is 1:2.5 and used next', true);
  await backToSetup(page);
  check(
    "Setup's recipes row follows",
    (await row(page, 'recipes')).includes('8 · last: Long black'),
    await row(page, 'recipes'),
  );

  // A coffee pack: added, a flavour, opened from the list, then finished.
  await byTestId(page, 'setup-packs').click();
  await byTestId(page, 'add-pack').click();
  await byTestId(page, 'setup-pack-screen').waitFor();
  check(
    'Add pack needs a name and a roast date',
    page.url().endsWith('#/setup/pack/new?mock') &&
      (await byTestId(page, 'save-pack').isDisabled()),
    page.url(),
  );
  await page.locator('#pk-brand').fill('Local roaster');
  await page.locator('#pk-name').fill('Ethiopia Guji · Natural');
  await page.locator('#pk-weight').fill('250');
  await page.locator('#pk-roast').fill('2026-09-22');
  await waitForText(page, 'pack-age', 'Day13off roast');
  await byTestId(page, 'save-pack').click();
  await page.waitForURL(/#\/setup\/pack\/[0-9a-f-]{36}\?mock$/);
  await page.getByRole('heading', { name: 'Ethiopia Guji' }).waitFor();
  check('the pack is stored, and its page opens', true, page.url());
  await button(page, '+ Add flavour').click();
  await page.getByLabel('New flavour').fill('Blueberry');
  await page.getByLabel('New flavour').press('Enter');
  await button(page, 'Blueberry').waitFor();
  check(
    'a flavour is added',
    (await button(page, 'Blueberry').getAttribute('aria-pressed')) === 'true',
  );
  await page.getByRole('link', { name: '‹ Coffee packs', exact: true }).click();
  await byTestId(page, 'pack-unopened').waitFor();
  await byTestId(page, 'open-pack').click();
  await byTestId(page, 'pack-open').waitFor();
  check(
    'Open opens it today',
    (await text(page, 'pack-open')).includes('Opened5 Oct'),
    await text(page, 'pack-open'),
  );
  await backToSetup(page);
  check(
    "Setup's packs row names the pack in use and its day",
    (await row(page, 'packs')) === 'Ethiopia Guji · day 13',
    await row(page, 'packs'),
  );
  await byTestId(page, 'setup-packs').click();
  await byTestId(page, 'finish').click();
  await button(byTestId(page, 'finish-panel'), 'Would buy again').click();
  await byTestId(page, 'finish-pack').click();
  await byTestId(page, 'pack-finished').waitFor();
  check(
    'Finish moves it to the finished, would buy again',
    (await text(page, 'pack-finished')).includes('Would buy again') &&
      (await text(page, 'pack-finished')).includes('finished 5 Oct'),
    await text(page, 'pack-finished'),
  );
  await backToSetup(page);

  // The tags: RDT on by default, one added, Experiment renamed.
  await byTestId(page, 'setup-tags').click();
  await button(page, 'Default for new shots: RDT').click();
  await page.getByText('7 tags · 3 default').waitFor();
  await page.getByLabel('New tag').fill('Bottomless');
  await byTestId(page, 'add-tag').click();
  await page.getByText('8 tags · 3 default').waitFor();
  check(
    'a tag is added, off by default',
    (await button(page, 'Default for new shots: Bottomless').getAttribute('aria-pressed')) ===
      'false',
  );
  await page.getByRole('button', { name: 'Experiment', exact: true }).click();
  const tagName = page.getByRole('textbox', { name: 'Name' });
  await tagName.fill('Trial');
  await tagName.press('Enter');
  await page.getByRole('button', { name: 'Trial', exact: true }).waitFor();
  check(
    'a tag is renamed',
    (await page.getByRole('button', { name: 'Experiment', exact: true }).count()) === 0,
  );
  await backToSetup(page);
  check(
    "Setup's tags row follows",
    (await row(page, 'tags')).includes('8 · 3 default'),
    await row(page, 'tags'),
  );

  // A container, weighed on the mock: its demo session puts a 110 g cup on 3 s after connecting.
  await byTestId(page, 'setup-containers').click();
  await page.locator('#c-name').fill('Espresso cup');
  await button(byTestId(page, 'add-container'), 'Connect scale').click();
  await waitForText(page, 'reads', /^1[01]\d\.\d$/);
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="weigh-add"]')?.disabled,
    null,
    { timeout: 10_000 },
  );
  const weighed = await text(page, 'reads');
  await byTestId(page, 'weigh-add').click();
  await byTestId(page, 'container').waitFor();
  check(
    'Weigh & add stores the still reading',
    (await text(page, 'container')).includes('Espresso cup') &&
      (await text(page, 'container')).includes(weighed) &&
      (await text(page, 'container')).includes('Cup'),
    `${await text(page, 'container')} (read ${weighed})`,
  );
  const cupG = Number(weighed);

  // Home recognises the cup still on the scale, now that it is learned (T2.4).
  await byTestId(page, 'tab-home').click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="container-row"]')?.getAttribute('data-state') ===
      'known',
  );
  check(
    "Home's scale card names the container on the scale",
    (await text(page, 'container-name')) === 'Espresso cup' &&
      (await text(page, 'container-row')).includes('Recognised · Cup'),
    await text(page, 'container-row'),
  );
  await byTestId(page, 'tab-setup').click();
  await byTestId(page, 'setup').waitFor();
  check(
    "Setup's containers row counts it",
    (await row(page, 'containers')) === '1',
    await row(page, 'containers'),
  );

  // Export all holds the entities.
  await byTestId(page, 'export-all').click();
  await byTestId(page, 'export-all-ready').waitFor();
  const { json } = await download(
    page,
    byTestId(page, 'export-all-ready').getByRole('link', { name: 'Download' }),
  );
  const entities = json.entities;
  check(
    'Export all holds the setup',
    json.formatVersion === 4 &&
      entities.machines.some(
        (m) => m.name === 'Gaggia Classic Pro E24' && m.baskets.length === 2,
      ) &&
      entities.grinders.length === 3 &&
      entities.recipes.some((r) => r.name === 'Long black' && r.coffeeRatio === 2.5) &&
      entities.packs.some((p) => p.buyAgain === true && p.flavours.includes('Blueberry')) &&
      entities.containers.length === 1 &&
      entities.tags.some((t) => t.name === 'Trial'),
    JSON.stringify(Object.fromEntries(Object.entries(entities).map(([k, v]) => [k, v.length]))),
  );

  // The same file with a second container 0.6 g heavier, imported on the probe.
  const [cup] = entities.containers;
  const tumbler = {
    ...cup,
    id: '019a0000-0000-7000-8000-00000000c0de',
    name: 'Glass tumbler',
    emptyMassG: Math.round((cupG + 0.6) * 10) / 10,
  };
  const file = join(OUT, 'with-tumbler.json');
  writeFileSync(
    file,
    JSON.stringify({ ...json, entities: { ...entities, containers: [cup, tumbler] } }),
  );
  await byTestId(page, 'setup-probe').click();
  await page.getByRole('heading', { name: 'Probe', exact: true }).waitFor();
  await page.getByLabel('Import an export file').setInputFiles(file);
  await byTestId(page, 'import-result').waitFor();
  check('the file imports', true, await text(page, 'import-result'));
  await page.getByRole('link', { name: '‹ Setup', exact: true }).click();
  await byTestId(page, 'attention').waitFor();
  check(
    'Needs attention names the two, one warning',
    (await text(page, 'attention')).includes('Espresso cup and Glass tumbler') &&
      (await text(page, 'attention')).includes('1 warning') &&
      (await row(page, 'containers')).includes('2 · 1 warning'),
    `${await text(page, 'attention')} | ${await row(page, 'containers')}`,
  );
  await byTestId(page, 'attention').click();
  await byTestId(page, 'clash').waitFor();
  check(
    'the containers page warns of the pair',
    (await text(page, 'clash')).includes('A wet Espresso cup may read as Glass tumbler'),
    await text(page, 'clash'),
  );
  await byTestId(page, 'dismiss').click();
  await byTestId(page, 'clash').waitFor({ state: 'detached' });
  await page.getByText('1 warning dismissed').waitFor();
  check('Dismiss puts the warning away', true);
  await backToSetup(page);
  check(
    'nothing needs attention any more',
    (await byTestId(page, 'attention').count()) === 0 && (await row(page, 'containers')) === '2',
    await row(page, 'containers'),
  );

  // A reload keeps it all.
  await page.waitForTimeout(500);
  await page.reload();
  await byTestId(page, 'setup').waitFor();
  check(
    'after a reload, Setup holds the changes',
    (await row(page, 'machine')).includes('Gaggia Classic Pro E24 · 6.5 bar · 2 baskets') &&
      (await row(page, 'grinders')).includes('C40 MK4 Red Clix (default)') &&
      (await row(page, 'recipes')).includes('8 · last: Long black') &&
      (await row(page, 'tags')).includes('8 · 3 default') &&
      (await row(page, 'containers')) === '2',
    [
      await row(page, 'machine'),
      await row(page, 'grinders'),
      await row(page, 'recipes'),
      await row(page, 'tags'),
      await row(page, 'containers'),
    ].join(' | '),
  );

  // The microphone waits for T3.1; the probe is a row with its way back.
  await byTestId(page, 'setup-microphone').click();
  check(
    'the microphone switch is off and disabled',
    await button(page, 'Listen for the pump and the grinder').isDisabled(),
  );
  await backToSetup(page);
  await byTestId(page, 'setup-probe').click();
  await page.getByRole('heading', { name: 'Probe', exact: true }).waitFor();
  check('the probe opens from Setup', page.url().endsWith('#/probe?mock'), page.url());
  await backToSetup(page);

  check('no page errors', errors.length === 0, errors.join(' | '));
}

await main(run);
