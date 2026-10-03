import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserPageLifecycle } from './page-lifecycle';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browserPageLifecycle', () => {
  it('does nothing where there is no document, as in Node', () => {
    const listener = vi.fn();
    const unsubscribe = browserPageLifecycle.onHidden(listener);
    expect(() => unsubscribe()).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it('reports the page going hidden and being hidden for unload, until unsubscribed', () => {
    const visibility: { visibilityState: DocumentVisibilityState } = { visibilityState: 'visible' };
    const page = Object.assign(new EventTarget(), visibility);
    const window = new EventTarget();
    vi.stubGlobal('document', page);
    vi.stubGlobal('window', window);
    const listener = vi.fn();
    const unsubscribe = browserPageLifecycle.onHidden(listener);

    page.dispatchEvent(new Event('visibilitychange'));
    expect(listener).not.toHaveBeenCalled();
    page.visibilityState = 'hidden';
    page.dispatchEvent(new Event('visibilitychange'));
    expect(listener).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('pagehide'));
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    page.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
