/**
 * The brew flow's settings (T1.18, D-067): the recipe and the dose last used, and the tag list
 * with the tags that are on by default for new shots. They live in the `kv` store, so a full
 * export carries them (D-025), under `SETTING_KEYS`.
 *
 * Until the entities exist (T2.1), the recipes are spec v2's prefilled list ("Recipes"), and the
 * tags the design's list, WDT and Puck screen on by default (the user's answer). The dose stands
 * in for the beans and grind phases (T2.6, T2.7) and the basket's size (T2.1), which will set it
 * later: the user sets it on the extraction screen. T2.1 moves the recipes and tags into their
 * own stores, seeded from these.
 *
 * Settings are conveniences: a value missing or malformed in `kv` reads as its default, and
 * never stops the flow.
 */

import type { JsonValue } from '../core/model';
import { Emitter, type Unsubscribe } from '../transport/emitter';

export interface Recipe {
  /** The drink, like `Cappuccino`: what a shot records and history shows. */
  readonly name: string;
  /** Yield ÷ dose: `2` for 1:2. */
  readonly coffeeRatio: number;
  /** Milk ÷ espresso: `3` for 1:3; null for a recipe without milk. */
  readonly milkRatio: number | null;
}

/** Spec v2 "Recipes": the prefilled list, until the user can edit it (T2.1, T2.9). */
export const DEFAULT_RECIPES: readonly Recipe[] = [
  { name: 'Ristretto', coffeeRatio: 1.5, milkRatio: null },
  { name: 'Espresso', coffeeRatio: 2, milkRatio: null },
  { name: 'Lungo', coffeeRatio: 3, milkRatio: null },
  { name: 'Cortado', coffeeRatio: 2, milkRatio: 1 },
  { name: 'Cappuccino', coffeeRatio: 2, milkRatio: 3 },
  { name: 'Flat white', coffeeRatio: 2, milkRatio: 4 },
  { name: 'Latte', coffeeRatio: 2, milkRatio: 6 },
];

/** The recipe before any was picked. */
export const DEFAULT_RECIPE_NAME = 'Espresso';

export interface BrewTag {
  readonly name: string;
  /** On for every new shot. */
  readonly isDefault: boolean;
}

/** The tags before any were added: the design's list, with WDT and Puck screen on (D-067). */
export const DEFAULT_TAGS: readonly BrewTag[] = [
  { name: 'WDT', isDefault: true },
  { name: 'Puck screen', isDefault: true },
  { name: 'RDT', isDefault: false },
  { name: 'Paper filter', isDefault: false },
  { name: 'Warm-up < 15 min', isDefault: false },
  { name: 'New basket', isDefault: false },
  { name: 'Experiment', isDefault: false },
];

/** The dose's limits and step on the extraction screen, g: the scale reads tenths (D-037). */
export const DOSE = { defaultG: 18, minG: 5, maxG: 30, stepG: 0.1 } as const;

/** Where the settings are kept in `kv`. */
export const SETTING_KEYS = {
  recipe: 'lastUsed.recipe',
  doseG: 'lastUsed.doseG',
  tags: 'tags',
} as const;

/** The longest tag name kept, in characters. */
export const MAX_TAG_LENGTH = 40;

export interface BrewSettings {
  readonly recipe: Recipe;
  /** The dose the target is set from, g, in tenths. */
  readonly doseG: number;
  /** In the order the card shows them. */
  readonly tags: readonly BrewTag[];
}

/** The settings before anything was stored. */
export const DEFAULT_BREW_SETTINGS: BrewSettings = {
  recipe: recipeNamed(DEFAULT_RECIPE_NAME)!,
  doseG: DOSE.defaultG,
  tags: DEFAULT_TAGS,
};

