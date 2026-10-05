import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JsonValue } from '../core/model';
import { Emitter } from '../transport/emitter';
import { FakeBluetooth } from '../transport/fake-web-bluetooth';
import { MockTransport } from '../transport/mock';
import { ManualClock } from '../transport/scheduler';
import type { TransportStatus } from '../transport/types';
import { WebBluetoothTransport } from '../transport/web-bluetooth';
import type { PageVisibility, PageVisibilityState } from './page-lifecycle';
import {
  BLUETOOTH_WAIT_MS,
  connectionView,
  KNOWN_SCALE_KEY,
  retryDelayMs,
  ScaleConnector,
  type ScaleConnectorState,
} from './scale-connector';

const SCALE = { id: 'fake-scale', name: 'BOOKOO_SC' };

class FakeVisibility implements PageVisibility {
  readonly #changes = new Emitter<PageVisibilityState>();

  onChange(listener: (state: PageVisibilityState) => void) {
    return this.#changes.on(listener);
  }

  set(state: PageVisibilityState): void {
    this.#changes.emit(state);
  }
}

/** `storage.local`, in memory. */
function memoryStore(initial: Record<string, JsonValue> = {}) {
  const values = new Map<string, JsonValue>(Object.entries(initial));
  return {
    values,
    get: (key: string) => Promise.resolve(values.get(key)),
    set: (key: string, value: JsonValue) => {
      values.set(key, value);
      return Promise.resolve();
    },
  };
}

interface SetupOptions {
  /** What the store holds; default the scale, remembered on an earlier page. */
  readonly stored?: Record<string, JsonValue>;
  /** No store: remembered for the page only. */
  readonly noStore?: boolean;
  /** Leave `navigator.bluetooth` out, for a shim to inject later. */
  readonly noBluetooth?: boolean;
  readonly fake?: FakeBluetooth;
}

function setup(options: SetupOptions = {}) {
  const clock = new ManualClock(1000);
  const fake = options.fake ?? new FakeBluetooth({ clock });
  const transport = new WebBluetoothTransport({
    bluetooth: options.noBluetooth ? undefined : fake,
    scheduler: clock,
  });
  const store = memoryStore(options.stored ?? { [KNOWN_SCALE_KEY]: SCALE });
  const visibility = new FakeVisibility();
  const wakeLock = { calls: 0, acquire: () => wakeLock.calls++, release: () => {} };
  const connector = new ScaleConnector({
    transport,
    store: options.noStore ? null : store,
    timers: clock,
    visibility,
    wakeLock,
  });
  const states: ScaleConnectorState[] = [];
  connector.onChange((state) => states.push(state));
  const view = () => connectionView(transport.status, connector.state);
  return { clock, fake, transport, store, visibility, wakeLock, connector, states, view };
}

type Setup = ReturnType<typeof setup>;

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Moves the clock on by `ms` in steps, letting the fake's steps finish between them. */
async function run({ clock }: Setup, ms: number, stepMs = 50): Promise<void> {
  const end = clock.now() + ms;
  do {
    clock.advanceTo(Math.min(end, clock.now() + stepMs));
    for (let i = 0; i < 5; i++) await settle();
  } while (clock.now() < end);
}

/** Moves the clock to `tMs` at once, running the timers due on the way, then lets them finish. */
async function at({ clock }: Setup, tMs: number): Promise<void> {
  clock.advanceTo(tMs);
  for (let i = 0; i < 5; i++) await settle();
}

