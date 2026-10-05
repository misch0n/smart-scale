/**
 * The entities in memory (T2.1, D-074): the machines, grinders, recipes, coffee packs,
 * containers and tags, loaded once at startup and kept in step with storage. They are few, so
 * the screens read them from here, synchronously, as `BrewPreferences` reads its settings.
 *
 * A change applies here at once and is stored behind it, in order, so a later change never lands
 * before an earlier one. A failed write leaves the change in place for this session and reports
 * it (`writeError`); the next change tries again. After an import, `reload()` reads them again.
 * Storage that can't be read gives the seeds, so the brew flow still has its recipes and tags.
 */

import {
  byId,
  createEntity,
  isListed,
  SEEDS,
  updateEntity,
  type EntityChanges,
  type EntityFields,
  type EntityKind,
  type EntityLists,
  type EntityOf,
  type Id,
} from '../core/model';
import type { EntityRepository } from '../storage';
import { Emitter, type Unsubscribe } from '../transport/emitter';

/** What `Entities` needs of storage (`AppStorage.entities` has it). */
export type EntityStore = Pick<EntityRepository, 'all' | 'create' | 'update'>;

export interface EntitiesOptions {
  /** The wall clock, for the entities' times. Default `Date.now`. */
  readonly epochNow?: () => number;
}

export class Entities {
  readonly #store: EntityStore;
  readonly #epochNow: () => number;
  readonly #changes = new Emitter<EntityLists>();
  readonly #stored = new Emitter<void>();
  #value: EntityLists;
  #loadError: string | null;
  #writeError: string | null = null;
  /** Writes in order: a later change never lands before an earlier one. */
  #writing: Promise<void> = Promise.resolve();

  private constructor(
    store: EntityStore,
    value: EntityLists,
    loadError: string | null,
    options: EntitiesOptions,
  ) {
    this.#store = store;
    this.#value = value;
    this.#loadError = loadError;
    this.#epochNow = options.epochNow ?? (() => Date.now());
  }

  /** Loads every entity. Storage that can't be read gives the seeds, and `loadError` says why. */
  static async load(store: EntityStore, options: EntitiesOptions = {}): Promise<Entities> {
    try {
      return new Entities(store, await store.all(), null, options);
    } catch (error) {
      return new Entities(store, SEEDS, errorText(error), options);
    }
  }

  /** Every kind's entities, removed ones too, each in id order. */
  get value(): EntityLists {
    return this.#value;
  }

  /** The kind's entities in the user's lists: removed ones left out, in id order. */
  listed<K extends EntityKind>(kind: K): readonly EntityOf<K>[] {
    const all: readonly EntityOf<K>[] = this.#value[kind];
    return all.filter(isListed);
  }

  /** The entity of the kind with that id, removed or not; null if there is none. */
  get<K extends EntityKind>(kind: K, id: Id): EntityOf<K> | null {
    const all: readonly EntityOf<K>[] = this.#value[kind];
    return all.find((entity) => entity.id === id) ?? null;
  }

  /** Why the entities couldn't be read, so the seeds stand in; null when they were read. */
  get loadError(): string | null {
    return this.#loadError;
  }

  /** Why the last write failed, or null. */
  get writeError(): string | null {
    return this.#writeError;
  }

  /** Calls `listener` after every change of `value` or `writeError`. */
  onChange(listener: (value: EntityLists) => void): Unsubscribe {
    return this.#changes.on(listener);
  }

  /** Calls `listener` after every change that was stored: automatic export uploads them (T1.20). */
  onStored(listener: () => void): Unsubscribe {
    return this.#stored.on(listener);
  }

  /**
   * Adds a new entity of the kind, created now, and returns it. Stored behind.
   *
   * @throws SchemaError on malformed fields: nothing is added.
   */
  add<K extends EntityKind>(kind: K, fields: EntityFields<K>): EntityOf<K> {
    const entity = createEntity(kind, fields, this.#epochNow());
    const all: readonly EntityOf<K>[] = this.#value[kind];
    this.#set(kind, [...all, entity]);
    this.#write(() => this.#store.create(kind, entity));
    return entity;
  }

  /**
   * Applies `changes` to the entity of the kind with that id, now, and returns it; null when
   * there is no such entity. Stored behind. `removedAtEpochMs` removes it, and null restores it.
   * A change made from the entity's value (a step, a list with one more) passes a function of
   * the current entity, so two taps before the screen draws again both count.
   *
   * @throws TypeError or SchemaError on a change `updateEntity` refuses: nothing changes.
   */
  update<K extends EntityKind>(
    kind: K,
    id: Id,
    change: EntityChanges<K> | ((current: EntityOf<K>) => EntityChanges<K>),
  ): EntityOf<K> | null {
    const current = this.get(kind, id);
    if (current === null) return null;
    const now = this.#epochNow();
    const changes = typeof change === 'function' ? change(current) : change;
    const next = updateEntity(kind, current, changes, now);
    const all: readonly EntityOf<K>[] = this.#value[kind];
    this.#set(
      kind,
      all.map((entity) => (entity.id === id ? next : entity)),
    );
    this.#write(() => this.#store.update(kind, id, changes, now));
    return next;
  }

  /**
   * Reads every entity again, after what was written so far: after an import. A failure keeps
   * the entities as they are, and `loadError` says why.
   */
  async reload(): Promise<void> {
    await this.#writing;
    try {
      this.#value = await this.#store.all();
      this.#loadError = null;
    } catch (error) {
      this.#loadError = errorText(error);
    }
    this.#changes.emit(this.#value);
  }

  /** Resolves once every change so far is stored, or has failed. */
  whenStored(): Promise<void> {
    return this.#writing;
  }

  #set<K extends EntityKind>(kind: K, list: readonly EntityOf<K>[]): void {
    this.#value = { ...this.#value, [kind]: [...list].sort(byId) };
    this.#changes.emit(this.#value);
  }

  #write(write: () => Promise<unknown>): void {
    this.#writing = this.#writing.then(write).then(
      () => {
        if (this.#writeError !== null) {
          this.#writeError = null;
          this.#changes.emit(this.#value);
        }
        this.#stored.emit();
      },
      (error: unknown) => {
        this.#writeError = errorText(error);
        this.#changes.emit(this.#value);
      },
    );
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
