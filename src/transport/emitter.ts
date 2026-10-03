/** Stops a listener: returned by every `on…` subscription. */
export type Unsubscribe = () => void;

/**
 * A small synchronous event emitter. A listener that throws doesn't stop the others or the
 * emitter: its error is rethrown on a microtask, so it still surfaces (in the console, or as a
 * failed test).
 */
export class Emitter<T> {
  #listeners: { readonly listener: (value: T) => void }[] = [];

  /** Adds a listener. The same function added twice is called twice. */
  on(listener: (value: T) => void): Unsubscribe {
    const entry = { listener };
    this.#listeners = [...this.#listeners, entry];
    return () => {
      this.#listeners = this.#listeners.filter((e) => e !== entry);
    };
  }

  /** Calls every listener with `value`, in the order they were added. */
  emit(value: T): void {
    for (const { listener } of this.#listeners) {
      try {
        listener(value);
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  get listenerCount(): number {
    return this.#listeners.length;
  }
}
