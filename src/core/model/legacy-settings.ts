/**
 * The brew flow's settings from before the entities (T1.18, D-067), converted to them (T2.1,
 * D-075): the tag list `tags` ([{ name, isDefault }]) becomes tag entities, and the last recipe
 * `lastUsed.recipe` (a prefilled recipe's name) becomes `lastUsed.recipeId`. Database migration
 * 3 converts a device's `kv` store and export migration 3 → 4 a file's settings, both with these
 * functions, so a device and its older exports convert to the same entities and an import finds
 * them equal.
 *
 * **Frozen**, as the migrations that use them are (see `seeds.ts`).
 */

import type { Tag } from './entities';
import type { Id } from './ids';
import { SEED_EPOCH_MS, SEEDS } from './seeds';

/** Where T1.18 kept its tag list: `[{ name, isDefault }]`. */
export const LEGACY_TAGS_KEY = 'tags';
/** Where T1.18 kept the last recipe: a prefilled recipe's name. */
export const LEGACY_RECIPE_KEY = 'lastUsed.recipe';
/** Where the last recipe is kept from T2.1 on: its id. */
export const RECIPE_ID_KEY = 'lastUsed.recipeId';

/** The longest tag name T1.18 kept, in characters. */
const MAX_TAG_LENGTH = 40;

/**
 * The tag entities for T1.18's tag list, in its order. A seed's name (in any case) keeps the
 * seed's id, and any other name gets an id derived from it (`legacyTagId`), so converting the
 * same list twice gives the same tags. All are created at `SEED_EPOCH_MS`, and a tag the user
 * didn't change is its seed exactly. The list is read leniently, as T1.18 read it: an entry that
 * isn't a tag, or a name already there in another case, is left out. Anything but a list gives
 * none.
 */
export function tagsFromLegacySetting(value: unknown): Tag[] {
  if (!Array.isArray(value)) return [];
  const entries: readonly unknown[] = value;
  const tags: Tag[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
    const { name: rawName, isDefault } = entry as Readonly<Record<string, unknown>>;
    if (typeof rawName !== 'string') continue;
    const name = rawName.trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH).trim();
    const key = name.toLowerCase();
    if (name === '' || seen.has(key)) continue;
    seen.add(key);
    const seeded = SEEDS.tags.find((tag) => tag.name.toLowerCase() === key);
    tags.push({
      id: seeded?.id ?? legacyTagId(name),
      createdAtEpochMs: SEED_EPOCH_MS,
      updatedAtEpochMs: SEED_EPOCH_MS,
      removedAtEpochMs: null,
      name,
      group: null,
      isDefault: isDefault === true,
    });
  }
  return tags;
}

/** The prefilled recipe's id for T1.18's last recipe (its name, in any case), or null. */
export function recipeIdFromLegacySetting(value: unknown): Id | null {
  if (typeof value !== 'string') return null;
  const recipes = SEEDS.recipes;
  const recipe =
    recipes.find((entry) => entry.name === value) ??
    recipes.find((entry) => entry.name.toLowerCase() === value.toLowerCase());
  return recipe?.id ?? null;
}

/**
 * An id for a tag T1.18's user added, derived from its name in lower case: the same name always
 * gives the same id. A UUIDv7 a millisecond after the seeds' time, so these sort after the seeds,
 * with 74 bits of a hash of the name for the rest.
 */
export function legacyTagId(name: string): Id {
  const key = name.toLowerCase();
  const a = hash32(key, 1);
  const b = hash32(key, 2);
  const c = hash32(key, 3);
  const time = (SEED_EPOCH_MS + 1).toString(16).padStart(12, '0');
  const randA = hex(a & 0xfff, 3);
  const variant = (0x8 | ((a >>> 12) & 0x3)).toString(16);
  const randB = hex((a >>> 14) & 0xfff, 3);
  return `${time.slice(0, 8)}-${time.slice(8)}-7${randA}-${variant}${randB}-${hex(b, 8)}${hex(c & 0xffff, 4)}`;
}

/** FNV-1a over the UTF-16 code units, from a seeded basis, with murmur3's finaliser. */
function hash32(text: string, seed: number): number {
  let h = (0x811c9dc5 ^ Math.imul(seed, 0x9e3779b9)) >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

function hex(value: number, digits: number): string {
  return (value >>> 0).toString(16).padStart(digits, '0').slice(-digits);
}
