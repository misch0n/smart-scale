import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  flowSmoothingOff,
  SERVICE_UUID,
  setBuzzer,
  stopTimer,
  tare,
  tareAndStartTimer,
} from '../core/protocol';
import {
  FakeBluetooth,
  NO_PROPERTIES,
  type FakeBluetoothOptions,
  type FakeCharacteristicOptions,
} from './fake-web-bluetooth';
import { ManualClock } from './scheduler';
import type { ScaleNotification, TransportStatus } from './types';
import { WebBluetoothTransport, type BluetoothApi, type WriteMethod } from './web-bluetooth';

interface SetupOptions extends FakeBluetoothOptions {
  readonly writeSpacingMs?: number;
}

/** A transport on a fake `navigator.bluetooth`; statuses go into the fake's log too. */
function setup(options: SetupOptions = {}) {
  const clock = new ManualClock(1000);
  const fake = new FakeBluetooth({ clock, ...options });
  const transport = new WebBluetoothTransport({
    bluetooth: fake,
    scheduler: clock,
    writeSpacingMs: options.writeSpacingMs,
  });
  const statuses: TransportStatus[] = [];
  const notifications: ScaleNotification[] = [];
  transport.onStatus((status) => {
    statuses.push(status);
    fake.log.push(`status ${status.state}`);
  });
  transport.onNotification((notification) => notifications.push(notification));
  return { clock, fake, transport, statuses, notifications };
}

async function connected(options: SetupOptions = {}) {
  const env = setup(options);
  await env.transport.connect();
  return env;
}

