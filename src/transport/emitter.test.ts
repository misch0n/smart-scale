import { afterEach, describe, expect, it, vi } from 'vitest';
import { Emitter } from './emitter';

describe('Emitter', () => {
  it('calls listeners in the order they were added, until they unsubscribe', () => {
    const emitter = new Emitter<number>();
    const log: string[] = [];
    const offA = emitter.on((v) => log.push(`a${v}`));
    emitter.on((v) => log.push(`b${v}`));
    emitter.emit(1);
    offA();
    emitter.emit(2);
    expect(log).toEqual(['a1', 'b1', 'b2']);
    expect(emitter.listenerCount).toBe(1);
  });

  it('calls the same function twice when it was added twice, and removes one at a time', () => {
    const emitter = new Emitter<void>();
    let calls = 0;
    const listener = () => calls++;
    const off = emitter.on(listener);
    emitter.on(listener);
    emitter.emit();
    off();
    emitter.emit();
    expect(calls).toBe(3);
  });

  describe('a listener that throws', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("doesn't stop the others, and its error is rethrown on a microtask", () => {
      const queued: (() => void)[] = [];
      vi.stubGlobal('queueMicrotask', (task: () => void) => queued.push(task));
      const emitter = new Emitter<number>();
      const seen: number[] = [];
      emitter.on(() => {
        throw new Error('listener bug');
      });
      emitter.on((v) => seen.push(v));

      emitter.emit(7);
      expect(seen).toEqual([7]);
      expect(queued).toHaveLength(1);
      expect(() => queued[0]()).toThrow('listener bug');
    });
  });
});
