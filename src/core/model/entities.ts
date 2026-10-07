/**
 * The entities (T2.1; spec v2 "Equipment, coffee and settings", D-053): the machine with its
 * baskets, the grinders, the recipes, the coffee packs, the containers and the tags. They are
 * user metadata, edited in Setup (T2.9) and in place during the phases. A shot refers to them by
 * id and keeps a snapshot of their values at brew time (`snapshot.ts`), so editing an entity
 * never rewrites a shot (D-068).
 *
 * Every entity carries an id, its creation and last change times, and a tombstone: removing one
 * sets `removedAtEpochMs` instead of deleting it (D-074), so neither an import nor a backup
 * brings it back, and a shot that names it still finds it. The lists the user picks from leave
 * removed entities out (`isListed`).
 *
 * The maintenance dates (spec v2 "Maintenance") live on what they maintain (D-074): descale and
 * backflush on the machine, grinder care on each grinder.
 *
 * Which entity a brew uses is the last used, kept in `kv` by id (`lastUsed.machineId` and so on):
 * "the default" is the last used, so no entity carries a default flag of its own (D-074). A tag's
 * `isDefault` is something else: the tag is on for every new shot.
 */

import { newId, type Id } from './ids';
import { field, SchemaError, type Field, type ObjectSchema } from './schema';
import { GRIND_SETTING_KINDS, type GrindSettingKind } from './shot';

