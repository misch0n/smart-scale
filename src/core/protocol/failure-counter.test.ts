import { describe, expect, it } from 'vitest';
import { FAILURE_WINDOW_FRAMES, RollingFailureCounter } from './failure-counter';

function feed(counter: RollingFailureCounter, pattern: boolean[]): void {
  for (const failed of pattern) counter.record(failed);
}

describe('RollingFailureCounter', () => {
  it('defaults to the recorder window of 50 frames', () => {
    expect(new RollingFailureCounter().windowSize).toBe(FAILURE_WINDOW_FRAMES);
    expect(FAILURE_WINDOW_FRAMES).toBe(50);
  });

  it('counts frames and failures until the window fills', () => {
    const counter = new RollingFailureCounter(10);
    feed(counter, [true, false, true]);
    expect(counter.count).toBe(3);
    expect(counter.failures).toBe(2);
  });

  it('forgets frames that leave the window', () => {
    const counter = new RollingFailureCounter(4);
    feed(counter, [true, true, true, true]);
    expect(counter.failures).toBe(4);
    feed(counter, [false, false, false]);
    expect(counter.count).toBe(4);
    expect(counter.failures).toBe(1);
    feed(counter, [false]);
    expect(counter.failures).toBe(0);
  });

  it('alarms only when more than half of a full window has failed', () => {
    const counter = new RollingFailureCounter();
    feed(counter, [true, true, false]);
    expect(counter.alarm).toBe(false);

    const halfFailing = new RollingFailureCounter();
    feed(
      halfFailing,
      Array.from({ length: 50 }, (_, i) => i % 2 === 0),
    );
    expect(halfFailing.failures).toBe(25);
    expect(halfFailing.alarm).toBe(false);
    halfFailing.record(true); // drops a failure, adds a failure: still 25
    expect(halfFailing.alarm).toBe(false);
    halfFailing.record(true); // drops a success, adds a failure: 26
    expect(halfFailing.alarm).toBe(true);
  });

  it('raises the alarm within 26 frames when every frame fails', () => {
    const counter = new RollingFailureCounter();
    feed(counter, Array<boolean>(25).fill(true));
    expect(counter.alarm).toBe(false);
    counter.record(true);
    expect(counter.alarm).toBe(true);
  });

  it('clears the alarm once good frames return', () => {
    const counter = new RollingFailureCounter();
    feed(counter, Array<boolean>(50).fill(true));
    expect(counter.alarm).toBe(true);
    feed(counter, Array<boolean>(25).fill(false));
    expect(counter.alarm).toBe(false);
  });

  it('resets to empty', () => {
    const counter = new RollingFailureCounter(4);
    feed(counter, [true, true, true]);
    counter.reset();
    expect(counter.count).toBe(0);
    expect(counter.failures).toBe(0);
    feed(counter, [false, false, false, false, true]);
    expect(counter.failures).toBe(1);
  });

  it('rejects a window smaller than one frame', () => {
    expect(() => new RollingFailureCounter(0)).toThrow(RangeError);
    expect(() => new RollingFailureCounter(2.5)).toThrow(RangeError);
  });
});
