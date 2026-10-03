/** Stops a listener: returned by every `on…` subscription. */
export type Unsubscribe = () => void;

/**
 * A small synchronous event emitter. A listener that throws doesn't stop the others or the
 * emitter: its error is rethrown on a microtask, so it still surfaces (in the console, or as a
 * failed test).
 *
 * A value emitted from inside a listener is delivered once the current value has reached every
 * listener, so all of them see values in the order they were emitted. Without that, a status
 * listener that disconnects on `connected` would let the listeners after it see `disconnected`
 * before `connected`.
 */
export class Emitter<T> {
  #listeners: { readonly listener: (value: T) => void }[] = [];
  /** Values waiting for the one being delivered to finish. */
  #queue: T[] = [];
  #emitting = false;

  /** Adds a listener. The same function added twice is called twice. */
  on(listener: (value: T) => void): Unsubscribe {
    const entry = { listener };
    this.#listeners = [...this.#listeners, entry];
    return () => {
      this.#listeners = this.#listeners.filter((e) => e !== entry);
    };
  }

  /**
   * Calls every listener with `value`, in the order they were added. Called from inside a
   * listener, it returns at once and the value follows the one being delivered.
   */
  emit(value: T): void {
    this.#queue.push(value);
    if (this.#emitting) return;
    this.#emitting = true;
    while (this.#queue.length > 0) {
      const next = this.#queue.shift() as T;
      for (const { listener } of this.#listeners) {
        try {
          listener(next);
        } catch (error) {
          queueMicrotask(() => {
            throw error;
          });
        }
      }
    }
    this.#emitting = false;
  }

  get listenerCount(): number {
    return this.#listeners.length;
  }
}
