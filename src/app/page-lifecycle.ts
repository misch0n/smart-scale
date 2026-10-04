/**
 * When the page may be about to stop running. iOS suspends a tab soon after it goes to the
 * background and may then discard it, so the recorder stores what it holds in memory as soon
 * as the page is hidden, rather than waiting for its next batch. The app also puts the page
 * being hidden and shown again on the recording's timeline (`ScaleLinks`), so a gap in the
 * frames can be told apart from a lost link.
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

export type PageVisibilityState = 'visible' | 'hidden';

export interface PageVisibility {
  /** Calls `listener` whenever the page is shown or hidden. */
  onChange(listener: (state: PageVisibilityState) => void): Unsubscribe;
}

/**
 * `visibilitychange`, which fires when the phone locks or the browser goes to the background
 * (hardware test B4). Where there is no document (Node), it never calls the listener.
 */
export const browserPageVisibility: PageVisibility = {
  onChange(listener) {
    if (typeof document === 'undefined') return () => {};
    const onVisibilityChange = (): void => {
      listener(document.visibilityState === 'hidden' ? 'hidden' : 'visible');
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  },
};
