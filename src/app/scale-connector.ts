/**
 * Connecting to the scale, and reconnecting without the chooser (T1.21; spec "Re-pairing —
 * check early"; hardware test B3). There is one per link, made with it and kept, and every
 * screen connects through it.
 *
 * - **The scale is remembered** on this device, as the device of the last connection: its id
 *   and name, in `storage.local`, which nothing exports (D-030). The mock's link remembers it
 *   for the page only, so on a fresh page it connects on a tap, as before.
 * - **Bluetooth may come late.** beacio injects `navigator.bluetooth` into the page, at times
 *   after the app has started. Until the transport is available, the connector looks again
 *   every 250 ms for 10 s, then says it isn't there (the screens offer a reload), and looks
 *   once more whenever the page is shown again.
 * - **It reconnects by itself** to the remembered scale, without the chooser, where the runtime
 *   lists the devices it has permission for (`getDevices()`): once the app starts, when the
 *   link drops, and after a tap on Connect. A failed attempt is retried with a backoff for as
 *   long as the page is open, since the scale may just be off. Showing the page again tries at
 *   once. In the iOS shims an attempt may simply wait until the scale is switched on.
 * - **The chooser is the fallback.** When the browser no longer lists the scale, the attempts
 *   stop and Connect opens the chooser. A tap can open it at any time: it cancels the attempt
 *   in progress first, in the same tap, so the chooser keeps the tap's user activation.
 * - **The user can stop it.** `disconnect()` ends the connection or the attempt, and nothing is
 *   tried again until a tap connects or the page is reloaded.
 */

import { field, type JsonValue, type ObjectSchema } from '../core/model';
import type { LocalRepository, Timers } from '../storage';
import { Emitter, type Unsubscribe } from '../transport/emitter';
import { TransportError, type ScaleTransport, type TransportStatus } from '../transport/types';
import type { WakeLockLike } from './links';
import { browserPageVisibility, type PageVisibility } from './page-lifecycle';

/** The `storage.local` key of the remembered scale. */
export const KNOWN_SCALE_KEY = 'scale.knownDevice';

/** How often to look for Web Bluetooth while a shim may still inject it, ms. */
export const BLUETOOTH_POLL_MS = 250; // PROVISIONAL(U1.1: B3)
/** How long to look for it before saying it isn't there, ms. */
export const BLUETOOTH_WAIT_MS = 10_000; // PROVISIONAL(U1.1: B3)
/**
 * The pause before each attempt after a failed one, ms; the last repeats. The first is also the
 * pause after a dropped link.
 */
// PROVISIONAL(U1.1: B3)
export const RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000, 8000, 10_000];

/** The scale of the last connection. */
export interface KnownScale {
  /** The browser's id for it: per origin, and meaningless on another device. */
  readonly id: string | null;
  readonly name: string | null;
}

export type BluetoothState =
  /** Starting: looking for Web Bluetooth, which a shim may inject late, and the known scale. */
  | 'checking'
  | 'available'
  /** Still not there after `BLUETOOTH_WAIT_MS`: reloading may help. */
  | 'unavailable';

export interface ScaleConnectorState {
  readonly bluetooth: BluetoothState;
  /** The scale remembered from the last connection; null before the first. */
  readonly known: KnownScale | null;
  /**
   * Reconnecting by itself, without the chooser: an attempt is under way, or the next one is
   * due. From the start with a known scale, after a dropped link and after a tap on Connect,
   * until it connects, the user stops it, or the browser no longer lists the scale.
   */
  readonly reconnecting: boolean;
  /** A tap on Connect reconnects without the chooser. Otherwise it opens the chooser. */
  readonly canReconnect: boolean;
  /** The browser lists the scale no more, so only the chooser can connect. */
  readonly forgotten: boolean;
  /** Failed attempts since reconnecting began. */
  readonly failures: number;
  /** Why the last attempt or the chooser failed, or why the link dropped; null once connected. */
  readonly error: string | null;
}

export interface ScaleConnectorOptions {
  readonly transport: ScaleTransport;
  /** Where the scale is remembered: `storage.local`. Null to remember it for the page only. */
  readonly store: Pick<LocalRepository, 'get' | 'set'> | null;
  /** Default the global timers; tests pass a `ManualClock`. */
  readonly timers?: Timers;
  /** Default `browserPageVisibility`. */
  readonly visibility?: PageVisibility;
  /** Acquired in the taps that connect: Safari grants it only during one. */
  readonly wakeLock?: WakeLockLike | null;
}

const GLOBAL_TIMERS: Timers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof globalThis.setTimeout>),
};

/** The pause before the attempt after `failures` failed ones, ms. */
export function retryDelayMs(failures: number): number {
  const i = Math.min(Math.max(failures, 1), RETRY_DELAYS_MS.length) - 1;
  return RETRY_DELAYS_MS[i];
}

