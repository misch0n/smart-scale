/**
 * Web Locks that mark a recording as being recorded right now (D-024). The recorder holds one
 * for each recording while it records, and the startup recovery ends an open recording as
 * `unclean` only when it can take that recording's lock. Without the lock, a tab that starts
 * while another tab is recording would end the live recording.
 *
 * The lock is requested before the recording is stored, so another tab can't see the open
 * recording before the request is queued. The browser releases a tab's locks when the tab
 * closes or crashes, which is exactly when its open recordings become unclean.
 */

import type { Id } from '../core/model';

/**
 * The part of the Web Locks API (`navigator.locks`) the app uses: `request` with options.
 * Loose, so tests can pass a fake (`fake-locks.ts`).
 */
export interface LockManagerLike {
  request<T>(
    name: string,
    options: { readonly ifAvailable?: boolean },
    callback: (lock: unknown) => T,
  ): Promise<Awaited<T>>;
}

/** `navigator.locks`, or null where the browser has no Web Locks. */
export function systemLocks(): LockManagerLike | null {
  const navigator = globalThis.navigator as { readonly locks?: LockManager } | undefined;
  const locks: LockManagerLike | undefined = navigator?.locks;
  return typeof locks?.request === 'function' ? locks : null;
}

/** The name of the lock held while `id` is being recorded. */
export function recordingLockName(id: Id): string {
  return `smart-scale:recording:${id}`;
}

/**
 * Takes the recording's lock and holds it until the returned function is called. The lock is
 * granted asynchronously, and a release before the grant lets it go as soon as it is granted.
 * Never throws: without Web Locks, or if the request fails, nothing is held.
 */
export function holdRecordingLock(locks: LockManagerLike | null, id: Id): () => void {
  if (locks === null) return () => {};
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    locks.request(recordingLockName(id), {}, () => held).catch(() => {});
  } catch {
    // A runtime that refuses the request (an opaque origin, say) holds nothing.
  }
  return release;
}

/** What `ifRecordingLockFree` did. */
export type LockedRun<T> = { readonly ran: true; readonly value: T } | { readonly ran: false };

/**
 * Runs `task` holding the recording's lock, if nobody holds it. While the task runs, nobody
 * else can take the lock, so two tabs can't both act on the recording.
 *
 * @returns `{ ran: false }` when someone holds the lock, as a tab recording it would.
 * @throws what `task` throws, or the Web Locks API's error.
 */
export function ifRecordingLockFree<T>(
  locks: LockManagerLike,
  id: Id,
  task: () => Promise<T>,
): Promise<LockedRun<T>> {
  return locks.request(
    recordingLockName(id),
    { ifAvailable: true },
    async (lock): Promise<LockedRun<T>> => {
      if (lock === null) return { ran: false };
      return { ran: true, value: await task() };
    },
  );
}
