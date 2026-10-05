/**
 * The brew flow's settings (T1.18, T2.1; D-067, D-074): what the next brew uses. The recipes,
 * the tags, the machine and its basket, the grinder and the coffee pack are entities
 * (`Entities`); which of them is in use is the last used, kept in `kv` by id together with the
 * dose, so a full export carries them (D-025), under `SETTING_KEYS`.
 *
 * The last used is "the default" (spec v2 "Brew phases": the last used is the default, and a
 * change becomes the default): a listed entity whose id is stored, else the first listed. The
 * seeds' order makes that the Gaggia with its LM 17 g basket and the ORO; the recipe falls back
 * to Espresso, as before T2.1 (D-067). A coffee pack is used only while it isn't finished:
 * after a finished pack the next is unknown until the user picks one (T2.2).
 *
 * The dose stands in for the beans and grind phases (T2.6, T2.7), which will weigh it: the user
 * sets it on the extraction screen (D-067).
 *
 * Settings are conveniences: a value missing or malformed in `kv` reads as its default, and
 * never stops the flow.
 */

import {
  DEFAULT_RECIPE_ID,
  isListed,
  RECIPE_ID_KEY,
  SEEDS,
  type Basket,
  type BrewContext,
  type CoffeePack,
  type EntityLists,
  type Grinder,
  type Id,
  type JsonValue,
  type Machine,
  type Recipe,
  type Tag,
} from '../core/model';
import { Emitter, type Unsubscribe } from '../transport/emitter';
import type { Entities } from './entities';

/** A tag as the grades use it: its name, and whether it is on for new shots. */
export type BrewTag = Pick<Tag, 'name' | 'isDefault'>;

/** The dose's limits and step on the extraction screen, g: the scale reads tenths (D-037). */
export const DOSE = { defaultG: 18, minG: 5, maxG: 30, stepG: 0.1 } as const;

/** Where the last-used values are kept in `kv`. */
export const SETTING_KEYS = {
  recipeId: RECIPE_ID_KEY,
  doseG: 'lastUsed.doseG',
  machineId: 'lastUsed.machineId',
  basketId: 'lastUsed.basketId',
  grinderId: 'lastUsed.grinderId',
  packId: 'lastUsed.packId',
} as const;

/** The longest tag name kept, in characters. */
export const MAX_TAG_LENGTH = 40;

/** What the next brew uses, and what its pickers offer. */
export interface BrewSettings extends BrewContext {
  /** The recipes to pick from: the listed ones, in list order. */
  readonly recipes: readonly Recipe[];
  /** The recipe in use. There always is one: Espresso's seed if every recipe is gone. */
  readonly recipe: Recipe;
  /** The dose the target is set from, g, in tenths. */
  readonly doseG: number;
  /** The tag list, in the order the card shows it. */
  readonly tags: readonly Tag[];
  /** The machine in use, and one of its baskets; null when none is listed. */
  readonly machine: Machine | null;
  readonly basket: Basket | null;
  readonly grinder: Grinder | null;
  /** The coffee pack in use; null until one is picked, and after it is finished. */
  readonly pack: CoffeePack | null;
}

/** The last-used values as `kv` holds them: `undefined` when not stored. */
export type StoredBrewSettings = {
  readonly [K in keyof typeof SETTING_KEYS]?: JsonValue | undefined;
};

/** The settings from the entities and the stored last-used values. */
export function resolveBrewSettings(
  entities: EntityLists,
  stored: StoredBrewSettings,
): BrewSettings {
  const recipes = entities.recipes.filter(isListed);
  const machines = entities.machines.filter(isListed);
  const grinders = entities.grinders.filter(isListed);
  const machine = lastUsed(machines, stored.machineId) ?? machines[0] ?? null;
  const baskets = machine?.baskets ?? [];
  const pack = lastUsed(entities.packs.filter(isListed), stored.packId);
  return {
    recipes,
    recipe:
      lastUsed(recipes, stored.recipeId) ??
      lastUsed(recipes, DEFAULT_RECIPE_ID) ??
      recipes[0] ??
      SEEDS.recipes.find((recipe) => recipe.id === DEFAULT_RECIPE_ID)!,
    doseG: typeof stored.doseG === 'number' ? clampDose(stored.doseG) : DOSE.defaultG,
    tags: entities.tags.filter(isListed),
    machine,
    basket: lastUsed(baskets, stored.basketId) ?? baskets[0] ?? null,
    grinder: lastUsed(grinders, stored.grinderId) ?? grinders[0] ?? null,
    pack: pack !== null && pack.finishedDate === null ? pack : null,
  };
}

