import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeLocks } from './fake-locks';
import {
  holdRecordingLock,
  ifRecordingLockFree,
  recordingLockName,
  systemLocks,
  type LockManagerLike,
} from './recording-locks';

const ID = '01923456-789a-7000-8000-000000000001';
const NAME = recordingLockName(ID);

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('recordingLockName', () => {
  it('names the lock after the app and the recording', () => {
    expect(NAME).toBe(`smart-scale:recording:${ID}`);
  });
});

describe('holdRecordingLock', () => {
  it('holds the lock until released', async () => {
    const locks = new FakeLocks();
    const release = holdRecordingLock(locks, ID);
    expect(locks.isHeld(NAME)).toBe(true);
    await settle();
    expect(locks.isHeld(NAME)).toBe(true);
    release();
    await settle();
    expect(locks.isHeld(NAME)).toBe(false);
  });

  it('lets go at once of a lock released before it was granted', async () => {
    const locks = new FakeLocks();
    const other = locks.hold(NAME);
    const release = holdRecordingLock(locks, ID);
    release();
    other();
    await settle();
    expect(locks.isHeld(NAME)).toBe(false);
  });

  it('holds nothing, and never throws, without Web Locks or when they fail', async () => {
    expect(() => holdRecordingLock(null, ID)()).not.toThrow();
    const throwing: LockManagerLike = {
      request: () => {
        throw new DOMException('Access denied', 'SecurityError');
      },
    };
    expect(() => holdRecordingLock(throwing, ID)()).not.toThrow();
    const rejecting: LockManagerLike = {
      request: () => Promise.reject(new DOMException('Access denied', 'SecurityError')),
    };
    const release = holdRecordingLock(rejecting, ID);
    await settle(); // an unhandled rejection would fail the test
    release();
  });
});

describe('ifRecordingLockFree', () => {
  it('runs the task holding the lock when nobody holds it', async () => {
    const locks = new FakeLocks();
    const result = await ifRecordingLockFree(locks, ID, () => Promise.resolve(locks.isHeld(NAME)));
    expect(result).toEqual({ ran: true, value: true });
    expect(locks.isHeld(NAME)).toBe(false);
  });

  it("doesn't run the task while someone holds the lock", async () => {
    const locks = new FakeLocks();
    const release = locks.hold(NAME);
    const task = vi.fn(() => Promise.resolve(1));
    expect(await ifRecordingLockFree(locks, ID, task)).toEqual({ ran: false });
    expect(task).not.toHaveBeenCalled();
    release();
    await settle();
    expect(await ifRecordingLockFree(locks, ID, task)).toEqual({ ran: true, value: 1 });
  });

  it("rejects with the task's error, and lets go of the lock", async () => {
    const locks = new FakeLocks();
    const error = new Error('storage failed');
    await expect(ifRecordingLockFree(locks, ID, () => Promise.reject(error))).rejects.toBe(error);
    expect(locks.isHeld(NAME)).toBe(false);
  });
});

describe('systemLocks', () => {
  it('is null where there are no Web Locks, as in Node', () => {
    expect(systemLocks()).toBeNull();
    vi.stubGlobal('navigator', { locks: {} });
    expect(systemLocks()).toBeNull();
    vi.stubGlobal('navigator', undefined);
    expect(systemLocks()).toBeNull();
  });

  it("is the browser's navigator.locks", () => {
    const locks = new FakeLocks();
    vi.stubGlobal('navigator', { locks });
    expect(systemLocks()).toBe(locks);
  });
});
