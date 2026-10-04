/**
 * Device-local values (D-030): state that belongs to this browser alone, as JSON under string
 * keys. The automatic export keeps its settings, its token and its ledger here (T1.20), and a
 * remembered scale can go here too (T1.21). Unlike `kv`, which a full export carries as
 * settings (D-025), nothing here is ever exported or imported: a token must never leave the
 * device, and a ledger or a device id means nothing on another one.
 */

import { field, type JsonValue } from '../core/model';
import type { Connection } from './db';

export interface LocalRepository {
  /** The stored value, or `undefined` if the key has none. */
  get(key: string): Promise<JsonValue | undefined>;
  /**
   * Stores a copy of `value` under `key`, replacing what was there.
   *
   * @throws SchemaError if `value` isn't JSON (a NaN, a `Date`, a typed array, …).
   */
  set(key: string, value: JsonValue): Promise<void>;
  /** Deletes the key's value, if it has one. */
  delete(key: string): Promise<void>;
  /** Every key that starts with `prefix`, with its value, in key order. */
  entries(prefix: string): Promise<readonly (readonly [string, JsonValue])[]>;
}

/**
 * The highest UTF-16 code unit. A key that starts with a prefix sorts below the prefix followed
 * by it, unless the rest of the key starts with U+FFFF too, which no key of the app does.
 */
const MAX_CODE_UNIT = '\uffff';

export function localRepository(connection: Connection): LocalRepository {
  return {
    get(key) {
      return connection.run(['local'], 'readonly', `Reading local value ${key}`, async (tx) => {
        const value = await tx.store.get(key);
        return value === undefined ? undefined : field.json(value, `local.${key}`);
      });
    },

    async set(key, value) {
      const copy = field.json(value, `local.${key}`);
      await connection.run(['local'], 'readwrite', `Storing local value ${key}`, (tx) =>
        Promise.all([tx.store.put(copy, key), tx.done]),
      );
    },

    async delete(key) {
      await connection.run(['local'], 'readwrite', `Deleting local value ${key}`, (tx) =>
        Promise.all([tx.store.delete(key), tx.done]),
      );
    },

    entries(prefix) {
      const range = IDBKeyRange.bound(prefix, prefix + MAX_CODE_UNIT);
      return connection.run(
        ['local'],
        'readonly',
        `Listing local values ${prefix}…`,
        async (tx) => {
          // Both in key order, from one transaction.
          const [keys, values] = await Promise.all([
            tx.store.getAllKeys(range),
            tx.store.getAll(range),
          ]);
          return keys.map((key, i) => [key, field.json(values[i], `local.${key}`)] as const);
        },
      );
    },
  };
}
