/**
 * When the page may be about to stop running. iOS suspends a tab soon after it goes to the
 * background and may then discard it, so the recorder stores what it holds in memory as soon
 * as the page is hidden, rather than waiting for its next batch.
 */

import type { Unsubscribe } from '../transport/emitter';

export interface PageLifecycle {
  /** Calls `listener` whenever the page is hidden or unloaded. */
  onHidden(listener: () => void): Unsubscribe;
}

/**
 * `visibilitychange` to hidden, and `pagehide`, which Safari fires where `visibilitychange`
 * doesn't. Where there is no document (Node), it never calls the listener.
 */
export const browserPageLifecycle: PageLifecycle = {
  onHidden(listener) {
    if (typeof document === 'undefined' || typeof window === 'undefined') return () => {};
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') listener();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', listener);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', listener);
    };
  },
};
