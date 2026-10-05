/**
 * The app's links to the scale (T1.8): one transport per kind, each with its one recorder, the
 * probe's display figures, the live shot (T1.18) and the connector that connects and reconnects
 * it (T1.21). The kinds are Web Bluetooth, and the mock at each speed (`?mock`). A link is made
 * on first use and kept for the app's lifetime: a recorder can't be detached, and two recorders
 * on one transport would record everything twice (D-024). Its connector starts with it, so the
 * real scale reconnects once a screen that shows it opens. Screens subscribe to a link's
 * transport and recorder, and unsubscribe when they go.
 *
 * Across the links:
 * - The microphone's sound levels, once the probe turns them on, go into every recording
 *   (`sound`, T1.24).
 * - The screen wake lock is wanted while any link is connected (hardware test B5), and from a tap
 *   that connects until it fails. Not while the connector waits for the scale by itself: an
 *   attempt can wait until the scale is switched on, and the screen may sleep meanwhile.
 * - The page being hidden or shown again is logged on the recording in progress, as the
 *   `ui-action`s `page-hidden` and `page-visible` (hardware test B4).
 * - `onRecordingsChanged` tells the recordings list when to reload: not after a connect that
 *   failed, which recorded nothing, so the connector's attempts cost nothing.
 */

import { ProbeMonitor } from '../core/live';
import type { AppInfo } from '../core/model';
import type { LocalRepository } from '../storage';
import { Emitter, type Unsubscribe } from '../transport/emitter';
import { MockTransport } from '../transport/mock';
import type { ScaleTransport, TransportStatus } from '../transport/types';
import { WebBluetoothTransport } from '../transport/web-bluetooth';
import { browserPageVisibility, type PageVisibility } from './page-lifecycle';
import { LiveShot } from './live-shot';
import { Recorder, type RecorderOptions, type RecorderStorage } from './recorder';
import { ScaleConnector, type ScaleConnectorOptions } from './scale-connector';
import { SoundCapture, type StartSoundMeter } from './sound-capture';

export type { ConnectionInfo, TransportStatus } from '../transport/types';

/** Which transport a link uses. */
export type LinkSpec =
  | { readonly kind: 'web-bluetooth' }
  /** The simulator's demo session, `speed` times faster than real time. */
  | { readonly kind: 'mock'; readonly speed: number };

export interface ScaleLink {
  /** `web-bluetooth`, or `mock@<speed>`. */
  readonly key: string;
  readonly spec: LinkSpec;
  readonly transport: ScaleTransport;
  readonly recorder: Recorder;
  /** The probe's display-only figures for the recording in progress. */
  readonly monitor: ProbeMonitor;
  /** The shot's live display, fed from the link's first use; the brew flow answers it. */
  readonly shot: LiveShot;
  /** Connects, and reconnects without the chooser: every screen connects through it. */
  readonly connector: ScaleConnector;
}

/** What the links hold while connected. `ScreenWakeLock` (src/platform) fits. */
export interface WakeLockLike {
  acquire(): void;
  release(): void;
}

export interface ScaleLinksOptions {
  readonly storage: RecorderStorage;
  /**
   * Where the real scale is remembered across reloads: `storage.local`. Default none: it is
   * remembered for the page only, as the mock's always is.
   */
  readonly local?: Pick<LocalRepository, 'get' | 'set'> | null;
  /** The build that is recording: `BUILD_INFO` (src/platform). */
  readonly app: AppInfo;
  /** `navigator.userAgent`. */
  readonly userAgent: string | null;
  /** Default: `WebBluetoothTransport`, or `MockTransport` with the demo session. */
  readonly makeTransport?: (spec: LinkSpec) => ScaleTransport;
  /** Passed on to every recorder; tests pass a `ManualClock`, `FakeLocks` and a fake page. */
  readonly recorder?: Pick<RecorderOptions, 'timers' | 'locks' | 'page' | 'epochNow' | 'writer'>;
  /** Passed on to every connector; tests pass a `ManualClock`. */
  readonly connector?: Pick<ScaleConnectorOptions, 'timers'>;
  /** Default `browserPageVisibility`. */
  readonly visibility?: PageVisibility;
  /** Wanted while any link is connected; the connectors acquire it in their taps. Default: none. */
  readonly wakeLock?: WakeLockLike | null;
  /** Starts the microphone's level meter. Default `startSoundMeter` (src/platform). */
  readonly startSoundMeter?: StartSoundMeter;
}

