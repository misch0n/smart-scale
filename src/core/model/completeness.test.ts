/**
 * Spec "Schema rules": every stored record carries every field, and "not set" is null, never a
 * missing key. For each record type, and for each app event type, these tests prove that:
 *
 * - a record holding only its required fields normalises to the full set of keys, the rest
 *   null, and keeps them all through JSON (the export, T1.7);
 * - a complete record normalises to itself, with its keys in the same order;
 * - every required field is enforced, and unknown keys are dropped.
 *
 * The complete samples are typed as the record interfaces, so adding a field to a type fails to
 * compile until its sample here has it too.
 */

import { describe, expect, it } from 'vitest';
import { encodeWeightFrame } from '../protocol';
import {
  ENTITY_KINDS,
  ENTITY_NAMES,
  normaliseEntity,
  type CoffeePack,
  type Container,
  type EntityKind,
  type EntityOf,
  type Grinder,
  type Machine,
  type Recipe,
  type Tag,
} from './entities';
import {
  APP_EVENT_TYPES,
  normaliseAppEvent,
  type AppEventDataMap,
  type AppEventOf,
  type AppEventType,
} from './events';
import { normaliseRawFrame, type RawFrame } from './frame';
import { normaliseRecording, type Recording } from './recording';
import { SchemaError } from './schema';
import { normaliseShot, type Shot } from './shot';

const REC = '01923456-789a-7000-8000-000000000001';
const SHOT = '01923456-789a-7000-8000-000000000002';
const BAG = '01923456-789a-7000-8000-000000000003';
const GRINDER = '01923456-789a-7000-8000-000000000004';
const EPOCH = '01923456-789a-7000-8000-000000000005';
const CUP = '01923456-789a-7000-8000-000000000006';
const RECIPE = '01923456-789a-7000-8000-000000000007';
const MACHINE = '01923456-789a-7000-8000-000000000008';
const BASKET = '01923456-789a-7000-8000-000000000009';
const JUG = '01923456-789a-7000-8000-00000000000a';
const TAG = '01923456-789a-7000-8000-00000000000b';
const START = Date.UTC(2026, 9, 3, 7, 30);

const FULL_RECORDING: Recording = {
  id: REC,
  startedAtEpochMs: START,
  endedAtEpochMs: START + 240_000,
  endReason: 'user',
  device: { name: 'BOOKOO_MINI', id: 'opaque-device-id' },
  transport: 'web-bluetooth',
  app: { commit: 'abc1234', buildTime: '2026-10-03T07:00:00.000Z' },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)',
};

const MINIMAL_RECORDING = {
  id: REC,
  startedAtEpochMs: START,
  device: {},
  transport: 'web-bluetooth',
  app: { commit: 'abc1234', buildTime: '2026-10-03T07:00:00.000Z' },
};

// Every frame field is required.
const FULL_FRAME: RawFrame = {
  recordingId: REC,
  seq: 12,
  tMs: 1503.75,
  source: 'ff11',
  bytes: encodeWeightFrame({ timerMs: 1500, weightG: 2.31, flowGps: 1.2 }),
};

const FULL_SHOT: Shot = {
  id: SHOT,
  recordingId: REC,
  anchorTMs: 61_020.5,
  source: 'live',
  createdAtEpochMs: START + 70_000,
  updatedAtEpochMs: START + 75_000,
  discardedAtEpochMs: START + 90_000,
  direction: 'sour',
  channelled: false,
  tags: ['warm-up 10 min', 'wdt'],
  doseG: 18.1,
  targetRatio: 2,
  recipeId: RECIPE,
  recipeName: 'Cappuccino',
  milkRatio: 3,
  beansPhase: 'done',
  beansWeighedG: 18.3,
  grindPhase: 'skipped',
  groundG: null,
  milkPhase: 'done',
  milkG: 104,
  machineId: MACHINE,
  machineName: 'Gaggia Classic Pro',
  pressureBar: 6,
  basketId: BASKET,
  basketSizeG: 17,
  grinderId: GRINDER,
  grinderName: 'Comandante C40 MK4',
  grindSetting: { kind: 'clicks', value: 18 },
  burrEpochId: EPOCH,
  packId: BAG,
  packName: 'Ethiopia Guji · Natural',
  packRoastDate: '2026-09-22',
  packOpenDate: '2026-09-26',
  containerId: CUP,
  lastDescaleDate: '2026-08-01',
  lastBackflushDate: '2026-09-23',
  lastGrinderCareDate: '2026-09-10',
};

