/**
 * A `ScaleTransport` backed by the simulator (`src/core/sim`): a scale session replayed in real
 * or accelerated time, which reacts to the commands the app sends. It lets the app, its tests
 * and Playwright checks run with no hardware. T1.8 makes it selectable in the UI
 * (`#/probe?mock`).
 *
 * Virtual time runs `speed` times faster than the scheduler's clock and is what `now()` and
 * `tArrival` report, so a recording made at 10× still has true-to-life timestamps. The
 * session's time 0 is the first successful connect: the script starts then. While disconnected
 * the simulated world keeps going; on reconnect it catches up, and whatever the scale sent in
 * between is lost, as it would be.
 */

import type { CharacteristicName, CharacteristicProperties, DeviceInfo } from '../core/model';
import { DEVICE_NAME_PREFIX, type ScaleCommand } from '../core/protocol';
import { demoScenario, ScaleSimulator, type Scenario } from '../core/sim';
import { CommandQueue } from './command-queue';
import { Emitter, type Unsubscribe } from './emitter';
import { systemScheduler, type Scheduler, type TimerId } from './scheduler';
import {
  TransportError,
  type ConnectionInfo,
  type ScaleNotification,
  type ScaleTransport,
  type TransportStatus,
} from './types';

export interface MockTransportOptions {
  /** The session to replay. Default `demoScenario()`. */
  readonly scenario?: Scenario;
  /** How many times faster than real time the session runs. Default 1. */
  readonly speed?: number;
  /** Default `systemScheduler`; tests pass a `ManualClock`. */
  readonly scheduler?: Scheduler;
  /** Virtual ms from `connect()` to connected. Default 300. */
  readonly connectDelayMs?: number;
  /** Virtual ms between command writes, like the Web Bluetooth queue (T1.4). Default 100. */
  readonly writeSpacingMs?: number;
  /** Whether FF12 has the notify property, and so is subscribed (hardware test A15). Default true. */
  readonly ff12Notify?: boolean;
  readonly device?: DeviceInfo;
}