/** How many times the transport has connected to the GATT server. */
const gattConnects = ({ fake }: Setup) => fake.log.filter((line) => line === 'gatt.connect').length;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ScaleConnector', () => {
  it('reconnects to the remembered scale by itself, without the chooser', async () => {
    const s = setup();
    expect(s.connector.state.bluetooth).toBe('checking');
    s.connector.start();
    await run(s, 0);
    expect(s.transport.status.state).toBe('connected');
    expect(s.fake.log).toContain('getDevices');
    expect(s.fake.log).not.toContain('requestDevice');
    expect(s.connector.state).toMatchObject({
      bluetooth: 'available',
      known: SCALE,
      reconnecting: false,
      canReconnect: true,
      failures: 0,
      error: null,
    });
    expect(s.view()).toBe('connected');
    // On its own there is no tap, so it asks for no wake lock: Safari wouldn't grant one.
    expect(s.wakeLock.calls).toBe(0);
  });

  it('remembers the scale it connects to, so the next page reconnects by itself', async () => {
    const first = setup({ stored: {} });
    first.connector.start();
    await run(first, 0);
    expect(first.connector.state).toMatchObject({
      bluetooth: 'available',
      known: null,
      reconnecting: false,
      canReconnect: false,
    });
    expect(first.view()).toBe('disconnected');
    expect(gattConnects(first)).toBe(0); // nothing remembered: it waits for a tap

    first.connector.connect(); // the chooser, in the tap
    expect(first.fake.log.at(-1)).toBe('requestDevice');
    expect(first.wakeLock.calls).toBe(1);
    await run(first, 0);
    expect(first.transport.status.state).toBe('connected');
    expect(first.store.values.get(KNOWN_SCALE_KEY)).toEqual(SCALE);

    const next = setup({ stored: Object.fromEntries(first.store.values) });
    next.connector.start();
    await run(next, 0);
    expect(next.transport.status.state).toBe('connected');
    expect(next.fake.log).not.toContain('requestDevice');
  });

  it('remembers the scale for the page only without a store', async () => {
    const s = setup({ noStore: true });
    s.connector.start();
    await run(s, 0);
    expect(s.connector.state.known).toBeNull();
    s.connector.connect();
    await run(s, 0);
    expect(s.connector.state.known).toEqual(SCALE);
    s.fake.scale.dropLink();
    await run(s, retryDelayMs(1));
    expect(s.transport.status.state).toBe('connected'); // back, without the chooser
    expect(s.fake.log.filter((line) => line === 'requestDevice')).toHaveLength(1);
  });

  it('ignores a stored scale it cannot read', async () => {
    const s = setup({ stored: { [KNOWN_SCALE_KEY]: { id: 7 } } });
    s.connector.start();
    await run(s, 0);
    expect(s.connector.state.known).toBeNull();
    expect(s.transport.status.state).toBe('disconnected');
  });

  describe('Web Bluetooth that comes late', () => {
    it('looks for it every 250 ms, and reconnects once a shim has injected it', async () => {
      const s = setup({ noBluetooth: true });
      s.connector.start();
      await run(s, 2000);
      expect(s.connector.state.bluetooth).toBe('checking');
      expect(s.view()).toBe('checking');
      vi.stubGlobal('navigator', { bluetooth: s.fake }); // beacio, late
      await run(s, 250);
      expect(s.connector.state.bluetooth).toBe('available');
      expect(s.transport.status.state).toBe('connected');
    });

    it('says it is not there after 10 s, and looks again when the page is shown', async () => {
      const s = setup({ noBluetooth: true });
      s.connector.start();
      await run(s, BLUETOOTH_WAIT_MS - 250, 250);
      expect(s.connector.state.bluetooth).toBe('checking');
      await run(s, 250);
      expect(s.connector.state.bluetooth).toBe('unavailable');
      expect(s.view()).toBe('unavailable');
      await run(s, 60_000, 1000);
      expect(s.connector.state.bluetooth).toBe('unavailable'); // no more looking
      vi.stubGlobal('navigator', { bluetooth: s.fake }); // allowed in Safari's settings, say
      s.visibility.set('visible');
      await run(s, 0);
      expect(s.connector.state.bluetooth).toBe('available');
      expect(s.transport.status.state).toBe('connected');
    });

    it('takes it as there once a tap has connected anyway', async () => {
      const s = setup({ noBluetooth: true, stored: {} });
      s.connector.start();
      await run(s, BLUETOOTH_WAIT_MS, 250);
      expect(s.connector.state.bluetooth).toBe('unavailable');
      vi.stubGlobal('navigator', { bluetooth: s.fake });
      s.connector.choose();
      await run(s, 0);
      expect(s.connector.state).toMatchObject({ bluetooth: 'available', canReconnect: true });
    });
  });

  describe('while the scale is off', () => {
    it('tries again with a backoff for as long as the page is open, then connects', async () => {
      const s = setup();
      s.fake.reachable = false;
      s.connector.start();
      await run(s, 0);
      expect(gattConnects(s)).toBe(1);
      expect(s.connector.state).toMatchObject({
        reconnecting: true,
        failures: 1,
        error: 'Connecting: NetworkError: Connection attempt failed.',
      });
      expect(s.view()).toBe('waiting');
      // The pauses: 1, 2, 4 and 8 s, then 10 s each.
      let tMs = s.clock.now();
      for (const [i, ms] of [1000, 2000, 4000, 8000, 10_000, 10_000, 10_000].entries()) {
        tMs += ms;
        await at(s, tMs - 1);
        expect(gattConnects(s)).toBe(i + 1);
        await at(s, tMs);
        expect(gattConnects(s)).toBe(i + 2);
      }
      expect(s.connector.state.failures).toBe(8);
      s.fake.reachable = true; // switched on
      await at(s, tMs + 10_000);
      expect(s.transport.status.state).toBe('connected');
      expect(s.connector.state).toMatchObject({ reconnecting: false, failures: 0, error: null });
    });

    it('waits in an attempt the runtime holds until the scale is on, as CoreBluetooth does', async () => {
      const s = setup();
      s.fake.steps.hold('connect');
      s.connector.start();
      await run(s, 60_000, 1000);
      expect(gattConnects(s)).toBe(1);
      expect(s.transport.status.state).toBe('connecting');
      expect(s.view()).toBe('waiting');
      s.fake.steps.release('connect'); // switched on
      await run(s, 0);
      expect(s.transport.status.state).toBe('connected');
    });

    it('tries at once when the page is shown again', async () => {
      const s = setup();
      s.fake.reachable = false;
      s.connector.start();
      await run(s, 1000 + 2000 + 1000); // three failures; the next is due in 4 s
      expect(gattConnects(s)).toBe(3);
      s.fake.reachable = true;
      s.visibility.set('hidden');
      expect(gattConnects(s)).toBe(3);
      s.visibility.set('visible');
      await run(s, 0);
      expect(gattConnects(s)).toBe(4);
      expect(s.transport.status.state).toBe('connected');
    });
  });

  it('reconnects after the link drops', async () => {
    const s = setup();
    s.connector.start();
    await run(s, 0);
    s.fake.scale.dropLink(); // switched off
    expect(s.transport.status).toMatchObject({ state: 'disconnected', reason: 'device' });
    expect(s.connector.state).toMatchObject({
      reconnecting: true,
      error: 'The connection to the scale was lost',
    });
    expect(s.view()).toBe('waiting');
    await run(s, retryDelayMs(1) - 50);
    expect(gattConnects(s)).toBe(1);
    await run(s, 50);
    expect(gattConnects(s)).toBe(2);
    expect(s.transport.status.state).toBe('connected');
  });

  it('stops when told to, and a tap reconnects without the chooser', async () => {
    const s = setup();
    s.fake.reachable = false;
    s.connector.start();
    await run(s, 3000);
    const tried = gattConnects(s);
    s.connector.disconnect();
    expect(s.connector.state).toMatchObject({ reconnecting: false, canReconnect: true });
    expect(s.view()).toBe('disconnected');
    await run(s, 60_000, 1000);
    expect(gattConnects(s)).toBe(tried);

    s.fake.reachable = true;
    s.connector.connect(); // the tap
    expect(s.wakeLock.calls).toBe(1);
    await run(s, 0);
    expect(s.transport.status.state).toBe('connected');
    expect(s.fake.log).not.toContain('requestDevice');
  });

  it('stops with the attempt in progress, and the connection too', async () => {
    const s = setup();
    s.fake.steps.hold('connect');
    s.connector.start();
    await run(s, 0);
    expect(s.transport.status.state).toBe('connecting');
    s.connector.disconnect();
    expect(s.transport.status).toMatchObject({ state: 'disconnected', reason: 'user' });
    s.fake.steps.stopHolding('connect');
    s.fake.steps.release('connect');
    await run(s, 30_000, 1000);
    expect(gattConnects(s)).toBe(1);

    s.connector.reconnect();
    await run(s, 0);
    expect(s.transport.status.state).toBe('connected');
    s.connector.disconnect();
    expect(s.transport.status).toMatchObject({ state: 'disconnected', reason: 'user' });
    await run(s, 30_000, 1000);
    expect(s.transport.status.state).toBe('disconnected');
  });

  it('asks for the chooser once the browser no longer lists the scale', async () => {
    const s = setup();
    s.fake.known = [];
    s.connector.start();
    await run(s, 0);
    expect(s.connector.state).toMatchObject({
      reconnecting: false,
      canReconnect: false,
      forgotten: true,
      error: 'Finding the known scale: getDevices() returned no devices',
    });
    expect(s.view()).toBe('disconnected');
    await run(s, 30_000, 1000);
    expect(s.fake.log.filter((line) => line === 'getDevices')).toHaveLength(1);

    s.connector.connect(); // the chooser, in the tap
    expect(s.fake.log.at(-1)).toBe('requestDevice');
    await run(s, 0);
    expect(s.transport.status.state).toBe('connected');
    expect(s.connector.state).toMatchObject({ forgotten: false, canReconnect: true });
  });

  it('opens the chooser from a tap while an attempt waits, cancelling it in the same tap', async () => {
    const s = setup();
    s.fake.steps.hold('connect');
    s.connector.start();
    await run(s, 0);
    expect(s.view()).toBe('waiting');
    s.fake.log.length = 0;
    s.connector.choose();
    // The chooser opened in the tap, with its user activation.
    expect(s.fake.log).toEqual(['gatt.disconnect', 'requestDevice']);
    expect(s.view()).toBe('connecting');
    s.fake.steps.stopHolding('connect');
    s.fake.steps.release('connect'); // the cancelled attempt's
    await run(s, 0);
    expect(s.transport.status.state).toBe('connected');
    await run(s, 30_000, 1000);
    expect(gattConnects(s)).toBe(1); // the chooser's: the cancelled attempt isn't retried
  });

  it('leaves it to the user when the chooser is cancelled', async () => {
    const s = setup({ stored: {} });
    s.connector.start();
    await run(s, 0);
    s.fake.steps.failNext(
      'requestDevice',
      new DOMException('User cancelled the requestDevice() chooser.', 'NotFoundError'),
    );
    s.connector.connect();
    await run(s, 0);
    expect(s.connector.state).toMatchObject({
      reconnecting: false,
      error: 'Choosing the scale: NotFoundError: User cancelled the requestDevice() chooser.',
    });
    expect(s.view()).toBe('disconnected');
    await run(s, 30_000, 1000);
    expect(s.fake.log.filter((line) => line === 'requestDevice')).toHaveLength(1);
  });

  it('retries a setup that failed after connecting', async () => {
    const s = setup();
    s.fake.steps.failNext('startNotifications ff11', new Error('no CCCD'));
    s.connector.start();
    await run(s, 0);
    expect(s.connector.state).toMatchObject({
      reconnecting: true,
      failures: 1,
      error: 'Starting notifications on FF11: no CCCD',
    });
    await run(s, retryDelayMs(1));
    expect(s.transport.status.state).toBe('connected');
    expect(gattConnects(s)).toBe(2); // one retry, not two
  });

  it('reconnects the mock without a chooser, which it has none of', async () => {
    const clock = new ManualClock();
    const transport = new MockTransport({ scheduler: clock });
    const connector = new ScaleConnector({ transport, store: null, timers: clock });
    connector.start();
    await settle();
    expect(connector.state).toMatchObject({ bluetooth: 'available', known: null });
    connector.connect();
    clock.advance(300);
    await settle();
    expect(transport.status.state).toBe('connected');
    expect(connector.state.known).toEqual({ id: 'mock', name: 'BOOKOO mock' });
  });
});

