/**
 * A hand-written fake of `navigator.bluetooth`, for the Web Bluetooth transport's tests. It
 * offers a BOOKOO scale with service 0FFE and characteristics FF11 and FF12, and logs every call
 * in order, so a test can check the sequence the transport goes through.
 *
 * Each asynchronous step finishes on a microtask unless the test holds it (`steps.hold()`) or
 * fails it (`steps.failNext()`). That lets a test stop the transport at any point: with the
 * chooser open, mid-connect, between `connected` and `startNotifications()`, with a write in
 * flight.
 *
 * It behaves like a careless runtime where the standard allows it. Every notification reuses
 * one buffer, and the bytes sit at an offset in it, so a transport that keeps the `DataView`
 * instead of copying the bytes gets caught. Characteristic properties are prototype getters,
 * as in browsers, so a transport that spreads them gets caught too. `gatt.disconnect()` fires
 * `gattserverdisconnected` synchronously, which catches a transport still listening when it
 * disconnects.
 *
 * Test-only: nothing in the app imports it.
 */

import type { CharacteristicProperties } from '../core/model';
import {
  COMMAND_CHARACTERISTIC_UUID,
  SERVICE_UUID,
  toHex,
  WEIGHT_CHARACTERISTIC_UUID,
} from '../core/protocol';
import type {
  BluetoothApi,
  BluetoothCharacteristicApi,
  BluetoothDeviceApi,
  BluetoothServerApi,
  BluetoothServiceApi,
  WriteMethod,
} from './web-bluetooth';

type PropertyValues = Partial<Record<keyof CharacteristicProperties, boolean>>;

/** Every property false. Spread it and set the ones a test needs. */
export const NO_PROPERTIES: Readonly<Record<keyof CharacteristicProperties, boolean>> = {
  broadcast: false,
  read: false,
  writeWithoutResponse: false,
  write: false,
  notify: false,
  indicate: false,
  authenticatedSignedWrites: false,
  reliableWrite: false,
  writableAuxiliaries: false,
};

const ALL_WRITE_METHODS: readonly WriteMethod[] = [
  'writeValueWithResponse',
  'writeValueWithoutResponse',
  'writeValue',
];

export interface FakeCharacteristicOptions {
  /**
   * What the runtime reports; a property left out is one it doesn't report, and null means it
   * reports no properties at all. Default: FF11 notifies; FF12 writes with and without response
   * and notifies.
   */
  readonly properties?: PropertyValues | null;
  /** The write methods the runtime has. Default all three. */
  readonly methods?: readonly WriteMethod[];
}

export interface FakeDeviceOptions {
  /** Default `fake-scale`. */
  readonly id?: string;
  /** null for a device the runtime gives no name. Default `BOOKOO_SC`. */
  readonly name?: string | null;
  readonly ff11?: FakeCharacteristicOptions;
  readonly ff12?: FakeCharacteristicOptions;
}

export interface FakeBluetoothOptions {
  /** The scale, which the chooser returns and `getDevices()` lists. */
  readonly scale?: FakeDeviceOptions;
  /** Whether the runtime has `getDevices()`. Default true. */
  readonly getDevices?: boolean;
  /** Stamps `writes` with its time. */
  readonly clock?: { now(): number };
}

export interface FakeWrite {
  readonly method: WriteMethod;
  /** The bytes as they were when the write was called, packed hex. */
  readonly hex: string;
  /** On the `clock` option's clock; null without one. */
  readonly atMs: number | null;
}

export class FakeBluetooth implements BluetoothApi {
  /** Every call, in order, like `getPrimaryService 0ffe` or `listen ff11`. */
  readonly log: string[] = [];
  readonly steps = new FakeSteps();
  readonly writes: FakeWrite[] = [];
  writesInFlight = 0;
  maxWritesInFlight = 0;
  readonly clock: { now(): number } | null;
  /** What the last `requestDevice()` call was given. */
  requestOptions: RequestDeviceOptions | null = null;
  /** The scale. The chooser returns it unless a test sets `chosen`. */
  readonly scale: FakeDevice;
  chosen: FakeDevice;
  /** What `getDevices()` returns. */
  known: FakeDevice[];
  /**
   * False while the scale is off or out of reach: `gatt.connect()` then fails, as Chrome's
   * does. (CoreBluetooth waits instead: hold the `connect` step for that.)
   */
  reachable = true;
  readonly getDevices?: () => Promise<FakeDevice[]>;