const NO_PROPERTIES: CharacteristicProperties = {
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

export class MockTransport implements ScaleTransport {
  readonly kind = 'mock';
  /** The simulated session, for tests to read ground truth from. Don't step it yourself. */
  readonly simulator: ScaleSimulator;

  readonly #scheduler: Scheduler;
  readonly #speed: number;
  readonly #connectDelayMs: number;
  readonly #connection: ConnectionInfo;
  readonly #queue: CommandQueue;
  readonly #notifications = new Emitter<ScaleNotification>();
  readonly #statuses = new Emitter<TransportStatus>();
  /** The scheduler's clock when this transport was made: virtual time 0. */
  readonly #originMs: number;
  #status: TransportStatus = { state: 'disconnected', reason: null, message: null };
  /** Virtual time of the first connect, which is the session's time 0. */
  #sessionStartMs: number | null = null;
  #pendingConnect: {
    readonly timer: TimerId;
    readonly resolve: (info: ConnectionInfo) => void;
    readonly reject: (error: Error) => void;
  } | null = null;
  #wake: { readonly timer: TimerId; readonly atMs: number } | null = null;

  /** @throws RangeError on an invalid scenario or option. */
  constructor(options: MockTransportOptions = {}) {
    this.simulator = new ScaleSimulator(options.scenario ?? demoScenario());
    this.#scheduler = options.scheduler ?? systemScheduler;
    this.#speed = options.speed ?? 1;
    if (!(this.#speed > 0 && Number.isFinite(this.#speed))) {
      throw new RangeError(`MockTransport: speed ${options.speed} is not a positive number`);
    }
    this.#connectDelayMs = options.connectDelayMs ?? 300;
    const ff12Notify = options.ff12Notify ?? true;
    const subscribed: CharacteristicName[] = ff12Notify ? ['ff11', 'ff12'] : ['ff11'];
    this.#connection = {
      device: options.device ?? { name: `${DEVICE_NAME_PREFIX} mock`, id: 'mock' },
      properties: {
        ff11: { ...NO_PROPERTIES, notify: true },
        ff12: { ...NO_PROPERTIES, write: true, writeWithoutResponse: true, notify: ff12Notify },
      },
      subscribed,
    };
    // Spacing is in virtual ms; the queue's timers run on the scheduler's clock.
    const scaled: Scheduler = {
      now: () => this.now(),
      setTimeout: (callback, ms) => this.#scheduler.setTimeout(callback, ms / this.#speed),
      clearTimeout: (id) => this.#scheduler.clearTimeout(id),
    };
    this.#queue = new CommandQueue(
      (bytes) => this.#write(bytes),
      scaled,
      options.writeSpacingMs ?? 100,
    );
    this.#originMs = this.#scheduler.now();
  }

  get status(): TransportStatus {
    return this.#status;
  }

  /** Virtual time: ms since this transport was made, times `speed`. */
  now(): number {
    return (this.#scheduler.now() - this.#originMs) * this.#speed;
  }

  connect(): Promise<ConnectionInfo> {
    if (this.#status.state !== 'disconnected') {
      return Promise.reject(new TransportError('busy', `Already ${this.#status.state}`));
    }
    this.#setStatus({ state: 'connecting' });
    return new Promise<ConnectionInfo>((resolve, reject) => {
      const timer = this.#scheduler.setTimeout(
        () => this.#finishConnect(),
        this.#connectDelayMs / this.#speed,
      );
      this.#pendingConnect = { timer, resolve, reject };
    });
  }

  /** The mock has no device chooser, so this is `connect()`. */
  readonly reconnectKnownDevice = (): Promise<ConnectionInfo> => this.connect();

  disconnect(): Promise<void> {
    const pending = this.#pendingConnect;
    if (pending) {
      this.#scheduler.clearTimeout(pending.timer);
      this.#pendingConnect = null;
      pending.reject(new TransportError('connect-failed', 'Cancelled by disconnect()'));
    }
    if (this.#status.state !== 'disconnected') this.#end('user', null);
    return Promise.resolve();
  }

  send(command: ScaleCommand): Promise<void> {
    if (this.#status.state !== 'connected') {
      return Promise.reject(new TransportError('not-connected', 'The scale is not connected'));
    }
    return this.#queue.enqueue(command);
  }

  onNotification(listener: (notification: ScaleNotification) => void): Unsubscribe {
    return this.#notifications.on(listener);
  }

  onStatus(listener: (status: TransportStatus) => void): Unsubscribe {
    return this.#statuses.on(listener);
  }

  #finishConnect(): void {
    const pending = this.#pendingConnect;
    if (!pending) return;
    this.#pendingConnect = null;
    const now = this.now();
    this.#sessionStartMs ??= now;
    const sessionMs = Math.max(now - this.#sessionStartMs, this.simulator.nowMs);
    const powerOffMs = this.simulator.powerOffMs;
    if (powerOffMs !== null && sessionMs >= powerOffMs) {
      const message = 'The scale is switched off';
      this.#setStatus({ state: 'disconnected', reason: 'error', message });
      pending.reject(new TransportError('connect-failed', message));
      return;
    }
    // On a reconnect, catch up with the world: whatever the scale sent while we were away is
    // gone. (On the first connect the session starts now, so there is nothing to skip.)
    if (sessionMs > this.simulator.nowMs) this.simulator.advanceTo(sessionMs);
    this.#setStatus({ state: 'connected', connection: this.#connection });
    pending.resolve(this.#connection);
    if (this.#status.state === 'connected') this.#scheduleWake();
  }

  /** Writes checked bytes to the simulated scale, at the current virtual time. */
  #write(bytes: Uint8Array<ArrayBuffer>): void {
    if (this.#status.state !== 'connected' || this.#sessionStartMs === null) {
      throw new TransportError('disconnected', 'The connection ended before the write');
    }
    const sessionMs = Math.max(this.now() - this.#sessionStartMs, this.simulator.nowMs);
    this.simulator.write(bytes, sessionMs);
    // The command may take effect before the wake we're waiting for.
    this.#scheduleWake();
  }

  /** Sleeps until the simulator's next event, or until the link is lost. */
  #scheduleWake(): void {
    if (this.#wake) this.#scheduler.clearTimeout(this.#wake.timer);
    this.#wake = null;
    const start = this.#sessionStartMs;
    if (start === null) return;
    const lost = this.simulator.linkLostAtMs;
    const next = this.simulator.nextWakeMs();
    const atMs = Math.min(next ?? Infinity, lost ?? Infinity);
    if (atMs === Infinity) return;
    const delayMs = Math.max(0, start + atMs - this.now()) / this.#speed;
    this.#wake = { timer: this.#scheduler.setTimeout(() => this.#onWake(), delayMs), atMs };
  }

  #onWake(): void {
    const wake = this.#wake;
    this.#wake = null;
    const start = this.#sessionStartMs;
    if (!wake || start === null || this.#status.state !== 'connected') return;
    // A timer that fires a hair early, or rounding, must still make progress.
    const sessionMs = Math.max(this.now() - start, wake.atMs, this.simulator.nowMs);
    for (const frame of this.simulator.advanceTo(sessionMs)) {
      if (this.#status.state !== 'connected') return; // a listener disconnected
      if (!this.#connection.subscribed.includes(frame.source)) continue;
      this.#notifications.emit({
        source: frame.source,
        bytes: frame.bytes.slice(),
        tArrival: start + frame.tArrival,
      });
    }
    if (this.#status.state !== 'connected') return;
    const lost = this.simulator.linkLostAtMs;
    if (lost !== null && sessionMs >= lost) {
      this.#end('device', 'The scale stopped responding');
    } else {
      this.#scheduleWake();
    }
  }

  #end(reason: 'user' | 'device', message: string | null): void {
    if (this.#wake) this.#scheduler.clearTimeout(this.#wake.timer);
    this.#wake = null;
    this.#queue.clear(new TransportError('disconnected', 'The connection ended'));
    this.#setStatus({ state: 'disconnected', reason, message });
  }

  #setStatus(status: TransportStatus): void {
    this.#status = status;
    this.#statuses.emit(status);
  }
}
