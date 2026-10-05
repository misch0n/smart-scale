// Smoke test of the probe screen (T1.8) in headless Chromium, with the mock transport: connect,
// commands, annotations, the microphone and its sound levels (T1.24), export while recording,
// disconnect, unclean recovery
// after a reload, import into a fresh profile, and a denied wake lock. It serves dist/ under
// /smart-scale/, as GitHub Pages does, at phone width.
//
// Run: npm run e2e (builds first). It needs Playwright and Chromium, which the agent
// environment has installed globally; it isn't part of `npm run check` or CI. Set
// PLAYWRIGHT_MODULE (the playwright package's path) or CHROMIUM_PATH to override.

import {
  BASE,
  button,
  byTestId,
  check,
  download,
  main,
  text,
  waitForText,
  watch as watchInto,
} from './e2e-lib.mjs';

async function run(browser) {
  const errors = [];
  const watch = (page) => watchInto(page, errors);
  // No `permissions` option: with one, Chromium rejects every permission not listed, the wake
  // lock included. The fake-UI flag accepts the microphone prompt.
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  watch(page);

  // The default route is the probe, on the real scale. Headless Chromium has no usable Web
  // Bluetooth, so connecting fails, with the failing step in the message.
  await page.goto(BASE);
  await page.getByRole('heading', { name: 'Connection' }).waitFor();
  check('the default route shows the probe', true);
  check('persistence result', (await text(page, 'persistence')).startsWith('Persistent storage:'));
  check('recovery result', (await text(page, 'recovery')).includes('No recordings were left open'));
  check(
    'capability table has Web Locks',
    (await page.locator('table').filter({ hasText: 'Web Locks' }).count()) === 1,
  );
  await button(page, 'Connect').click();
  await waitForText(page, 'connection-state', 'ended: error');
  check('a failed connect names its step', true, await text(page, 'connection-state'));

  // The mock, at 10×.
  await page.goto(`${BASE}#/probe?mock&speed=10`);
  await page.getByText('Simulated scale (mock transport) at 10× speed').waitFor();
  check('reconnect is offered', (await button(page, 'Reconnect known device').count()) === 1);
  await button(page, 'Connect').click();
  await waitForText(page, 'connection-state', /^connected/);
  await waitForText(page, 'smoothing', /^confirmed/);
  check('smoothing confirmed off', true, await text(page, 'smoothing'));
  await waitForText(page, 'wake-lock', 'held');
  check('wake lock held while connected', true);
  check('live weight', / g/.test(await text(page, 'weight')), await text(page, 'weight'));

  await page.getByRole('button', { name: /^Tare \+ start/ }).click();
  await waitForText(page, 'timer', /^[1-9]\d* ms/);
  check('the timer runs after tare+start', true, await text(page, 'timer'));
  // The simulated scale is in its timer mode, the app's (D-038), which sends nothing on FF12:
  // only the automatic mode did in hardware session 1 (D-037).
  check('FF12 stays quiet', (await text(page, 'frames-ff12')).startsWith('FF12 frames: 0'));
  check('no 03 0D event frame', (await page.getByTestId('event-frame').count()) === 0);

  for (const label of ['pump on', 'pump off', 'cup on', 'cup off']) {
    await button(page, label).click();
  }
  await page.getByLabel('Note').fill('18 g in, grind 12');
  await button(page, 'Add note').click();
  await page.getByRole('button', { name: /^Keep-alive \(unverified\)/ }).click();
  await page.getByLabel('Buzzer level').selectOption('0');
  await page.getByRole('button', { name: /^Set buzzer/ }).click();
  await button(page, 'Try microphone').click();
  await waitForText(page, 'microphone', 'Logged on the recording');
  check('microphone granted and logged', (await text(page, 'microphone')).startsWith('granted'));

  // The sound levels (T1.24), from Chromium's fake microphone, into the recording.
  await button(page, 'Record sound').click();
  await waitForText(page, 'sound', /^On: \d+ readings/);
  await waitForText(page, 'sound', /[1-9]\d* in this recording/);
  check('sound levels go into the recording', true, await text(page, 'sound'));
  await byTestId(page, 'sound-levels').waitFor();
  check('a level per band', (await byTestId(page, 'sound-levels').locator('tr').count()) === 12);
  check('Try microphone waits while they run', await button(page, 'Try microphone').isDisabled());
  // Chromium's fake microphone beeps now and then, with silence between: wait for a beep.
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-testid="sound-levels"] td:nth-child(2)')].some(
      (cell) => !cell.textContent.startsWith('≤'),
    ),
  );
  check('a beep shows in the levels', true);
  await page.waitForTimeout(500);
  const events = await text(page, 'events');
  for (const expected of [
    'annotation pump-on',
    'annotation cup-off',
    'annotation note: 18 g in, grind 12',
    'sent tareAndStartTimer 030A0700000E [probe]',
    'sent keepAlive 030A2500002C [probe]',
    'sent setBuzzer 0 030A0200000B [probe]',
    'try-microphone {"outcome":"granted"',
    'record-sound {"outcome":"granted"',
    'sound levels start: layout 1, every 50 ms',
    'smoothing off, confirmed',
  ]) {
    check(`event log has "${expected}"`, events.includes(expected));
  }
  check(
    'weight windows',
    /Last 0\.5 s[-\d.]+ g, σ [\d.]+ g/.test(await text(page, 'weight-stats')),
  );
  check('timer gaps', /Timer gaps \(A1\)\d+\.\d ms/.test(await text(page, 'status')));
  check('no failed frames', (await text(page, 'failures')).startsWith('0 in all'));

  // Export the recording in progress: the panel flushes the recorders first.
  const recordings = byTestId(page, 'recordings');
  await recordings
    .locator('tr', { hasText: 'open' })
    .last()
    .getByRole('button', { name: 'Export', exact: true })
    .click();
  await byTestId(page, 'export-ready').waitFor();
  const live = await download(page, page.getByRole('link', { name: 'Download' }));
  const entry = live.json.recordings[0];
  check('an export while recording holds it open', entry.recording.endedAtEpochMs === null);
  const labels = entry.events.filter((e) => e.type === 'annotation').map((e) => e.data.label);
  check(
    'the export has the annotations',
    labels.join() === 'pump-on,pump-off,cup-on,cup-off,note',
    labels.join(),
  );
  check(
    'the export has the latest events',
    entry.events.some((e) => e.type === 'ui-action' && e.data.action === 'try-microphone'),
  );
  check('the export is format version 2', live.json.formatVersion === 2);
  check(
    'the export has the FF11 frames, and no FF12 ones in the timer mode',
    entry.frames.some((f) => f[2] === 'ff11') && entry.frames.every((f) => f[2] !== 'ff12'),
  );
  const levels = entry.frames.filter((f) => f[2] === 'mic');
  check(
    'the export has the sound levels: layout 1, twelve levels each',
    levels.length > 0 && levels.every((f) => /^01[0-9A-F]{24}$/.test(f[3])),
    `${levels.length} mic frames, first ${levels[0]?.[3]}`,
  );
  const loudest = levels.map((f) => f[3]).find((hex) => hex !== `01${'FF'.repeat(12)}`);
  check('the export has the beep', loudest !== undefined, loudest);
  const started = entry.events.find((e) => e.type === 'sound-started');
  check(
    'sound-started describes the levels',
    started?.data.layout === 1 &&
      started.data.measures.length === 12 &&
      started.data.fftSize === 4096 &&
      started.data.sampleRateHz > 0 &&
      started.data.continued === false,
    JSON.stringify(started?.data),
  );

  await button(page, 'Stop sound').click();
  await waitForText(page, 'sound', /^Off\.$/);
  await waitForText(page, 'events', 'sound levels stop (user)');
  check('Stop sound stops them, logged', true);

  await button(page, 'Disconnect').click();
  await waitForText(page, 'connection-state', 'ended: user');
  await recordings.locator('tr', { hasText: 'user' }).first().waitFor();
  check('the list shows the recording ended', true);
  await waitForText(page, 'wake-lock', 'off');
  check('wake lock released', true);

  await button(page, 'Export all').click();
  await waitForText(page, 'export-ready', '_all.json');
  const all = await download(page, page.getByRole('link', { name: 'Download' }));
  const ended = all.json.recordings.find((r) => r.recording.id === entry.recording.id);
  check(
    'export all has the ended recording',
    ended?.recording.endReason === 'user' && ended.events.at(-1).type === 'disconnected',
  );

  // Reloading while connected leaves the recording open; startup recovery ends it.
  await button(page, 'Connect').click();
  await waitForText(page, 'connection-state', /^connected/);
  await page.waitForTimeout(1500);
  await page.reload();
  await waitForText(page, 'recovery', 'Ended as unclean');
  check('startup recovery ends a recording left open', true, await text(page, 'recovery'));
  await recordings.locator('tr', { hasText: 'unclean' }).first().waitFor();

  // The page being hidden and shown again goes on the recording (hardware test B4).
  await button(page, 'Connect').click();
  await waitForText(page, 'connection-state', /^connected/);
  await page.evaluate(() => {
    for (const state of ['hidden', 'visible']) {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
      document.dispatchEvent(new Event('visibilitychange'));
    }
  });
  await waitForText(page, 'events', 'page-visible');
  check(
    'page-hidden and page-visible logged',
    (await text(page, 'events')).includes('page-hidden'),
  );
  await button(page, 'Disconnect').click();

  // Import the full export into a fresh profile.
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page2 = await fresh.newPage();
  watch(page2);
  await page2.goto(`${BASE}#/probe?mock`);
  await page2.getByLabel('Import an export file').setInputFiles(all.path);
  await waitForText(page2, 'import-result', 'Recordings: 1 added');
  check('import into a fresh profile', true);

  // A denied wake lock shows its error and a tap to retry. Listing any permission denies it.
  const denied = await browser.newContext({ permissions: ['geolocation'] });
  const page3 = await denied.newPage();
  watch(page3);
  await page3.goto(`${BASE}#/probe?mock&speed=10`);
  await button(page3, 'Connect').click();
  await waitForText(page3, 'wake-lock', 'NotAllowedError');
  check(
    'a denied wake lock offers Keep screen on',
    (await text(page3, 'wake-lock')).includes('Keep screen on'),
  );
  await button(page3, 'Disconnect').click();

  check('no page errors', errors.length === 0, errors.join(' | '));
}

await main(run);