const MINIMAL_SHOT = {
  id: SHOT,
  recordingId: REC,
  anchorTMs: 61_020.5,
  source: 'live',
  createdAtEpochMs: START + 70_000,
  updatedAtEpochMs: START + 75_000,
};

/** What every entity has; the times are the only required fields besides the kind's own. */
const ENTITY_TIMES = {
  createdAtEpochMs: START,
  updatedAtEpochMs: START + 60_000,
  removedAtEpochMs: START + 120_000,
};
const ENTITY_TIMES_MINIMAL = { createdAtEpochMs: START, updatedAtEpochMs: START };

/** A full and a minimal record of each kind of entity (T2.1). */
const ENTITY_SAMPLES: {
  readonly [K in EntityKind]: {
    readonly full: EntityOf<K>;
    readonly minimal: Readonly<Record<string, unknown>>;
  };
} = {
  machines: {
    full: {
      id: MACHINE,
      ...ENTITY_TIMES,
      name: 'Gaggia Classic Pro',
      pressureBar: 6,
      baskets: [{ id: BASKET, name: 'LM 17 g', sizeG: 17 }],
      descale: { lastDoneDate: '2026-08-01', reminderDays: 60 },
      backflush: { lastDoneDate: '2026-09-23', reminderDays: 14 },
    } satisfies Machine,
    minimal: {
      id: MACHINE,
      ...ENTITY_TIMES_MINIMAL,
      name: 'Gaggia Classic Pro',
      baskets: [],
      descale: {},
      backflush: {},
    },
  },
  grinders: {
    full: {
      id: GRINDER,
      ...ENTITY_TIMES,
      brand: 'Comandante',
      model: 'C40 MK4 Red Clix',
      settingKind: 'clicks',
      currentSetting: 22,
      care: { lastDoneDate: '2026-09-10', reminderDays: 30 },
    } satisfies Grinder,
    minimal: {
      id: GRINDER,
      ...ENTITY_TIMES_MINIMAL,
      brand: 'Comandante',
      model: 'C40 MK4 Red Clix',
      settingKind: 'clicks',
      care: {},
    },
  },
  recipes: {
    full: {
      id: RECIPE,
      ...ENTITY_TIMES,
      name: 'Cappuccino',
      coffeeRatio: 2,
      milkRatio: 3,
    } satisfies Recipe,
    minimal: { id: RECIPE, ...ENTITY_TIMES_MINIMAL, name: 'Espresso', coffeeRatio: 2 },
  },
  packs: {
    full: {
      id: BAG,
      ...ENTITY_TIMES,
      brand: 'Local roaster',
      name: 'Ethiopia Guji · Natural',
      weightG: 250,
      roastDate: '2026-09-22',
      openDate: '2026-09-26',
      flavours: ['Blueberry', 'Jasmine', 'Bergamot'],
      finishedDate: '2026-10-10',
      buyAgain: true,
    } satisfies CoffeePack,
    minimal: {
      id: BAG,
      ...ENTITY_TIMES_MINIMAL,
      name: 'Kenya Nyeri',
      roastDate: '2026-09-30',
      flavours: [],
    },
  },
  containers: {
    full: {
      id: CUP,
      ...ENTITY_TIMES,
      name: 'Glass tumbler',
      emptyMassG: 182,
      roles: ['cup'],
      dismissedWarningIds: [JUG],
    } satisfies Container,
    minimal: {
      id: CUP,
      ...ENTITY_TIMES_MINIMAL,
      name: 'Glass tumbler',
      emptyMassG: 182,
      roles: [],
      dismissedWarningIds: [],
    },
  },
  tags: {
    full: {
      id: TAG,
      ...ENTITY_TIMES,
      name: 'Paper filter',
      group: 'Puck',
      isDefault: false,
    } satisfies Tag,
    minimal: { id: TAG, ...ENTITY_TIMES_MINIMAL, name: 'WDT', isDefault: true },
  },
};

