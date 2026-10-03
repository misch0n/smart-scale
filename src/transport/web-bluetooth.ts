/**
 * The Web Bluetooth `ScaleTransport` (T1.4, D-022), and the only module that touches
 * `navigator.bluetooth` (CLAUDE.md hard rule 4; lint enforces it). It runs wherever the API
 * exists: beacio or Bluefy on iOS (D-016), and desktop Chrome for development.
 *
 * Connecting goes in this order:
 * 1. `connect()` calls `requestDevice()` synchronously. The chooser needs the user activation
 *    of the click that called `connect()`, and an `await` before it would lose it. The filters
 *    match the service or the name, because the scale may not advertise its service
 *    (protocol-notes, finding 12; hardware test A14).
 * 2. GATT connect, then the service, FF11 and FF12. Both characteristics' properties are
 *    reported as the runtime gives them (hardware test A15).
 * 3. The notification listeners go on, and the status turns `connected`, before anything is
 *    subscribed. The recorder creates its recording on `connected`, so no frame can arrive
 *    before the recording exists (D-020).
 * 4. `startNotifications()` on FF11, then on FF12 if it can notify or indicate. `connect()`
 *    resolves once both have started. A command sent before then waits, so GATT operations
 *    never overlap.
 *
 * There is no reconnect loop and no timeout. `disconnect()` cancels a connection in progress,
 * and a dropped link ends in `disconnected` with reason `device`. What to do after that is
 * T1.21's job.
 */

import type { CharacteristicName, CharacteristicProperties, DisconnectReason } from '../core/model';
import {
  COMMAND_CHARACTERISTIC_UUID,
  DEVICE_NAME_PREFIX,
  SERVICE_UUID,
  SERVICE_UUID16,
  WEIGHT_CHARACTERISTIC_UUID,
  type ScaleCommand,
} from '../core/protocol';
import { CommandQueue, type CommandWriter } from './command-queue';
import { Emitter, type Unsubscribe } from './emitter';
import { systemScheduler, type Scheduler } from './scheduler';
import {
  TransportError,
  type ConnectionInfo,
  type ScaleNotification,
  type ScaleTransport,
  type TransportStatus,
} from './types';

// The parts of the Web Bluetooth API the transport uses. They are narrower than the
// `@types/web-bluetooth` ones, so a test can hand in a small fake, and `systemBluetooth()`
// checks at compile time that the real API fits them. Members a shim might leave out are
// optional.

/** `navigator.bluetooth`. */
export interface BluetoothApi {
  requestDevice(options: RequestDeviceOptions): Promise<BluetoothDeviceApi>;
  /** Missing where the runtime can't list the devices it already has permission for. */
  getDevices?(): Promise<BluetoothDeviceApi[]>;
}

export interface BluetoothDeviceApi {
  readonly id?: string;
  readonly name?: string;
  readonly gatt?: BluetoothServerApi;
  addEventListener(type: 'gattserverdisconnected', listener: (event: Event) => void): void;
  removeEventListener(type: 'gattserverdisconnected', listener: (event: Event) => void): void;
}

export interface BluetoothServerApi {
  connect(): Promise<BluetoothServerApi>;
  disconnect(): void;
  getPrimaryService(service: string): Promise<BluetoothServiceApi>;
}

export interface BluetoothServiceApi {
  getCharacteristic(characteristic: string): Promise<BluetoothCharacteristicApi>;
}

export interface BluetoothCharacteristicApi {
  /** A property the runtime doesn't report is recorded as null. */
  readonly properties?: { readonly [K in keyof CharacteristicProperties]?: unknown };
  readonly value?: DataView | null;
  startNotifications(): Promise<unknown>;
  writeValueWithResponse?(value: BufferSource): Promise<void>;
  writeValueWithoutResponse?(value: BufferSource): Promise<void>;
  /** Deprecated, but older shims may have only this. The runtime picks the write type. */
  writeValue?(value: BufferSource): Promise<void>;
  addEventListener(type: 'characteristicvaluechanged', listener: (event: Event) => void): void;
  removeEventListener(type: 'characteristicvaluechanged', listener: (event: Event) => void): void;
}

