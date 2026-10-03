/**
 * Test support, for tests only: an in-memory IndexedDB (fake-indexeddb) that starts empty in
 * every test, and a way to reach the connections the code under test opened.
 */

import 'fake-indexeddb/auto';
import { forceCloseDatabase, IDBFactory } from 'fake-indexeddb';
import { openDB, type IDBPDatabase } from 'idb';
import { DB_NAME } from './db';

export interface FakeIndexedDB {
  readonly factory: IDBFactory;
  /** Every connection opened since `freshIndexedDB()`, in order. */
  readonly connections: readonly IDBDatabase[];
}

/** Installs a new, empty IndexedDB as the global one. Call it in `beforeEach`. */
export function freshIndexedDB(): FakeIndexedDB {
  const factory = new IDBFactory();
  const connections: IDBDatabase[] = [];
  const open = factory.open.bind(factory);
  factory.open = (name, version) => {
    const request = open(name, version);
    request.addEventListener('success', () => connections.push(request.result));
    return request;
  };
  globalThis.indexedDB = factory;
  return { factory, connections };
}

/** Closes a connection as the browser would on its own, firing its `close` event. */
export function closeAsBrowser(connection: IDBDatabase): void {
  // fake-indexeddb's declared parameter type is wrong: it takes a connection, not the class.
  (forceCloseDatabase as unknown as (db: IDBDatabase) => void)(connection);
}

/**
 * Opens the database directly, at its current version, to look at or plant stored records
 * behind the repositories' backs. Only once storage has created it: opening a database that
 * doesn't exist would create an empty one. Close it when done.
 */
export function openDirect(name = DB_NAME): Promise<IDBPDatabase> {
  return openDB(name);
}
