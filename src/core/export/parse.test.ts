/**
 * Reading export files: what is refused and how clearly (T1.7 acceptance: a newer, unknown
 * formatVersion gives a clear error), what is tolerated (D-018), and the migration hook.
 */

import { describe, expect, it } from 'vitest';
import {
  emptyEntityLists,
  legacyTagId,
  SchemaError,
  SEED_EPOCH_MS,
  SEED_IDS,
  SEEDS,
  type EntityLists,
} from '../model';
import {
  EXPORT_FORMAT,
  EXPORT_MIGRATIONS,
  ExportFormatError,
  FORMAT_VERSION,
  type ExportFormatErrorCode,
  type ExportMigration,
} from './format';
import { parseExport } from './parse';
import { serialiseExport } from './serialise';
import { SAMPLE_IDS, sampleBundle } from './test-samples';

type Json = Record<string, unknown>;

/** The sample export as JSON, to be broken by a test. */
function sampleJson(): Json {
  return JSON.parse(serialiseExport(sampleBundle())) as Json;
}

function entry(json: Json, i = 0): Json {
  return (json.recordings as Json[])[i];
}

function frameRows(json: Json, i = 0): unknown[][] {
  return entry(json, i).frames as unknown[][];
}

function eventsOf(json: Json, i = 0): Json[] {
  return entry(json, i).events as Json[];
}

function errorFrom(text: string, migrations?: readonly ExportMigration[]): ExportFormatError {
  try {
    parseExport(text, { migrations });
  } catch (error) {
    if (error instanceof ExportFormatError) return error;
    throw error;
  }
  throw new Error('expected parseExport to throw');
}

function expectRefused(
  json: unknown,
  code: ExportFormatErrorCode,
  message: string | RegExp,
): ExportFormatError {
  const error = errorFrom(JSON.stringify(json));
  expect(error.code).toBe(code);
  expect(error.message).toMatch(message);
  return error;
}

/** The fields a shot gained in format version 3 (T1.18), besides `packId`. */
const SNAPSHOT_FIELDS = [
  'recipeId',
  'recipeName',
  'milkRatio',
  'beansPhase',
  'grindPhase',
  'groundG',
  'milkPhase',
  'milkG',
  'machineId',
  'machineName',
  'pressureBar',
  'basketId',
  'basketSizeG',
  'grinderName',
  'packName',
  'packRoastDate',
  'packOpenDate',
  'lastDescaleDate',
  'lastBackflushDate',
  'lastGrinderCareDate',
];

/** A shot as version 2 wrote it: no snapshot, and the pack's id as `beanBagId`. */
function asVersion2Shot(shot: Json): Json {
  const { packId, ...rest } = shot;
  for (const key of SNAPSHOT_FIELDS) delete rest[key];
  return { ...rest, beanBagId: packId };
}

/** The sample as a version 3 file, which has no entities, and the bundle it reads as. */
function versionThree(): { json: Json; bundle: ReturnType<typeof sampleBundle> } {
  const json = sampleJson();
  delete json.entities;
  // The sample's settings hold no tag list from T1.18: a full export gains empty lists.
  return {
    json: { ...json, formatVersion: 3 },
    bundle: { ...sampleBundle(), entities: emptyEntityLists() },
  };
}

/** The sample as a version 2 file, and the bundle it reads as. */
function versionTwo(): { json: Json; bundle: ReturnType<typeof sampleBundle> } {
  const { json, bundle } = versionThree();
  return {
    json: { ...json, formatVersion: 2, shots: (json.shots as Json[]).map(asVersion2Shot) },
    bundle: {
      ...bundle,
      shots: bundle.shots.map((shot) => ({
        ...shot,
        ...Object.fromEntries(SNAPSHOT_FIELDS.map((key) => [key, null])),
      })),
    },
  };
}

/** T1.18's tag list, as a full export of its build held it, with a tag the user added. */
const T1_18_TAGS = [
  { name: 'WDT', isDefault: true },
  { name: 'Puck screen', isDefault: true },
  { name: 'RDT', isDefault: false },
  { name: 'Paper filter', isDefault: false },
  { name: 'Warm-up < 15 min', isDefault: false },
  { name: 'New basket', isDefault: false },
  { name: 'Experiment', isDefault: false },
  { name: 'Bottomless', isDefault: false },
];