export type WriteMethod = 'writeValueWithResponse' | 'writeValueWithoutResponse' | 'writeValue';

export interface WebBluetoothTransportOptions {
  /**
   * Default `navigator.bluetooth`, read each time it's needed rather than once, because shims
   * inject it into the page. Tests pass a fake.
   */
  readonly bluetooth?: BluetoothApi;
  /** Default `systemScheduler`. Its clock stamps `tArrival`. */
  readonly scheduler?: Scheduler;
  /** ms from the end of one command write to the start of the next. Default 100. */
  readonly writeSpacingMs?: number;
}

/** A fresh copy each call, so a runtime can't change the one the next call uses. */
export function requestDeviceOptions(): RequestDeviceOptions {
  return {
    // Filters are OR-ed: either the advertised service or the name finds the scale.
    filters: [{ services: [SERVICE_UUID] }, { namePrefix: DEVICE_NAME_PREFIX }],
    // Grants access to the service when only the name matched.
    optionalServices: [SERVICE_UUID],
  };
}

/**
 * How commands are written to FF12. With response when the characteristic allows it, so a
 * resolved write means the scale received it; else without response; else the deprecated
 * `writeValue`, which lets the runtime choose. A runtime that reports no properties gets
 * `writeValue` too.
 *
 * @returns null when the characteristic has no write method at all.
 */
export function chooseWriteMethod(
  characteristic: BluetoothCharacteristicApi,
  properties: CharacteristicProperties,
): WriteMethod | null {
  const has = (method: WriteMethod): boolean => typeof characteristic[method] === 'function';
  if (properties.write === true && has('writeValueWithResponse')) return 'writeValueWithResponse';
  if (properties.writeWithoutResponse === true && has('writeValueWithoutResponse')) {
    return 'writeValueWithoutResponse';
  }
  const fallbacks: WriteMethod[] = [
    'writeValue',
    'writeValueWithResponse',
    'writeValueWithoutResponse',
  ];
  return fallbacks.find(has) ?? null;
}

const LINK_LOST = 'The connection to the scale was lost';

export class WebBluetoothTransport implements ScaleTransport {
  readonly kind = 'web-bluetooth';

  readonly #bluetooth: BluetoothApi | undefined;
  readonly #scheduler: Scheduler;
  readonly #writeSpacingMs: number;
  readonly #notifications = new Emitter<ScaleNotification>();
  readonly #statuses = new Emitter<TransportStatus>();
  #status: TransportStatus = { state: 'disconnected', reason: null, message: null };
  /** The connection, from `connect()` until `disconnected`; null while disconnected. */
  #link: Link | null = null;
  /** The device of the last connection, which `reconnectKnownDevice()` looks for first. */
  #lastDeviceId: string | null = null;

  constructor(options: WebBluetoothTransportOptions = {}) {
    this.#bluetooth = options.bluetooth;
    this.#scheduler = options.scheduler ?? systemScheduler;
    this.#writeSpacingMs = options.writeSpacingMs ?? 100;
  }

  get status(): TransportStatus {
    return this.#status;
  }

  now(): number {
    return this.#scheduler.now();
  }

  /**
   * Present when the runtime has `getDevices()` (hardware test B3), checked on each access. It
   * picks the device of this transport's last connection if the runtime still lists it, and
   * otherwise the first device whose name starts with `BOOKOO`.
   */
  get reconnectKnownDevice(): (() => Promise<ConnectionInfo>) | undefined {
    if (typeof this.#api()?.getDevices !== 'function') return undefined;
    return () => this.#open('Finding the known scale', (bluetooth) => this.#knownDevice(bluetooth));
  }

  /** Call it synchronously from a click handler, with no `await` before it: the chooser opens. */
  connect(): Promise<ConnectionInfo> {
    return this.#open('Choosing the scale', (bluetooth) =>
      bluetooth.requestDevice(requestDeviceOptions()),
    );
  }

