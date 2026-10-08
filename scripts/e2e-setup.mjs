// Smoke test of Setup and its screens (T2.9) in headless Chromium, in a phone-sized window on UTC
// with the clock at the morning of hardware session 2: Home's backup reminder opening the
// automatic export in Setup; the list with the seeded setup; the machine (name, pressure, a
// second basket made the default), the grinders (a setting, a step of 0.05, another made the
// default, one added), the recipes (one added, edited and used next), a coffee pack (added, a
// flavour, opened, finished with "would buy again"), the tags (a default switched on, one added,
// one renamed), a container weighed on the mock, which Home then recognises on the scale (T2.4);
// then Export all, which holds the entities, and the same file
// with a second container 0.6 g heavier imported on the probe: the warning in Needs attention
// and on the containers page, where it is dismissed. The maintenance dates (T2.10): done today,
// dated back with a reminder, due in Needs attention and on Home, coming up only in Setup.
// Last, a reload keeps everything, and the probe and the microphone are rows of Setup. It
// serves dist/ under /smart-scale/, as GitHub Pages does.
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
    'no packs or containers yet, and the microphone not ready, sound with every brew',
    (await row(page, 'packs')).includes('None yet') &&
      (await row(page, 'containers')).includes('None yet') &&
      (await row(page, 'microphone')).includes('Sound with every brew · listening not ready'),
    await row(page, 'microphone'),
  );
  check(
    'nothing needs attention, no maintenance reminders, and no maintenance row (T2.32)',
    (await byTestId(page, 'attention').count()) === 0 &&
      (await byTestId(page, 'maint-row').count()) === 0 &&
      (await byTestId(page, 'setup-maintenance').count()) === 0,
  );
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

  // Its maintenance (T2.10): the descale done today, its next picked, then dated back, so due;
  // the backflush coming up by its default.
  const descale = byTestId(page, 'maint-descale');
  check(
    'the descale starts not logged',
    (await descale.textContent()).includes('Not logged'),
    await descale.textContent(),
  );
  await button(descale, 'Done today').click();
  await waitForText(page, 'maint-descale', 'Last 5 Oct');
  check('Done today stamps today', await button(descale, 'Done today').isDisabled());
  // The reminder is beside the type (T2.32): the kind's default until another date is picked
  // (T2.33): every 60 days for the descale, so next 4 Dec; the next picked 30 days out.
  check(
    'the descale reminds every 60 days by default, counted from the last',
    (await text(descale, 'maint-remind')) === 'Every 60 days · default' &&
      (await text(descale, 'maint-next')) === 'Next 4 Dec',
    `${await text(descale, 'maint-remind')} | ${await text(descale, 'maint-next')}`,
  );
  await byTestId(descale, 'maint-next').click();
  await descale.getByLabel('Next').fill('2026-11-04');
  await waitForText(page, 'maint-descale', 'Next 4 Nov');
  check(
    'a date picked for the next sets the reminder: every 30 days, no longer the default',
    (await text(descale, 'maint-remind')) === 'Every 30 days' &&
      (await byTestId(descale, 'maint-default').count()) === 1,
    await text(descale, 'maint-remind'),
  );
  await byTestId(descale, 'maint-dates').click();
  await descale.getByLabel('Last done').fill('2026-09-01');
  await waitForText(page, 'maint-descale', '4 days overdue');
  check(
    'dated back past its reminder, the descale is overdue',
    (await text(descale, 'maint-badge')) === '4 days overdue' &&
      (await descale.textContent()).includes('Last 1 Sep'),
    await descale.textContent(),
  );
  // The backflush: its default, every 14 days, from 24 Sep.
  const backflush = byTestId(page, 'maint-backflush');
  await byTestId(backflush, 'maint-dates').click();
  await backflush.getByLabel('Last done').fill('2026-09-24');
  await waitForText(page, 'maint-backflush', 'in 3 days');
  check(
    'a backflush last done 24 Sep, every 14 days by default, comes up in 3 days',
    (await text(backflush, 'maint-remind')) === 'Every 14 days · default' &&
      (await text(backflush, 'maint-next')) === 'Next 8 Oct',
    await backflush.textContent(),
  );
  await backToSetup(page);
  check(
    "Setup's machine row follows",
    (await row(page, 'machine')).includes('Gaggia Classic Pro E24 · 6.5 bar · 2 baskets'),
    await row(page, 'machine'),
  );
  const reminders = byTestId(page, 'maint-row');
  check(
    'Needs attention has the descale overdue, then the backflush coming up',
    (await reminders.count()) === 2 &&
      (await reminders.nth(0).textContent()).includes('Descale · Gaggia Classic Pro E24') &&
      (await reminders.nth(0).textContent()).includes('4 days overdue') &&
      (await reminders.nth(1).textContent()).includes('Backflush') &&
      (await reminders.nth(1).textContent()).includes('in 3 days'),
    (await reminders.allTextContents()).join(' | '),
  );
  check(
    'Setup has no maintenance row: the dates are with the machine and the grinders (T2.32)',
    (await byTestId(page, 'setup-maintenance').count()) === 0,
  );

  // Home shows only what is due, and its row opens the machine.
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await byTestId(page, 'maintenance').waitFor();
  check(
    'Home has the descale due, not the backflush to come',
    (await byTestId(page, 'maintenance').getByTestId('maint-row').count()) === 1 &&
      (await text(page, 'maintenance')).includes('Descale') &&
      (await text(page, 'maintenance')).includes('4 days overdue') &&
      !(await text(page, 'maintenance')).includes('Gaggia'),
    await text(page, 'maintenance'),
  );
  await byTestId(page, 'maint-row').click();
  await byTestId(page, 'setup-machine-screen').waitFor();
  check("Home's reminder opens the machine", page.url().endsWith('#/setup/machine?mock'));
  await backToSetup(page);

  // The grinders: the default's setting, another made the default, and one added.
  await byTestId(page, 'setup-grinders').click();
  await byTestId(page, 'setup-grinders-screen').waitFor();
  check('the setting starts not set', (await text(page, 'grinder-setting')) === 'Not set');
  await button(page, 'Increase setting').click();
  await waitForText(page, 'grinder-setting', '5.0');
  check('+ sets it from the stepless start', true);
  // Its step (T2.28): 0.05 marks between the dial's marks; − and + move by it.
  const oro = byTestId(page, 'grinder').first();
  check(
    'a stepless grinder steps by 0.1 until its step is set',
    (await oro.locator('[data-testid="grinder-step"] [aria-pressed="true"]').textContent()) ===
      '0.1',
  );
  await button(byTestId(oro, 'grinder-step'), '0.05').click();
  await button(page, 'Increase setting').click();
  await waitForText(page, 'grinder-setting', '5.05');
  await button(page, 'Decrease setting').click();
  await button(page, 'Decrease setting').click();
  await waitForText(page, 'grinder-setting', '4.95');
  check('with a step of 0.05, + and − move the setting by 0.05', true);
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
  // Each grinder has its care, open or not (T2.10).
  const care = byTestId(c40, 'maint-care');
  await button(care, 'Done today').click();
  await care.getByText('Last 5 Oct').waitFor();
  check(
    'grinder care done today, reminded every 30 days by default',
    (await text(care, 'maint-remind')) === 'Every 30 days · default' &&
      (await byTestId(page, 'maint-care').count()) === 3,
    await care.textContent(),
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
  // A scale accessory, like the mat, has no other role (T2.17).
  const roles = byTestId(page, 'add-container').getByRole('group', { name: 'Role' });
  const role = (name) => roles.getByRole('button', { name, exact: true });
  await role('Scale accessory').click();
  check(
    'a scale accessory takes no other role',
    (await role('Scale accessory').getAttribute('aria-pressed')) === 'true' &&
      (await role('Cup').getAttribute('aria-pressed')) === 'false',
  );
  await role('Cup').click();
  check(
    '…and another role turns it off',
    (await role('Scale accessory').getAttribute('aria-pressed')) === 'false' &&
      (await role('Cup').getAttribute('aria-pressed')) === 'true',
  );
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

  // Home has no container row any more (T3.14); the cup, on as Home opens, opens no brew (T2.16).
  await byTestId(page, 'tab-home').click();
  await byTestId(page, 'home').waitFor();
  await page.waitForTimeout(1000);
  check(
    'Home stays with the cup that was on as it opened, and shows no container row',
    page.url().includes('#/?mock') && (await byTestId(page, 'container-row').count()) === 0,
    page.url(),
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
    json.formatVersion === 6 &&
      entities.grinders.some((g) => g.settingStep === 0.05 && g.currentSetting === 4.95) &&
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
    'the containers need no attention any more',
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
      (await row(page, 'containers')) === '2' &&
      (await byTestId(page, 'maint-row').count()) === 2,
    [
      await row(page, 'machine'),
      await row(page, 'grinders'),
      await row(page, 'recipes'),
      await row(page, 'tags'),
      await row(page, 'containers'),
    ].join(' | '),
  );

  // The microphone waits for T3.1; sound with every brew is on, and can be turned off (T2.18).
  await byTestId(page, 'setup-microphone').click();
  check(
    'the microphone switch is off and disabled',
    await button(page, 'Listen for the pump and the grinder').isDisabled(),
  );
  const brewSound = button(page, 'Record sound with every brew');
  check('sound with every brew is on', (await brewSound.getAttribute('aria-pressed')) === 'true');
  await brewSound.click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="brew-sound"]')?.getAttribute('aria-pressed') ===
      'false',
  );
  await page.reload();
  await byTestId(page, 'brew-sound').waitFor();
  check(
    '…turned off, it stays off after a reload',
    (await brewSound.getAttribute('aria-pressed')) === 'false',
  );
  await backToSetup(page);
  check(
    "…and Setup's row says so",
    (await row(page, 'microphone')).includes('Off · not ready yet'),
    await row(page, 'microphone'),
  );
  await byTestId(page, 'setup-probe').click();
  await page.getByRole('heading', { name: 'Probe', exact: true }).waitFor();
  check('the probe opens from Setup', page.url().endsWith('#/probe?mock'), page.url());
  await backToSetup(page);

  // The theme (T3.11): Dark sets the page dark whatever the system's, and stays after a reload;
  // System follows the system again.
  const themeOf = () => page.evaluate(() => document.documentElement.dataset.theme ?? 'system');
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const lightBackground = await background();
  await button(byTestId(page, 'setup-theme'), 'Dark').click();
  check(
    'Dark turns the page dark',
    (await themeOf()) === 'dark' && (await background()) !== lightBackground,
    `${await themeOf()} ${await background()}`,
  );
  await page.reload();
  await byTestId(page, 'setup-theme').waitFor();
  check(
    'the theme stays after a reload',
    (await themeOf()) === 'dark' &&
      (await byTestId(page, 'setup-theme').locator('[aria-pressed="true"]').textContent()) ===
        'Dark',
  );
  await button(byTestId(page, 'setup-theme'), 'System').click();
  check(
    'System follows the system again',
    (await themeOf()) === 'system' && (await background()) === lightBackground,
  );

  check('no page errors', errors.length === 0, errors.join(' | '));
}

await main(run);