/** The one with the stored id, or null. */
function lastUsed<T extends { readonly id: Id }>(
  list: readonly T[],
  id: JsonValue | undefined,
): T | null {
  return typeof id === 'string' ? (list.find((entry) => entry.id === id) ?? null) : null;
}

/** The dose within its limits, in tenths of a gram. */
export function clampDose(doseG: number): number {
  if (!Number.isFinite(doseG)) return DOSE.defaultG;
  return Math.round(Math.min(DOSE.maxG, Math.max(DOSE.minG, doseG)) * 10) / 10;
}

/** A tag name as kept: trimmed, single-spaced, at most `MAX_TAG_LENGTH` characters; '' if none. */
export function tagName(text: string): string {
  return text.trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH).trim();
}

/** The tags a new shot starts with: the defaults, in list order. */
export function defaultTagNames(tags: readonly BrewTag[]): string[] {
  return tags.filter((tag) => tag.isDefault).map((tag) => tag.name);
}

/** Whether two tag names are the same tag: case doesn't count. */
export function sameTag(a: string, b: string): boolean {
  return a.toLocaleLowerCase() === b.toLocaleLowerCase();
}

/** `tags` in the list's order, those the list lacks after them in their own order. */
export function tagsInListOrder(list: readonly BrewTag[], tags: readonly string[]): string[] {
  const rank = (tag: string) => {
    const i = list.findIndex((entry) => sameTag(entry.name, tag));
    return i === -1 ? list.length : i;
  };
  return [...tags].sort((a, b) => rank(a) - rank(b));
}

/** A shot's `tags` with `name` turned off if it is on, else on, in the list's order. */
export function toggledTag(
  list: readonly BrewTag[],
  tags: readonly string[],
  name: string,
): string[] {
  return tags.some((tag) => sameTag(tag, name))
    ? tags.filter((tag) => !sameTag(tag, name))
    : tagsInListOrder(list, [...tags, name]);
}

/** What `BrewPreferences` needs of the `kv` store. */
export interface SettingsStore {
  get(key: string): Promise<JsonValue | undefined>;
  set(key: string, value: JsonValue): Promise<void>;
}

/**
 * The settings, loaded once and kept in step with `kv` and the entities: a change applies at
 * once, and is stored behind it. A failed write leaves the change in place for this session and
 * reports it (`writeError`); the next change tries again.
 */
export class BrewPreferences {
  readonly #store: SettingsStore;
  readonly #entities: Entities;
  readonly #changes = new Emitter<BrewSettings>();
  #stored: StoredBrewSettings;
  #value: BrewSettings;
  #writeError: string | null = null;
  /** Writes in order: a later change never lands before an earlier one. */
  #writing: Promise<void> = Promise.resolve();

