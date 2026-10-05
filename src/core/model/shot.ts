/**
 * A shot: one extraction, as user-owned metadata anchored at a time in a recording (D-007,
 * D-019). Segments and metrics are derived and disposable. Analysis matches them to shots by
 * anchor time and never writes to a shot, so re-running it can't lose a grade.
 *
 * Besides its grades, a shot keeps a **snapshot** of its context as values at brew time, next
 * to the ids (spec v2 "What every shot records", D-053): the recipe and its ratios, the phases'
 * results or "skipped", the machine and basket, the grinder and its setting, the coffee pack
 * and its dates, and the maintenance dates. Editing equipment later never rewrites history. The
 * entities come with T2.1, so until then most of it is null (T1.18).
 *
 * Nothing derivable is stored: days off roast and days open derive from the pack's dates and
 * the shot's time (T2.2), the retention from the beans and the ground dose, and every target
 * from the ratios and the doses.
 */

import { newId, type Id } from './ids';
import { field, SchemaError, type Field, type ObjectSchema } from './schema';

/**
 * Who created the shot:
 * - `live`: the capture flow, when the live display saw a shot finish (T1.18);
 * - `manual`: the user, by hand (the manual start, or adding one from history);
 * - `post-hoc`: analysis, for a segment no shot claimed (D-007, T1.14).
 */
export const SHOT_SOURCES = ['live', 'manual', 'post-hoc'] as const;
export type ShotSource = (typeof SHOT_SOURCES)[number];