  disconnect(): Promise<void> {
    if (this.#link) this.#end(this.#link, 'user', null);
    return Promise.resolve();
  }

  send(command: ScaleCommand): Promise<void> {
    const queue = this.#link?.queue;
    if (this.#status.state !== 'connected' || !queue) {
      return Promise.reject(new TransportError('not-connected', 'The scale is not connected'));
    }
    return queue.enqueue(command);
  }

  onNotification(listener: (notification: ScaleNotification) => void): Unsubscribe {
    return this.#notifications.on(listener);
  }

  onStatus(listener: (status: TransportStatus) => void): Unsubscribe {
    return this.#statuses.on(listener);
  }

  #api(): BluetoothApi | undefined {
    return this.#bluetooth ?? systemBluetooth();
  }

  #open(
    firstStep: string,
    pick: (bluetooth: BluetoothApi) => Promise<BluetoothDeviceApi>,
  ): Promise<ConnectionInfo> {
    if (this.#status.state !== 'disconnected') {
      return Promise.reject(new TransportError('busy', `Already ${this.#status.state}`));
    }
    const link = new Link(firstStep);
    this.#link = link;
    this.#setStatus({ state: 'connecting' });
    // A status listener may have disconnected already.
    if (!link.closed) {
      void this.#setUp(link, pick).catch((error: unknown) => {
        this.#end(link, 'error', `${link.step}: ${errorText(error)}`, error);
      });
    }
    return link.opened.promise;
  }

  async #setUp(
    link: Link,
    pick: (bluetooth: BluetoothApi) => Promise<BluetoothDeviceApi>,
  ): Promise<void> {
    const bluetooth = this.#api();
    if (!bluetooth) throw new Error("Web Bluetooth isn't available in this browser");
    // Everything up to this first await runs synchronously inside connect(), so the chooser
    // still has the click's user activation. Don't add an await above this line.
    const device = await pick(bluetooth);
    if (link.closed) return;
    link.device = device;

    link.step = 'Connecting';
    const gatt = device.gatt;
    if (!gatt) throw new Error('The browser gave no GATT server for the device');
    const server = await gatt.connect();
    if (link.closed) {
      // Cancelled meanwhile. A runtime that finished connecting anyway must let go again.
      disconnectQuietly(gatt);
      return;
    }
    // Listened for only from now on: an event left over from an earlier connection to the
    // same device can't then be taken for this one's.
    const onLost = (): void => this.#end(link, 'device', LINK_LOST);
    device.addEventListener('gattserverdisconnected', onLost);
    link.cleanup.push(() => device.removeEventListener('gattserverdisconnected', onLost));

    link.step = `Getting service ${hex16(SERVICE_UUID16)}`;
    const service = await server.getPrimaryService(SERVICE_UUID);
    if (link.closed) return;
    link.step = 'Getting characteristic FF11';
    const ff11 = await service.getCharacteristic(WEIGHT_CHARACTERISTIC_UUID);
    if (link.closed) return;
    link.step = 'Getting characteristic FF12';
    const ff12 = await service.getCharacteristic(COMMAND_CHARACTERISTIC_UUID);
    if (link.closed) return;

    const characteristics = { ff11, ff12 };
    const properties = { ff11: readProperties(ff11), ff12: readProperties(ff12) };
    // FF11 carries the weight, so it's subscribed whatever it reports; if it really can't
    // notify, startNotifications() says so. FF12 is subscribed only when it says it can
    // (protocol-notes, finding 14).
    const subscribed: CharacteristicName[] = canNotify(properties.ff12)
      ? ['ff11', 'ff12']
      : ['ff11'];
    for (const source of subscribed) this.#listen(link, source, characteristics[source]);
    link.queue = new CommandQueue(
      this.#writer(link, ff12, chooseWriteMethod(ff12, properties.ff12)),
      this.#scheduler,
      this.#writeSpacingMs,
    );
    const connection: ConnectionInfo = {
      device: { name: device.name ?? null, id: device.id ?? null },
      properties,
      subscribed,
    };
    this.#lastDeviceId = connection.device.id;
    this.#setStatus({ state: 'connected', connection });

    for (const source of subscribed) {
      if (link.closed) return; // a status listener may have disconnected
      link.step = `Starting notifications on ${source.toUpperCase()}`;
      await characteristics[source].startNotifications();
    }
    if (link.closed) return;
    link.ready = true;
    link.subscribed.resolve();
    link.opened.resolve(connection);
  }

  #listen(link: Link, source: CharacteristicName, characteristic: BluetoothCharacteristicApi) {
    const listener = (event: Event): void => {
      if (link.closed) return;
      const tArrival = this.#scheduler.now();
      // The standard puts the value on the event's target, the characteristic. Shims may reuse
      // the buffer behind it for the next notification, so the bytes are copied at once.
      const fromEvent = (event.target as { value?: unknown } | null)?.value;
      const bytes = copyBytes(ArrayBuffer.isView(fromEvent) ? fromEvent : characteristic.value);
      this.#notifications.emit({ source, bytes, tArrival });
    };
    characteristic.addEventListener('characteristicvaluechanged', listener);
    link.cleanup.push(() =>
      characteristic.removeEventListener('characteristicvaluechanged', listener),
    );
  }

  /**
   * Writes for the command queue. The queue has just checked the command against the
   * whitelist and copied its bytes (D-015); no one else holds that copy. Once notifications
   * have started, the GATT write happens in the same synchronous step as that check.
   */
  #writer(
    link: Link,
    characteristic: BluetoothCharacteristicApi,
    method: WriteMethod | null,
  ): CommandWriter {
    const write = async (bytes: Uint8Array<ArrayBuffer>): Promise<void> => {
      if (link.closed) {
        throw new TransportError('disconnected', 'The connection ended before the write');
      }
      if (method === null) throw new Error('FF12 has no write method');
      try {
        // A write the runtime never settles mustn't hold send() forever: the link ending
        // settles it.
        await Promise.race([characteristic[method]!(bytes), link.ended.promise]);
      } catch (error) {
        if (error instanceof TransportError) throw error;
        throw new Error(`${method}: ${errorText(error)}`, { cause: error });
      }
    };
    return (bytes) =>
      link.ready ? write(bytes) : link.subscribed.promise.then(() => write(bytes));
  }

  async #knownDevice(bluetooth: BluetoothApi): Promise<BluetoothDeviceApi> {
    if (!bluetooth.getDevices) throw new Error("getDevices() isn't available");
    const devices = await bluetooth.getDevices();
    const lastId = this.#lastDeviceId;
    const device =
      devices.find((d) => lastId !== null && d.id === lastId) ??
      devices.find((d) => d.name?.startsWith(DEVICE_NAME_PREFIX));
    if (!device) throw new Error(`getDevices() returned ${describeDevices(devices)}`);
    return device;
  }

  /**
   * Ends the link, once: listeners off, commands rejected, the GATT connection closed, then
   * the `disconnected` status. A connection still in progress rejects as `connect-failed`.
   */
  #end(link: Link, reason: DisconnectReason, message: string | null, cause?: unknown): void {
    if (link.closed) return;
    link.closed = true;
    // Listeners come off before the GATT disconnect, whose own event would otherwise arrive.
    for (const undo of link.cleanup.splice(0)) {
      try {
        undo();
      } catch {
        // A listener that won't come off is harmless: it checks `closed` first.
      }
    }
    const ended = new TransportError('disconnected', 'The connection ended');
    link.queue?.clear(ended);
    link.subscribed.reject(ended);
    link.ended.reject(ended);
    disconnectQuietly(link.device?.gatt);
    this.#link = null;
    // Does nothing if connect() already resolved.
    link.opened.reject(
      new TransportError('connect-failed', message ?? 'Cancelled by disconnect()', { cause }),
    );
    this.#setStatus({ state: 'disconnected', reason, message });
  }

  #setStatus(status: TransportStatus): void {
    this.#status = status;
    this.#statuses.emit(status);
  }
}

