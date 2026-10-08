// Smoke test of the reconnect without the chooser (T1.21) in headless Chromium, on the real Web
// Bluetooth transport: a fake `navigator.bluetooth` goes into the page before the app loads. It
// keeps the scale's permission across reloads, as a browser does, can come late or never, as
// beacio's injection may, and can switch the scale off. Its chooser refuses to open without the
// tap's user activation, as Chrome's does. On the brew screen:
//
// - the first Connect opens the chooser; after a reload the scale reconnects with no tap, on
//   Home too, the landing page (T1.23);
// - a dropped link is retried every 0.5 s until the scale is back, with no Stop; a tap on the
//   scale's name tries at once, with no chooser (T3.14);
// - the scale's icon (Choose scale) cancels a waiting attempt and opens the chooser in the same
//   tap;
// - Bluetooth injected late is found; never injected, the line says so and its name reloads;
// - a scale the browser no longer lists leaves the chooser.
//
// Run: npm run e2e (builds first). It needs Playwright and Chromium, which the agent environment
// has installed globally; it isn't part of `npm run check` or CI.

import { BASE, button, check, main, text, waitForText, watch } from './e2e-lib.mjs';
import { registerTypeScript } from './typescript.mjs';

registerTypeScript();
const { encodeWeightFrame } = await import('../src/core/protocol/index.ts');

/** An idle scale's weight frame: 0.0 g, battery 82 %, smoothing off. */
const FRAME = Array.from(
  encodeWeightFrame({ timerMs: 0, weightG: 0, batteryPct: 82, standbyMin: 15 }),
);

/**
 * Runs in the page before the app. When `navigator.bluetooth` appears is read from
 * localStorage, so that the test can change it between reloads: `fake-bluetooth-inject` is a
 * delay in ms (default 0), or `never`.
 */
function installFakeBluetooth(frame) {
  const PERMITTED = 'fake-bluetooth-permitted';
  const injectSetting = localStorage.getItem('fake-bluetooth-inject') ?? '0';
  const injectAt = injectSetting === 'never' ? null : Date.now() + Number(injectSetting);
  const fake = {
    log: [],
    /** Whether each chooser call came with the tap's user activation. */
    activations: [],
    /** False while the scale is off: a GATT connect fails at once, as Chrome's does. */
    reachable: true,
    /** True to make a GATT connect wait until released, as CoreBluetooth does. */
    hold: false,
    pending: null,
  };
  const say = (line) => fake.log.push(line);

  const characteristic = (name) => {
    const c = new EventTarget();
    c.properties = {
      broadcast: false,
      read: true,
      writeWithoutResponse: false,
      write: true,
      notify: true,
      indicate: false,
      authenticatedSignedWrites: false,
      reliableWrite: false,
      writableAuxiliaries: false,
    };
    c.value = null;
    c.startNotifications = async () => {
      say(`startNotifications ${name}`);
      return c;
    };
    c.writeValueWithResponse = async (bytes) => {
      say(`write ${[...new Uint8Array(bytes.buffer ?? bytes)].length} bytes`);
    };
    return c;
  };
  const ff11 = characteristic('ff11');
  const ff12 = characteristic('ff12');
  const service = {
    async getCharacteristic(uuid) {
      return uuid.startsWith('0000ff11') ? ff11 : ff12;
    },
  };

  const device = new EventTarget();
  let streaming = null;
  const drop = () => {
    clearInterval(streaming);
    streaming = null;
    device.gatt.connected = false;
    device.dispatchEvent(new Event('gattserverdisconnected'));
  };
  device.id = 'fake-scale-id';
  device.name = 'BOOKOO_SC 109813';
  device.gatt = {
    connected: false,
    async connect() {
      say('gatt.connect');
      if (fake.hold) {
        await new Promise((resolve, reject) => (fake.pending = { resolve, reject }));
      }
      if (!fake.reachable) throw new DOMException('Connection attempt failed.', 'NetworkError');
      this.connected = true;
      clearInterval(streaming);
      streaming = setInterval(() => {
        if (!this.connected) return;
        ff11.value = new DataView(Uint8Array.from(frame).buffer);
        ff11.dispatchEvent(new Event('characteristicvaluechanged'));
      }, 100);
      return this;
    },
    disconnect() {
      say('gatt.disconnect');
      // Chrome aborts a connect in progress.
      fake.pending?.reject(new DOMException('Connection attempt aborted.', 'AbortError'));
      fake.pending = null;
      if (this.connected) drop();
    },
    async getPrimaryService() {
      return service;
    },
  };

  const bluetooth = {
    async requestDevice() {
      const active = navigator.userActivation?.isActive === true;
      fake.activations.push(active);
      say('requestDevice');
      if (!active) {
        throw new DOMException(
          'Must be handling a user gesture to show a permission request.',
          'SecurityError',
        );
      }
      localStorage.setItem(PERMITTED, '1');
      return device;
    },
    async getDevices() {
      say('getDevices');
      return localStorage.getItem(PERMITTED) === '1' ? [device] : [];
    },
  };
  Object.defineProperty(Navigator.prototype, 'bluetooth', {
    configurable: true,
    get: () => (injectAt !== null && Date.now() >= injectAt ? bluetooth : undefined),
  });

  window.fakeBluetooth = {
    fake,
    /** The scale switches off: the link drops, and connects fail until `switchOn()`. */
    switchOff() {
      fake.reachable = false;
      if (device.gatt.connected) drop();
    },
    switchOn() {
      fake.reachable = true;
      fake.pending?.resolve();
      fake.pending = null;
    },
    /** The browser forgets the permission. */
    forget() {
      localStorage.removeItem(PERMITTED);
    },
    count: (line) => fake.log.filter((entry) => entry === line).length,
  };
}