/** The taste (spec v2 "Grading"), the spec's direction: which way to move the grinder. */
export const DIRECTIONS = ['sour', 'balanced', 'bitter'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const GRIND_SETTING_KINDS = ['stepless', 'clicks'] as const;
export type GrindSettingKind = (typeof GRIND_SETTING_KINDS)[number];

/**
 * A grinder setting. The spec says not to force one numeric field: the ORO Mignon is stepless
 * and the Comandante counts clicks. The kind travels with the value, so a stored setting reads
 * correctly on its own. T2.1 and T2.3 may still refine this type while every stored value is
 * null (D-019).
 */
export interface GrindSetting {
  readonly kind: GrindSettingKind;
  /** Stepless: the dial reading. Clicks: a whole number of clicks. */
  readonly value: number;
}

/**
 * What became of a phase of the brew (spec v2 "Brew phases"): done, or skipped. Skipped is
 * recorded as such, never left empty; null means the phase wasn't offered (before it existed,
 * T2.6, T2.7, T2.11) or doesn't apply (the milk of a recipe without a milk ratio).
 */
export const PHASE_STATES = ['done', 'skipped'] as const;
export type PhaseState = (typeof PHASE_STATES)[number];

export interface Shot {
  readonly id: Id;
  readonly recordingId: Id;
  /**
   * When the shot happened, on the recording's timeline (`tMs`): the capture flow's "shot
   * done" moment for a `live` shot, the user's action for a `manual` one, and the segment's
   * start for a `post-hoc` one. Analysis uses it only to match the shot to a segment (T1.14),
   * and nothing ever moves it.
   */
  readonly anchorTMs: number;
  readonly source: ShotSource;
  readonly createdAtEpochMs: number;
  readonly updatedAtEpochMs: number;
  /**
   * When the user deleted the shot; null while it stands. Deleting leaves this tombstone: the
   * shot still claims its segment, so re-running analysis doesn't bring it back as a `post-hoc`
   * shot (D-019).
   */
  readonly discardedAtEpochMs: number | null;

  // The grades (spec v2 "Grading", D-054). Nothing is required: null until graded.
  /** The taste: sour, balanced or bitter. */
  readonly direction: Direction | null;
  /** Channels or spurts: a puck-prep problem, kept apart from the taste. */
  readonly channelled: boolean | null;
  /**
   * Tags, like a warm-up note or a puck-prep experiment (spec v2 "Tags"). `[]` means none were
   * given; null means the field wasn't captured.
   */
  readonly tags: readonly string[] | null;

  // The extraction's target (spec "Flow and yield"): the dose times the recipe's coffee ratio.
  /**
   * The dose the target was set from, g: the ground dose, else the beans weighed, else the
   * basket's size (spec v2 "Brew phases"). Until those phases exist, the extraction screen's
   * dose (D-067). The ratio is the yield over it (D-047).
   */
  readonly doseG: number | null;
  /** The recipe's coffee ratio, yield ÷ dose: `2` for 1:2. */
  readonly targetRatio: number | null;

  // The recipe at brew time (spec v2 "Recipes"). Its coffee ratio is `targetRatio`.
  /** The recipe entity (T2.1); null before recipes were stored, even with a name. */
  readonly recipeId: Id | null;
  /** The drink, like `Cappuccino`: what history shows. */
  readonly recipeName: string | null;
  /** Milk to espresso, `3` for 1:3; null for a recipe without milk. */
  readonly milkRatio: number | null;

  // The phases' results (spec v2 "Brew phases"). The extraction is the shot itself.
  readonly beansPhase: PhaseState | null;
  /** The beans weighed before grinding, g. */
  readonly beansWeighedG: number | null;
  readonly grindPhase: PhaseState | null;
  /** The ground dose, g. The retention is the beans less this. */
  readonly groundG: number | null;
  readonly milkPhase: PhaseState | null;
  /** The milk poured, g. */
  readonly milkG: number | null;

  // The machine and its basket at brew time (spec v2 "Machine"; T2.1).
  readonly machineId: Id | null;
  readonly machineName: string | null;
  readonly pressureBar: number | null;
  readonly basketId: Id | null;
  /** The basket's size, g: the beans target. */
  readonly basketSizeG: number | null;

  // The grinder at brew time (spec v2 "Grinders"; T2.1, T2.3).
  readonly grinderId: Id | null;
  /** Its brand and model, like `Eureka ORO Mignon Single Dose Pro`. */
  readonly grinderName: string | null;
  readonly grindSetting: GrindSetting | null;
  /** Burr epochs are deferred (D-053): the grinder-care date covers the burrs. Null for now. */
  readonly burrEpochId: Id | null;

  // The coffee pack at brew time (spec v2 "Coffee packs"; T2.1, T2.2).
  /** The pack entity. Named `beanBagId` up to export format version 2. */
  readonly packId: Id | null;
  /** Its brand and name, like `Local roaster · Ethiopia Guji · Natural`. */
  readonly packName: string | null;
  /** `YYYY-MM-DD`, as on the pack. Days off roast derive from it (T2.2). */
  readonly packRoastDate: string | null;
  /** `YYYY-MM-DD`. Days open derive from it. */
  readonly packOpenDate: string | null;

  /** The cup's container (T2.4). */
  readonly containerId: Id | null;

  // The maintenance dates at brew time (spec v2 "Maintenance"; T2.10), `YYYY-MM-DD`.
  readonly lastDescaleDate: string | null;
  readonly lastBackflushDate: string | null;
  readonly lastGrinderCareDate: string | null;
}

/** The fields `updateShot` won't take: identity, the anchor, and the timestamps it sets itself. */
const IDENTITY_KEYS = [
  'id',
  'recordingId',
  'anchorTMs',
  'source',
  'createdAtEpochMs',
  'updatedAtEpochMs',
] as const;

/** The fields a user edits. Analysis never writes any of them. */
export type ShotMetadata = Omit<Shot, (typeof IDENTITY_KEYS)[number]>;

const parseGrindSettingShape = field.object<GrindSetting>({
  kind: field.oneOf(GRIND_SETTING_KINDS),
  value: field.number,
});

const grindSettingField: Field<GrindSetting> = (value, path) => {
  const setting = parseGrindSettingShape(value, path);
  if (setting.kind === 'clicks' && !Number.isInteger(setting.value)) {
    throw new SchemaError(
      `${path}.value`,
      `expected a whole number of clicks, got ${setting.value}`,
    );
  }
  return setting;
};

const SHOT_SCHEMA: ObjectSchema<Shot> = {
  id: field.id,
  recordingId: field.id,
  anchorTMs: field.number,
  source: field.oneOf(SHOT_SOURCES),
  createdAtEpochMs: field.number,
  updatedAtEpochMs: field.number,
  discardedAtEpochMs: field.nullable(field.number),
  direction: field.nullable(field.oneOf(DIRECTIONS)),
  channelled: field.nullable(field.boolean),
  tags: field.nullable(field.arrayOf(field.string)),
  doseG: field.nullable(field.number),
  targetRatio: field.nullable(field.number),
  recipeId: field.nullable(field.id),
  recipeName: field.nullable(field.string),
  milkRatio: field.nullable(field.number),
  beansPhase: field.nullable(field.oneOf(PHASE_STATES)),
  beansWeighedG: field.nullable(field.number),
  grindPhase: field.nullable(field.oneOf(PHASE_STATES)),
  groundG: field.nullable(field.number),
  milkPhase: field.nullable(field.oneOf(PHASE_STATES)),
  milkG: field.nullable(field.number),
  machineId: field.nullable(field.id),
  machineName: field.nullable(field.string),
  pressureBar: field.nullable(field.number),
  basketId: field.nullable(field.id),
  basketSizeG: field.nullable(field.number),
  grinderId: field.nullable(field.id),
  grinderName: field.nullable(field.string),
  grindSetting: field.nullable(grindSettingField),
  burrEpochId: field.nullable(field.id),
  packId: field.nullable(field.id),
  packName: field.nullable(field.string),
  packRoastDate: field.nullable(field.isoDate),
  packOpenDate: field.nullable(field.isoDate),
  containerId: field.nullable(field.id),
  lastDescaleDate: field.nullable(field.isoDate),
  lastBackflushDate: field.nullable(field.isoDate),
  lastGrinderCareDate: field.nullable(field.isoDate),
};

const parseShot = field.object(SHOT_SCHEMA);

/**
 * A complete `Shot` from stored or imported data: missing nullable fields become `null` and
 * unknown keys are dropped (D-018). A shot stored before export format version 3 names its
 * pack `beanBagId`, which is read as `packId`.
 *
 * @throws SchemaError when a required field is missing or a value has the wrong type.
 */
export function normaliseShot(input: unknown, path = 'shot'): Shot {
  return parseShot(withPackId(input), path);
}

/** `beanBagId` renamed to `packId`, the coffee pack's id (D-053), unless both are there. */
function withPackId(input: unknown): unknown {
  if (typeof input !== 'object' || input === null || !Object.hasOwn(input, 'beanBagId')) {
    return input;
  }
  const { beanBagId, ...rest } = input as Readonly<Record<string, unknown>>;
  return Object.hasOwn(rest, 'packId') ? rest : { ...rest, packId: beanBagId };
}

export interface NewShot extends Partial<ShotMetadata> {
  /** Default: a new id. */
  readonly id?: Id;
  readonly recordingId: Id;
  readonly anchorTMs: number;
  readonly source: ShotSource;
}

/**
 * A new shot. Metadata that isn't given is null.
 *
 * @throws SchemaError on a malformed input.
 */
export function createShot(input: NewShot, nowEpochMs: number): Shot {
  return normaliseShot({
    ...input,
    id: input.id ?? newId(),
    createdAtEpochMs: nowEpochMs,
    updatedAtEpochMs: nowEpochMs,
  });
}

/**
 * The shot with `changes` applied and `updatedAtEpochMs` set to now. A change that is
 * `undefined` is skipped; pass `null` to clear a field.
 *
 * @throws TypeError if `changes` names a field that isn't metadata (an id, the anchor, the
 *   source or a timestamp), and SchemaError on a malformed value.
 */
export function updateShot(shot: Shot, changes: Partial<ShotMetadata>, nowEpochMs: number): Shot {
  const next: Record<string, unknown> = { ...shot };
  for (const [key, value] of Object.entries(changes)) {
    if ((IDENTITY_KEYS as readonly string[]).includes(key)) {
      throw new TypeError(`updateShot: ${key} isn't editable metadata (D-007)`);
    }
    if (value !== undefined) next[key] = value;
  }
  next.updatedAtEpochMs = nowEpochMs;
  return normaliseShot(next);
}

/**
 * Whether two shots are the same shot as created: the same id, recording, anchor, source and
 * creation time, which never change (D-019). Their metadata and `updatedAtEpochMs` may differ.
 * An import replaces a stored shot with a file's only when this holds (T1.7).
 */
export function sameShotIdentity(a: Shot, b: Shot): boolean {
  return (
    a.id === b.id &&
    a.recordingId === b.recordingId &&
    a.anchorTMs === b.anchorTMs &&
    a.source === b.source &&
    a.createdAtEpochMs === b.createdAtEpochMs
  );
}
