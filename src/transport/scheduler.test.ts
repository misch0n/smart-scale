import { describe, expect, it } from 'vitest';
import { ManualClock, systemScheduler } from './scheduler';

describe('ManualClock', () => {
  it('stands still until advanced', () => {
    const clock = new ManualClock(500);
    expect(clock.now()).toBe(500);
    clock.advance(250);
    expect(clock.now()).toBe(750);
  });

  it('runs timers at their due time, in due order, then same-time timers in the order set', () => {
    const clock = new ManualClock();
    const log: string[] = [];
    clock.setTimeout(() => log.push(`b@${clock.now()}`), 200);
    clock.setTimeout(() => log.push(`a@${clock.now()}`), 100);
    clock.setTimeout(() => log.push(`c@${clock.now()}`), 200);
    clock.advance(150);
    expect(log).toEqual(['a@100']);
    clock.advance(1000);
    expect(log).toEqual(['a@100', 'b@200', 'c@200']);
    expect(clock.now()).toBe(1150);
  });

  it('runs timers that callbacks set, when they fall due within the advance', () => {
    const clock = new ManualClock();
    const log: number[] = [];
    const tick = () => {
      log.push(clock.now());
      if (log.length < 5) clock.setTimeout(tick, 10);
    };
    clock.setTimeout(tick, 0);
    clock.advance(25);
    expect(log).toEqual([0, 10, 20]);
    clock.advance(100);
    expect(log).toEqual([0, 10, 20, 30, 40]);
  });

  it('treats a negative or NaN delay as now', () => {
    const clock = new ManualClock(10);
    let ran = 0;
    clock.setTimeout(() => ran++, -5);
    clock.setTimeout(() => ran++, NaN);
    clock.advance(0);
    expect(ran).toBe(2);
  });

  it('cancels timers', () => {
    const clock = new ManualClock();
    let ran = false;
    const id = clock.setTimeout(() => (ran = true), 10);
    expect(clock.pendingTimers).toBe(1);
    clock.clearTimeout(id);
    clock.advance(100);
    expect(ran).toBe(false);
    expect(clock.pendingTimers).toBe(0);
  });

  it('refuses to go back in time', () => {
    const clock = new ManualClock(100);
    expect(() => clock.advanceTo(50)).toThrow(RangeError);
    expect(() => clock.advance(NaN)).toThrow(RangeError);
  });

  it('stops a timer loop that never lets time move', () => {
    const clock = new ManualClock();
    const loop = () => clock.setTimeout(loop, 0);
    clock.setTimeout(loop, 0);
    expect(() => clock.advance(1)).toThrow(/due at once/);
  });
});

describe('systemScheduler', () => {
  it('reads a monotonic clock and runs real timers', async () => {
    const start = systemScheduler.now();
    await new Promise<void>((resolve) => systemScheduler.setTimeout(resolve, 5));
    expect(systemScheduler.now()).toBeGreaterThan(start);
    let ran = false;
    const id = systemScheduler.setTimeout(() => (ran = true), 1);
    systemScheduler.clearTimeout(id);
    await new Promise<void>((resolve) => systemScheduler.setTimeout(resolve, 10));
    expect(ran).toBe(false);
  });
});