const EVENT_DATA: {
  readonly [K in AppEventType]: {
    readonly full: AppEventDataMap[K];
    readonly minimal: Readonly<Record<string, unknown>>;
  };
} = {
  connected: { full: { deviceName: 'BOOKOO_MINI', deviceId: 'opaque-device-id' }, minimal: {} },
  disconnected: {
    full: { reason: 'device', message: 'GATT server disconnected' },
    minimal: { reason: 'device' },
  },
  'command-sent': {
    full: { command: 'setBuzzer', param: 0, hex: '030A0200000B', reason: 'probe' },
    minimal: { command: 'setBuzzer', hex: '030A0200000B' },
  },
  'command-failed': {
    full: {
      command: 'flowSmoothingOff',
      param: null,
      hex: '030A08000001',
      reason: 'connect',
      error: 'NetworkError: GATT operation failed',
    },
    minimal: { command: 'flowSmoothingOff', hex: '030A08000001', error: 'NetworkError' },
  },
  'ui-action': {
    full: { action: 'manual-start', detail: { screen: 'live', taps: [1, 2] } },
    minimal: { action: 'manual-start' },
  },
  annotation: {
    full: { label: 'note', text: '18 g, ORO at 4.25' },
    minimal: { label: 'note' },
  },
  'smoothing-confirmed': { full: { attempts: 1 }, minimal: { attempts: 1 } },
  'smoothing-not-confirmed': {
    full: { attempts: 2, smoothingByte: 1 },
    minimal: { attempts: 2 },
  },
  error: {
    full: { message: 'QuotaExceededError', context: 'storage' },
    minimal: { message: 'QuotaExceededError' },
  },
  'characteristic-properties': {
    full: {
      characteristic: 'ff12',
      properties: {
        broadcast: false,
        read: false,
        writeWithoutResponse: true,
        write: true,
        notify: true,
        indicate: false,
        authenticatedSignedWrites: false,
        reliableWrite: false,
        writableAuxiliaries: false,
      },
    },
    minimal: { characteristic: 'ff12', properties: {} },
  },
  'sound-started': {
    full: {
      layout: 1,
      measures: [{ kind: 'band', name: 'all', fromHz: 40, toHz: 16000 }],
      sampleRateHz: 48000,
      fftSize: 4096,
      intervalMs: 50,
      input: 'iPhone Microphone',
      continued: false,
    },
    minimal: {
      layout: 1,
      sampleRateHz: 48000,
      fftSize: 4096,
      intervalMs: 50,
      continued: true,
    },
  },
  'sound-input': {
    full: { contextState: 'interrupted', muted: true },
    minimal: { contextState: 'running', muted: false },
  },
  'sound-stopped': {
    full: { reason: 'ended', message: 'The input ended' },
    minimal: { reason: 'user' },
  },
};

function event<K extends AppEventType>(type: K, data: AppEventDataMap[K]): AppEventOf<K>;
function event(type: AppEventType, data: unknown): object;
function event(type: AppEventType, data: unknown): object {
  return { recordingId: REC, seq: 3, tMs: 812.5, type, data };
}

/** The path an entity's errors start with. */
const ENTITY_ROOTS = ENTITY_NAMES;

interface Case {
  readonly name: string;
  /** The path normalisers report errors under. */
  readonly root: string;
  readonly normalise: (input: unknown) => unknown;
  readonly full: object;
  readonly minimal: object;
  /** Records that go into the export as JSON as they are. Frames' bytes become hex (T1.7). */
  readonly json: boolean;
}