  constructor(options: FakeBluetoothOptions = {}) {
    this.clock = options.clock ?? null;
    this.scale = this.device(options.scale);
    this.chosen = this.scale;
    this.known = [this.scale];
    if (options.getDevices !== false) {
      this.getDevices = async () => {
        this.log.push('getDevices');
        await this.steps.run('getDevices');
        return [...this.known];
      };
    }
  }

  requestDevice(options: RequestDeviceOptions): Promise<FakeDevice> {
    this.log.push('requestDevice');
    this.requestOptions = options;
    return this.steps.run('requestDevice').then(() => this.chosen);
  }

  /** Makes a device that shares this fake's log and steps. */
  device(options: FakeDeviceOptions = {}): FakeDevice {
    return new FakeDevice(this, options);
  }
}

export class FakeDevice implements BluetoothDeviceApi {
  readonly id: string;
  readonly name: string | undefined;
  readonly gatt: FakeServer;
  readonly ff11: FakeCharacteristic;
  readonly ff12: FakeCharacteristic;
  readonly #fake: FakeBluetooth;
  readonly #listeners = new FakeListeners();

  constructor(fake: FakeBluetooth, options: FakeDeviceOptions) {
    this.#fake = fake;
    this.id = options.id ?? 'fake-scale';
    this.name = options.name === null ? undefined : (options.name ?? 'BOOKOO_SC');
    this.ff11 = new FakeCharacteristic(fake, this, 'ff11', {
      properties: { ...NO_PROPERTIES, notify: true },
      ...options.ff11,
    });
    this.ff12 = new FakeCharacteristic(fake, this, 'ff12', {
      properties: { ...NO_PROPERTIES, write: true, writeWithoutResponse: true, notify: true },
      ...options.ff12,
    });
    this.gatt = new FakeServer(fake, this, new FakeService(fake, this.ff11, this.ff12));
  }

  addEventListener(type: 'gattserverdisconnected', listener: (event: Event) => void): void {
    this.#fake.log.push(`listen ${type}`);
    this.#listeners.add(type, listener);
  }

  removeEventListener(type: 'gattserverdisconnected', listener: (event: Event) => void): void {
    this.#fake.log.push(`unlisten ${type}`);
    this.#listeners.remove(type, listener);
  }

  get disconnectListeners(): number {
    return this.#listeners.count('gattserverdisconnected');
  }

  /** The link drops (the scale switched off, say): the runtime fires `gattserverdisconnected`. */
  dropLink(): void {
    this.gatt.connected = false;
    this.#listeners.fire(eventAt('gattserverdisconnected', this));
  }
}

export class FakeServer implements BluetoothServerApi {
  connected = false;
  readonly #fake: FakeBluetooth;
  readonly #device: FakeDevice;
  readonly #service: FakeService;

  constructor(fake: FakeBluetooth, device: FakeDevice, service: FakeService) {
    this.#fake = fake;
    this.#device = device;
    this.#service = service;
  }

  connect(): Promise<FakeServer> {
    this.#fake.log.push('gatt.connect');
    return this.#fake.steps.run('connect').then(() => {
      if (!this.#fake.reachable) {
        throw new DOMException('Connection attempt failed.', 'NetworkError');
      }
      this.connected = true;
      return this;
    });
  }

  disconnect(): void {
    this.#fake.log.push('gatt.disconnect');
    if (this.connected) this.#device.dropLink();
  }

  getPrimaryService(service: string): Promise<FakeService> {
    this.#fake.log.push(`getPrimaryService ${shortUuid(service)}`);
    return this.#fake.steps.run('getPrimaryService').then(() => {
      requireConnected(this);
      if (service !== SERVICE_UUID) throw notFound(`No service matching ${service}`);
      return this.#service;
    });
  }
}

export class FakeService implements BluetoothServiceApi {
  readonly #fake: FakeBluetooth;
  readonly #characteristics: readonly FakeCharacteristic[];

