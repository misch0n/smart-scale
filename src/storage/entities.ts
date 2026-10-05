/**
 * The entities (T2.1, D-074): the machine, grinders, recipes, coffee packs, containers and tags,
 * one store per kind, by id. They are user metadata: created, edited, and removed by setting
 * their tombstone (`removedAtEpochMs`), never deleted, so that neither an import nor a backup
 * brings a removed one back. That is why there is no delete. Every entity read back goes
 * through `normaliseEntity` (D-018).
 */

import {
  ENTITY_KINDS,
  normaliseEntity,
  sameEntityIdentity,
  updateEntity,
  type EntityChanges,
  type EntityKind,
  type EntityLists,
  type EntityOf,
  type Id,
} from '../core/model';
import type { Connection } from './db';
import { StorageError } from './errors';

export interface EntityRepository {
  /** @throws StorageError `exists` if an entity of the kind with its id is stored. */
  create<K extends EntityKind>(kind: K, entity: EntityOf<K>): Promise<void>;
  /** The entity, or null if none of the kind with that id is stored. */
  get<K extends EntityKind>(kind: K, id: Id): Promise<EntityOf<K> | null>;
  /**
   * Applies `changes` with `updateEntity` and returns the entity as stored, in one transaction.
   *
   * @throws StorageError `not-found`; TypeError or SchemaError on a change `updateEntity`
   *   refuses.
   */
  update<K extends EntityKind>(
    kind: K,
    id: Id,
    changes: EntityChanges<K>,
    nowEpochMs: number,
  ): Promise<EntityOf<K>>;
  /**
   * Stores `entity`, as it is, in place of the stored one with its id, and returns it: an
   * import that replaces metadata. Its fields and `updatedAtEpochMs` may differ from the
   * stored one's, but not its identity: the creation time.
   *
   * @throws StorageError `not-found`; TypeError if the identity differs; SchemaError on a
   *   malformed entity.
   */
  replace<K extends EntityKind>(kind: K, entity: EntityOf<K>): Promise<EntityOf<K>>;
  /** The kind's entities, removed ones too, in id order: creation order. */
  list<K extends EntityKind>(kind: K): Promise<readonly EntityOf<K>[]>;
  /** Every kind's entities, removed ones too, each in id order, read in one transaction. */
  all(): Promise<EntityLists>;
}

export function entityRepository(connection: Connection): EntityRepository {
  /** Reads an entity, changes it with `change` and stores it, in one transaction. */
  const modify = <K extends EntityKind>(
    kind: K,
    id: Id,
    doing: string,
    change: (entity: EntityOf<K>) => EntityOf<K>,
  ): Promise<EntityOf<K>> =>
    connection.run([kind], 'readwrite', doing, async (tx) => {
      const stored = await tx.objectStore(kind).get(id);
      if (stored === undefined) throw new StorageError('not-found', `${doing}: no such ${kind}`);
      const next = change(normaliseEntity(kind, stored));
      await Promise.all([tx.objectStore(kind).put(next), tx.done]);
      return next;
    });

  return {
    async create(kind, entity) {
      const record = normaliseEntity(kind, entity);
      await connection.run([kind], 'readwrite', `Creating ${kind} ${record.id}`, (tx) =>
        Promise.all([tx.objectStore(kind).add(record), tx.done]),
      );
    },

    get(kind, id) {
      return connection.run([kind], 'readonly', `Reading ${kind} ${id}`, async (tx) => {
        const value = await tx.objectStore(kind).get(id);
        return value === undefined ? null : normaliseEntity(kind, value);
      });
    },

    update(kind, id, changes, nowEpochMs) {
      return modify(kind, id, `Updating ${kind} ${id}`, (entity) =>
        updateEntity(kind, entity, changes, nowEpochMs),
      );
    },

    async replace(kind, entity) {
      const record = normaliseEntity(kind, entity);
      return await modify(kind, record.id, `Replacing ${kind} ${record.id}`, (stored) => {
        if (!sameEntityIdentity(stored, record)) {
          throw new TypeError(
            `replace: ${kind} ${record.id} has another creation time than the stored one`,
          );
        }
        return record;
      });
    },

    list(kind) {
      return connection.run([kind], 'readonly', `Listing ${kind}`, async (tx) => {
        const values = await tx.objectStore(kind).getAll();
        return values.map((value, i) => normaliseEntity(kind, value, `${kind}[${i}]`));
      });
    },

    all() {
      return connection.run(ENTITY_KINDS, 'readonly', 'Listing the entities', async (tx) => {
        const [machines, grinders, recipes, packs, containers, tags] = await Promise.all(
          ENTITY_KINDS.map((kind) => tx.objectStore(kind).getAll()),
        );
        const read = <K extends EntityKind>(kind: K, values: readonly unknown[]) =>
          values.map((value, i) => normaliseEntity(kind, value, `${kind}[${i}]`));
        return {
          machines: read('machines', machines),
          grinders: read('grinders', grinders),
          recipes: read('recipes', recipes),
          packs: read('packs', packs),
          containers: read('containers', containers),
          tags: read('tags', tags),
        };
      });
    },
  };
}
