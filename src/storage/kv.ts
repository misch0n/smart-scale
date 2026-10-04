/**
 * Settings and last-used values (dose, ratio, bean, grinder; T1.18, T2.8): JSON values under
 * string keys.
 */

import { field, type JsonValue } from '../core/model';
import type { Connection } from './db';

export interface KeyValueRepository {
  /** The stored value, or `undefined` if the key has none. */
  get(key: string): Promise<JsonValue | undefined>;
  /**
   * Stores a copy of `value` under `key`, replacing what was there.
   *
   * @throws SchemaError if `value` isn't JSON (a NaN, a `Date`, a typed array, …).
   */
  set(key: string, value: JsonValue): Promise<void>;
  /** Every stored key with its value, in key order: what a full export carries (T1.7). */
  entries(): Promise<readonly (readonly [string, JsonValue])[]>;
}

export function keyValueRepository(connection: Connection): KeyValueRepository {
  return {
    get(key) {
      return connection.run(['kv'], 'readonly', `Reading setting ${key}`, async (tx) => {
        const value = await tx.store.get(key);
        return value === undefined ? undefined : field.json(value, `kv.${key}`);
      });
    },

    entries() {
      return connection.run(['kv'], 'readonly', 'Listing settings', async (tx) => {
        // Both in key order, from one transaction.
        const [keys, values] = await Promise.all([tx.store.getAllKeys(), tx.store.getAll()]);
        return keys.map((key, i) => [key, field.json(values[i], `kv.${key}`)] as const);
      });
    },

    async set(key, value) {
      const copy = field.json(value, `kv.${key}`);
      await connection.run(['kv'], 'readwrite', `Storing setting ${key}`, (tx) =>
        Promise.all([tx.store.put(copy, key), tx.done]),
      );
    },
  };
}