  constructor(fake: FakeBluetooth, ff11: FakeCharacteristic, ff12: FakeCharacteristic) {
    this.#fake = fake;
    this.#characteristics = [ff11, ff12];
  }

  getCharacteristic(characteristic: string): Promise<FakeCharacteristic> {
    const name = shortUuid(characteristic);
    this.#fake.log.push(`getCharacteristic ${name}`);
    return this.#fake.steps.run(`getCharacteristic ${name}`).then(() => {
      const found = this.#characteristics.find((c) => c.name === name);
      if (!found) throw notFound(`No characteristic matching ${characteristic}`);
      requireConnected(found.device.gatt);
      return found;
    });
  }
}

export class FakeCharacteristic implements BluetoothCharacteristicApi {
  readonly name: 'ff11' | 'ff12';
  readonly device: FakeDevice;
  readonly properties: BluetoothCharacteristicApi['properties'];
  value: DataView | null = null;
  notifying = false;
  readonly writeValueWithResponse: ((value: BufferSource) => Promise<void>) | undefined;
  readonly writeValueWithoutResponse: ((value: BufferSource) => Promise<void>) | undefined;
  readonly writeValue: ((value: BufferSource) => Promise<void>) | undefined;
  readonly #fake: FakeBluetooth;
  readonly #listeners = new FakeListeners();
  /** One buffer for every notification, as a runtime may reuse its own. */
  readonly #buffer = new ArrayBuffer(64);

  constructor(
    fake: FakeBluetooth,
    device: FakeDevice,
    name: 'ff11' | 'ff12',
    options: FakeCharacteristicOptions,
  ) {
    this.#fake = fake;
    this.device = device;
    this.name = name;
    this.properties = options.properties ? withGetters(options.properties) : undefined;
    const methods = options.methods ?? ALL_WRITE_METHODS;
    const method = (m: WriteMethod) =>
      methods.includes(m) ? (value: BufferSource) => this.#write(m, value) : undefined;
    this.writeValueWithResponse = method('writeValueWithResponse');
    this.writeValueWithoutResponse = method('writeValueWithoutResponse');
    this.writeValue = method('writeValue');
  }

