import { openDB, type IDBPDatabase } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Connection, DB_NAME, DB_VERSION, MIGRATIONS, type Migration } from './db';
import { errorName, StorageError } from './errors';
import { closeAsBrowser, freshIndexedDB, openDirect, type FakeIndexedDB } from './fake-idb';
import { openStorage } from './index';

let idb: FakeIndexedDB;

beforeEach(() => {
  idb = freshIndexedDB();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function storeLayout(db: IDBPDatabase) {
  const names = [...db.objectStoreNames];
  const tx = db.transaction(names);
  return Object.fromEntries(
    names.map((name) => {
      const store = tx.objectStore(name);
      const indexes = Object.fromEntries(
        [...store.indexNames].map((index) => [
          index,
          { keyPath: store.index(index).keyPath, unique: store.index(index).unique },
        ]),
      );
      return [name, { keyPath: store.keyPath, autoIncrement: store.autoIncrement, indexes }];
    }),
  );
}

describe('the schema', () => {
  it('builds every store and index in an empty database', async () => {
    const storage = await openStorage();
    storage.close();

    const db = await openDirect();
    expect(db.version).toBe(DB_VERSION);
    expect(storeLayout(db)).toEqual({
      recordings: { keyPath: 'id', autoIncrement: false, indexes: {} },
      frameChunks: { keyPath: ['recordingId', 'firstSeq'], autoIncrement: false, indexes: {} },
      events: { keyPath: ['recordingId', 'seq'], autoIncrement: false, indexes: {} },
      shots: {
        keyPath: 'id',
        autoIncrement: false,
        indexes: { byRecording: { keyPath: ['recordingId', 'anchorTMs'], unique: false } },
      },
      derived: {
        keyPath: ['recordingId', 'analysisVersion'],
        autoIncrement: false,
        indexes: {},
      },
      kv: { keyPath: null, autoIncrement: false, indexes: {} },
    });
    db.close();
  });

  it('is at version 1, one migration so far', () => {
    expect(DB_VERSION).toBe(1);
    expect(MIGRATIONS).toHaveLength(DB_VERSION);
  });
});

describe('upgrades', () => {
  // A stand-in for a later version, like T2.1's entity stores.
  const addThings: Migration = (db) => {
    (db as unknown as IDBPDatabase).createObjectStore('things', { keyPath: 'id' });
  };

  it('runs only the migrations a database is missing, and keeps its records', async () => {
    const v1 = new Connection();
    const db1 = await v1.open();
    await db1.put('kv', 'kept', 'answer');
    v1.close();

    const first = vi.fn(MIGRATIONS[0]);
    const second = vi.fn(addThings);
    const v2 = new Connection({ migrations: [first, second] });
    const db2 = await v2.open();
    expect(db2.version).toBe(2);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    expect([...db2.objectStoreNames]).toContain('things');
    expect(await db2.get('kv', 'answer')).toBe('kept');
    v2.close();
  });

  it('runs every migration on an empty database', async () => {
    const first = vi.fn(MIGRATIONS[0]);
    const second = vi.fn(addThings);
    const connection = new Connection({ migrations: [first, second] });
    await connection.open();
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    connection.close();
  });

  it('refuses a database that a newer build upgraded', async () => {
    const newer = await openDB(DB_NAME, DB_VERSION + 1);
    newer.close();
    const opening = openStorage();
    await expect(opening).rejects.toThrow(StorageError);
    await expect(opening).rejects.toMatchObject({
      code: 'newer-version',
      message: expect.stringContaining('Reload') as unknown,
    });
  });

  it('closes its connection for another tab that upgrades, then reports newer-version', async () => {
    const storage = await openStorage();
    const newer = await openDB(DB_NAME, DB_VERSION + 1); // would hang if storage didn't close
    newer.close();
    await expect(storage.kv.get('anything')).rejects.toMatchObject({ code: 'newer-version' });
  });

  it('says when an older connection that ignores the request blocks an upgrade', async () => {
    const old = await openDB(DB_NAME, 1); // no blocking handler: it won't close when asked
    const onBlocked = vi.fn();
    const connection = new Connection({ migrations: [MIGRATIONS[0], addThings], onBlocked });
    const opening = connection.open();
    await vi.waitFor(() => expect(onBlocked).toHaveBeenCalledOnce());
    old.close();
    expect((await opening).version).toBe(2);
    connection.close();
  });
});

describe('the connection', () => {
  it('reports unavailable without IndexedDB', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(openStorage()).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('opens a new connection after the browser closes it', async () => {
    const storage = await openStorage();
    await storage.kv.set('a', 1);
    expect(idb.connections).toHaveLength(1);

    const dead = vi.spyOn(idb.connections[0], 'transaction');
    closeAsBrowser(idb.connections[0]);
    expect(await storage.kv.get('a')).toBe(1);
    expect(idb.connections).toHaveLength(2);
    expect(dead).not.toHaveBeenCalled(); // the close event said so: no need to try it first
    storage.close();
  });

  it('opens a new connection when one turns out to be closed', async () => {
    const storage = await openStorage();
    // Closed without a close event: the next transaction finds out.
    idb.connections[0].close();
    await storage.kv.set('b', 2);
    expect(await storage.kv.get('b')).toBe(2);
    expect(idb.connections).toHaveLength(2);
    storage.close();
  });

  it('opens a new connection after a transaction fails with a lost connection', async () => {
    const connection = new Connection();
    await connection.open();
    const lost = new DOMException('Connection to Indexed Database server lost', 'UnknownError');
    await expect(
      connection.run(['kv'], 'readonly', 'Testing', () => Promise.reject(lost)),
    ).rejects.toMatchObject({ code: 'failed', cause: lost });
    await connection.run(['kv'], 'readonly', 'Testing', (tx) => tx.store.get('x'));
    expect(idb.connections).toHaveLength(2);
    connection.close();
  });

  it('keeps nothing a failed transaction wrote', async () => {
    const connection = new Connection();
    await connection.open();
    await expect(
      connection.run(['kv'], 'readwrite', 'Testing', async (tx) => {
        await tx.store.put(1, 'written');
        throw new Error('then it failed');
      }),
    ).rejects.toThrow('then it failed');
    expect(
      await connection.run(['kv'], 'readonly', 'Testing', (tx) => tx.store.get('written')),
    ).toBeUndefined();
    connection.close();
  });

  it('wraps IndexedDB errors with what it was doing, and passes other errors through', async () => {
    const connection = new Connection();
    await connection.open();
    await connection.run(['kv'], 'readwrite', 'Seeding', (tx) =>
      Promise.all([tx.store.add(1, 'k'), tx.done]),
    );
    const duplicate = connection.run(['kv'], 'readwrite', 'Adding k again', (tx) =>
      Promise.all([tx.store.add(2, 'k'), tx.done]),
    );
    await expect(duplicate).rejects.toThrow(StorageError);
    await expect(duplicate).rejects.toMatchObject({
      code: 'exists',
      message: expect.stringMatching(/^Adding k again: ConstraintError/) as unknown,
    });
    const bug = new TypeError('a bug');
    await expect(
      connection.run(['kv'], 'readonly', 'Testing', () => Promise.reject(bug)),
    ).rejects.toBe(bug);
    connection.close();
  });

  it('fails every call with closed after close()', async () => {
    const storage = await openStorage();
    storage.close();
    await expect(storage.kv.get('a')).rejects.toMatchObject({ code: 'closed' });
    await expect(storage.recordings.list()).rejects.toMatchObject({ code: 'closed' });
  });

  it('closes a connection that finishes opening after close()', async () => {
    const connection = new Connection();
    const opening = connection.open();
    connection.close();
    const db = await opening;
    let error: unknown;
    try {
      db.transaction('kv');
    } catch (thrown) {
      error = thrown;
    }
    expect(errorName(error)).toBe('InvalidStateError');
  });

  it('tries again after a failed open, even one that threw at once', async () => {
    const connection = new Connection();
    const open = vi.spyOn(idb.factory, 'open').mockImplementationOnce(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    await expect(connection.open()).rejects.toMatchObject({
      code: 'unavailable',
      message: expect.stringContaining('SecurityError') as unknown,
    });
    expect((await connection.open()).version).toBe(DB_VERSION);
    expect(open).toHaveBeenCalledTimes(2);
    connection.close();
  });
});