const CASES: readonly Case[] = [
  {
    name: 'Recording',
    root: 'recording',
    normalise: (input) => normaliseRecording(input),
    full: FULL_RECORDING,
    minimal: MINIMAL_RECORDING,
    json: true,
  },
  {
    name: 'RawFrame',
    root: 'frame',
    normalise: (input) => normaliseRawFrame(input),
    full: FULL_FRAME,
    minimal: FULL_FRAME,
    json: false,
  },
  {
    name: 'Shot',
    root: 'shot',
    normalise: (input) => normaliseShot(input),
    full: FULL_SHOT,
    minimal: MINIMAL_SHOT,
    json: true,
  },
  ...(Object.keys(ENTITY_SAMPLES) as EntityKind[]).map((kind): Case => ({
    name: `Entity ${kind}`,
    root: ENTITY_ROOTS[kind],
    normalise: (input) => normaliseEntity(kind, input),
    full: ENTITY_SAMPLES[kind].full,
    minimal: ENTITY_SAMPLES[kind].minimal,
    json: true,
  })),
  ...APP_EVENT_TYPES.map((type): Case => ({
    name: `AppEvent ${type}`,
    root: 'event',
    normalise: (input) => normaliseAppEvent(input),
    full: event(type, EVENT_DATA[type].full),
    minimal: event(type, EVENT_DATA[type].minimal),
    json: true,
  })),
];

describe.each(CASES)('$name', ({ root, normalise, full, minimal, json }) => {
  it('gets every key from a record with only its required fields, the others null', () => {
    const out = normalise(structuredClone(minimal));
    expectSameKeys(out, full);
    expectNullWhereMissing(out, minimal, full);
    if (json) expectSameKeys(JSON.parse(JSON.stringify(out)), full);
  });

  it('normalises a complete record to itself, keys in the same order, through JSON too', () => {
    const out = normalise(structuredClone(full));
    expect(out).toStrictEqual(full);
    expectSameKeys(out, full);
    if (json) expect(normalise(JSON.parse(JSON.stringify(full)))).toStrictEqual(full);
  });

  it('enforces every required field', () => {
    for (const path of keyPaths(minimal)) {
      const error = thrownBy(() => normalise(without(minimal, path)));
      expect(error, `without ${path.join('.')}`).toBeInstanceOf(SchemaError);
      expect((error as SchemaError).path).toBe([root, ...path].join('.'));
    }
  });

  it('drops unknown keys', () => {
    expect(normalise({ ...structuredClone(full), addedByANewerBuild: 1 })).toStrictEqual(full);
  });
});

it('covers every event type', () => {
  expect(Object.keys(EVENT_DATA)).toEqual(APP_EVENT_TYPES);
});

it('covers every kind of entity', () => {
  expect(Object.keys(ENTITY_SAMPLES)).toEqual(ENTITY_KINDS);
});

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !ArrayBuffer.isView(value)
  );
}

/** Same keys in the same order, recursively wherever both sides hold an object. */
function expectSameKeys(actual: unknown, expected: unknown, path = 'record'): void {
  if (!isPlainObject(actual) || !isPlainObject(expected)) throw new Error(`${path}: not objects`);
  expect(Object.keys(actual), path).toEqual(Object.keys(expected));
  for (const key of Object.keys(expected)) {
    if (isPlainObject(actual[key]) && isPlainObject(expected[key])) {
      expectSameKeys(actual[key], expected[key], `${path}.${key}`);
    }
  }
}

/** Every key of `full` that `minimal` lacks is null in `out`, recursively. */
function expectNullWhereMissing(
  out: unknown,
  minimal: unknown,
  full: unknown,
  path = 'record',
): void {
  if (!isPlainObject(out) || !isPlainObject(minimal) || !isPlainObject(full)) {
    throw new Error(`${path}: not objects`);
  }
  for (const key of Object.keys(full)) {
    if (!Object.hasOwn(minimal, key)) expect(out[key], `${path}.${key}`).toBeNull();
    else if (isPlainObject(minimal[key])) {
      expectNullWhereMissing(out[key], minimal[key], full[key], `${path}.${key}`);
    }
  }
}

/** The path of every key in `value`, nested ones included. */
function keyPaths(value: unknown, prefix: readonly string[] = []): string[][] {
  if (!isPlainObject(value)) return [];
  return Object.keys(value).flatMap((key) => [
    [...prefix, key],
    ...keyPaths(value[key], [...prefix, key]),
  ]);
}

/** A deep copy of `value` without the key at `path`. */
function without(value: object, path: readonly string[]): unknown {
  const copy = structuredClone(value) as Record<string, unknown>;
  let parent = copy;
  for (const key of path.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
  delete parent[path[path.length - 1]];
  return copy;
}

function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}