  startNotifications(): Promise<this> {
    this.#fake.log.push(`startNotifications ${this.name}`);
    return this.#fake.steps.run(`startNotifications ${this.name}`).then(() => {
      requireConnected(this.device.gatt);
      this.notifying = true;
      return this;
    });
  }

  addEventListener(type: 'characteristicvaluechanged', listener: (event: Event) => void): void {
    this.#fake.log.push(`listen ${this.name}`);
    this.#listeners.add(type, listener);
  }

  removeEventListener(type: 'characteristicvaluechanged', listener: (event: Event) => void): void {
    this.#fake.log.push(`unlisten ${this.name}`);
    this.#listeners.remove(type, listener);
  }

  get listeners(): number {
    return this.#listeners.count('characteristicvaluechanged');
  }

  /**
   * The scale sends `bytes`. They go into the shared buffer, after scribbling over what was
   * there, at an offset, and the event fires on this characteristic. The `target` option
   * imitates shims that dispatch differently:
   * - `none`: the event has no target, so the value is only on the characteristic;
   * - `copy`: the target is another object standing for this characteristic, and only it has
   *   the new value; the characteristic keeps its old one.
   */
  notify(
    bytes: readonly number[],
    options: { readonly target?: 'characteristic' | 'none' | 'copy' } = {},
  ): void {
    const target = options.target ?? 'characteristic';
    if (target === 'copy') {
      const value = new DataView(Uint8Array.from(bytes).buffer);
      this.#listeners.fire(eventAt('characteristicvaluechanged', { value }));
      return;
    }
    const offset = 5;
    new Uint8Array(this.#buffer).fill(0xee);
    new Uint8Array(this.#buffer, offset, bytes.length).set(bytes);
    this.value = new DataView(this.#buffer, offset, bytes.length);
    this.#listeners.fire(eventAt('characteristicvaluechanged', target === 'none' ? null : this));
  }

  /** A notification event with no value to read, as a broken shim might send. */
  notifyWithoutValue(): void {
    this.value = null;
    this.#listeners.fire(eventAt('characteristicvaluechanged', this));
  }

  #write(method: WriteMethod, value: BufferSource): Promise<void> {
    const bytes = ArrayBuffer.isView(value)
      ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice()
      : new Uint8Array(value).slice();
    const hex = toHex(bytes, '');
    const fake = this.#fake;
    fake.log.push(`write ${method} ${hex}`);
    fake.writes.push({ method, hex, atMs: fake.clock?.now() ?? null });
    fake.writesInFlight++;
    fake.maxWritesInFlight = Math.max(fake.maxWritesInFlight, fake.writesInFlight);
    return fake.steps
      .run('write')
      .then(() => requireConnected(this.device.gatt))
      .finally(() => {
        fake.writesInFlight--;
      });
  }
}

/**
 * Controls the fake's asynchronous steps, named like `connect`, `getPrimaryService`,
 * `getCharacteristic ff12`, `startNotifications ff11`, `write`, `requestDevice` and
 * `getDevices`.
 */
export class FakeSteps {
  readonly #holding = new Set<string>();
  readonly #failNext = new Map<string, unknown>();
  readonly #waiting = new Map<string, Deferred[]>();

  /** Calls of `step` wait for `release()`, until `stopHolding(step)`. */
  hold(step: string): void {
    this.#holding.add(step);
  }

  stopHolding(step: string): void {
    this.#holding.delete(step);
  }

  /** The next call of `step` fails with `error`. */
  failNext(step: string, error: unknown): void {
    this.#failNext.set(step, error);
  }

  /** How many calls of `step` are waiting. */
  waiting(step: string): number {
    return this.#waiting.get(step)?.length ?? 0;
  }

  /**
   * Lets the oldest waiting call of `step` finish, or fail with `error`.
   *
   * @throws Error when none is waiting.
   */
  release(step: string, error?: unknown): void {
    const next = this.#waiting.get(step)?.shift();
    if (!next) throw new Error(`FakeSteps: no "${step}" call is waiting`);
    if (error === undefined) next.resolve();
    else next.reject(error);
  }

  async run(step: string): Promise<void> {
    if (this.#failNext.has(step)) {
      const error = this.#failNext.get(step);
      this.#failNext.delete(step);
      await Promise.resolve();
      throw error;
    }
    if (this.#holding.has(step)) {
      const waiter = deferred();
      const list = this.#waiting.get(step) ?? [];
      list.push(waiter);
      this.#waiting.set(step, list);
      return waiter.promise;
    }
    await Promise.resolve();
  }
}

class FakeListeners {
  readonly #byType = new Map<string, ((event: Event) => void)[]>();

  add(type: string, listener: (event: Event) => void): void {
    this.#byType.set(type, [...(this.#byType.get(type) ?? []), listener]);
  }

  remove(type: string, listener: (event: Event) => void): void {
    const list = this.#byType.get(type) ?? [];
    const i = list.indexOf(listener);
    if (i >= 0) this.#byType.set(type, [...list.slice(0, i), ...list.slice(i + 1)]);
  }

  count(type: string): number {
    return this.#byType.get(type)?.length ?? 0;
  }

  fire(event: Event): void {
    for (const listener of this.#byType.get(event.type) ?? []) listener(event);
  }
}

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** An event whose `target` is set, as dispatching it would. */
function eventAt(type: string, target: object | null): Event {
  const event = new Event(type);
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

/** Properties as browsers give them: getters on the prototype, not own properties. */
function withGetters(values: PropertyValues): BluetoothCharacteristicApi['properties'] {
  const prototype = {};
  for (const [name, value] of Object.entries(values)) {
    Object.defineProperty(prototype, name, { get: () => value, enumerable: false });
  }
  return Object.create(prototype) as BluetoothCharacteristicApi['properties'];
}

function shortUuid(uuid: string): string {
  if (uuid === SERVICE_UUID) return '0ffe';
  if (uuid === WEIGHT_CHARACTERISTIC_UUID) return 'ff11';
  if (uuid === COMMAND_CHARACTERISTIC_UUID) return 'ff12';
  return uuid;
}

function requireConnected(server: FakeServer): void {
  if (!server.connected) {
    throw new DOMException('GATT Server is disconnected.', 'NetworkError');
  }
}

function notFound(message: string): DOMException {
  return new DOMException(message, 'NotFoundError');
}
