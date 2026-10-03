/**
 * Runtime schemas for stored records (D-018). Each record type has one, typed so that the
 * compiler demands a parser for every field of the record's interface. The normalisers next to
 * each type are built from them, and the export importer and the Phase 2 entities reuse them.
 *
 * Parsing a record:
 * - returns exactly the schema's keys, in schema order;
 * - turns a missing or `undefined` nullable field into `null` (spec "Schema rules": a field is
 *   null, never absent);
 * - throws `SchemaError`, naming the path, for a missing required field or a value of the wrong
 *   type;
 * - drops keys the schema doesn't know.
 *
 * The result is a fresh object, sharing nothing mutable with the input except `Uint8Array`
 * bytes. Nothing is coerced: `"18"` is not a number. Plausibility isn't checked either (a
 * negative dose parses), so that no stored record becomes unreadable over a judgement call.
 * Parsers guard structure only.
 */

import { isId, type Id } from './ids';

export class SchemaError extends Error {
  /** Where the problem is, like `shot.grindSetting.value` or `events[3].data`. */
  readonly path: string;

  constructor(path: string, problem: string) {
    super(`${path}: ${problem}`);
    this.name = 'SchemaError';
    this.path = path;
  }
}

/**
 * Parses one value, or throws `SchemaError` naming `path`. `value` is `undefined` when the key
 * is missing.
 */
export type Field<T> = (value: unknown, path: string) => T;

/** One parser for each key of `T`: the compiler rejects a missing or an extra one. */
export type ObjectSchema<T> = { readonly [K in keyof T]-?: Field<T[K]> };

/** Any value JSON can carry. */
export type JsonValue =
  null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

const stringField: Field<string> = (value, path) => {
  if (typeof value === 'string') return value;
  throw mismatch(path, 'a string', value);
};

/** NaN and ±Infinity are refused: JSON can't carry them, so an export would lose them. */
const numberField: Field<number> = (value, path) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw mismatch(path, 'a finite number', value);
};

const integerField: Field<number> = (value, path) => {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  throw mismatch(path, 'an integer', value);
};

const nonNegativeIntegerField: Field<number> = (value, path) => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  throw mismatch(path, 'an integer ≥ 0', value);
};

const booleanField: Field<boolean> = (value, path) => {
  if (typeof value === 'boolean') return value;
  throw mismatch(path, 'a boolean', value);
};

const idField: Field<Id> = (value, path) => {
  if (isId(value)) return value;
  throw mismatch(path, 'an id (a lower-case UUIDv7)', value);
};

/** Bytes are stored as `Uint8Array` (IndexedDB clones it). The export encodes them as hex. */
const bytesField: Field<Uint8Array<ArrayBuffer>> = (value, path) => {
  if (value instanceof Uint8Array && value.buffer instanceof ArrayBuffer) {
    return value as Uint8Array<ArrayBuffer>;
  }
  throw mismatch(path, 'a Uint8Array', value);
};

/** Any JSON value, deep-copied. A missing value becomes `null`. */
const jsonField: Field<JsonValue> = (value, path) =>
  value === undefined ? null : copyJson(value, path);

function oneOf<const T extends readonly string[]>(values: T): Field<T[number]> {
  const allowed: readonly string[] = values;
  return (value, path) => {
    if (typeof value === 'string' && allowed.includes(value)) return value;
    throw mismatch(path, `one of ${allowed.map((v) => `"${v}"`).join(', ')}`, value);
  };
}

/** `null` when the value is missing, `undefined` or `null`; otherwise `inner` parses it. */
function nullable<T>(inner: Field<T>): Field<T | null> {
  return (value, path) => (value === undefined || value === null ? null : inner(value, path));
}

function arrayOf<T>(item: Field<T>): Field<readonly T[]> {
  return (value, path) => {
    if (!Array.isArray(value)) throw mismatch(path, 'an array', value);
    const items: readonly unknown[] = value;
    const out: T[] = [];
    // An index loop, not map(): a sparse array's holes must fail as missing, not be skipped.
    for (let i = 0; i < items.length; i++) out.push(item(items[i], `${path}[${i}]`));
    return out;
  };
}

/** Parses an object with `schema`. See the module comment for the rules. */
function objectOf<T>(schema: ObjectSchema<T>): Field<T> {
  const keys = Object.keys(schema) as (keyof T & string)[];
  return (value, path) => {
    if (!isObjectRecord(value)) throw mismatch(path, 'an object', value);
    const out: Partial<Record<keyof T, unknown>> = {};
    for (const key of keys) {
      const fieldValue = Object.hasOwn(value, key) ? value[key] : undefined;
      out[key] = schema[key](fieldValue, `${path}.${key}`);
    }
    return out as T;
  };
}

/** The parsers, used as `field.string` or `field.nullable(field.number)`. */
export const field = {
  string: stringField,
  number: numberField,
  integer: integerField,
  nonNegativeInteger: nonNegativeIntegerField,
  boolean: booleanField,
  id: idField,
  bytes: bytesField,
  json: jsonField,
  oneOf,
  nullable,
  arrayOf,
  object: objectOf,
} as const;

function isObjectRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !ArrayBuffer.isView(value)
  );
}

function copyJson(value: unknown, path: string): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value;
    throw mismatch(path, 'a JSON value', value);
  }
  if (Array.isArray(value)) {
    const items: readonly unknown[] = value;
    const out: JsonValue[] = [];
    for (let i = 0; i < items.length; i++) out.push(copyJson(items[i], `${path}[${i}]`));
    return out;
  }
  if (isObjectRecord(value)) {
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto === Object.prototype || proto === null) {
      // fromEntries defines own properties, so a "__proto__" key stays data.
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, copyJson(item, `${path}.${key}`)]),
      );
    }
  }
  throw mismatch(path, 'a JSON value', value);
}

function mismatch(path: string, expected: string, value: unknown): SchemaError {
  if (value === undefined) return new SchemaError(path, `missing (expected ${expected})`);
  return new SchemaError(path, `expected ${expected}, got ${describe(value)}`);
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  if (ArrayBuffer.isView(value)) return `a ${value.constructor.name}`;
  switch (typeof value) {
    case 'string':
      return `the string ${JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value)}`;
    case 'number':
    case 'boolean':
    case 'bigint':
      return `${typeof value} ${String(value)}`;
    default:
      return typeof value;
  }
}
