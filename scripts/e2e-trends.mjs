// Smoke test of the history's filter and trend (T3.3) in headless Chromium, in a phone-sized
// window on UTC. An export is made here from simulated sessions, a shot each: five on the ORO,
// finer settings running longer to the first drip, and one on the C40. Imported on the probe,
// the history lists the six; the filter narrows them to the ORO, and the trend draws the first
// drip against the grind with its fitted line; the figures and the axis change it; a dot opens
// its shot, and the filter is still there coming back; two grinders in the filter have no grind
// axis. It serves dist/ under /smart-scale/, as GitHub Pages does.
//
// Run: npm run e2e (builds first). It needs Playwright and Chromium, which the agent environment
// has installed globally; it isn't part of `npm run check` or CI.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, button, byTestId, check, main, OUT, text, watch } from './e2e-lib.mjs';
import { registerTypeScript } from './typescript.mjs';

registerTypeScript();
const { espressoScenario, simulateSession, toRawRecording } =
  await import('../src/core/sim/index.ts');
const { createShot, SEED_IDS } = await import('../src/core/model/index.ts');
const { serialiseExport } = await import('../src/core/export/index.ts');

const DAY = 86_400_000;
/** 1 October 2026, 07:00 UTC: the first session. */
const FIRST = Date.UTC(2026, 9, 1, 7);

/** A session with one shot, and its live shot as the brew flow stores it. */
function session(i, { setting, preInfusionMs, grinder, direction }) {
  const simulated = simulateSession(
    espressoScenario({ seed: 10 + i, manualStartMs: 7000, shot: { preInfusionMs } }),
  );
  const startedAtEpochMs = FIRST + i * DAY;
  const raw = toRawRecording(simulated, { startedAtEpochMs });
  const truth = simulated.truth.shots[0];
  const anchorTMs = truth.pumpOffMs + 2000;
  const shot = createShot(
    {
      recordingId: raw.recording.id,
      anchorTMs,
      source: 'live',
      doseG: 18,
      targetRatio: 2,
      recipeName: 'Espresso',
      grinderId: grinder === 'oro' ? SEED_IDS.oro : SEED_IDS.c40,
      grinderName: grinder === 'oro' ? 'Eureka ORO Mignon Single Dose Pro' : 'Comandante C40',
      grindSetting:
        grinder === 'oro'
          ? { kind: 'stepless', value: setting }
          : { kind: 'clicks', value: setting },
      packId: '019a0000-0000-7000-8000-0000000fac01',
      packName: 'Local roaster · Ethiopia Guji',
      packRoastDate: '2026-09-25',
      direction,
    },
    startedAtEpochMs + anchorTMs,
  );
  return { raw, shot };
}

const sessions = [
  session(0, { setting: 6.4, preInfusionMs: 5000, grinder: 'oro', direction: 'sour' }),
  session(1, { setting: 6.2, preInfusionMs: 6000, grinder: 'oro', direction: 'sour' }),
  session(2, { setting: 6.0, preInfusionMs: 7000, grinder: 'oro', direction: 'balanced' }),
  session(3, { setting: 5.8, preInfusionMs: 8000, grinder: 'oro', direction: 'bitter' }),
  session(4, { setting: 5.6, preInfusionMs: 9000, grinder: 'oro', direction: null }),
  session(5, { setting: 22, preInfusionMs: 7000, grinder: 'c40', direction: 'sour' }),
];
const file = join(OUT, 'trends.json');
writeFileSync(
  file,
  serialiseExport({
    exportedAtEpochMs: FIRST + 7 * DAY,
    app: sessions[0].raw.recording.app,
    recordings: sessions.map((s) => s.raw),
    shots: sessions.map((s) => s.shot),
    entities: null,
    settings: null,
  }),
);