/** The prefilled recipe of that name, or null. */
export function recipeNamed(name: string): Recipe | null {
  return DEFAULT_RECIPES.find((recipe) => recipe.name === name) ?? null;
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

/**
 * The settings from their stored values (`undefined` when not stored). Anything missing or
 * malformed reads as its default.
 */
export function readBrewSettings(stored: {
  readonly recipe: JsonValue | undefined;
  readonly doseG: JsonValue | undefined;
  readonly tags: JsonValue | undefined;
}): BrewSettings {
  const recipe =
    (typeof stored.recipe === 'string' ? recipeNamed(stored.recipe) : null) ??
    DEFAULT_BREW_SETTINGS.recipe;
  const doseG = typeof stored.doseG === 'number' ? clampDose(stored.doseG) : DOSE.defaultG;
  return { recipe, doseG, tags: readTags(stored.tags) ?? DEFAULT_TAGS };
}

/** The stored tag list, without malformed or repeated entries; null if it isn't a list. */
function readTags(value: JsonValue | undefined): BrewTag[] | null {
  if (!Array.isArray(value)) return null;
  const items: readonly JsonValue[] = value;
  const tags: BrewTag[] = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const entry = item as { readonly [key: string]: JsonValue };
    const name = typeof entry.name === 'string' ? tagName(entry.name) : '';
    if (name === '' || tags.some((tag) => sameTag(tag.name, name))) continue;
    tags.push({ name, isDefault: entry.isDefault === true });
  }
  return tags;
}

/** Whether two tag names are the same tag: case doesn't count. */
export function sameTag(a: string, b: string): boolean {
  return a.toLocaleLowerCase() === b.toLocaleLowerCase();
}

/** What `BrewPreferences` needs of the `kv` store. */
export interface SettingsStore {
  get(key: string): Promise<JsonValue | undefined>;
  set(key: string, value: JsonValue): Promise<void>;
}

/**
 * The settings, loaded once and kept in step with `kv`: a change applies at once, and is stored
 * behind it. A failed write leaves the change in place for this session and reports it
 * (`writeError`); the next change tries again.
 */
export class BrewPreferences {
  readonly #store: SettingsStore;
  readonly #changes = new Emitter<BrewSettings>();
  #value: BrewSettings;
  #writeError: string | null = null;
  /** Writes in order: a later change never lands before an earlier one. */
  #writing: Promise<void> = Promise.resolve();

  private constructor(store: SettingsStore, value: BrewSettings) {
    this.#store = store;
    this.#value = value;
  }

  /** Loads the settings. A store that can't be read gives the defaults. */
  static async load(store: SettingsStore): Promise<BrewPreferences> {
    let value = DEFAULT_BREW_SETTINGS;
    try {
      const [recipe, doseG, tags] = await Promise.all([
        store.get(SETTING_KEYS.recipe),
        store.get(SETTING_KEYS.doseG),
        store.get(SETTING_KEYS.tags),
      ]);
      value = readBrewSettings({ recipe, doseG, tags });
    } catch {
      // The defaults: storage failing shows elsewhere (the recorder's warnings).
    }
    return new BrewPreferences(store, value);
  }

  get value(): BrewSettings {
    return this.#value;
  }

  /** Why the last write failed, or null. */
  get writeError(): string | null {
    return this.#writeError;
  }

  onChange(listener: (settings: BrewSettings) => void): Unsubscribe {
    return this.#changes.on(listener);
  }

  /** Makes a prefilled recipe the one in use: the default from now on. */
  setRecipe(name: string): void {
    const recipe = recipeNamed(name);
    if (recipe === null || recipe.name === this.#value.recipe.name) return;
    this.#change({ ...this.#value, recipe }, SETTING_KEYS.recipe, recipe.name);
  }

  /** Sets the dose, kept within its limits and in tenths. */
  setDoseG(doseG: number): void {
    const next = clampDose(doseG);
    if (next === this.#value.doseG) return;
    this.#change({ ...this.#value, doseG: next }, SETTING_KEYS.doseG, next);
  }

  /**
   * Adds a tag, off by default, at the end of the list, and returns its name as kept. A name
   * already there, in any case, adds nothing and returns the existing name; an empty one
   * returns null.
   */
  addTag(text: string): string | null {
    const name = tagName(text);
    if (name === '') return null;
    const existing = this.#value.tags.find((tag) => sameTag(tag.name, name));
    if (existing) return existing.name;
    const tags = [...this.#value.tags, { name, isDefault: false }];
    this.#change(
      { ...this.#value, tags },
      SETTING_KEYS.tags,
      tags.map((tag) => ({ name: tag.name, isDefault: tag.isDefault })),
    );
    return name;
  }

  /** Resolves once every change so far is stored, or has failed. */
  whenStored(): Promise<void> {
    return this.#writing;
  }

  #change(next: BrewSettings, key: string, stored: JsonValue): void {
    this.#value = next;
    this.#changes.emit(next);
    this.#writing = this.#writing.then(() =>
      this.#store.set(key, stored).then(
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
}
