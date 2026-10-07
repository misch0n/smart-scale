// Accessibility audit (T3.5) in headless Chromium: axe-core's WCAG 2.2 A and AA rules and its
// best practices on every screen, in a phone-sized window, in light and dark mode, with the mock
// scale: Home, the brew's phases and its shot card, History with a real recording (a shot's page
// and Compare), Setup and each of its screens, and the probe. Every violation is printed with
// the elements it names; the run fails on any. It serves dist/ under /smart-scale/, as GitHub
// Pages does.
//
// Run: npm run e2e (builds first). It needs Playwright and Chromium, which the agent environment
// has installed globally, and axe-core (a dev dependency); it isn't part of `npm run check` or CI.

import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { BASE, button, byTestId, check, download, main, OUT, watch } from './e2e-lib.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const FIXTURE = 'fixtures/real/2026-10-05_two-shots_0a69da56.json';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/** Runs axe on the page as it is, and reports each violation under `name`. */
async function audit(page, name) {
  await page.addScriptTag({ path: AXE });
  const violations = await page.evaluate(async (tags) => {
    const result = await window.axe.run(document, { runOnly: { type: 'tag', values: tags } });
    return result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes
        .slice(0, 4)
        .map((n) => `${n.target.join(' ')}: ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`),
      count: v.nodes.length,
    }));
  }, TAGS);
  check(
    `${name}: no violations`,
    violations.length === 0,
    violations
      .map(
        (v) =>
          `\n    [${v.impact}] ${v.id} (${v.count}): ${v.help}\n      ${v.nodes.join('\n      ')}`,
      )
      .join(''),
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

async function screens(browser, scheme) {
  const errors = [];
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: 'UTC',
    colorScheme: scheme,
    acceptDownloads: true,
  });
  const page = await context.newPage();
  watch(page, errors);
  const at = (name) => `${scheme} · ${name}`;

  // A real recording for History, and containers for the phases.
  await page.goto(`${BASE}#/probe?mock`);
  await page.getByLabel('Import an export file').setInputFiles(FIXTURE);
  await byTestId(page, 'import-result').waitFor();
  await page.getByRole('button', { name: 'Export all', exact: true }).click();
  const { json } = await download(page, page.getByRole('link', { name: 'Download' }));
  json.entities.containers = [
    container('019a0000-0000-7000-8000-0000000c0f01', 'Espresso cup', 110, ['cup']),
    container('019a0000-0000-7000-8000-0000000c0f02', 'Milk jug', 95, ['milk']),
    container('019a0000-0000-7000-8000-0000000c0f03', 'Bean cup', 60, ['bean']),
  ];
  const file = join(OUT, `a11y-${scheme}.json`);
  writeFileSync(file, JSON.stringify(json));
  await page.getByLabel('Import an export file').setInputFiles(file);
  await byTestId(page, 'import-result').waitFor();
  await audit(page, at('the probe'));

  await page.goto(`${BASE}#/?mock`);
  await byTestId(page, 'home').waitFor();
  await page.waitForTimeout(500);
  await audit(page, at('Home'));

  // The brew: the beans (a bean cup learned) with their equipment and the grinder, a picker
  // open; connected, the cup's extraction; the live view, the card and the milk.
  await page.goto(`${BASE}#/brew?mock&speed=5`);
  await byTestId(page, 'brew').waitFor();
  await byTestId(page, 'beans-equipment').waitFor();
  await byTestId(page, 'grind-equipment').waitFor();
  await audit(page, at('the brew, the beans'));
  await byTestId(page, 'pick-basket').click();
  await audit(page, at('the beans, a picker open'));
  await byTestId(page, 'pick-basket').click();
  await button(page, 'Connect scale').click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="vessel-name"]')?.textContent === 'Espresso cup',
  );
  await byTestId(page, 'recipe').click();
  await page.getByRole('button', { name: /^Cappuccino/ }).click();
  await audit(page, at('the brew, the cup on'));
  await byTestId(page, 'start').click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="brew"]')?.dataset.view === 'live',
    null,
    { timeout: 30_000 },
  );
  await audit(page, at('the brew, live'));
  await page.waitForFunction(
    () => document.querySelector('[data-testid="brew"]')?.dataset.view === 'card',
    null,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(1500);
  await audit(page, at('the shot card'));
  await page.waitForFunction(
    () => document.querySelector('[data-testid="brew"]')?.dataset.view === 'milk',
    null,
    { timeout: 60_000 },
  );
  await audit(page, at('the milk'));
  await byTestId(page, 'skip-milk').click();
  await byTestId(page, 'save').click();

  // History, a shot, Compare, the filter and the trend.
  await page.goto(`${BASE}#/history?mock`);
  await byTestId(page, 'history-row').nth(1).waitFor({ timeout: 30_000 });
  await audit(page, at('History'));
  await byTestId(page, 'filter').click();
  await byTestId(page, 'filters').waitFor();
  await audit(page, at('History, the filter'));
  await byTestId(page, 'filters')
    .getByRole('group', { name: 'Taste' })
    .getByRole('button')
    .first()
    .click();
  await byTestId(page, 'filters-done').click();
  await byTestId(page, 'trend').waitFor();
  await audit(page, at('History, the trend'));
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await byTestId(page, 'history-row').first().click();
  await byTestId(page, 'metrics').waitFor();
  await audit(page, at('a shot'));
  await page.goto(`${BASE}#/history?mock`);
  await byTestId(page, 'history-row').nth(1).waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await byTestId(page, 'history-pick').nth(0).click();
  await byTestId(page, 'history-pick').nth(1).click();
  await audit(page, at('History, picking two'));
  await byTestId(page, 'compare-go').click();
  await page.waitForURL(/#\/compare\//);
  await page.waitForTimeout(800);
  await audit(page, at('Compare'));

  // Setup and its screens.
  for (const [section, testId] of [
    ['', 'setup'],
    ['/machine', 'setup-machine-screen'],
    ['/grinders', 'setup-grinders-screen'],
    ['/recipes', 'setup-recipes-screen'],
    ['/packs', 'setup-packs-screen'],
    ['/containers', 'setup-containers-screen'],
    ['/tags', 'setup-tags-screen'],
    ['/microphone', 'setup-microphone-screen'],
    ['/backup', 'setup-backup-screen'],
  ]) {
    await page.goto(`${BASE}#/setup${section}?mock`);
    await byTestId(page, testId).waitFor();
    await page.waitForTimeout(300);
    await audit(page, at(`Setup${section}`));
  }

  check(`${scheme}: no page errors`, errors.length === 0, errors.join(' | '));
  await context.close();
}

await main(async (browser) => {
  await screens(browser, 'light');
  await screens(browser, 'dark');
});