/** The kinds of entity, each in its own store and its own list in an export. */
export const ENTITY_KINDS = [
  'machines',
  'grinders',
  'recipes',
  'packs',
  'containers',
  'tags',
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

/** What every entity carries. */
export interface EntityBase {
  readonly id: Id;
  readonly createdAtEpochMs: number;
  /** When it last changed: its creation time until then. */
  readonly updatedAtEpochMs: number;
  /**
   * When the user removed it; null while it is listed. Removing leaves this tombstone, which
   * clearing restores.
   */
  readonly removedAtEpochMs: number | null;
}

/** A basket of a machine. Its id tells apart baskets of the same size (spec v2 "Machine"). */
export interface Basket {
  readonly id: Id;
  /** Like `LM 17 g`; null when it has none. */
  readonly name: string | null;
  /** Its size, g: the beans target. */
  readonly sizeG: number;
}

/** A maintenance date (spec v2 "Maintenance"): when it was last done, and the reminder. */
export interface Maintenance {
  /** The day it was last done, `YYYY-MM-DD`; null when never logged. */
  readonly lastDoneDate: string | null;
  /** Remind this many days after it was last done; null for no reminder. */
  readonly reminderDays: number | null;
}

/** Never logged, and no reminder. */
export const NO_MAINTENANCE: Maintenance = { lastDoneDate: null, reminderDays: null };

export interface Machine extends EntityBase {
  /** Like `Gaggia Classic Pro`. */
  readonly name: string;
  /** Its brew pressure, bar (an OPV's setting, say); null when not tracked. */
  readonly pressureBar: number | null;
  /** In the order the user added them. */
  readonly baskets: readonly Basket[];
  readonly descale: Maintenance;
  readonly backflush: Maintenance;
}

export interface Grinder extends EntityBase {
  /** Like `Eureka`. */
  readonly brand: string;
  /** Like `ORO Mignon Single Dose Pro`. */
  readonly model: string;
  /** How its setting reads, as a shot's `GrindSetting.kind` does (D-019). */
  readonly settingKind: GrindSettingKind;
  /**
   * The setting now: the dial's reading (stepless) or a whole number of clicks; null until the
   * user sets one. A setting changed during a brew becomes this (T2.3).
   */
  readonly currentSetting: number | null;
  /**
   * How far a step of − or + moves a stepless setting, like `0.05` to mark between the dial's
   * marks; null for the kind's own step (0.1 stepless). Clicks always step one click (T2.28).
   */
  readonly settingStep: number | null;
  /** Grinder care: cleaning, or whatever the user counts as care. It covers the burrs (D-053). */
  readonly care: Maintenance;
}

/** A drink (spec v2 "Recipes"). A milk ratio makes it a milk drink, and brings the milk phase. */
export interface Recipe extends EntityBase {
  /** Like `Cappuccino`: what a shot records, and history shows. */
  readonly name: string;
  /** Yield ÷ dose: `2` for 1:2. */
  readonly coffeeRatio: number;
  /** Milk ÷ espresso: `3` for 1:3; null for a drink without milk. */
  readonly milkRatio: number | null;
}

/** A coffee pack (spec v2 "Coffee packs"). No stock is kept (D-053). */
export interface CoffeePack extends EntityBase {
  /** The roaster, like `Local roaster`; null when unknown. */
  readonly brand: string | null;
  /** Its name or type, like `Ethiopia Guji · Natural`. */
  readonly name: string;
  /** The pack's weight when bought, g; null when unknown. */
  readonly weightG: number | null;
  /** `YYYY-MM-DD`, as on the pack. Required: days off roast derive from it. */
  readonly roastDate: string;
  /** `YYYY-MM-DD`; null while unopened. */
  readonly openDate: string | null;
  /** Flavours, as on the pack. `[]` for none. */
  readonly flavours: readonly string[];
  /** The day it was finished, `YYYY-MM-DD`; null while in use. */
  readonly finishedDate: string | null;
  /** Would buy again, asked when it is finished (Q5); null when not answered. */
  readonly buyAgain: boolean | null;
}

/**
 * What a container is put down for (spec v2 "Brew phases"): it opens that phase (T2.4, T2.5). A
 * scale accessory (T2.17, Q30: the mat that protects the scale) opens none: recognised as it goes
 * on, it is part of the platform, and what is put on it is weighed and recognised as usual.
 */
export const CONTAINER_ROLES = ['bean', 'grind', 'cup', 'milk', 'accessory'] as const;
export type ContainerRole = (typeof CONTAINER_ROLES)[number];

/** A container the scale recognises by its empty mass (spec v2 "Containers"). */
export interface Container extends EntityBase {
  readonly name: string;
  /** Learned once, by putting it on the scale empty, g. */
  readonly emptyMassG: number;
  /**
   * Bean cup, grind cup, cup, milk jug: one container can have several. A scale accessory has
   * no other (Setup keeps it so; anywhere else, the accessory role wins).
   */
  readonly roles: readonly ContainerRole[];
  /**
   * The containers whose "within 3 g" warning with this one the user dismissed (T2.4): a wet
   * container weighs more, so two that close can be mistaken.
   */
  readonly dismissedWarningIds: readonly Id[];
}

/** A tag (spec v2 "Tags"): one list, for experiments and conditions. */
export interface Tag extends EntityBase {
  /** What a shot records in its `tags`. */
  readonly name: string;
  /** Only sorts the list; null for none. */
  readonly group: string | null;
  /** On for every new shot. */
  readonly isDefault: boolean;
}

export interface EntityTypes {
  readonly machines: Machine;
  readonly grinders: Grinder;
  readonly recipes: Recipe;
  readonly packs: CoffeePack;
  readonly containers: Container;
  readonly tags: Tag;
}

export type EntityOf<K extends EntityKind> = EntityTypes[K];
export type Entity = EntityTypes[EntityKind];

/** An entity's own fields: everything but its id and its times. */
export type EntityFields<K extends EntityKind> = Omit<EntityOf<K>, keyof EntityBase>;

/** Every kind's entities, as a full export and the automatic export's entities file hold them. */
export type EntityLists = { readonly [K in EntityKind]: readonly EntityOf<K>[] };

/** One entity, singular, for paths and messages: `machine`, `pack`, … */
export const ENTITY_NAMES: Readonly<Record<EntityKind, string>> = {
  machines: 'machine',
  grinders: 'grinder',
  recipes: 'recipe',
  packs: 'pack',
  containers: 'container',
  tags: 'tag',
};

const BASE_SCHEMA: ObjectSchema<EntityBase> = {
  id: field.id,
  createdAtEpochMs: field.number,
  updatedAtEpochMs: field.number,
  removedAtEpochMs: field.nullable(field.number),
};

const maintenanceField = field.object<Maintenance>({
  lastDoneDate: field.nullable(field.isoDate),
  reminderDays: field.nullable(field.nonNegativeInteger),
});

const basketField = field.object<Basket>({
  id: field.id,
  name: field.nullable(field.string),
  sizeG: field.number,
});

const parseMachine = field.object<Machine>({
  ...BASE_SCHEMA,
  name: field.string,
  pressureBar: field.nullable(field.number),
  baskets: field.arrayOf(basketField),
  descale: maintenanceField,
  backflush: maintenanceField,
});

const parseGrinderShape = field.object<Grinder>({
  ...BASE_SCHEMA,
  brand: field.string,
  model: field.string,
  settingKind: field.oneOf(GRIND_SETTING_KINDS),
  currentSetting: field.nullable(field.number),
  settingStep: field.nullable(field.number),
  care: maintenanceField,
});

/** As a shot's setting: clicks are whole (D-019). */
const parseGrinder: Field<Grinder> = (value, path) => {
  const grinder = parseGrinderShape(value, path);
  const setting = grinder.currentSetting;
  if (grinder.settingKind === 'clicks' && setting !== null && !Number.isInteger(setting)) {
    throw new SchemaError(
      `${path}.currentSetting`,
      `expected a whole number of clicks, got ${setting}`,
    );
  }
  if (grinder.settingStep !== null && !(grinder.settingStep > 0)) {
    throw new SchemaError(
      `${path}.settingStep`,
      `expected a step above 0, got ${grinder.settingStep}`,
    );
  }
  return grinder;
};

const parseRecipe = field.object<Recipe>({
  ...BASE_SCHEMA,
  name: field.string,
  coffeeRatio: field.number,
  milkRatio: field.nullable(field.number),
});

const parsePack = field.object<CoffeePack>({
  ...BASE_SCHEMA,
  brand: field.nullable(field.string),
  name: field.string,
  weightG: field.nullable(field.number),
  roastDate: field.isoDate,
  openDate: field.nullable(field.isoDate),
  flavours: field.arrayOf(field.string),
  finishedDate: field.nullable(field.isoDate),
  buyAgain: field.nullable(field.boolean),
});

const parseContainer = field.object<Container>({
  ...BASE_SCHEMA,
  name: field.string,
  emptyMassG: field.number,
  roles: field.arrayOf(field.oneOf(CONTAINER_ROLES)),
  dismissedWarningIds: field.arrayOf(field.id),
});

const parseTag = field.object<Tag>({
  ...BASE_SCHEMA,
  name: field.string,
  group: field.nullable(field.string),
  isDefault: field.boolean,
});

const PARSERS: { readonly [K in EntityKind]: Field<EntityOf<K>> } = {
  machines: parseMachine,
  grinders: parseGrinder,
  recipes: parseRecipe,
  packs: parsePack,
  containers: parseContainer,
  tags: parseTag,
};

/**
 * A complete entity of the kind from stored or imported data: missing nullable fields become
 * `null` and unknown keys are dropped (D-018). Errors name the path, `machine.baskets[0].sizeG`
 * by default.
 *
 * @throws SchemaError when a required field is missing or a value has the wrong type.
 */
export function normaliseEntity<K extends EntityKind>(
  kind: K,
  input: unknown,
  path: string = ENTITY_NAMES[kind],
): EntityOf<K> {
  const parse: Field<EntityOf<K>> = PARSERS[kind];
  return parse(input, path);
}

/** What a new entity is made from: all its own fields, and an id if it has one already. */
export type NewEntity<K extends EntityKind> = EntityFields<K> & { readonly id?: Id };

/**
 * A new entity of the kind, created now.
 *
 * @throws SchemaError on a malformed input.
 */
export function createEntity<K extends EntityKind>(
  kind: K,
  input: NewEntity<K>,
  nowEpochMs: number,
): EntityOf<K> {
  return normaliseEntity(kind, {
    ...input,
    id: input.id ?? newId(),
    createdAtEpochMs: nowEpochMs,
    updatedAtEpochMs: nowEpochMs,
    removedAtEpochMs: null,
  });
}

/** What an entity's changes may hold: its own fields, and its tombstone. */
export type EntityChanges<K extends EntityKind> = Partial<
  EntityFields<K> & Pick<EntityBase, 'removedAtEpochMs'>
>;

/** The fields `updateEntity` won't take: the id, and the times it keeps itself. */
const IDENTITY_KEYS: readonly string[] = ['id', 'createdAtEpochMs', 'updatedAtEpochMs'];

/**
 * The entity with `changes` applied and `updatedAtEpochMs` set to now. A change that is
 * `undefined` is skipped; pass `null` to clear a field. `removedAtEpochMs` removes the entity,
 * and null restores it.
 *
 * @throws TypeError if `changes` names its id or a time it keeps itself, and SchemaError on a
 *   malformed value.
 */
export function updateEntity<K extends EntityKind>(
  kind: K,
  entity: EntityOf<K>,
  changes: EntityChanges<K>,
  nowEpochMs: number,
): EntityOf<K> {
  const next: Record<string, unknown> = { ...entity };
  for (const [key, value] of Object.entries(changes)) {
    if (IDENTITY_KEYS.includes(key)) {
      throw new TypeError(`updateEntity: ${key} isn't something to change`);
    }
    if (value !== undefined) next[key] = value;
  }
  next.updatedAtEpochMs = nowEpochMs;
  return normaliseEntity(kind, next);
}

/**
 * Whether two entities are the same entity as created: the same id and creation time, which
 * never change. An import replaces a stored entity with a file's only when this holds (T2.1).
 */
export function sameEntityIdentity(a: EntityBase, b: EntityBase): boolean {
  return a.id === b.id && a.createdAtEpochMs === b.createdAtEpochMs;
}

/** Whether the entity is in the user's lists: not removed. */
export function isListed(entity: EntityBase): boolean {
  return entity.removedAtEpochMs === null;
}

/** By id, which is creation order (D-017): the order the lists show. */
export function byId(a: EntityBase, b: EntityBase): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Every kind, with no entities. */
export function emptyEntityLists(): EntityLists {
  return { machines: [], grinders: [], recipes: [], packs: [], containers: [], tags: [] };
}

/** A grinder as a shot names it: its brand and model, like `Eureka ORO Mignon Single Dose Pro`. */
export function grinderName(grinder: Pick<Grinder, 'brand' | 'model'>): string {
  return [grinder.brand, grinder.model].filter((part) => part !== '').join(' ');
}

/** A pack as a shot names it: its brand and name, like `Local roaster · Ethiopia Guji`. */
export function packName(pack: Pick<CoffeePack, 'brand' | 'name'>): string {
  return [pack.brand ?? '', pack.name].filter((part) => part !== '').join(' · ');
}