describe('connectionView', () => {
  const state = (changes: Partial<ScaleConnectorState> = {}): ScaleConnectorState => ({
    bluetooth: 'available',
    known: SCALE,
    reconnecting: false,
    canReconnect: true,
    forgotten: false,
    failures: 0,
    error: null,
    ...changes,
  });
  const disconnected: TransportStatus = { state: 'disconnected', reason: null, message: null };
  const connecting: TransportStatus = { state: 'connecting' };

  it('says what the screens show', () => {
    expect(
      connectionView(
        { state: 'connected', connection: null as never },
        state({ reconnecting: true }),
      ),
    ).toBe('connected');
    expect(connectionView(connecting, state({ reconnecting: true }))).toBe('waiting');
    expect(connectionView(disconnected, state({ reconnecting: true }))).toBe('waiting');
    expect(connectionView(connecting, state())).toBe('connecting');
    expect(connectionView(disconnected, state({ bluetooth: 'checking' }))).toBe('checking');
    expect(connectionView(disconnected, state({ bluetooth: 'unavailable' }))).toBe('unavailable');
    expect(connectionView(disconnected, state())).toBe('disconnected');
  });
});

describe('retryDelayMs', () => {
  it('doubles from 1 s, up to 10 s', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 50].map(retryDelayMs)).toEqual([
      1000, 1000, 2000, 4000, 8000, 10_000, 10_000, 10_000,
    ]);
  });
});