  private constructor(store: SettingsStore, entities: Entities, stored: StoredBrewSettings) {
    this.#store = store;
    this.#entities = entities;
    this.#stored = stored;
    this.#value = resolveBrewSettings(entities.value, stored);
    entities.onChange(() => this.#update());
  }

  /** Loads the settings. A store that can't be read gives the defaults. */
  static async load(store: SettingsStore, entities: Entities): Promise<BrewPreferences> {
    return new BrewPreferences(store, entities, await readStored(store));
  }

  get value(): BrewSettings {
    return this.#value;
  }

  /** Why the last write failed, of a setting or an entity, or null. */
  get writeError(): string | null {
    return this.#writeError ?? this.#entities.writeError;
  }

  onChange(listener: (settings: BrewSettings) => void): Unsubscribe {
    return this.#changes.on(listener);
  }

  /** Makes a listed recipe the one in use: the default from now on. */
  setRecipe(id: Id): void {
    if (id === this.#value.recipe.id || !this.#value.recipes.some((r) => r.id === id)) return;
    this.#change('recipeId', id);
  }

  /** Makes a listed machine the one in use: the default from now on (Setup, the beans phase). */
  setMachine(id: Id): void {
    if (id === this.#value.machine?.id) return;
    if (!this.#entities.listed('machines').some((machine) => machine.id === id)) return;
    this.#change('machineId', id);
  }

  /** Makes one of the machine's baskets the one in use: the default, and the beans target. */
  setBasket(id: Id): void {
    if (id === this.#value.basket?.id) return;
    if (!(this.#value.machine?.baskets ?? []).some((basket) => basket.id === id)) return;
    this.#change('basketId', id);
  }

  /** Makes a listed grinder the one in use: the default (Setup's "Make default", T2.3). */
  setGrinder(id: Id): void {
    if (id === this.#value.grinder?.id) return;
    if (!this.#entities.listed('grinders').some((grinder) => grinder.id === id)) return;
    this.#change('grinderId', id);
  }

  /** Makes a listed pack that isn't finished the one in use, or none with null (T2.2). */
  setPack(id: Id | null): void {
    if (id === (this.#value.pack?.id ?? null)) return;
    const pack = id === null ? null : this.#entities.get('packs', id);
    if (pack !== null && (pack.removedAtEpochMs !== null || pack.finishedDate !== null)) return;
    if (id !== null && pack === null) return;
    this.#change('packId', id);
  }

  /** Sets the dose, kept within its limits and in tenths. */
  setDoseG(doseG: number): void {
    const next = clampDose(doseG);
    if (next === this.#value.doseG) return;
    this.#change('doseG', next);
  }

  /**
   * Adds a tag, off by default, at the end of the list, and returns its name as kept. A name
   * already listed, in any case, adds nothing and returns the listed name; a removed one is
   * listed again, off by default. An empty name returns null.
   */
  addTag(text: string): string | null {
    const name = tagName(text);
    if (name === '') return null;
    const tags = this.#entities.value.tags;
    const listed = tags.find((tag) => isListed(tag) && sameTag(tag.name, name));
    if (listed) return listed.name;
    const removed = tags.find((tag) => !isListed(tag) && sameTag(tag.name, name));
    if (removed) {
      this.#entities.update('tags', removed.id, { removedAtEpochMs: null, isDefault: false });
      return removed.name;
    }
    this.#entities.add('tags', { name, group: null, isDefault: false });
    return name;
  }

  /** Reads the settings and the entities again: after an import. */
  async reload(): Promise<void> {
    await this.#writing;
    await this.#entities.reload();
    this.#stored = await readStored(this.#store);
    this.#update();
  }

  /** Resolves once every change so far is stored, or has failed. */
  async whenStored(): Promise<void> {
    await Promise.all([this.#writing, this.#entities.whenStored()]);
  }

  #change(key: keyof typeof SETTING_KEYS, value: JsonValue): void {
    this.#stored = { ...this.#stored, [key]: value };
    this.#update();
    this.#writing = this.#writing.then(() =>
      this.#store.set(SETTING_KEYS[key], value).then(
        () => {
          this.#writeError = null;
        },
        (error: unknown) => {
          this.#writeError = error instanceof Error ? error.message : String(error);
          this.#changes.emit(this.#value);
        },
      ),
    );
  }

  #update(): void {
    this.#value = resolveBrewSettings(this.#entities.value, this.#stored);
    this.#changes.emit(this.#value);
  }
}

/** The stored last-used values; none when the store can't be read. */
async function readStored(store: SettingsStore): Promise<StoredBrewSettings> {
  const keys = Object.keys(SETTING_KEYS) as (keyof typeof SETTING_KEYS)[];
  try {
    const values = await Promise.all(keys.map((key) => store.get(SETTING_KEYS[key])));
    return Object.fromEntries(keys.map((key, i) => [key, values[i]]));
  } catch {
    // The defaults: storage failing shows elsewhere (the recorder's warnings).
    return {};
  }
}
