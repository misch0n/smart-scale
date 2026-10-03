import { describe, expect, it } from 'vitest';
import { requestPersistence, type StorageManagerLike } from './persistence';

interface Answers {
  readonly persist?: boolean | Error;
  readonly persisted?: boolean | Error;
  readonly estimate?: { usage?: number; quota?: number } | Error;
}

/** A fake `navigator.storage` whose methods need `this`, as the real ones do. */
class FakeStorageManager implements StorageManagerLike {
  readonly calls: string[] = [];
  readonly answers: Answers;

  constructor(answers: Answers) {
    this.answers = answers;
  }

  #answer<T>(name: 'persist' | 'persisted' | 'estimate'): Promise<T> {
    this.calls.push(name);
    const answer = this.answers[name];
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer as T);
  }

  persist = function (this: FakeStorageManager) {
    return this.#answer<boolean>('persist');
  };

  persisted = function (this: FakeStorageManager) {
    return this.#answer<boolean>('persisted');
  };

  estimate = function (this: FakeStorageManager) {
    return this.#answer<{ usage?: number; quota?: number }>('estimate');
  };
}

describe('requestPersistence', () => {
  it('asks for persistence and reads the estimate', async () => {
    const manager = new FakeStorageManager({
      persist: true,
      estimate: { usage: 12_345, quota: 1_000_000_000 },
    });
    expect(await requestPersistence(manager)).toEqual({
      supported: true,
      persisted: true,
      usageBytes: 12_345,
      quotaBytes: 1_000_000_000,
      error: null,
    });
    expect(manager.calls).toEqual(['persist', 'estimate']);
  });

  it('reports a refusal', async () => {
    const manager = new FakeStorageManager({ persist: false, estimate: { usage: 0 } });
    expect(await requestPersistence(manager)).toMatchObject({
      supported: true,
      persisted: false,
      usageBytes: 0,
      quotaBytes: null,
    });
  });

  it('falls back to persisted() when persist() fails', async () => {
    const manager = new FakeStorageManager({
      persist: new DOMException('Not allowed', 'NotAllowedError'),
      persisted: true,
      estimate: {},
    });
    expect(await requestPersistence(manager)).toEqual({
      supported: true,
      persisted: true,
      usageBytes: null,
      quotaBytes: null,
      error: 'persist(): NotAllowedError: Not allowed',
    });
  });

  it('reads persisted() where persist() is missing', async () => {
    const withoutPersist: StorageManagerLike = { persisted: () => Promise.resolve(false) };
    expect(await requestPersistence(withoutPersist)).toEqual({
      supported: false,
      persisted: false,
      usageBytes: null,
      quotaBytes: null,
      error: null,
    });
  });

  it('never throws, and reports every failure', async () => {
    const manager = new FakeStorageManager({
      persist: new Error('boom'),
      persisted: new Error('again'),
      estimate: new Error('and again'),
    });
    expect(await requestPersistence(manager)).toEqual({
      supported: true,
      persisted: null,
      usageBytes: null,
      quotaBytes: null,
      error: 'persist(): Error: boom; persisted(): Error: again; estimate(): Error: and again',
    });
  });

  it('knows nothing without a storage manager', async () => {
    expect(await requestPersistence(undefined)).toEqual({
      supported: false,
      persisted: null,
      usageBytes: null,
      quotaBytes: null,
      error: null,
    });
  });

  it('ignores answers of the wrong type', async () => {
    const manager = new FakeStorageManager({
      persist: 'yes' as unknown as boolean,
      estimate: { usage: Number.NaN, quota: Infinity },
    });
    expect(await requestPersistence(manager)).toMatchObject({
      persisted: null,
      usageBytes: null,
      quotaBytes: null,
    });
  });
});
