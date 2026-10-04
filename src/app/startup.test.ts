import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRecording } from '../core/model';
import { ScreenWakeLock } from '../platform/wake-lock';
import { freshIndexedDB, openDirect } from '../storage/fake-idb';
import { openStorage, type StorageManagerLike } from '../storage';
import { FakeLocks } from './fake-locks';
import { recordingLockName } from './recording-locks';
import { startApp, type AppServices } from './startup';

const APP = { commit: 'abc1234', buildTime: '2026-10-04T07:00:00.000Z' };
const STARTED = Date.UTC(2026, 9, 4, 6);

const granted: StorageManagerLike = {
  persist: () => Promise.resolve(true),
  estimate: () => Promise.resolve({ usage: 1234, quota: 1_000_000 }),
};

let services: AppServices | null = null;

beforeEach(() => {
  freshIndexedDB();
});

afterEach(() => {
  services?.storage.close();
  services = null;
});

/** Stores open recordings, as a tab that closed while recording leaves them. */
async function leaveOpen(count: number) {
  const storage = await openStorage();
  const recordings = Array.from({ length: count }, (_, i) =>
    createRecording({
      startedAtEpochMs: STARTED + i,
      device: { name: 'BOOKOO_MINI', id: null },
      transport: 'web-bluetooth',
      app: APP,
      userAgent: null,
    }),
  );
  for (const recording of recordings) await storage.recordings.create(recording);
  storage.close();
  return recordings;
}

describe('startApp', () => {
  it('opens storage, asks to keep it, and ends recordings left open', async () => {
    const [left] = await leaveOpen(1);
    services = await startApp({
      app: APP,
      userAgent: 'test agent',
      storageManager: granted,
      recovery: { locks: new FakeLocks() },
      wakeLock: new ScreenWakeLock({}),
    });
    expect(services.persistence).toEqual({
      supported: true,
      persisted: true,
      usageBytes: 1234,
      quotaBytes: 1_000_000,
      error: null,
    });
    expect(services.recovery?.ended.map((r) => [r.id, r.endReason])).toEqual([
      [left.id, 'unclean'],
    ]);
    expect(services.recoveryError).toBeNull();
    expect((await services.storage.recordings.get(left.id))?.endReason).toBe('unclean');
    expect(services.wakeLock.status.state).toBe('unsupported');
    expect(services.links.links).toEqual([]);
  });

  it('leaves alone a recording another tab is recording', async () => {
    const [mine, theirs] = await leaveOpen(2);
    const locks = new FakeLocks();
    const release = locks.hold(recordingLockName(theirs.id));
    services = await startApp({
      app: APP,
      userAgent: null,
      storageManager: {},
      recovery: { locks },
      wakeLock: new ScreenWakeLock({}),
    });
    expect(services.recovery?.ended.map((r) => r.id)).toEqual([mine.id]);
    expect(services.recovery?.skipped).toEqual([theirs.id]);
    expect(services.persistence.supported).toBe(false);
    release();
  });

  it('gives the links the storage and the wake lock', async () => {
    const wakeLock = new ScreenWakeLock({});
    services = await startApp({
      app: APP,
      userAgent: 'test agent',
      storageManager: {},
      recovery: { locks: new FakeLocks() },
      wakeLock,
    });
    expect(services.wakeLock).toBe(wakeLock);
    const link = services.links.get({ kind: 'mock', speed: 1 });
    expect(link.recorder.state.recording).toBeNull();
  });

  it('still starts when recovery cannot list the open recordings', async () => {
    (await openStorage()).close();
    const db = await openDirect();
    await db.put('recordings', { id: 'not-a-recording' });
    db.close();
    services = await startApp({
      app: APP,
      userAgent: null,
      storageManager: {},
      recovery: { locks: new FakeLocks() },
      wakeLock: new ScreenWakeLock({}),
    });
    expect(services.recovery).toBeNull();
    expect(services.recoveryError).toMatch(/recordings\[0\]\.id: expected an id/);
  });

  it('fails when storage cannot open', async () => {
    const indexedDB = globalThis.indexedDB;
    // @ts-expect-error: a browser without IndexedDB
    delete globalThis.indexedDB;
    try {
      await expect(
        startApp({
          app: APP,
          userAgent: null,
          storageManager: {},
          wakeLock: new ScreenWakeLock({}),
        }),
      ).rejects.toMatchObject({ name: 'StorageError', code: 'unavailable' });
    } finally {
      globalThis.indexedDB = indexedDB;
    }
  });
});