/** One connection: from `connect()` until it ends, successfully opened or not. */
class Link {
  closed = false;
  /** What the setup is doing, for error messages: "Getting service 0FFE: NotFoundError: …". */
  step: string;
  device: BluetoothDeviceApi | null = null;
  queue: CommandQueue | null = null;
  /** True once notifications have started, when commands go straight to the GATT write. */
  ready = false;
  /** `connect()`'s result. */
  readonly opened = deferred<ConnectionInfo>();
  /** Resolves when notifications have started; rejects if the link ends first. */
  readonly subscribed = deferred<void>();
  /** Rejects when the link ends. */
  readonly ended = deferred<never>();
  /** Removes each listener this link added. */
  readonly cleanup: (() => void)[] = [];

  constructor(step: string) {
    this.step = step;
    // Internal: nothing may be waiting on them when they reject.
    this.subscribed.promise.catch(() => undefined);
    this.ended.promise.catch(() => undefined);
  }
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: Error) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** `navigator.bluetooth`, or undefined where the browser has none. */
function systemBluetooth(): BluetoothApi | undefined {
  if (typeof navigator === 'undefined') return undefined;
  // Typed by @types/web-bluetooth, so returning it as a `BluetoothApi` checks at compile time
  // that the narrow types above fit the real API.
  const bluetooth: Bluetooth | undefined = navigator.bluetooth;
  return bluetooth;
}