export class ScaleConnector {
  readonly #transport: ScaleTransport;
  readonly #store: ScaleConnectorOptions['store'];
  readonly #timers: Timers;
  readonly #visibility: PageVisibility;
  readonly #wakeLock: WakeLockLike | null;
  readonly #changes = new Emitter<ScaleConnectorState>();
  #started = false;
  #loaded = false;
  #bluetooth: BluetoothState = 'checking';
  #known: KnownScale | null = null;
  /** `auto` while the scale should be connected: a drop or a failure is followed by an attempt. */
  #mode: 'auto' | 'off' = 'auto';
  #forgotten = false;
  #failures = 0;
  #error: string | null = null;
  /** Identifies the connect in progress; a new one, or a cancel, moves it on. */
  #token = 0;
  /** A connect of this connector's is in progress: an attempt, or the chooser's. */
  #pending = false;
  #retryTimer: unknown = null;
  #lookedMs = 0;
  #pollTimer: unknown = null;
  #lastState: TransportStatus['state'];

  constructor(options: ScaleConnectorOptions) {
    this.#transport = options.transport;
    this.#store = options.store;
    this.#timers = options.timers ?? GLOBAL_TIMERS;
    this.#visibility = options.visibility ?? browserPageVisibility;
    this.#wakeLock = options.wakeLock ?? null;
    this.#lastState = this.#transport.status.state;
  }

  get state(): ScaleConnectorState {
    const canAttempt =
      this.#bluetooth === 'available' &&
      this.#known !== null &&
      !this.#forgotten &&
      typeof this.#transport.reconnectKnownDevice === 'function';
    return {
      bluetooth: this.#bluetooth,
      known: this.#known,
      reconnecting:
        canAttempt && this.#mode === 'auto' && this.#transport.status.state !== 'connected',
      canReconnect: canAttempt,
      forgotten: this.#forgotten,
      failures: this.#failures,
      error: this.#error,
    };
  }

  /** Calls `listener` after every change of `state`. */
  onChange(listener: (state: ScaleConnectorState) => void): Unsubscribe {
    return this.#changes.on(listener);
  }

  /**
   * Starts: follows the transport and the page, reads the remembered scale and looks for Web
   * Bluetooth, then reconnects once both are there. Starting again does nothing.
   */
  start(): void {
    if (this.#started) return;
    this.#started = true;
    this.#transport.onStatus((status) => this.#onStatus(status));
    this.#visibility.onChange((state) => {
      if (state === 'visible') this.#onVisible();
    });
    this.#lookForBluetooth();
    // Without a store there is nothing to wait for, so a screen's first render shows the state.
    if (this.#store === null) this.#setLoaded(undefined);
    else void this.#load(this.#store);
  }

  /**
   * The Connect tap: reconnects to the known scale without the chooser where it can, and opens
   * the chooser otherwise. Call it straight from the tap, with no `await` before it.
   */
  connect(): void {
    if (this.state.canReconnect) this.reconnect();
    else this.choose();
  }

  /** A tap that reconnects to the known scale, or any scale the browser lists, without the chooser. */
  reconnect(): void {
    this.#mode = 'auto';
    this.#forgotten = false;
    this.#failures = 0;
    this.#error = null;
    this.#attempt({ force: true });
    this.#wakeLock?.acquire();
    this.#emit();
  }

