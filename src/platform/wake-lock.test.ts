import { describe, expect, it, vi } from 'vitest';
import {
  ScreenWakeLock,
  type WakeLockEnv,
  type WakeLockSentinelLike,
  type WakeLockState,
} from './wake-lock';

class FakeSentinel implements WakeLockSentinelLike {
  released = false;
  /** Hold back the release event of `release()` until `fireRelease()`, as a slow browser might. */
  deferRelease = false;
  readonly #listeners: (() => void)[] = [];

  release(): Promise<void> {
    if (!this.deferRelease) this.#letGo();
    return Promise.resolve();
  }

  fireRelease(): void {
    this.#letGo();
  }

  addEventListener(_type: 'release', listener: () => void): void {
    this.#listeners.push(listener);
  }

  /** The browser letting go, as when the page is hidden. */
  browserRelease(): void {
    this.#letGo();
  }

  #letGo(): void {
    if (this.released) return;
    this.released = true;
    for (const listener of this.#listeners) listener();
  }
}

/** A fake `navigator.wakeLock` and `document`, with requests the test settles. */
class FakeEnv implements WakeLockEnv {
  visibilityState = 'visible';
  readonly requests: { resolve: (s: FakeSentinel) => void; reject: (e: Error) => void }[] = [];
  readonly #visibility: (() => void)[] = [];
  readonly wakeLock = {
    request: (type: 'screen'): Promise<WakeLockSentinelLike> => {
      expect(type).toBe('screen');
      return new Promise((resolve, reject) => this.requests.push({ resolve, reject }));
    },
  };
  readonly document = {
    get visibilityState(): string {
      return env.visibilityState;
    },
    addEventListener: (_type: 'visibilitychange', listener: () => void) => {
      this.#visibility.push(listener);
    },
  };

  setVisibility(state: 'visible' | 'hidden'): void {
    this.visibilityState = state;
    for (const listener of this.#visibility) listener();
  }

  /** Grants the oldest pending request. */
  grant(): FakeSentinel {
    const sentinel = new FakeSentinel();
    this.requests.shift()!.resolve(sentinel);
    return sentinel;
  }
}

let env: FakeEnv;
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup() {
  env = new FakeEnv();
  const lock = new ScreenWakeLock(env);
  const states: WakeLockState[] = [];
  lock.onChange((status) => states.push(status.state));
  return { lock, states };
}

describe('ScreenWakeLock', () => {
  it('is unsupported without navigator.wakeLock, and acquiring does nothing', () => {
    const lock = new ScreenWakeLock({});
    expect(lock.status).toEqual({ state: 'unsupported', error: null });
    lock.acquire();
    lock.release();
    expect(lock.status.state).toBe('unsupported');
  });

  it('requests the lock at once when acquired, then holds it', async () => {
    const { lock, states } = setup();
    expect(lock.status.state).toBe('off');
    lock.acquire();
    // Synchronously, so the request has the tap's user activation.
    expect(env.requests).toHaveLength(1);
    expect(lock.status.state).toBe('requesting');
    lock.acquire(); // already on its way: no second request
    expect(env.requests).toHaveLength(1);
    env.grant();
    await settle();
    expect(lock.status).toEqual({ state: 'held', error: null });
    lock.acquire();
    expect(env.requests).toHaveLength(0);
    expect(states).toEqual(['requesting', 'held']);
  });

  it('lets go on release', async () => {
    const { lock } = setup();
    lock.acquire();
    const sentinel = env.grant();
    await settle();
    lock.release();
    expect(sentinel.released).toBe(true);
    expect(lock.status.state).toBe('off');
  });

  it('lets go of a lock granted after it was released', async () => {
    const { lock, states } = setup();
    lock.acquire();
    lock.release();
    expect(lock.status.state).toBe('requesting');
    const sentinel = env.grant();
    await settle();
    expect(sentinel.released).toBe(true);
    expect(states).toEqual(['requesting', 'off']);
  });

  it('ignores a late release event from a lock it already let go', async () => {
    const { lock } = setup();
    lock.acquire();
    const first = env.grant();
    first.deferRelease = true;
    await settle();
    lock.release();
    lock.acquire();
    env.grant();
    await settle();
    first.fireRelease();
    expect(lock.status.state).toBe('held');
    lock.release();
    expect(lock.status.state).toBe('off');
  });

  it('asks again when the page is visible again after the browser let go', async () => {
    const { lock } = setup();
    lock.acquire();
    const first = env.grant();
    await settle();
    first.browserRelease();
    env.setVisibility('hidden');
    expect(lock.status.state).toBe('released');
    expect(env.requests).toHaveLength(0); // not while hidden: it would fail
    env.setVisibility('visible');
    expect(env.requests).toHaveLength(1);
    env.grant();
    await settle();
    expect(lock.status.state).toBe('held');
  });

  it("doesn't ask again on visibility when it isn't wanted", async () => {
    const { lock } = setup();
    lock.acquire();
    env.grant();
    await settle();
    lock.release();
    env.setVisibility('hidden');
    env.setVisibility('visible');
    expect(env.requests).toHaveLength(0);
    expect(lock.status.state).toBe('off');
  });

  it('reports a failed request, and tries again on acquire or on becoming visible', async () => {
    const { lock } = setup();
    lock.acquire();
    env.requests
      .shift()!
      .reject(Object.assign(new Error('needs a tap'), { name: 'NotAllowedError' }));
    await settle();
    expect(lock.status).toEqual({ state: 'failed', error: 'NotAllowedError: needs a tap' });
    env.setVisibility('visible');
    expect(env.requests).toHaveLength(1);
    env.requests.shift()!.reject(new Error('again'));
    await settle();
    lock.acquire();
    env.grant();
    await settle();
    expect(lock.status).toEqual({ state: 'held', error: null });
  });

  it('asks again on retry() only while wanted and not held: any tap may call it', async () => {
    const { lock } = setup();
    lock.retry();
    expect(env.requests).toHaveLength(0); // not wanted
    lock.acquire(); // the scale reconnected by itself, with no tap
    lock.retry();
    expect(env.requests).toHaveLength(1); // one request at a time
    env.requests
      .shift()!
      .reject(Object.assign(new Error('needs a tap'), { name: 'NotAllowedError' }));
    await settle();
    expect(lock.status.state).toBe('failed');
    lock.retry(); // the next tap
    env.grant();
    await settle();
    expect(lock.status).toEqual({ state: 'held', error: null });
    lock.retry();
    expect(env.requests).toHaveLength(0); // held
    lock.release();
    lock.retry();
    expect(env.requests).toHaveLength(0);
    expect(lock.status.state).toBe('off');
  });

  it('turns a request that throws synchronously into a failure', async () => {
    const lock = new ScreenWakeLock({
      wakeLock: {
        request: () => {
          throw new TypeError('shim says no');
        },
      },
    });
    lock.acquire();
    await settle();
    expect(lock.status).toEqual({ state: 'failed', error: 'TypeError: shim says no' });
  });

  it('keeps notifying the other listeners when one throws, and rethrows on a microtask', () => {
    const queued: (() => void)[] = [];
    vi.stubGlobal('queueMicrotask', (task: () => void) => queued.push(task));
    try {
      env = new FakeEnv();
      const lock = new ScreenWakeLock(env);
      lock.onChange(() => {
        throw new Error('listener bug');
      });
      const states: WakeLockState[] = [];
      lock.onChange((status) => states.push(status.state));
      lock.acquire();
      expect(states).toEqual(['requesting']);
      expect(queued).toHaveLength(1);
      expect(() => queued[0]()).toThrow('listener bug');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