describe('the format version', () => {
  it('is 5, after the scale accessory role (T2.17)', () => {
    // Changing the format means a new version and a migration (CLAUDE.md hard rule 7), and an
    // update to docs/export-format.md.
    expect(FORMAT_VERSION).toBe(6);
    expect(EXPORT_MIGRATIONS).toHaveLength(5);
  });

  it('reads a version 4 file unchanged: it holds no scale accessory', () => {
    const json = sampleJson();
    const parsed = parseExport(JSON.stringify({ ...json, formatVersion: 4 }));
    expect(parsed.formatVersion).toBe(4);
    expect(parsed.bundle).toEqual(sampleBundle());
  });

  it('reads a version 5 file: its grinders have no step, which reads as null', () => {
    const json = sampleJson();
    const entities = json.entities as { grinders: Json[] };
    const grinders = entities.grinders.map((grinder) => {
      const older = { ...grinder };
      delete older.settingStep;
      return older;
    });
    const parsed = parseExport(
      JSON.stringify({ ...json, formatVersion: 5, entities: { ...entities, grinders } }),
    );
    expect(parsed.formatVersion).toBe(5);
    expect(parsed.bundle).toEqual(sampleBundle());
  });

  it('keeps the step of a grinder (version 6)', () => {
    const bundle = sampleBundle();
    const entities = bundle.entities;
    if (entities === null) throw new Error('the sample has entities');
    const grinders = entities.grinders.map((g) => ({ ...g, settingStep: 0.05 }));
    const withStep = { ...bundle, entities: { ...entities, grinders } };
    const parsed = parseExport(serialiseExport(withStep));
    expect(parsed.bundle.entities?.grinders.map((g) => g.settingStep)).toEqual([0.05, 0.05]);
  });

  it('keeps a container that is a scale accessory (version 5)', () => {
    const bundle = sampleBundle();
    const mat = {
      id: '01a10000-0000-7000-8000-0000000a0001',
      createdAtEpochMs: SEED_EPOCH_MS,
      updatedAtEpochMs: SEED_EPOCH_MS,
      removedAtEpochMs: null,
      name: 'Scale mat',
      emptyMassG: 15.5,
      roles: ['accessory' as const],
      dismissedWarningIds: [],
    };
    const withMat = { ...bundle, entities: { ...bundle.entities!, containers: [mat] } };
    const parsed = parseExport(serialiseExport(withMat));
    expect(parsed.bundle.entities?.containers).toEqual([mat]);
  });

  it('reads a version 3 full export: it gains every kind’s list, empty', () => {
    const { json, bundle } = versionThree();
    const parsed = parseExport(JSON.stringify(json));
    expect(parsed.formatVersion).toBe(3);
    expect(parsed.bundle).toEqual(bundle);
  });

  it('reads a version 3 recording’s file: it carries no entities, as it carries no settings', () => {
    const { json } = versionThree();
    const parsed = parseExport(JSON.stringify({ ...json, settings: null }));
    expect(parsed.bundle.entities).toBeNull();
    expect(parsed.bundle.settings).toBeNull();
  });

  it('turns a version 3 file’s T1.18 tags and last recipe into entities, as the database does', () => {
    const { json } = versionThree();
    const settings = { 'lastUsed.doseG': 17.5, tags: T1_18_TAGS, 'lastUsed.recipe': 'Cappuccino' };
    const parsed = parseExport(JSON.stringify({ ...json, settings }));
    const expected: EntityLists = {
      ...emptyEntityLists(),
      tags: [
        ...SEEDS.tags,
        {
          id: legacyTagId('Bottomless'),
          createdAtEpochMs: SEED_EPOCH_MS,
          updatedAtEpochMs: SEED_EPOCH_MS,
          removedAtEpochMs: null,
          name: 'Bottomless',
          group: null,
          isDefault: false,
        },
      ],
    };
    expect(parsed.bundle.entities).toEqual(expected);
    expect(parsed.bundle.settings).toEqual({
      'lastUsed.doseG': 17.5,
      'lastUsed.recipeId': SEED_IDS.cappuccino,
    });
  });

  it('drops a last recipe it can’t name, and keeps a recipe id already there', () => {
    const { json } = versionThree();
    const unknown = parseExport(
      JSON.stringify({ ...json, settings: { 'lastUsed.recipe': 'Mocha' } }),
    );
    expect(unknown.bundle.settings).toEqual({});
    const both = parseExport(
      JSON.stringify({
        ...json,
        settings: { 'lastUsed.recipe': 'Latte', 'lastUsed.recipeId': SEED_IDS.lungo },
      }),
    );
    expect(both.bundle.settings).toEqual({ 'lastUsed.recipeId': SEED_IDS.lungo });
  });

  it('reads a version 2 file: its shots gain the snapshot as null, and beanBagId is packId', () => {
    const { json, bundle } = versionTwo();
    const shots = json.shots as Json[];
    expect(shots[1]).toHaveProperty('beanBagId', SAMPLE_IDS.bag);
    expect(shots[1]).not.toHaveProperty('recipeName');
    const parsed = parseExport(JSON.stringify(json));
    expect(parsed.formatVersion).toBe(2);
    expect(parsed.bundle).toEqual(bundle);
    expect(parsed.bundle.shots[1]).toMatchObject({ packId: SAMPLE_IDS.bag, recipeName: null });
    expect(parsed.bundle.shots[1]).not.toHaveProperty('beanBagId');
  });

  it('reads a version 1 file, which holds no sound levels and no snapshot', () => {
    const { json, bundle } = versionTwo();
    for (const recording of json.recordings as Json[]) {
      recording.frames = (recording.frames as unknown[][]).filter((row) => row[2] !== 'mic');
      recording.events = (recording.events as Json[]).filter(
        (event) => typeof event.type !== 'string' || !event.type.startsWith('sound-'),
      );
    }
    const parsed = parseExport(JSON.stringify({ ...json, formatVersion: 1 }));
    expect(parsed.formatVersion).toBe(1);
    const asTwo = parseExport(JSON.stringify(json));
    expect(parsed.bundle).toEqual(asTwo.bundle);
    expect(parsed.bundle.shots).toEqual(bundle.shots);
  });

  it('refuses a newer version with a clear error that says what to do', () => {
    const json = { ...sampleJson(), formatVersion: 7 };
    const error = expectRefused(json, 'newer-version', /version 7/);
    expect(error.message).toMatch(/reads versions up to 6/);
    expect(error.message).toMatch(/reload the app/);
    expect(error).toBeInstanceOf(ExportFormatError);
    expect(error.name).toBe('ExportFormatError');
  });

  it('refuses a newer version before looking at the rest of the file', () => {
    expectRefused({ format: EXPORT_FORMAT, formatVersion: 99 }, 'newer-version', /version 99/);
  });

  it('refuses a version that is not a whole number from 1', () => {
    for (const formatVersion of [0, -1, 1.5, '1', null, true, 2 ** 60]) {
      expectRefused(
        { ...sampleJson(), formatVersion },
        'invalid',
        /formatVersion should be a whole number from 1/,
      );
    }
    const missing = sampleJson();
    delete missing.formatVersion;
    expectRefused(missing, 'invalid', /but it is missing/);
  });
});

