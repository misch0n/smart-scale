/**
 * A shot: one extraction, as user-owned metadata anchored at a time in a recording (D-007,
 * D-019). Segments and metrics are derived and disposable. Analysis matches them to shots by
 * anchor time and never writes to a shot, so re-running it can't lose a grade.
 *
 * Days off roast is not stored. It derives from the bag's roast date and the shot's time
 * (T2.2), so correcting a roast date corrects the history too.
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

/** The direction grade (spec "Grading"): which way to move the grinder. */
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

  /** The capture flow's one required input (spec "Grading"). null until graded. */
  readonly direction: Direction | null;
  /** A puck-prep problem, deliberately kept apart from direction (spec "Grading"). */
  readonly channelled: boolean | null;
  /**
   * Freeform tags, like a warm-up note or a puck-prep experiment (spec "Optional fields"). `[]`
   * means none were given; null means the field wasn't captured (hidden, T2.8).
   */
  readonly tags: readonly string[] | null;

  /** The logged dose in grams. The live ratio target uses it (spec "Flow and yield"). */
  readonly doseG: number | null;
  /** The target brew ratio, yield ÷ dose: `2` for 1:2. */
  readonly targetRatio: number | null;
  /**
   * The beans weighed before grinding, in grams. The bag's remaining estimate drops by this,
   * not by the dose (spec "Bean bags"; T2.2, T2.6).
   */
  readonly beansWeighedG: number | null;

  // Phase 2 references (T2.1–T2.4), null until those exist. Null always means "not captured".
  readonly beanBagId: Id | null;
  readonly grinderId: Id | null;
  readonly grindSetting: GrindSetting | null;
  readonly burrEpochId: Id | null;
  readonly containerId: Id | null;
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
  beansWeighedG: field.nullable(field.number),
  beanBagId: field.nullable(field.id),
  grinderId: field.nullable(field.id),
  grindSetting: field.nullable(grindSettingField),
  burrEpochId: field.nullable(field.id),
  containerId: field.nullable(field.id),
};

const parseShot = field.object(SHOT_SCHEMA);

/**
 * A complete `Shot` from stored or imported data: missing nullable fields become `null` and
 * unknown keys are dropped (D-018).
 *
 * @throws SchemaError when a required field is missing or a value has the wrong type.
 */
export function normaliseShot(input: unknown, path = 'shot'): Shot {
  return parseShot(input, path);
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