async function run(browser) {
  const errors = [];
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: 'UTC',
  });
  const page = await context.newPage();
  watch(page, errors);

  await page.goto(`${BASE}#/probe`);
  await page.getByLabel('Import an export file').setInputFiles(file);
  await byTestId(page, 'import-result').waitFor();
  await byTestId(page, 'tab-history').click();
  await byTestId(page, 'history-row').nth(5).waitFor({ timeout: 30_000 });
  check(
    'History lists the six shots, and no trend without a filter',
    (await byTestId(page, 'history-row').count()) === 6 &&
      (await byTestId(page, 'trend').count()) === 0,
  );

  // The filter: the ORO only.
  await byTestId(page, 'filter').click();
  const filters = byTestId(page, 'filters');
  await filters
    .getByRole('group', { name: 'Grinder' })
    .getByRole('button', { name: /ORO/ })
    .click();
  await byTestId(page, 'filters-done').click();
  await byTestId(page, 'filter-line').waitFor();
  check(
    'the filter keeps the ORO’s five shots, and says so',
    (await byTestId(page, 'history-row').count()) === 5 &&
      (await text(page, 'filter-line')).includes('Eureka ORO Mignon Single Dose Pro') &&
      (await text(page, 'filter-line')).includes('5 of 6 shots'),
    await text(page, 'filter-line'),
  );

  // The trend: the first drip against the grind, five dots and a falling line.
  await byTestId(page, 'trend-chart').waitFor();
  check(
    'the trend draws the first drip against the grind, a dot a shot, with its line',
    (await page.locator('.trend-dot').count()) === 5 &&
      (await page.locator('.trend-fit').count()) === 1 &&
      (await page.locator('.trend-dot-sour').count()) === 2 &&
      (await page.locator('.trend-dot-ungraded').count()) === 1,
  );
  const note = await text(page, 'trend-note');
  // 1 s more to the first drip per 0.2 finer: −0.5 s per 0.1 of grind.
  check(
    'the line says what each step of grind does',
    /^First drip −0\.5 s per 0\.1 of grind, fitted over 5 shots$/.test(note),
    note,
  );
  await button(byTestId(page, 'trend'), 'Days off roast').click();
  await button(byTestId(page, 'trend'), 'Ratio').click();
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="trend-note"]')?.textContent?.includes('Ratio'),
  );
  check(
    'the figure and the axis change it',
    (await text(page, 'trend-note')).includes('per day off roast') &&
      (await page.locator('.trend-tick').allTextContents()).some((t) => t.endsWith(' d')),
    await text(page, 'trend-note'),
  );

  // A dot opens its shot; the filter is still there coming back.
  await page.locator('.trend-chart a').first().click();
  await byTestId(page, 'metrics').waitFor();
  check('a dot opens its shot', page.url().includes('#/shot/'), page.url());
  await page.goBack();
  await byTestId(page, 'filter-line').waitFor();
  await byTestId(page, 'trend-note').waitFor();
  check(
    'back in History, the filter and the axes are kept',
    (await byTestId(page, 'history-row').count()) === 5 &&
      (await text(page, 'trend-note')).includes('Ratio'),
  );

  // Two grinders share no grind axis.
  await byTestId(page, 'filter').click();
  await filters
    .getByRole('group', { name: 'Grinder' })
    .getByRole('button', { name: /ORO/ })
    .click();
  await filters.getByRole('group', { name: 'Taste' }).getByRole('button', { name: /Sour/ }).click();
  await byTestId(page, 'filters-done').click();
  await button(byTestId(page, 'trend'), 'Grind').click();
  await byTestId(page, 'trend-empty').waitFor();
  check(
    'sour on two grinders: no grind axis, and the list keeps the three',
    (await text(page, 'trend-empty')).includes('more than one grinder') &&
      (await byTestId(page, 'history-row').count()) === 3,
    await text(page, 'trend-empty'),
  );
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await byTestId(page, 'filter-line').waitFor({ state: 'detached' });
  check(
    'Clear shows every shot again, and no trend',
    (await byTestId(page, 'history-row').count()) === 6 &&
      (await byTestId(page, 'trend').count()) === 0,
  );

  check('no page errors', errors.length === 0, errors.join(' | '));
}

await main(run);
