/**
 * Test support, for tests only: an in-memory Web Locks API (`navigator.locks`), since Node has
 * none. One instance stands for one origin's lock manager, which all its tabs share. It has
 * exclusive locks, `ifAvailable`, and a queue of waiting requests, which is all the app uses.
 */

import type { LockManagerLike } from './recording-locks';

/** What a granted request's callback receives; null when `ifAvailable` found the lock held. */
export interface FakeLock {
  readonly name: string;
}

export class FakeLocks implements LockManagerLike {
  /** Every request, in order. */
  readonly requests: { readonly name: string; readonly ifAvailable: boolean }[] = [];
  readonly #held = new Set<string>();
  /** Requests waiting for a held lock, oldest first. Each is handed the lock directly. */
  readonly #waiting = new Map<string, (() => void)[]>();

  async request<T>(
    name: string,
    options: { readonly ifAvailable?: boolean },
    callback: (lock: unknown) => T,
  ): Promise<Awaited<T>> {
    const ifAvailable = options.ifAvailable === true;
    this.requests.push({ name, ifAvailable });
    if (this.#held.has(name)) {
      if (ifAvailable) return await callback(null);
      await new Promise<void>((resolve) => {
        const waiting = this.#waiting.get(name) ?? [];
        waiting.push(resolve);
        this.#waiting.set(name, waiting);
      });
    } else {
      // Synchronously, as the request is made: like the real API, a request queues at once.
      this.#held.add(name);
    }
    try {
      const lock: FakeLock = { name };
      return await callback(lock);
    } finally {
      const next = this.#waiting.get(name)?.shift();
      if (next) next();
      else this.#held.delete(name);
    }
  }

  isHeld(name: string): boolean {
    return this.#held.has(name);
  }

  /** Takes a lock as another tab would, and holds it until the returned function is called. */
  hold(name: string): () => void {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    void this.request(name, {}, () => held);
    return release;
  }
}