/** The key of a spec's link. */
export function linkKey(spec: LinkSpec): string {
  return spec.kind === 'mock' ? `mock@${spec.speed}` : spec.kind;
}

export class ScaleLinks {
  /** The microphone's sound levels, recorded into every link's recordings while on. */
  readonly sound: SoundCapture;
  readonly #options: ScaleLinksOptions;
  readonly #links = new Map<string, ScaleLink>();
  readonly #recordingsChanged = new Emitter<void>();

  constructor(options: ScaleLinksOptions) {
    this.#options = options;
    this.sound = new SoundCapture({ startMeter: options.startSoundMeter });
    // Subscribed before any recorder exists, so on hiding the page the event is logged before
    // the recorders flush, and goes out with that flush.
    (options.visibility ?? browserPageVisibility).onChange((state) => {
      const action = state === 'hidden' ? 'page-hidden' : 'page-visible';
      for (const link of this.#links.values()) link.recorder.logUiAction(action);
    });
  }

  /**
   * The link for `spec`, made on first use.
   *
   * @throws RangeError for a mock speed that isn't a positive number.
   */
  get(spec: LinkSpec): ScaleLink {
    const key = linkKey(spec);
    const existing = this.#links.get(key);
    if (existing) return existing;
    const transport = (this.#options.makeTransport ?? defaultTransport)(spec);
    const recorder = new Recorder({
      ...this.#options.recorder,
      transport,
      storage: this.#options.storage,
      app: this.#options.app,
      userAgent: this.#options.userAgent,
    });
    const monitor = new ProbeMonitor();
    recorder.onFrame(({ frame, decoded }) => monitor.addFrame(frame, decoded));
    recorder.onEvent((event) => monitor.addEvent(event));
    const shot = new LiveShot(recorder);
    this.sound.add(recorder);
    // After the recorder's own listener, which it added in its constructor: on `connected` the
    // recording exists, and on `disconnected` it is finishing.
    let was = transport.status.state;
    transport.onStatus((status) => {
      this.#onStatus(recorder, status, was);
      was = status.state;
    });
    const connector = new ScaleConnector({
      ...this.#options.connector,
      transport,
      // Only the real scale is remembered across reloads: on a fresh page the mock waits for a
      // tap, as the smoke tests expect.
      store: spec.kind === 'web-bluetooth' ? (this.#options.local ?? null) : null,
      visibility: this.#options.visibility,
      wakeLock: this.#options.wakeLock,
    });
    const link: ScaleLink = { key, spec, transport, recorder, monitor, shot, connector };
    this.#links.set(key, link);
    connector.start();
    return link;
  }

  /** Every link made so far. */
  get links(): readonly ScaleLink[] {
    return [...this.#links.values()];
  }

  /** Whether any link is connecting or connected. */
  get active(): boolean {
    return this.links.some((link) => link.transport.status.state !== 'disconnected');
  }

  /**
   * Stores everything recorded so far, on every link: call it before exporting a recording in
   * progress. Rejects if a write fails; the records stay queued and are retried.
   */
  async flush(): Promise<void> {
    await Promise.all(this.links.map((link) => link.recorder.flush()));
  }

  /**
   * Calls `listener` when the stored recordings change: once a new recording is stored, and
   * once an ended one is stored and ended.
   */
  onRecordingsChanged(listener: () => void): Unsubscribe {
    return this.#recordingsChanged.on(listener);
  }

  #onStatus(recorder: Recorder, status: TransportStatus, was: TransportStatus['state']): void {
    const wakeLock = this.#options.wakeLock;
    if (status.state === 'connected') {
      this.sound.recordingStarted(recorder);
      wakeLock?.acquire();
      // Once the new recording is stored; a failure shows in the recorder's warnings.
      const notify = (): void => this.#recordingsChanged.emit();
      recorder.flush().then(notify, notify);
    } else if (status.state === 'disconnected') {
      // A tap's connect in progress on another link keeps it.
      if (!this.active) wakeLock?.release();
      // A recording ended only if the link had been connected.
      if (was === 'connected') {
        void recorder.whenIdle().then(() => this.#recordingsChanged.emit());
      }
    }
  }
}

function defaultTransport(spec: LinkSpec): ScaleTransport {
  return spec.kind === 'mock'
    ? new MockTransport({ speed: spec.speed })
    : new WebBluetoothTransport();
}
