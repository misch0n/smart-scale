import { describe, expect, it } from 'vitest';
import { field, SchemaError, type Field, type ObjectSchema } from './schema';

const ID = '01923456-789a-7000-8000-000000000001';

/** The SchemaError `run` throws, so tests can check its path and message. */
function schemaError(run: () => unknown): SchemaError {
  try {
    run();
  } catch (error) {
    if (error instanceof SchemaError) return error;
    throw error;
  }
  throw new Error('expected a SchemaError, but nothing was thrown');
}

describe('scalar fields', () => {
  it.each<[string, Field<unknown>, unknown[], unknown[]]>([
    ['string', field.string, ['', 'x'], [1, null, undefined, ['x']]],
    ['number', field.number, [0, -1.5, 1e9], [NaN, Infinity, -Infinity, '1', null]],
    ['integer', field.integer, [0, -3, 2 ** 53 - 1], [1.5, 2 ** 53, NaN, '1']],
    ['nonNegativeInteger', field.nonNegativeInteger, [0, 7], [-1, 0.5, '0']],
    ['boolean', field.boolean, [true, false], [0, 'true', null]],
    ['id', field.id, [ID], [ID.toUpperCase(), 'x', 1]],
  ])('%s accepts its values and refuses others', (_, parse, good, bad) => {
    for (const value of good) expect(parse(value, 'v')).toBe(value);
    for (const value of bad) expect(() => parse(value, 'v')).toThrow(SchemaError);
  });

  it('names the path and what was expected', () => {
    const error = schemaError(() => field.number('18', 'shot.doseG'));
    expect(error.path).toBe('shot.doseG');
    expect(error.message).toBe('shot.doseG: expected a finite number, got the string "18"');
    expect(error.name).toBe('SchemaError');
    expect(error).toBeInstanceOf(Error);
  });

  it('reports a missing value as missing', () => {
    expect(schemaError(() => field.string(undefined, 'a.b')).message).toBe(
      'a.b: missing (expected a string)',
    );
  });

  it('accepts only ArrayBuffer-backed Uint8Arrays as bytes', () => {
    const bytes = new Uint8Array([3, 11]);
    expect(field.bytes(bytes, 'v')).toBe(bytes);
    expect(() => field.bytes([3, 11], 'v')).toThrow(SchemaError);
    expect(() => field.bytes(new Uint16Array(2), 'v')).toThrow(SchemaError);
    expect(() => field.bytes(new Uint8Array(new SharedArrayBuffer(2)), 'v')).toThrow(SchemaError);
  });
});

describe('oneOf', () => {
  const kind = field.oneOf(['stepless', 'clicks'] as const);

  it('accepts the listed strings only', () => {
    expect(kind('clicks', 'k')).toBe('clicks');
    expect(schemaError(() => kind('Clicks', 'k')).message).toBe(
      'k: expected one of "stepless", "clicks", got the string "Clicks"',
    );
  });
});

describe('nullable', () => {
  const dose = field.nullable(field.number);

  it('turns missing, undefined and null into null', () => {
    expect(dose(undefined, 'd')).toBeNull();
    expect(dose(null, 'd')).toBeNull();
  });

  it('parses anything else with the inner field', () => {
    expect(dose(18.2, 'd')).toBe(18.2);
    expect(() => dose('18', 'd')).toThrow(SchemaError);
  });
});

describe('arrayOf', () => {
  const tags = field.arrayOf(field.string);

  it('parses each item into a new array', () => {
    const input = ['warm-up', 'wdt'];
    const output = tags(input, 't');
    expect(output).toEqual(input);
    expect(output).not.toBe(input);
  });

  it('names the failing index', () => {
    expect(schemaError(() => tags(['a', 2], 'shot.tags')).path).toBe('shot.tags[1]');
  });

  it('treats a hole in a sparse array as missing', () => {
    const sparse: string[] = [];
    sparse[1] = 'b';
    expect(schemaError(() => tags(sparse, 't')).path).toBe('t[0]');
  });

  it('refuses a non-array', () => {
    expect(() => tags('a', 't')).toThrow(SchemaError);
  });
});

describe('object', () => {
  interface Sample {
    readonly id: string;
    readonly dose: number | null;
    readonly inner: { readonly note: string | null };
  }
  const schema: ObjectSchema<Sample> = {
    id: field.id,
    dose: field.nullable(field.number),
    inner: field.object({ note: field.nullable(field.string) }),
  };
  const parse = field.object(schema);

  it('returns exactly the schema keys, in schema order, dropping unknown ones', () => {
    const out = parse({ extra: 1, inner: { note: 'x', more: 2 }, dose: 18, id: ID }, 's');
    expect(out).toEqual({ id: ID, dose: 18, inner: { note: 'x' } });
    expect(Object.keys(out)).toEqual(['id', 'dose', 'inner']);
  });

  it('fills missing nullable fields with null, nested ones too', () => {
    expect(parse({ id: ID, inner: {} }, 's')).toEqual({
      id: ID,
      dose: null,
      inner: { note: null },
    });
  });

  it('refuses a missing required field, naming its path', () => {
    expect(schemaError(() => parse({ id: ID }, 'sample')).path).toBe('sample.inner');
    expect(schemaError(() => parse({ inner: {} }, 'sample')).path).toBe('sample.id');
    expect(schemaError(() => parse({ id: ID, inner: { note: 5 } }, 'sample')).path).toBe(
      'sample.inner.note',
    );
  });

  it('reads own properties only', () => {
    const inherited: unknown = Object.assign(Object.create({ id: ID }) as object, { inner: {} });
    expect(schemaError(() => parse(inherited, 's')).path).toBe('s.id');
  });

  it('returns a fresh object', () => {
    const input = { id: ID, dose: null, inner: { note: null } };
    const out = parse(input, 's');
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
    expect(out.inner).not.toBe(input.inner);
  });

  it.each([null, undefined, [], 'x', new Uint8Array(1)])('refuses %s as an object', (value) => {
    expect(() => parse(value, 's')).toThrow(SchemaError);
  });
});

describe('json', () => {
  it('accepts any JSON value and deep-copies it', () => {
    const input = { a: [1, 'two', null, true, { b: -2.5 }], c: {} };
    const out = field.json(input, 'j');
    expect(out).toEqual(input);
    input.a.push(3);
    expect(out).toEqual({ a: [1, 'two', null, true, { b: -2.5 }], c: {} });
  });

  it('turns a missing value into null', () => {
    expect(field.json(undefined, 'j')).toBeNull();
  });

  it('keeps a "__proto__" key as data', () => {
    const input: unknown = JSON.parse('{"__proto__": {"polluted": true}}');
    const out = field.json(input, 'j');
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(Object.keys(out as object)).toEqual(['__proto__']);
  });

  it.each([
    ['NaN', { a: NaN }, 'j.a'],
    ['undefined inside an object', { a: undefined }, 'j.a'],
    ['undefined inside an array', [1, undefined], 'j[1]'],
    ['a Date', { when: new Date(0) }, 'j.when'],
    ['a Map', new Map(), 'j'],
    ['bytes', new Uint8Array(1), 'j'],
    ['a function', () => 1, 'j'],
  ])('refuses %s', (_, value, path) => {
    expect(schemaError(() => field.json(value, 'j')).path).toBe(path);
  });
});
