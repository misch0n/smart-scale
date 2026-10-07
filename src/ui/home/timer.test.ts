import { describe, expect, it } from 'vitest';
import { TimerWatch, timerAction, timerCommand } from './timer';

describe('timerAction', () => {
  it('starts a timer at 0, stops a running one, resets a stopped one', () => {
    expect(timerAction(0, false)).toBe('start');
    expect(timerAction(12_300, true)).toBe('stop');
    expect(timerAction(12_300, false)).toBe('reset');
  });

  it('sends the whitelisted 04, 05 and 06', () => {
    expect(timerCommand('start').name).toBe('startTimer');
    expect(timerCommand('stop').name).toBe('stopTimer');
    expect(timerCommand('reset').name).toBe('resetTimer');
  });
});

describe('TimerWatch', () => {
  it('runs while the frames’ timer moves, and stops half a second after it stood still', () => {
    const watch = new TimerWatch();
    expect(watch.running).toBe(false);
    watch.observe(0, 0);
    watch.observe(100, 0);
    expect(watch.running).toBe(false);
    watch.observe(200, 100);
    watch.observe(300, 200);
    expect(watch.running).toBe(true);
    expect(watch.timerMs).toBe(200);
    // Stopped at 200 ms: still for 0.5 s, then stopped.
    watch.observe(500, 200);
    expect(watch.running).toBe(true);
    watch.observe(900, 200);
    expect(watch.running).toBe(false);
    // An old frame changes nothing.
    watch.observe(800, 900);
    expect(watch.timerMs).toBe(200);
  });
});