/** Lets every pending promise chain run: the fake's steps finish on microtasks. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('WebBluetoothTransport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is a web-bluetooth transport on its scheduler's clock, disconnected until asked", () => {
    const { clock, transport } = setup();
    expect(transport.kind).toBe('web-bluetooth');
    expect(transport.status).toEqual({ state: 'disconnected', reason: null, message: null });
    clock.advance(250);
    expect(transport.now()).toBe(1250);
  });

  describe('connecting', () => {
    it('calls requestDevice synchronously, with filters for the service or the name', async () => {
      const { fake, transport } = setup();
      const connecting = transport.connect();
      // Still inside the caller's click handler: the chooser keeps its user activation.
      expect(fake.log).toEqual(['status connecting', 'requestDevice']);
      expect(fake.requestOptions).toEqual({
        filters: [{ services: [SERVICE_UUID] }, { namePrefix: 'BOOKOO' }],
        optionalServices: [SERVICE_UUID],
      });
      await connecting;
    });

    it('listens before subscribing, and reports connected before starting notifications', async () => {
      const { fake, transport, statuses } = setup();
      const info = await transport.connect();
      expect(fake.log).toEqual([
        'status connecting',
        'requestDevice',
        'gatt.connect',
        'listen gattserverdisconnected',
        'getPrimaryService 0ffe',
        'getCharacteristic ff11',
        'getCharacteristic ff12',
        'listen ff11',
        'listen ff12',
        'status connected',
        'startNotifications ff11',
        'startNotifications ff12',
      ]);
      expect(info).toEqual({
        device: { name: 'BOOKOO_SC', id: 'fake-scale' },
        properties: {
          ff11: { ...NO_PROPERTIES, notify: true },
          ff12: { ...NO_PROPERTIES, write: true, writeWithoutResponse: true, notify: true },
        },
        subscribed: ['ff11', 'ff12'],
      });
      expect(transport.status).toEqual({ state: 'connected', connection: info });
      expect(statuses.map((s) => s.state)).toEqual(['connecting', 'connected']);
      expect(fake.scale.ff11.notifying && fake.scale.ff12.notifying).toBe(true);
    });

    it('resolves connect() only once both characteristics notify', async () => {
      const { fake, transport } = setup();
      fake.steps.hold('startNotifications ff12');
      let resolved = false;
      const connecting = transport.connect().then(() => (resolved = true));
      await settle();
      expect(transport.status.state).toBe('connected');
      expect(resolved).toBe(false);
      fake.steps.release('startNotifications ff12');
      await connecting;
    });

    it.each<[string, FakeCharacteristicOptions['properties'], boolean]>([
      ['notify', { ...NO_PROPERTIES, notify: true }, true],
      ['indicate only', { ...NO_PROPERTIES, indicate: true }, true],
      ['neither notify nor indicate', { ...NO_PROPERTIES, write: true }, false],
      ['no reported properties', null, false],
    ])('subscribes to FF12 when it reports %s: %s', async (_, properties, subscribes) => {
      const { fake, transport, notifications } = setup({ scale: { ff12: { properties } } });
      const info = await transport.connect();
      expect(info.subscribed).toEqual(subscribes ? ['ff11', 'ff12'] : ['ff11']);
      expect(fake.log.includes('listen ff12')).toBe(subscribes);
      expect(fake.log.includes('startNotifications ff12')).toBe(subscribes);
      fake.scale.ff12.notify([0x03, 0x0d]);
      expect(notifications).toHaveLength(subscribes ? 1 : 0);
    });

    it('reports properties the runtime leaves out as null, and a device with no name', async () => {
      const { transport } = setup({
        scale: { name: null, ff12: { properties: { write: true } } },
      });
      const info = await transport.connect();
      expect(info.device.name).toBeNull();
      expect(info.properties.ff12).toEqual({
        broadcast: null,
        read: null,
        writeWithoutResponse: null,
        write: true,
        notify: null,
        indicate: null,
        authenticatedSignedWrites: null,
        reliableWrite: null,
        writableAuxiliaries: null,
      });
      expect(info.subscribed).toEqual(['ff11']);
    });

    it('refuses to connect twice', async () => {
      const { fake, transport } = setup();
      fake.steps.hold('connect');
      const first = transport.connect();
      await expect(transport.connect()).rejects.toMatchObject({ code: 'busy' });
      fake.steps.release('connect');
      await first;
      await expect(transport.connect()).rejects.toMatchObject({ code: 'busy' });
      expect(fake.log.filter((line) => line === 'requestDevice')).toHaveLength(1);
    });

    it('connects again after a disconnect, with nothing left over from the first connection', async () => {
      const { fake, transport, notifications } = await connected();
      await transport.disconnect();
      await transport.connect();
      fake.scale.ff11.notify([1, 2]);
      expect(notifications).toHaveLength(1);
      expect(fake.scale.ff11.listeners).toBe(1);
      expect(fake.scale.disconnectListeners).toBe(1);
      await transport.send(tare());
      expect(fake.writes).toHaveLength(1);
    });
  });

  describe('when connecting fails', () => {
    it('reports a cancelled chooser, naming the step', async () => {
      const { fake, transport, statuses } = setup();
      const cancelled = new DOMException(
        'User cancelled the requestDevice() chooser.',
        'NotFoundError',
      );
      fake.steps.failNext('requestDevice', cancelled);
      const message =
        'Choosing the scale: NotFoundError: User cancelled the requestDevice() chooser.';
      await expect(transport.connect()).rejects.toMatchObject({
        name: 'TransportError',
        code: 'connect-failed',
        message,
        cause: cancelled,
      });
      expect(transport.status).toEqual({ state: 'disconnected', reason: 'error', message });
      expect(statuses.map((s) => s.state)).toEqual(['connecting', 'disconnected']);
      expect(fake.log).not.toContain('gatt.connect');
    });

    it.each([
      ['connect', 'Connecting', false],
      ['getPrimaryService', 'Getting service 0FFE', false],
      ['getCharacteristic ff11', 'Getting characteristic FF11', false],
      ['getCharacteristic ff12', 'Getting characteristic FF12', false],
      ['startNotifications ff11', 'Starting notifications on FF11', true],
      ['startNotifications ff12', 'Starting notifications on FF12', true],
    ])('fails at %s: "%s: …", and closes GATT', async (step, label, afterConnected) => {
      const { fake, transport, statuses } = setup();
      fake.steps.failNext(step, new DOMException('GATT operation failed.', 'NetworkError'));
      const message = `${label}: NetworkError: GATT operation failed.`;
      await expect(transport.connect()).rejects.toMatchObject({ code: 'connect-failed', message });
      expect(transport.status).toEqual({ state: 'disconnected', reason: 'error', message });
      expect(statuses.map((s) => s.state)).toEqual(
        afterConnected
          ? ['connecting', 'connected', 'disconnected']
          : ['connecting', 'disconnected'],
      );
      expect(fake.log.at(-2)).toBe('gatt.disconnect');
      expect(fake.scale.gatt.connected).toBe(false);
      expect(fake.scale.ff11.listeners + fake.scale.ff12.listeners).toBe(0);
      expect(fake.scale.disconnectListeners).toBe(0);
    });

    it('rejects a command sent on connected when the subscription then fails', async () => {
      const { fake, transport } = setup();
      fake.steps.failNext('startNotifications ff11', new Error('no CCCD'));
      const sent: Promise<void>[] = [];
      transport.onStatus((status) => {
        if (status.state === 'connected') sent.push(transport.send(flowSmoothingOff()));
      });
      await expect(transport.connect()).rejects.toMatchObject({ code: 'connect-failed' });
      expect(sent).toHaveLength(1);
      await expect(sent[0]).rejects.toMatchObject({ code: 'disconnected' });
      expect(fake.writes).toEqual([]);
    });

    it('fails when Web Bluetooth is missing, and offers no reconnect', async () => {
      // Node's navigator has no bluetooth, like a browser without Web Bluetooth.
      const transport = new WebBluetoothTransport({ scheduler: new ManualClock() });
      expect(transport.available).toBe(false);
      expect(transport.reconnectKnownDevice).toBeUndefined();
      const message = "Choosing the scale: Web Bluetooth isn't available in this browser";
      await expect(transport.connect()).rejects.toMatchObject({ code: 'connect-failed', message });
      expect(transport.status).toEqual({ state: 'disconnected', reason: 'error', message });
    });

    it('fails when requestDevice throws instead of rejecting', async () => {
      const bluetooth: BluetoothApi = {
        requestDevice() {
          throw new TypeError('Invalid filters');
        },
      };
      const transport = new WebBluetoothTransport({ bluetooth, scheduler: new ManualClock() });
      await expect(transport.connect()).rejects.toMatchObject({
        code: 'connect-failed',
        message: 'Choosing the scale: TypeError: Invalid filters',
      });
    });

    it('fails when the device has no GATT server', async () => {
      const bluetooth: BluetoothApi = {
        requestDevice: () =>
          Promise.resolve({ id: 'x', addEventListener() {}, removeEventListener() {} }),
      };
      const transport = new WebBluetoothTransport({ bluetooth, scheduler: new ManualClock() });
      await expect(transport.connect()).rejects.toMatchObject({
        code: 'connect-failed',
        message: 'Connecting: The browser gave no GATT server for the device',
      });
    });
  });

  describe('notifications', () => {
    it('copies the bytes out of a buffer the runtime reuses, stamped on the clock', async () => {
      const { clock, fake, notifications } = await connected();
      const first = [0x03, 0x0b, 0x01, 0x02];
      fake.scale.ff11.notify(first);
      clock.advance(100);
      fake.scale.ff11.notify([0x03, 0x0b, 0x09, 0x09, 0x09, 0x09]); // same buffer, overwritten
      expect([...notifications[0].bytes]).toEqual(first);
      expect([...notifications[1].bytes]).toEqual([0x03, 0x0b, 0x09, 0x09, 0x09, 0x09]);
      // An exact copy: its own buffer, holding just these bytes.
      expect(notifications[0].bytes.buffer).not.toBe(fake.scale.ff11.value!.buffer);
      expect(notifications[0].bytes.byteOffset).toBe(0);
      expect(notifications[0].bytes.buffer.byteLength).toBe(first.length);
      expect(notifications.map((n) => [n.source, n.tArrival])).toEqual([
        ['ff11', 1000],
        ['ff11', 1100],
      ]);
    });

    it('tags FF12 notifications with their source', async () => {
      const { fake, notifications } = await connected();
      fake.scale.ff12.notify([0x03, 0x0d, 0x01]);
      expect(notifications).toMatchObject([{ source: 'ff12' }]);
      expect([...notifications[0].bytes]).toEqual([0x03, 0x0d, 0x01]);
    });

    it('delivers one that arrives before startNotifications() has resolved', async () => {
      const { fake, transport, notifications } = setup();
      fake.steps.hold('startNotifications ff11');
      const connecting = transport.connect();
      await settle();
      expect(fake.steps.waiting('startNotifications ff11')).toBe(1);
      fake.scale.ff11.notify([1, 2, 3]); // the scale started sending as soon as it could
      expect(notifications.map((n) => [...n.bytes])).toEqual([[1, 2, 3]]);
      fake.steps.release('startNotifications ff11');
      await connecting;
    });

    it('reads the value off the characteristic when the event has no target', async () => {
      const { fake, notifications } = await connected();
      fake.scale.ff11.notify([7, 8], { target: 'none' });
      expect([...notifications[0].bytes]).toEqual([7, 8]);
    });

    it("reads the event target's value when the target is another object", async () => {
      const { fake, notifications } = await connected();
      fake.scale.ff11.notify([1, 1]);
      fake.scale.ff11.notify([2, 2], { target: 'copy' }); // the characteristic still has [1, 1]
      expect(notifications.map((n) => [...n.bytes])).toEqual([
        [1, 1],
        [2, 2],
      ]);
    });

    it('delivers an event with no readable value as zero bytes: raw keeps what arrived', async () => {
      const { fake, notifications } = await connected();
      fake.scale.ff11.notifyWithoutValue();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].bytes).toEqual(new Uint8Array(0));
    });
  });

  describe('commands', () => {
    it('writes one at a time, about 100 ms apart, with response when FF12 allows it', async () => {
      const { clock, fake, transport } = await connected();
      fake.steps.hold('write');
      const sent = [
        transport.send(tare()),
        transport.send(tareAndStartTimer()),
        transport.send(stopTimer()),
      ];
      expect(fake.writes).toEqual([
        { method: 'writeValueWithResponse', hex: '030A01000008', atMs: 1000 },
      ]);
      clock.advance(1000); // the first write hasn't finished, so nothing else starts
      expect(fake.writes).toHaveLength(1);
      fake.steps.release('write');
      await settle();
      clock.advance(99);
      expect(fake.writes).toHaveLength(1);
      clock.advance(1);
      fake.steps.release('write');
      await settle();
      clock.advance(100);
      fake.steps.release('write');
      await Promise.all(sent);
      expect(fake.writes.map((w) => [w.hex, w.atMs])).toEqual([
        ['030A01000008', 1000],
        ['030A0700000E', 2100],
        ['030A0500000C', 2200],
      ]);
      expect(fake.maxWritesInFlight).toBe(1);
    });

    it.each<[string, FakeCharacteristicOptions, WriteMethod]>([
      [
        'with response when FF12 has write',
        { properties: { ...NO_PROPERTIES, write: true, writeWithoutResponse: true } },
        'writeValueWithResponse',
      ],
      [
        'without response when that is all FF12 has',
        { properties: { ...NO_PROPERTIES, writeWithoutResponse: true } },
        'writeValueWithoutResponse',
      ],
      [
        'writeValue when the runtime lacks writeValueWithResponse',
        { properties: { ...NO_PROPERTIES, write: true }, methods: ['writeValue'] },
        'writeValue',
      ],
      ['writeValue when no properties are reported', { properties: null }, 'writeValue'],
      [
        'whatever method there is when no properties are reported',
        { properties: null, methods: ['writeValueWithoutResponse'] },
        'writeValueWithoutResponse',
      ],
    ])('writes %s', async (_, ff12, method) => {
      const { fake, transport } = await connected({ scale: { ff12 } });
      await transport.send(tare());
      expect(fake.writes).toMatchObject([{ method, hex: '030A01000008' }]);
    });

    it('fails a write when FF12 has no write method', async () => {
      const { transport } = await connected({ scale: { ff12: { methods: [] } } });
      await expect(transport.send(tare())).rejects.toMatchObject({
        code: 'write-failed',
        message: 'Writing "tare" failed: FF12 has no write method',
      });
    });

    it('turns a failed write into write-failed, naming the method, and carries on', async () => {
      const { clock, fake, transport } = await connected();
      fake.steps.failNext('write', new DOMException('GATT operation failed.', 'NetworkError'));
      await expect(transport.send(tare())).rejects.toMatchObject({
        code: 'write-failed',
        message:
          'Writing "tare" failed: writeValueWithResponse: NetworkError: GATT operation failed.',
      });
      const next = transport.send(stopTimer());
      clock.advance(100);
      await next;
      expect(fake.writes.map((w) => w.hex)).toEqual(['030A01000008', '030A0500000C']);
    });

    // D-015: the queue checks each command and copies its bytes right before the write, so a
    // command changed while it waited never reaches the scale.
    it('refuses a command changed while it waited, and the scale never sees it', async () => {
      const { clock, fake, transport } = await connected();
      fake.steps.hold('write');
      const first = transport.send(tare());
      const tampered = tare();
      const refused = transport.send(tampered);
      const third = transport.send(setBuzzer(0));
      tampered.bytes[2] = 0x15; // tare turned into shutdown
      tampered.bytes[5] = 0x1c;
      fake.steps.release('write');
      await first;
      clock.advance(100);
      await expect(refused).rejects.toMatchObject({ code: 'refused' });
      fake.steps.release('write');
      await third;
      expect(fake.writes.map((w) => w.hex)).toEqual(['030A01000008', '030A0200000B']);
    });

    it('holds a command sent on connected until both subscriptions are done', async () => {
      const { fake, transport } = setup();
      fake.steps.hold('startNotifications ff11');
      fake.steps.hold('startNotifications ff12');
      const sent: Promise<void>[] = [];
      transport.onStatus((status) => {
        if (status.state === 'connected') sent.push(transport.send(flowSmoothingOff()));
      });
      const connecting = transport.connect();
      await settle();
      expect(sent).toHaveLength(1);
      fake.steps.release('startNotifications ff11');
      await settle();
      expect(fake.writes).toEqual([]); // FF12's subscription is still a GATT operation in flight
      fake.steps.release('startNotifications ff12');
      await connecting;
      await sent[0];
      expect(fake.writes.map((w) => w.hex)).toEqual(['030A08000001']);
    });

    it('rejects a command when not connected', async () => {
      const { fake, transport } = setup();
      await expect(transport.send(tare())).rejects.toMatchObject({ code: 'not-connected' });
      fake.steps.hold('connect');
      void transport.connect();
      await expect(transport.send(tare())).rejects.toMatchObject({ code: 'not-connected' });
    });
  });

  describe('disconnecting', () => {
    it('disconnect(): listeners off, commands rejected, GATT closed, then one status', async () => {
      const { fake, transport, statuses, notifications } = await connected();
      fake.steps.hold('write');
      const inFlight = transport.send(tare());
      const queued = transport.send(stopTimer());
      fake.log.length = 0;
      await transport.disconnect();
      // Listeners come off before the GATT disconnect, whose event then finds no one.
      expect(fake.log).toEqual([
        'unlisten gattserverdisconnected',
        'unlisten ff11',
        'unlisten ff12',
        'gatt.disconnect',
        'status disconnected',
      ]);
      expect(statuses.at(-1)).toEqual({ state: 'disconnected', reason: 'user', message: null });
      expect(statuses.filter((s) => s.state === 'disconnected')).toHaveLength(1);
      // The write the runtime never finished settles too, so send() never hangs.
      await expect(inFlight).rejects.toMatchObject({ code: 'disconnected' });
      await expect(queued).rejects.toMatchObject({ code: 'disconnected' });
      expect(fake.scale.gatt.connected).toBe(false);
      fake.scale.ff11.notify([1]);
      expect(notifications).toEqual([]);
      await expect(transport.send(tare())).rejects.toMatchObject({ code: 'not-connected' });
      await transport.disconnect(); // a no-op now
      expect(statuses.filter((s) => s.state === 'disconnected')).toHaveLength(1);
    });

    it("ignores a notification from a listener the runtime wouldn't remove", async () => {
      const { fake, transport, notifications } = await connected();
      const characteristic = fake.scale.ff11;
      Object.defineProperty(characteristic, 'removeEventListener', {
        value: () => {
          throw new Error('not supported');
        },
      });
      await transport.disconnect();
      expect(transport.status).toMatchObject({ state: 'disconnected', reason: 'user' });
      expect(characteristic.listeners).toBe(1); // still attached
      characteristic.notify([1, 2]);
      expect(notifications).toEqual([]);
    });

    it('reports the link dropping as the device, and stops', async () => {
      const { fake, transport, statuses, notifications } = await connected();
      fake.steps.hold('write');
      const inFlight = transport.send(tare());
      const queued = transport.send(stopTimer());
      fake.scale.dropLink();
      expect(transport.status).toEqual({
        state: 'disconnected',
        reason: 'device',
        message: 'The connection to the scale was lost',
      });
      expect(statuses.map((s) => s.state)).toEqual(['connecting', 'connected', 'disconnected']);
      await expect(inFlight).rejects.toMatchObject({ code: 'disconnected' });
      await expect(queued).rejects.toMatchObject({ code: 'disconnected' });
      fake.scale.ff11.notify([1]);
      expect(notifications).toEqual([]);
      expect(fake.scale.ff11.listeners + fake.scale.disconnectListeners).toBe(0);
    });

    it('cancels while the chooser is open, and ignores the device chosen afterwards', async () => {
      const { fake, transport, statuses } = setup();
      fake.steps.hold('requestDevice');
      const connecting = transport.connect();
      await transport.disconnect();
      await expect(connecting).rejects.toMatchObject({
        code: 'connect-failed',
        message: 'Cancelled by disconnect()',
      });
      fake.steps.release('requestDevice');
      await settle();
      expect(fake.log).not.toContain('gatt.connect');
      expect(statuses).toEqual([
        { state: 'connecting' },
        { state: 'disconnected', reason: 'user', message: null },
      ]);
    });

    it('cancels mid-connect, and lets go of a connection the runtime finishes anyway', async () => {
      const { fake, transport } = setup();
      fake.steps.hold('connect');
      const connecting = transport.connect();
      await settle();
      await transport.disconnect();
      await expect(connecting).rejects.toMatchObject({ code: 'connect-failed' });
      fake.steps.release('connect'); // a runtime that couldn't abort it
      await settle();
      expect(fake.scale.gatt.connected).toBe(false);
      expect(fake.log.filter((line) => line === 'gatt.disconnect')).toHaveLength(2);
      expect(fake.log).not.toContain('getPrimaryService 0ffe');
    });

    it('fails the connection at once when the link drops during setup', async () => {
      const { fake, transport, statuses } = setup();
      fake.steps.hold('getPrimaryService');
      const connecting = transport.connect();
      await settle();
      fake.scale.dropLink();
      await expect(connecting).rejects.toMatchObject({
        code: 'connect-failed',
        message: 'The connection to the scale was lost',
      });
      expect(transport.status).toMatchObject({ state: 'disconnected', reason: 'device' });
      fake.steps.release('getPrimaryService'); // it fails now, and nothing more happens
      await settle();
      expect(fake.log).not.toContain('getCharacteristic ff11');
      expect(statuses.map((s) => s.state)).toEqual(['connecting', 'disconnected']);
    });

    it('stops the setup when a status listener disconnects on connected', async () => {
      const { fake, transport, statuses } = setup();
      transport.onStatus((status) => {
        if (status.state === 'connected') void transport.disconnect();
      });
      await expect(transport.connect()).rejects.toMatchObject({
        code: 'connect-failed',
        message: 'Cancelled by disconnect()',
      });
      expect(fake.log).not.toContain('startNotifications ff11');
      // Every listener sees the statuses in order (the Emitter queues the nested one).
      expect(statuses.map((s) => s.state)).toEqual(['connecting', 'connected', 'disconnected']);
    });

    it('never opens the chooser when a status listener disconnects on connecting', async () => {
      const { fake, transport } = setup();
      transport.onStatus((status) => {
        if (status.state === 'connecting') void transport.disconnect();
      });
      await expect(transport.connect()).rejects.toMatchObject({ code: 'connect-failed' });
      expect(fake.log).not.toContain('requestDevice');
      expect(transport.status.state).toBe('disconnected');
    });
  });

  describe('reconnectKnownDevice', () => {
    it('is there only when the runtime has getDevices()', () => {
      expect(setup().transport.reconnectKnownDevice).toBeTypeOf('function');
      expect(setup({ getDevices: false }).transport.reconnectKnownDevice).toBeUndefined();
    });

    it('reconnects to the last device without the chooser', async () => {
      const { fake, transport } = await connected();
      await transport.disconnect();
      fake.log.length = 0;
      const info = await transport.reconnectKnownDevice!();
      expect(fake.log.slice(0, 3)).toEqual(['status connecting', 'getDevices', 'gatt.connect']);
      expect(fake.log).not.toContain('requestDevice');
      expect(info.device).toEqual({ name: 'BOOKOO_SC', id: 'fake-scale' });
      expect(transport.status.state).toBe('connected');
    });

    it('finds the scale by name on a fresh page, among other devices', async () => {
      const { fake, transport } = setup();
      fake.known = [
        fake.device({ id: 'buds', name: 'Earbuds' }),
        fake.device({ id: 'anon', name: null }),
        fake.scale,
      ];
      const info = await transport.reconnectKnownDevice!();
      expect(info.device.id).toBe('fake-scale');
    });

    it('prefers the device of the last connection to another scale', async () => {
      const { fake, transport } = setup();
      const second = fake.device({ id: 'second-scale', name: 'BOOKOO_SC 2' });
      fake.chosen = second;
      await transport.connect();
      await transport.disconnect();
      fake.known = [fake.scale, second];
      const info = await transport.reconnectKnownDevice!();
      expect(info.device.id).toBe('second-scale');
    });

    it('looks for the remembered scale first, from an earlier page', async () => {
      const { fake, transport } = setup();
      const second = fake.device({ id: 'second-scale', name: 'Not named BOOKOO' });
      fake.known = [fake.scale, second];
      const info = await transport.reconnectKnownDevice!('second-scale');
      expect(info.device.id).toBe('second-scale');
    });

    it('takes the remembered scale over the last connection, which takes one by name', async () => {
      const { fake, transport } = setup();
      const second = fake.device({ id: 'second-scale', name: 'BOOKOO_SC 2' });
      const third = fake.device({ id: 'third-scale', name: 'BOOKOO_SC 3' });
      fake.chosen = second;
      await transport.connect();
      await transport.disconnect();
      fake.known = [fake.scale, second, third];
      expect((await transport.reconnectKnownDevice!('third-scale')).device.id).toBe('third-scale');
      await transport.disconnect();
      // A remembered scale the browser no longer lists: this page's last, then any scale.
      expect((await transport.reconnectKnownDevice!('gone')).device.id).toBe('third-scale');
      await transport.disconnect();
      fake.known = [fake.scale, second];
      expect((await transport.reconnectKnownDevice!(null)).device.id).toBe('fake-scale');
    });

    it('says what getDevices() returned when no scale is among them', async () => {
      const { fake, transport } = setup();
      fake.known = [
        fake.device({ id: 'buds', name: 'Earbuds' }),
        fake.device({ id: 'anon', name: null }),
      ];
      await expect(transport.reconnectKnownDevice!()).rejects.toMatchObject({
        code: 'no-known-device',
        message:
          'Finding the known scale: getDevices() returned 2 devices, none named BOOKOO…: "Earbuds", one with no name',
      });
      fake.known = [fake.device({ id: 'buds', name: 'Earbuds' })];
      await expect(transport.reconnectKnownDevice!()).rejects.toMatchObject({
        message:
          'Finding the known scale: getDevices() returned 1 device, not named BOOKOO…: "Earbuds"',
      });
      fake.known = [];
      await expect(transport.reconnectKnownDevice!('fake-scale')).rejects.toMatchObject({
        code: 'no-known-device',
        message: 'Finding the known scale: getDevices() returned no devices',
      });
      expect(fake.log).not.toContain('gatt.connect');
      expect(transport.status).toEqual({
        state: 'disconnected',
        reason: 'error',
        message: 'Finding the known scale: getDevices() returned no devices',
      });
    });

    it('fails as connect-failed when the known scale is listed but out of reach', async () => {
      const { fake, transport } = setup();
      fake.steps.failNext(
        'connect',
        new DOMException('Connection attempt failed.', 'NetworkError'),
      );
      await expect(transport.reconnectKnownDevice!('fake-scale')).rejects.toMatchObject({
        code: 'connect-failed',
        message: 'Connecting: NetworkError: Connection attempt failed.',
      });
    });

    it('can be cancelled while it waits for the scale, and the chooser opened in the same tap', async () => {
      const { fake, transport } = setup();
      fake.steps.hold('connect'); // CoreBluetooth waits until the scale is switched on
      const waiting = transport.reconnectKnownDevice!('fake-scale');
      await settle();
      expect(fake.steps.waiting('connect')).toBe(1);
      fake.log.length = 0;
      void transport.disconnect();
      expect(transport.status).toEqual({ state: 'disconnected', reason: 'user', message: null });
      const chosen = transport.connect();
      expect(fake.log).toEqual([
        'gatt.disconnect',
        'status disconnected',
        'status connecting',
        'requestDevice',
      ]);
      await expect(waiting).rejects.toMatchObject({ code: 'connect-failed' });
      await settle();
      expect(fake.steps.waiting('connect')).toBe(2); // the cancelled attempt's, then the chooser's
      fake.steps.release('connect'); // the cancelled attempt connects late, and is let go
      await settle();
      expect(fake.scale.gatt.connected).toBe(false);
      fake.steps.release('connect');
      await expect(chosen).resolves.toMatchObject({ device: { id: 'fake-scale' } });
      expect(transport.status.state).toBe('connected');
    });

    it('fails when getDevices() does', async () => {
      const { fake, transport } = setup();
      fake.steps.failNext('getDevices', new DOMException('Not allowed.', 'SecurityError'));
      await expect(transport.reconnectKnownDevice!()).rejects.toMatchObject({
        code: 'connect-failed',
        message: 'Finding the known scale: SecurityError: Not allowed.',
      });
    });

    it('is busy while connected', async () => {
      const { transport } = await connected();
      await expect(transport.reconnectKnownDevice!()).rejects.toMatchObject({ code: 'busy' });
    });
  });

  it('uses navigator.bluetooth by default, looked up each time it is needed', async () => {
    const transport = new WebBluetoothTransport({ scheduler: new ManualClock() });
    expect(transport.available).toBe(false);
    expect(transport.reconnectKnownDevice).toBeUndefined();
    const fake = new FakeBluetooth();
    vi.stubGlobal('navigator', { bluetooth: fake }); // a shim injecting it after the app loaded
    expect(transport.available).toBe(true);
    expect(transport.reconnectKnownDevice).toBeTypeOf('function');
    await transport.connect();
    expect(fake.log).toContain('requestDevice');
    expect(transport.status.state).toBe('connected');
  });
});