/** Waits until the scale's line (T3.14), or the cup once connected, shows `view`. */
async function waitForView(page, view, timeout = 20_000) {
  await page.waitForFunction(
    (view) => {
      const card = document.querySelector('[data-testid="scale"]');
      if (view === 'connected')
        return card === null && document.querySelector('[data-testid="vessel"]');
      return card?.dataset.view === view;
    },
    view,
    { timeout },
  );
}

const count = (page, line) => page.evaluate((line) => window.fakeBluetooth.count(line), line);
const fakeLog = (page) => page.evaluate(() => window.fakeBluetooth.fake.log);

async function run(browser) {
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(installFakeBluetooth, FRAME);
  const page = await context.newPage();
  watch(page, errors);

  // A first visit: nothing remembered, so nothing happens until the tap.
  await page.goto(`${BASE}#/brew`);
  await waitForView(page, 'disconnected');
  check('a fresh page waits for a tap', (await count(page, 'getDevices')) === 0);
  check(
    'the scale is not connected yet',
    (await text(page, 'scale-status')).includes('Not connected'),
  );
  await button(page, 'Connect scale').click();
  await waitForView(page, 'connected');
  check(
    'the first Connect opens the chooser, in the tap',
    (await page.evaluate(() => window.fakeBluetooth.fake.activations)).join() === 'true',
  );
  await waitForText(page, 'scale-status', 'Scale · 82%');
  check('the scale streams', true, await text(page, 'scale-status'));

  // A reload: the scale reconnects with no tap and no chooser.
  await page.reload();
  await waitForView(page, 'connected');
  check(
    'after a reload the scale reconnects by itself, without the chooser',
    (await count(page, 'getDevices')) === 1 && (await count(page, 'requestDevice')) === 0,
    (await fakeLog(page)).slice(0, 3).join(', '),
  );

  // Home, the landing page, starts the reconnect on load too (T1.23), and shows the scale.
  await page.goto(`${BASE}#/`);
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="scale"]')?.dataset.view === 'connected',
    null,
    { timeout: 20_000 },
  );
  await waitForText(page, 'battery', '82 %');
  check(
    'Home, as the landing page, reconnects by itself and shows the scale and its battery',
    (await count(page, 'getDevices')) === 1 &&
      (await count(page, 'requestDevice')) === 0 &&
      (await text(page, 'scale-name')) === 'BOOKOO_SC 109813',
    `${await text(page, 'scale-name')} · ${await text(page, 'battery')}`,
  );
  await page.goto(`${BASE}#/brew`);
  await waitForView(page, 'connected');

  // The scale switches off: the app waits for it and tries again until it's back.
  await page.evaluate(() => window.fakeBluetooth.switchOff());
  await waitForView(page, 'waiting');
  check(
    'a dropped link turns to waiting',
    (await text(page, 'scale-state')).includes('Waiting for the scale'),
    await text(page, 'scale-state'),
  );
  const before = await count(page, 'gatt.connect');
  await page.waitForFunction(
    (before) => window.fakeBluetooth.count('gatt.connect') >= before + 2,
    before,
    { timeout: 10_000 },
  );
  check('it tries again while the scale is off', true);
  await page.evaluate(() => window.fakeBluetooth.switchOn());
  await waitForView(page, 'connected');
  check('it connects once the scale is back', (await count(page, 'requestDevice')) === 0);

  // No Stop any more (T3.14): the attempts come every 0.5 s; a tap on the name tries at once.
  await page.evaluate(() => window.fakeBluetooth.switchOff());
  await waitForView(page, 'waiting');
  const from = await count(page, 'gatt.connect');
  await page.waitForTimeout(3000);
  const tries = (await count(page, 'gatt.connect')) - from;
  check('while the scale is off, it tries about every 0.5 s', tries >= 4, `${tries} in 3 s`);
  check('no Stop button', (await button(page, 'Stop').count()) === 0);
  await page.evaluate(() => window.fakeBluetooth.switchOn());
  await button(page, 'Connect scale').click();
  await waitForView(page, 'connected');
  check('a tap on the name reconnects, no chooser', (await count(page, 'requestDevice')) === 0);

  // An attempt that waits for the scale, as CoreBluetooth's do; the scale's icon (Choose scale)
  // cancels it and opens the chooser in the same tap.
  await page.evaluate(() => {
    window.fakeBluetooth.fake.hold = true;
    window.fakeBluetooth.switchOff();
  });
  await waitForView(page, 'waiting');
  await page.waitForFunction(() => window.fakeBluetooth.fake.pending !== null);
  await page.evaluate(() => {
    window.fakeBluetooth.fake.hold = false;
    window.fakeBluetooth.fake.reachable = true;
  });
  await button(page, 'Choose scale').click();
  await waitForView(page, 'connected');
  check(
    'Choose scale opens the chooser in the tap, cancelling the waiting attempt',
    (await page.evaluate(() => window.fakeBluetooth.fake.activations)).join() === 'true',
  );

  // The probe shows what B3 needs: the remembered scale, and getDevices().
  await page.goto(`${BASE}#/probe`);
  await waitForText(page, 'reconnect-state', 'remembered: BOOKOO_SC 109813 fake-scale-id');
  check('the probe names the remembered scale', true, await text(page, 'reconnect-state'));
  await page.goto(`${BASE}#/brew`);

  // beacio injects Web Bluetooth late: the app finds it and reconnects with no tap.
  await page.evaluate(() => localStorage.setItem('fake-bluetooth-inject', '2000'));
  await page.reload();
  await waitForView(page, 'checking', 5000);
  check(
    'until Bluetooth appears, the line says it is looking',
    (await text(page, 'scale-state')).includes('Looking for Bluetooth'),
  );
  await waitForView(page, 'connected');
  check('Bluetooth injected late is found, and the scale reconnects', true);

  // Never injected: after 10 s the card says so, with Reload.
  await page.evaluate(() => localStorage.setItem('fake-bluetooth-inject', 'never'));
  await page.reload();
  await waitForView(page, 'unavailable', 15_000);
  check(
    'without Bluetooth the line says so, and its name reloads',
    (await text(page, 'scale-state')).includes('No Bluetooth') &&
      (await button(page, 'Reload').count()) === 1,
    await text(page, 'scale-state'),
  );
  await page.evaluate(() => localStorage.setItem('fake-bluetooth-inject', '0'));
  await Promise.all([page.waitForEvent('load'), button(page, 'Reload').click()]);
  await waitForView(page, 'connected');
  check('Reload brings it back, and the scale reconnects', true);

  // The browser forgets the scale: the chooser again.
  await page.evaluate(() => window.fakeBluetooth.forget());
  await page.reload();
  await waitForView(page, 'disconnected');
  check(
    'a scale the browser no longer lists needs the chooser',
    (await text(page, 'scale-state')).includes('Not connected'),
    await text(page, 'scale-state'),
  );
  await button(page, 'Connect scale').click();
  await waitForView(page, 'connected');
  check(
    'and Connect opens it, in the tap',
    (await page.evaluate(() => window.fakeBluetooth.fake.activations)).join() === 'true',
  );

  check('no page errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

await main(run);