  /**
   * A tap that opens the device chooser, cancelling an attempt in progress first. Call it
   * straight from the tap: the chooser needs the tap's user activation.
   */
  choose(): void {
    // Nothing may await before connect(): the chooser would lose the tap's activation.
    this.#clearRetry();
    this.#mode = 'off'; // until it connects
    this.#error = null;
    const token = ++this.#token;
    if (this.#transport.status.state !== 'disconnected') void this.#transport.disconnect();
    this.#pending = true;
    const connecting = this.#transport.connect();
    this.#wakeLock?.acquire();
    connecting.then(
      () => {
        if (token === this.#token) this.#pending = false;
      },
      (error: unknown) => {
        if (token !== this.#token) return;
        this.#pending = false;
        this.#mode = 'off';
        this.#error = errorText(error);
        this.#emit();
      },
    );
    this.#emit();
  }

  /** Ends the connection or the attempt in progress, and stops reconnecting. */
  disconnect(): void {
    this.#mode = 'off';
    this.#token++;
    this.#pending = false;
    this.#clearRetry();
    void this.#transport.disconnect();
    this.#emit();
  }

  /**
   * Tries to reconnect now: when `force`d by a tap, whatever the mode; otherwise only while
   * reconnecting by itself.
   */
  #attempt({ force = false } = {}): void {
    this.#clearRetry();
    const reconnect = this.#transport.reconnectKnownDevice;
    if (!force && !this.state.reconnecting) return;
    if (!reconnect || this.#transport.status.state !== 'disconnected') return;
    const token = ++this.#token;
    this.#pending = true;
    reconnect(this.#known?.id ?? null).then(
      () => {
        if (token === this.#token) this.#pending = false;
      },
      (error: unknown) => {
        if (token !== this.#token) return;
        this.#pending = false;
        if (error instanceof TransportError && error.code === 'busy') return; // a tap's connect
        this.#error = errorText(error);
        if (error instanceof TransportError && error.code === 'no-known-device') {
          this.#forgotten = true;
        } else {
          this.#failures++;
          this.#retryIn(retryDelayMs(this.#failures));
        }
        this.#emit();
      },
    );
  }

  #onStatus(status: TransportStatus): void {
    const was = this.#lastState;
    this.#lastState = status.state;
    if (status.state === 'connected') {
      this.#mode = 'auto';
      this.#forgotten = false;
      this.#failures = 0;
      this.#error = null;
      this.#clearRetry();
      this.#remember(status.connection.device);
      // A tap may have connected while the app was still looking for Bluetooth.
      this.#stopLooking();
      this.#bluetooth = 'available';
    } else if (status.state === 'disconnected') {
      if (status.reason === 'user') {
        // A tap ended it, or cancelled an attempt to open the chooser.
        this.#mode = 'off';
        this.#clearRetry();
      } else if (was === 'connected' && !this.#pending) {
        // The link dropped: the scale was switched off, or went out of reach. A connect still
        // in progress says so itself, and is retried from there.
        this.#error = status.message;
        if (this.state.reconnecting) this.#retryIn(retryDelayMs(1));
      }
    }
    this.#emit();
  }

  #onVisible(): void {
    if (this.#bluetooth !== 'available' && this.#loaded && this.#transport.available) {
      this.#stopLooking();
      this.#setBluetooth('available');
    } else if (this.#retryTimer !== null) {
      this.#attempt(); // the page is back: no need to wait out the pause
    }
  }

  #lookForBluetooth(): void {
    if (this.#transport.available || this.#lookedMs >= BLUETOOTH_WAIT_MS) {
      this.#pollTimer = null;
      if (this.#loaded) this.#setBluetooth(this.#transport.available ? 'available' : 'unavailable');
      return;
    }
    this.#pollTimer = this.#timers.setTimeout(() => {
      this.#lookedMs += BLUETOOTH_POLL_MS;
      this.#lookForBluetooth();
    }, BLUETOOTH_POLL_MS);
  }

  #stopLooking(): void {
    if (this.#pollTimer !== null) this.#timers.clearTimeout(this.#pollTimer);
    this.#pollTimer = null;
  }

  async #load(store: NonNullable<ScaleConnectorOptions['store']>): Promise<void> {
    let stored: JsonValue | undefined;
    try {
      stored = await store.get(KNOWN_SCALE_KEY);
    } catch {
      stored = undefined; // storage failing: nothing remembered this time
    }
    this.#setLoaded(stored);
  }

  #setLoaded(stored: JsonValue | undefined): void {
    this.#loaded = true;
    this.#known ??= parseKnownScale(stored);
    if (this.#pollTimer === null) {
      this.#setBluetooth(this.#transport.available ? 'available' : 'unavailable');
    } else {
      this.#emit();
    }
  }

  #setBluetooth(state: BluetoothState): void {
    this.#bluetooth = state;
    this.#emit();
    if (state === 'available') this.#attempt();
  }

  #remember(device: KnownScale): void {
    const known = { id: device.id, name: device.name };
    const same = this.#known?.id === known.id && this.#known?.name === known.name;
    this.#known = known;
    if (same || this.#store === null) return;
    // A failure only means the scale isn't remembered after a reload.
    this.#store.set(KNOWN_SCALE_KEY, { ...known }).catch(() => {});
  }

  #retryIn(ms: number): void {
    this.#clearRetry();
    this.#retryTimer = this.#timers.setTimeout(() => {
      this.#retryTimer = null;
      this.#attempt();
    }, ms);
  }

  #clearRetry(): void {
    if (this.#retryTimer !== null) this.#timers.clearTimeout(this.#retryTimer);
    this.#retryTimer = null;
  }

  #emit(): void {
    this.#changes.emit(this.state);
  }
}

/** The view of the scale's connection that the screens show. */
export type ConnectionView =
  | 'connected'
  /** A tap's connect is under way: the chooser, then the setup. */
  | 'connecting'
  /** Reconnecting by itself: the scale may be off. */
  | 'waiting'
  /** Looking for Web Bluetooth, and for the known scale. */
  | 'checking'
  /** No Web Bluetooth: reloading may help, or allowing beacio on the site. */
  | 'unavailable'
  /** Not connected: a tap connects, without the chooser where `canReconnect`. */
  | 'disconnected';

export function connectionView(
  status: TransportStatus,
  state: ScaleConnectorState,
): ConnectionView {
  if (status.state === 'connected') return 'connected';
  if (state.reconnecting) return 'waiting';
  if (status.state === 'connecting') return 'connecting';
  if (state.bluetooth !== 'available') return state.bluetooth;
  return 'disconnected';
}

const KNOWN_SCALE_SCHEMA: ObjectSchema<KnownScale> = {
  id: field.nullable(field.string),
  name: field.nullable(field.string),
};

const parseKnown = field.object(KNOWN_SCALE_SCHEMA);

/** The stored scale, or null when nothing is stored, or something unreadable. */
function parseKnownScale(value: JsonValue | undefined): KnownScale | null {
  if (value === undefined) return null;
  try {
    return parseKnown(value, KNOWN_SCALE_KEY);
  } catch {
    return null;
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
