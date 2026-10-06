import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { JsonValue } from '../core/model';
import { freshIndexedDB } from '../storage/fake-idb';
import { openStorage, type AppStorage } from '../storage';
import { NUDGE_DISMISSED_KEY, NudgeDismissal } from './nudge';

let storage: AppStorage;

beforeEach(async () => {
  freshIndexedDB();
  storage = await openStorage();
});

afterEach(() => {
  storage.close();
});

describe('NudgeDismissal', () => {
  it('keeps the dismissed shot on the device, across a restart', async () => {
    const first = await NudgeDismissal.load(storage.local);
    expect(first.shotId).toBeNull();
    let changes = 0;
    first.onChange(() => changes++);
    await first.dismiss('shot-1');
    expect(first.shotId).toBe('shot-1');
    expect(changes).toBe(1);
    await first.dismiss('shot-1');
    expect(changes).toBe(1);
    expect(await storage.local.get(NUDGE_DISMISSED_KEY)).toBe('shot-1');

    const again = await NudgeDismissal.load(storage.local);
    expect(again.shotId).toBe('shot-1');
  });

  it('dismisses for the session when it can’t be stored or read', async () => {
    const broken = {
      get: (): Promise<JsonValue | undefined> => Promise.reject(new Error('gone')),
      set: (): Promise<void> => Promise.reject(new Error('full')),
    };
    const dismissal = await NudgeDismissal.load(broken);
    expect(dismissal.shotId).toBeNull();
    await dismissal.dismiss('shot-2');
    expect(dismissal.shotId).toBe('shot-2');
  });

  it('takes anything but a shot id as none', async () => {
    await storage.local.set(NUDGE_DISMISSED_KEY, 42);
    expect((await NudgeDismissal.load(storage.local)).shotId).toBeNull();
  });
});