function readProperties(characteristic: BluetoothCharacteristicApi): CharacteristicProperties {
  // Read one by one: in browsers they are getters on the prototype, which a spread would miss.
  const reported = characteristic.properties;
  const flag = (name: keyof CharacteristicProperties): boolean | null => {
    const value = reported?.[name];
    return typeof value === 'boolean' ? value : null;
  };
  return {
    broadcast: flag('broadcast'),
    read: flag('read'),
    writeWithoutResponse: flag('writeWithoutResponse'),
    write: flag('write'),
    notify: flag('notify'),
    indicate: flag('indicate'),
    authenticatedSignedWrites: flag('authenticatedSignedWrites'),
    reliableWrite: flag('reliableWrite'),
    writableAuxiliaries: flag('writableAuxiliaries'),
  };
}

function canNotify(properties: CharacteristicProperties): boolean {
  return properties.notify === true || properties.indicate === true;
}

/** A copy of a notification's bytes; none when the runtime gave no readable value. */
function copyBytes(value: unknown): Uint8Array<ArrayBuffer> {
  if (!ArrayBuffer.isView(value)) return new Uint8Array(0);
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
}

function disconnectQuietly(gatt: BluetoothServerApi | undefined): void {
  try {
    gatt?.disconnect();
  } catch {
    // Already gone.
  }
}

function hex16(value: number): string {
  return value.toString(16).toUpperCase().padStart(4, '0');
}

function describeDevices(devices: readonly BluetoothDeviceApi[]): string {
  if (devices.length === 0) return 'no devices';
  const names = devices.map((d) => (d.name ? `"${d.name}"` : 'one with no name'));
  const count = devices.length === 1 ? '1 device, not' : `${devices.length} devices, none`;
  return `${count} named ${DEVICE_NAME_PREFIX}…: ${names.join(', ')}`;
}

/** An error as text, with its name when it has one ("NotFoundError: …"). */
function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.name && error.name !== 'Error' ? `${error.name}: ${error.message}` : error.message;
  }
  return String(error);
}
