/**
 * The Screen Wake Lock, held while the scale is connected (T1.8, hardware test B5), so the
 * phone doesn't lock in the middle of a shot.
 *
 * - The browser releases the lock whenever the page is hidden. While it is still wanted, it is
 *   requested again when the page is visible again.
 * - Safari grants it only during the user activation of a tap. So call `acquire()` straight from
 *   the tap handler that connects. A request made later, as on the page becoming visible
 *   again or when the scale reconnects by itself (T1.21), may fail there. The app then calls
 *   `retry()` on every tap, so the next tap gets it, and the probe offers a tap to try again.
 * - It never throws. Failures show in `status`.
 */

export type WakeLockState =
  /** The browser has no Screen Wake Lock. */
  | 'unsupported'
  /** Not wanted. */
  | 'off'
  | 'requesting'
  | 'held'
  /**
   * Wanted, but the browser let it go, usually because the page was hidden. It is requested
   * again when the page is visible again.
   */
  | 'released'
  /** Wanted, but the request failed: `error` says why. */
  | 'failed';

export interface WakeLockStatus {
  readonly state: WakeLockState;
  /** Why the last request failed, as `NotAllowedError: …`; null unless `failed`. */
  readonly error: string | null;
}

/** A `WakeLockSentinel`. Loose, so tests can pass fakes. */
export interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

/** The parts of the browser the wake lock uses. Loose, so tests can pass fakes. */
export interface WakeLockEnv {
  /** `navigator.wakeLock`. */
  readonly wakeLock?: { readonly request?: (type: 'screen') => Promise<WakeLockSentinelLike> };
  /** `document`, for its visibility. */
  readonly document?: {
    readonly visibilityState: string;
    addEventListener(type: 'visibilitychange', listener: () => void): void;
  };
}

/** `navigator.wakeLock` and `document`, where they exist. */
export function browserWakeLockEnv(): WakeLockEnv {
  return {
    wakeLock: typeof navigator === 'undefined' ? undefined : navigator.wakeLock,
    document: typeof document === 'undefined' ? undefined : document,
  };
}

export class ScreenWakeLock {
  readonly #env: WakeLockEnv;
  readonly #listeners = new Set<(status: WakeLockStatus) => void>();
  #status: WakeLockStatus;
  #wanted = false;
  #requesting = false;
  #sentinel: WakeLockSentinelLike | null = null;

  constructor(env: WakeLockEnv = browserWakeLockEnv()) {
    this.#env = env;
    this.#status = { state: this.#supported ? 'off' : 'unsupported', error: null };
    env.document?.addEventListener('visibilitychange', () => {
      if (env.document?.visibilityState === 'visible') this.#requestIfNeeded();
    });
  }

  get status(): WakeLockStatus {
    return this.#status;
  }

  /** Calls `listener` with every new status. */
  onChange(listener: (status: WakeLockStatus) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * Wants the lock, and requests it unless it is held or being requested. Call it straight
   * from a tap handler where there is one: Safari needs the tap's user activation.
   */
  acquire(): void {
    this.#wanted = true;
    this.#requestIfNeeded();
  }

  /**
   * Requests the lock again if it is wanted but neither held nor being requested: the request
   * failed, or the browser let it go. Call it from any tap, since Safari grants the lock only
   * during one. Does nothing when the lock isn't wanted.
   */
  retry(): void {
    this.#requestIfNeeded();
  }

  /** No longer wants the lock, and lets it go. */
  release(): void {
    this.#wanted = false;
    const sentinel = this.#sentinel;
    this.#sentinel = null;
    sentinel?.release().catch(() => {});
    if (this.#supported && !this.#requesting) this.#set('off');
  }

  get #supported(): boolean {
    return typeof this.#env.wakeLock?.request === 'function';
  }

  #requestIfNeeded(): void {
    if (!this.#wanted || !this.#supported || this.#requesting || this.#sentinel !== null) return;
    this.#requesting = true;
    this.#set('requesting');
    let request: Promise<WakeLockSentinelLike>;
    try {
      request = this.#env.wakeLock!.request!('screen');
    } catch (error) {
      request = Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    request.then(
      (sentinel) => {
        this.#requesting = false;
        if (!this.#wanted) {
          // Released while the request was on its way.
          sentinel.release().catch(() => {});
          this.#set('off');
          return;
        }
        this.#sentinel = sentinel;
        sentinel.addEventListener('release', () => {
          if (this.#sentinel !== sentinel) return; // let go by release()
          this.#sentinel = null;
          this.#set(this.#wanted ? 'released' : 'off');
        });
        this.#set('held');
      },
      (error: unknown) => {
        this.#requesting = false;
        if (this.#wanted) this.#set('failed', describe(error));
        else this.#set('off');
      },
    );
  }

  #set(state: WakeLockState, error: string | null = null): void {
    this.#status = { state, error };
    for (const listener of [...this.#listeners]) {
      try {
        listener(this.#status);
      } catch (thrown) {
        // One failing listener mustn't keep the others from hearing; it still surfaces.
        queueMicrotask(() => {
          throw thrown;
        });
      }
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