describe('what is not an export', () => {
  it('refuses text that is not JSON', () => {
    for (const text of ['', '{', 'hello', '{"format": "smart-scale-export",}']) {
      const error = errorFrom(text);
      expect(error.code).toBe('not-json');
      expect(error.message).toMatch(/isn't JSON/);
      expect(error.cause).toBeInstanceOf(SyntaxError);
    }
  });

  it('refuses JSON without the format marker', () => {
    for (const json of [
      null,
      42,
      'smart-scale-export',
      [],
      {},
      { format: 'other', formatVersion: 1 },
    ]) {
      expectRefused(json, 'not-an-export', /isn't a smart-scale export/);
    }
    const unmarked = sampleJson();
    delete unmarked.format;
    expectRefused(unmarked, 'not-an-export', /"format": "smart-scale-export"/);
  });
});

describe('a malformed export', () => {
  it('names the place of a bad frame row', () => {
    const cases: [(rows: unknown[][]) => void, RegExp][] = [
      [
        (rows) => (rows[0][3] = '030b00'),
        /recordings\[0\]\.frames\[0\]\[3\]: expected packed upper-case hex, got "030b00"/,
      ],
      [(rows) => (rows[1][3] = '030B0'), /frames\[1\]\[3\]: expected packed upper-case hex/],
      [(rows) => (rows[2][3] = '03 0B'), /frames\[2\]\[3\]: expected packed upper-case hex/],
      [(rows) => (rows[3][3] = '030G'), /frames\[3\]\[3\]: expected packed upper-case hex/],
      [(rows) => (rows[4][3] = 12), /frames\[4\]\[3\]: expected a string, got number 12/],
      [(rows) => (rows[5][2] = 'ff13'), /frames\[5\]\[2\]: expected one of "ff11", "ff12"/],
      [(rows) => (rows[6][1] = '12.5'), /frames\[6\]\[1\]: expected a finite number/],
      [(rows) => (rows[7][0] = -1), /frames\[7\]\[0\]: expected an integer ≥ 0/],
      [(rows) => (rows[8][0] = 1.5), /frames\[8\]\[0\]: expected an integer ≥ 0/],
      [(rows) => rows[9].pop(), /frames\[9\]: expected a frame row, \[seq, tMs, source, hex\]/],
      [(rows) => rows[10].push('extra'), /frames\[10\]: expected a frame row/],
    ];
    for (const [breakIt, message] of cases) {
      const json = sampleJson();
      breakIt(frameRows(json));
      expectRefused(json, 'invalid', message);
    }
    const json = sampleJson();
    (entry(json).frames as unknown[])[11] = { seq: 1, tMs: 1, source: 'ff11', hex: '00' };
    expectRefused(json, 'invalid', /frames\[11\]: expected a frame row/);
  });

  it('shortens a long bad hex string in the message', () => {
    const json = sampleJson();
    frameRows(json)[0][3] = 'x'.repeat(100);
    const error = expectRefused(json, 'invalid', /got "x{48}…"/);
    expect(error.message.length).toBeLessThan(200);
  });

  it('refuses an unknown event type, loudly, rather than dropping it (D-018)', () => {
    const json = sampleJson();
    eventsOf(json)[1].type = 'teleported';
    expectRefused(json, 'invalid', /recordings\[0\]\.events\[1\]\.type: expected one of/);
  });

  it('refuses malformed event data', () => {
    const json = sampleJson();
    const event = eventsOf(json).find((e) => e.type === 'command-sent')!;
    (event.data as Json).hex = '030a';
    expectRefused(json, 'invalid', /\.data\.hex: expected packed upper-case hex/);
    const notObject = sampleJson();
    eventsOf(notObject)[0] = [0, 0, 'connected'] as unknown as Json;
    expectRefused(notObject, 'invalid', /recordings\[0\]\.events\[0\]: expected an event object/);
  });

  it('refuses records out of seq order, or a seq used by a frame and an event', () => {
    const swapped = sampleJson();
    const rows = frameRows(swapped);
    [rows[0], rows[1]] = [rows[1], rows[0]];
    expectRefused(
      swapped,
      'invalid',
      /frames\[1\]: seq \d+ comes after seq \d+, but seq must increase/,
    );

    const repeated = sampleJson();
    eventsOf(repeated)[2].seq = eventsOf(repeated)[1].seq;
    expectRefused(repeated, 'invalid', /events\[2\]: seq 1 comes after seq 1/);

    const shared = sampleJson();
    const firstFrameSeq = frameRows(shared)[0][0];
    const late = eventsOf(shared).find((e) => (e.seq as number) > (firstFrameSeq as number))!;
    const index = eventsOf(shared).indexOf(late);
    // The first event after a frame takes the seq of the frame just before it.
    const before = frameRows(shared).filter((row) => (row[0] as number) < (late.seq as number));
    late.seq = before.at(-1)![0];
    expectRefused(
      shared,
      'invalid',
      new RegExp(`events\\[${index}\\]: seq \\d+ is frames\\[\\d+\\]'s seq too`),
    );
  });

  it('refuses a recording or a shot that appears twice', () => {
    const recordings = sampleJson();
    (recordings.recordings as Json[]).push(entry(recordings, 0));
    expectRefused(
      recordings,
      'invalid',
      /recordings\[2\]\.recording\.id: recording .* appears twice/,
    );
    const shots = sampleJson();
    (shots.shots as Json[]).push((shots.shots as Json[])[0]);
    expectRefused(shots, 'invalid', /shots\[4\]\.id: shot .* appears twice/);
  });

  it('refuses a missing required field, naming it', () => {
    const cases: [(json: Json) => void, RegExp][] = [
      [(json) => delete json.exportedAtEpochMs, /exportedAtEpochMs: missing/],
      [(json) => delete (json.app as Json).commit, /app\.commit: missing/],
      [(json) => delete json.recordings, /recordings: missing \(expected an array\)/],
      [(json) => delete json.shots, /shots: missing/],
      [(json) => delete entry(json).frames, /recordings\[0\]\.frames: missing/],
      [(json) => delete entry(json).events, /recordings\[0\]\.events: missing/],
      [(json) => delete entry(json).recording, /recordings\[0\]\.recording: missing/],
      [
        (json) => delete (entry(json).recording as Json).id,
        /recordings\[0\]\.recording\.id: missing/,
      ],
      [(json) => delete eventsOf(json)[0].data, /events\[0\]\.data: missing/],
      [(json) => delete (json.shots as Json[])[0].anchorTMs, /shots\[0\]\.anchorTMs: missing/],
      [(json) => delete (json.entities as Json).tags, /entities\.tags: missing/],
      [
        (json) => delete ((json.entities as Json).packs as Json[])[0].roastDate,
        /entities\.packs\[0\]\.roastDate: missing/,
      ],
    ];
    for (const [breakIt, message] of cases) {
      const json = sampleJson();
      breakIt(json);
      expectRefused(json, 'invalid', message);
    }
  });

  it('refuses wrong types, naming the field', () => {
    const cases: [(json: Json) => void, RegExp][] = [
      [(json) => (json.recordings = {}), /recordings: expected an array/],
      [
        (json) => ((json.recordings as unknown[])[0] = []),
        /recordings\[0\]: expected a recording entry object/,
      ],
      [(json) => (json.settings = []), /settings: expected an object of settings/],
      [(json) => (json.settings = 'dark'), /settings: expected an object of settings/],
      [(json) => ((json.shots as Json[])[0].id = 'not-an-id'), /shots\[0\]\.id: expected an id/],
      [
        (json) => ((json.shots as Json[])[0].direction = 'sweet'),
        /shots\[0\]\.direction: expected one of/,
      ],
      [
        (json) => ((entry(json).recording as Json).transport = 'usb'),
        /recording\.transport: expected one of/,
      ],
      [(json) => (json.entities = []), /entities: expected an object/],
      [
        (json) => (((json.entities as Json).machines as Json[])[0].baskets = {}),
        /entities\.machines\[0\]\.baskets: expected an array/,
      ],
      [
        (json) => (((json.entities as Json).grinders as Json[])[0].currentSetting = 18.5),
        /entities\.grinders\[0\]\.currentSetting: expected a whole number of clicks/,
      ],
    ];
    for (const [breakIt, message] of cases) {
      const json = sampleJson();
      breakIt(json);
      expectRefused(json, 'invalid', message);
    }
  });

  it('keeps the schema error as the cause', () => {
    const json = sampleJson();
    frameRows(json)[0][3] = 'zz';
    const error = expectRefused(json, 'invalid', /^The file isn't a valid export: /);
    expect(error.cause).toBeInstanceOf(SchemaError);
    expect((error.cause as SchemaError).path).toBe('recordings[0].frames[0][3]');
  });
});

describe('what is tolerated', () => {
  it('ignores a byte order mark', () => {
    const text = serialiseExport(sampleBundle());
    expect(parseExport(`\uFEFF${text}`).bundle).toEqual(sampleBundle());
  });

  it('reads compact or differently indented JSON the same', () => {
    const json = sampleJson();
    expect(parseExport(JSON.stringify(json)).bundle).toEqual(sampleBundle());
    expect(parseExport(JSON.stringify(json, null, 4)).bundle).toEqual(sampleBundle());
  });

  it('fills a missing nullable field with null (D-018)', () => {
    const json = sampleJson();
    const shot = (json.shots as Json[]).find((s) => s.id === SAMPLE_IDS.fullShot)!;
    delete shot.tags;
    delete shot.grindSetting;
    delete (entry(json).recording as Json).userAgent;
    delete json.settings;
    delete json.entities;
    const { bundle } = parseExport(JSON.stringify(json));
    const read = bundle.shots.find((s) => s.id === SAMPLE_IDS.fullShot)!;
    expect(read.tags).toBeNull();
    expect(read.grindSetting).toBeNull();
    expect(Object.hasOwn(read, 'tags')).toBe(true);
    expect(bundle.recordings[0].recording.userAgent).toBeNull();
    expect(bundle.settings).toBeNull();
    expect(bundle.entities).toBeNull();
  });

  it('drops unknown keys', () => {
    const json = sampleJson();
    json.futureThing = { anything: true };
    entry(json).derived = [];
    (json.shots as Json[])[0].mood = 'happy';
    eventsOf(json)[0].note = 'extra';
    const { bundle } = parseExport(JSON.stringify(json));
    expect(bundle).toEqual(sampleBundle());
    expect(Object.keys(bundle)).toEqual([
      'exportedAtEpochMs',
      'app',
      'recordings',
      'shots',
      'entities',
      'settings',
    ]);
  });

  it("gives an event its entry's recording id, whatever the event says", () => {
    const json = sampleJson();
    eventsOf(json)[0].recordingId = SAMPLE_IDS.recordingC;
    const { bundle } = parseExport(JSON.stringify(json));
    expect(bundle.recordings[0].events[0].recordingId).toBe(SAMPLE_IDS.recordingA);
  });

  it('accepts gaps in seq, which record a loss', () => {
    const json = sampleJson();
    frameRows(json).splice(5, 3);
    const { bundle } = parseExport(JSON.stringify(json));
    expect(bundle.recordings[0].frames).toHaveLength(
      sampleBundle().recordings[0].frames.length - 3,
    );
  });
});

describe('migrations', () => {
  /**
   * A pretend history: version 1 wrote frames as objects, version 2 renamed `exportedAt`, and
   * version 3 is today's format.
   */
  const v1ToV2: ExportMigration = (document) => ({
    ...document,
    recordings: (document.recordings as Json[]).map((e) => ({
      ...e,
      frames: (e.frames as Json[]).map((f) => [f.seq, f.tMs, f.source, f.hex]),
    })),
  });
  const v2ToV3: ExportMigration = ({ exportedAt, ...rest }) => ({
    ...rest,
    exportedAtEpochMs: exportedAt,
  });

  function asVersion(version: number): Json {
    const json = sampleJson();
    const { exportedAtEpochMs, ...rest } = json;
    const v2: Json = { ...rest, formatVersion: version, exportedAt: exportedAtEpochMs };
    if (version === 2) return v2;
    return {
      ...v2,
      recordings: (v2.recordings as Json[]).map((e) => ({
        ...e,
        frames: (e.frames as unknown[][]).map(([seq, tMs, source, hex]) => ({
          seq,
          tMs,
          source,
          hex,
        })),
      })),
    };
  }

  it('upgrades an older file through each migration in order', () => {
    const calls: string[] = [];
    const migrations: ExportMigration[] = [
      (d) => (calls.push('1→2'), v1ToV2(d)),
      (d) => (calls.push('2→3'), v2ToV3(d)),
    ];
    const parsed = parseExport(JSON.stringify(asVersion(1)), { migrations });
    expect(calls).toEqual(['1→2', '2→3']);
    expect(parsed.formatVersion).toBe(1);
    expect(parsed.bundle).toEqual(sampleBundle());

    calls.length = 0;
    const fromTwo = parseExport(JSON.stringify(asVersion(2)), { migrations });
    expect(calls).toEqual(['2→3']);
    expect(fromTwo.formatVersion).toBe(2);
    expect(fromTwo.bundle).toEqual(sampleBundle());
  });

  it('runs no migration on a current file, and refuses one newer than the migrations know', () => {
    const migrations: ExportMigration[] = [
      () => {
        throw new Error('must not run');
      },
    ];
    const current = { ...sampleJson(), formatVersion: 2 };
    expect(parseExport(JSON.stringify(current), { migrations }).bundle).toEqual(sampleBundle());
    const error = errorFrom(JSON.stringify({ ...sampleJson(), formatVersion: 3 }), migrations);
    expect(error.code).toBe('newer-version');
    expect(error.message).toMatch(/reads versions up to 2/);
  });

  it('validates what a migration returns', () => {
    const broken: ExportMigration = (document) => ({ ...document, shots: 'none' });
    const error = errorFrom(JSON.stringify({ ...sampleJson(), formatVersion: 1 }), [broken]);
    expect(error.code).toBe('invalid');
    expect(error.message).toMatch(/shots: expected an array/);
  });

  it('reports a schema error from a migration as invalid, and anything else as is', () => {
    const schema: ExportMigration = () => {
      throw new SchemaError('recordings[0].frames', 'not convertible');
    };
    const versionOne = JSON.stringify({ ...sampleJson(), formatVersion: 1 });
    expect(errorFrom(versionOne, [schema]).code).toBe('invalid');
    const bug: ExportMigration = () => {
      throw new TypeError('bug');
    };
    expect(() => parseExport(versionOne, { migrations: [bug] })).toThrow(TypeError);
  });
});
