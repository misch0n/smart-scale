/**
 * Test support, for tests only: the entities' storage in memory (`EntityStore`), seeded as a new
 * database is, which can be told to fail.
 */

import {
  byId,
  normaliseEntity,
  SEEDS,
  updateEntity,
  type EntityChanges,
  type EntityKind,
  type EntityLists,
  type EntityOf,
} from '../core/model';
import { StorageError } from '../storage';
import type { EntityStore } from './entities';

export class MemoryEntityStore implements EntityStore {
  /** What is stored, by kind. */
  lists: EntityLists;
  failReads = false;
  failWrites = false;
  /** Every write, as `create machines <id>` or `update tags <id>`. */
  readonly writes: string[] = [];

  constructor(lists: EntityLists = SEEDS) {
    this.lists = lists;
  }

  all(): Promise<EntityLists> {
    if (this.failReads) return Promise.reject(new StorageError('failed', 'read failed'));
    return Promise.resolve(this.lists);
  }

  create<K extends EntityKind>(kind: K, entity: EntityOf<K>): Promise<void> {
    if (this.failWrites) return Promise.reject(new StorageError('quota', 'disk full'));
    const list: readonly EntityOf<K>[] = this.lists[kind];
    if (list.some((stored) => stored.id === entity.id)) {
      return Promise.reject(new StorageError('exists', `${kind} ${entity.id} exists`));
    }
    this.writes.push(`create ${kind} ${entity.id}`);
    this.#set(kind, [...list, normaliseEntity(kind, entity)]);
    return Promise.resolve();
  }

  update<K extends EntityKind>(
    kind: K,
    id: string,
    changes: EntityChanges<K>,
    nowEpochMs: number,
  ): Promise<EntityOf<K>> {
    if (this.failWrites) return Promise.reject(new StorageError('quota', 'disk full'));
    const list: readonly EntityOf<K>[] = this.lists[kind];
    const stored = list.find((entity) => entity.id === id);
    if (stored === undefined) {
      return Promise.reject(new StorageError('not-found', `no such ${kind}`));
    }
    const next = updateEntity(kind, stored, changes, nowEpochMs);
    this.writes.push(`update ${kind} ${id}`);
    this.#set(
      kind,
      list.map((entity) => (entity.id === id ? next : entity)),
    );
    return Promise.resolve(next);
  }

  #set<K extends EntityKind>(kind: K, list: readonly EntityOf<K>[]): void {
    this.lists = { ...this.lists, [kind]: [...list].sort(byId) };
  }
}
