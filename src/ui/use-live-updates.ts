import { useEffect, useState } from 'preact/hooks';

/**
 * Re-renders the component when `subscribe`'s notify is called, at most once per `intervalMs`.
 * The recorder reports a change with every frame, which can be hundreds a second with the mock
 * sped up; the screen doesn't need more than a few updates a second.
 *
 * The listeners go on after the first render, so it re-renders once after subscribing too: a
 * change in between, such as the scale's connector settling (T1.21), isn't lost.
 *
 * @param subscribe adds the listeners, calling `notify` on each change, and returns a function
 *   that removes them.
 */
export function useLiveUpdates(
  subscribe: (notify: () => void) => () => void,
  deps: readonly unknown[],
  intervalMs = 150,
): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const notify = (): void => {
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        setTick((tick) => tick + 1);
      }, intervalMs);
    };
    const unsubscribe = subscribe(notify);
    notify();
    return () => {
      unsubscribe();
      if (timer !== null) clearTimeout(timer);
    };
    // The caller lists what `subscribe` depends on.
  }, [...deps, intervalMs]);
}
