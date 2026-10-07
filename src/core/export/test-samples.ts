/**
 * Test support, for tests only: an export bundle that exercises the whole format. The core and
 * app export tests share it.
 *
 * - Recording A ended, from Web Bluetooth: simulated weight frames, some corrupted or truncated,
 *   FF12 frames, an empty notification, and every app event type.
 * - Recording B is still open (exported while recording), from the mock, with nothing optional
 *   set.
 * - Shots: one with every field set (and discarded), one with nothing set, one with empty tags
 *   on B, and one whose recording isn't in the bundle.
 * - Entities of every kind: the full shot's, with every field set, a removed one, one with
 *   nothing optional set, and a seed as seeded.
 * - Settings with nested values and awkward keys.
 */

import {
  commandEventData,
  createEntity,
  createRecording,
  createShot,
  endRecording,
  NO_MAINTENANCE,
  RecordingSequence,
  SEEDS,
  updateEntity,
  type AppEvent,
  type AppInfo,
  type CharacteristicProperties,
  type EntityLists,
  type Id,
  type RawFrame,
  type Shot,
} from '../model';
import { flowSmoothingOff, fromHex, tareAndStartTimer } from '../protocol';
import { espressoScenario, simulateSession } from '../sim';
import { encodeSoundFrame, SOUND_LAYOUT } from '../sound';
import type { ExportBundle, ExportedRecording, ExportSettings } from './format';

export const SAMPLE_START = Date.UTC(2026, 9, 4, 6, 30, 5);
export const SAMPLE_APP: AppInfo = { commit: 'abc1234', buildTime: '2026-10-04T06:00:00.000Z' };
export const SAMPLE_IDS = {
  recordingA: '019a1b2c-3d4e-7000-8000-0000000000a1',
  recordingB: '019a1b2c-3d4e-7000-8000-0000000000b2',
  /** A recording no sample holds. */
  recordingC: '019a1b2c-3d4e-7000-8000-0000000000c3',
  fullShot: '019a1b2c-3d4e-7000-9000-000000000001',
  emptyShot: '019a1b2c-3d4e-7000-9000-000000000002',
  shotOnB: '019a1b2c-3d4e-7000-9000-000000000003',
  shotOnC: '019a1b2c-3d4e-7000-9000-000000000004',
  bag: '019a1b2c-3d4e-7000-a000-000000000001',
  grinder: '019a1b2c-3d4e-7000-a000-000000000002',
  burrEpoch: '019a1b2c-3d4e-7000-a000-000000000003',
  cup: '019a1b2c-3d4e-7000-a000-000000000004',
  recipe: '019a1b2c-3d4e-7000-a000-000000000005',
  machine: '019a1b2c-3d4e-7000-a000-000000000006',
  basket: '019a1b2c-3d4e-7000-a000-000000000007',
  /** Entities no sample shot names. */
  smallBasket: '019a1b2c-3d4e-7000-a000-000000000008',
  oldGrinder: '019a1b2c-3d4e-7000-a000-000000000009',
  finishedPack: '019a1b2c-3d4e-7000-a000-00000000000a',
  jug: '019a1b2c-3d4e-7000-a000-00000000000b',
  tag: '019a1b2c-3d4e-7000-a000-00000000000c',
} as const satisfies Record<string, Id>;

/** How many of the simulated frames recording A keeps. */
const A_FRAMES = 400;

const ALL_PROPERTIES: CharacteristicProperties = {
  broadcast: false,
  read: false,
  writeWithoutResponse: false,
  write: true,
  notify: true,
  indicate: false,
  authenticatedSignedWrites: false,
  reliableWrite: false,
  writableAuxiliaries: false,
};

/** Recording A: ended, damaged frames, FF12 frames, an empty frame, every event type. */
export function sampleRecordingA(): ExportedRecording {
  const session = simulateSession(
    espressoScenario({ seed: 7, link: { corruptProbability: 0.05, truncateProbability: 0.03 } }),
  );
  const sequence = new RecordingSequence(SAMPLE_IDS.recordingA);
  const frames: RawFrame[] = [];
  const events: AppEvent[] = [];

  events.push(
    sequence.event(0, 'connected', { deviceName: 'BOOKOO_MINI', deviceId: 'dGVzdA==/+id' }),
    sequence.event(0, 'characteristic-properties', {
      characteristic: 'ff11',
      properties: { ...ALL_PROPERTIES, write: false },
    }),
    sequence.event(0, 'characteristic-properties', {
      characteristic: 'ff12',
      properties: { ...ALL_PROPERTIES, reliableWrite: null, writableAuxiliaries: null },
    }),
  );
  let tMs = 0;
  session.frames.slice(0, A_FRAMES).forEach((frame, i) => {
    tMs = frame.tArrival;
    frames.push(sequence.frame(tMs, frame.source, frame.bytes));
    switch (i) {
      case 3:
        events.push(
          sequence.event(tMs, 'command-sent', commandEventData(flowSmoothingOff(), 'connect')),
        );
        break;
      case 25:
        events.push(sequence.event(tMs, 'smoothing-confirmed', { attempts: 1 }));
        break;
      case 40:
        events.push(
          sequence.event(tMs, 'ui-action', {
            action: 'manual-start',
            detail: { nested: [1, 'two', null, true, { deep: -0.5 }], empty: {} },
          }),
          sequence.event(
            tMs,
            'command-sent',
            commandEventData(tareAndStartTimer(), 'manual-start'),
          ),
        );
        break;
      case 60:
        events.push(sequence.event(tMs, 'annotation', { label: 'pump-on', text: null }));
        frames.push(sequence.frame(tMs + 0.25, 'ff12', fromHex('03 0D 01 00 00 0F')));
        events.push(
          sequence.event(tMs + 0.5, 'sound-started', {
            layout: SOUND_LAYOUT.id,
            measures: SOUND_LAYOUT.measures.map((measure) => ({ ...measure })),
            sampleRateHz: 48000,
            fftSize: 4096,
            intervalMs: 50,
            input: 'iPhone Microphone',
            continued: false,
          }),
        );
        // Within the 100 ms before the next weight frame, so the times keep the seq order.
        for (let k = 0; k < 3; k++) {
          const levels = SOUND_LAYOUT.measures.map((_, j) => -30 - 5 * j - k);
          frames.push(sequence.frame(tMs + 1 + 25 * k, 'mic', encodeSoundFrame(levels)));
        }
        events.push(
          sequence.event(tMs + 80, 'sound-input', { contextState: 'interrupted', muted: true }),
        );
        break;
      case 100:
        events.push(
          sequence.event(tMs, 'command-failed', {
            ...commandEventData(flowSmoothingOff(), 'smoothing-retry'),
            error: 'GATT operation failed for unknown reason.',
          }),
        );
        break;
      case 150:
        events.push(
          sequence.event(tMs, 'annotation', {
            label: 'note',
            text: 'Line one\nline "two" with ünïcødé ☕ and a \\ backslash\u2028',
          }),
        );
        break;
      case 200:
        events.push(
          sequence.event(tMs, 'smoothing-not-confirmed', { attempts: 2, smoothingByte: 1 }),
        );
        break;
      case 250:
        events.push(sequence.event(tMs, 'error', { message: 'QuotaExceededError', context: null }));
        events.push(
          sequence.event(tMs, 'sound-stopped', { reason: 'ended', message: 'The input ended' }),
        );
        break;
      case 300:
        frames.push(sequence.frame(tMs, 'ff11', new Uint8Array(0)));
        frames.push(sequence.frame(tMs + 1, 'ff12', fromHex('03 0D 00 00 00 0E')));
        break;
    }
  });
  events.push(sequence.event(tMs + 5, 'disconnected', { reason: 'user', message: null }));

  const recording = endRecording(
    createRecording({
      id: SAMPLE_IDS.recordingA,
      startedAtEpochMs: SAMPLE_START,
      device: { name: 'BOOKOO_MINI', id: 'dGVzdA==/+id' },
      transport: 'web-bluetooth',
      app: SAMPLE_APP,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) beacio',
    }),
    SAMPLE_START + tMs + 5,
    'user',
  );
  return { recording, frames, events };
}

/** Recording B: still open, from the mock, nothing optional set. */
export function sampleRecordingB(): ExportedRecording {
  const session = simulateSession(espressoScenario({ seed: 8 }));
  const sequence = new RecordingSequence(SAMPLE_IDS.recordingB);
  const events = [sequence.event(0, 'connected', { deviceName: null, deviceId: null })];
  const frames = session.frames
    .slice(0, 30)
    .map((frame) => sequence.frame(frame.tArrival, frame.source, frame.bytes));
  const recording = createRecording({
    id: SAMPLE_IDS.recordingB,
    startedAtEpochMs: SAMPLE_START + 3_600_000,
    device: { name: null, id: null },
    transport: 'mock',
    app: SAMPLE_APP,
    userAgent: null,
  });
  return { recording, frames, events };
}

/** In storage order: by recording, then by anchor time. */
export function sampleShots(): Shot[] {
  const day = 86_400_000;
  return [
    createShot(
      {
        id: SAMPLE_IDS.emptyShot,
        recordingId: SAMPLE_IDS.recordingA,
        anchorTMs: 0,
        source: 'post-hoc',
      },
      SAMPLE_START + 50_000,
    ),
    createShot(
      {
        id: SAMPLE_IDS.fullShot,
        recordingId: SAMPLE_IDS.recordingA,
        anchorTMs: 30_123.456,
        source: 'live',
        discardedAtEpochMs: SAMPLE_START + day,
        direction: 'sour',
        channelled: false,
        tags: ['warm-up 10 min', 'wdt', ''],
        doseG: 18.1,
        targetRatio: 2.25,
        recipeId: SAMPLE_IDS.recipe,
        recipeName: 'Flat white',
        milkRatio: 4,
        beansPhase: 'done',
        beansWeighedG: 18.3,
        grindPhase: 'done',
        groundG: 18.1,
        milkPhase: 'skipped',
        milkG: null,
        machineId: SAMPLE_IDS.machine,
        machineName: 'Gaggia Classic Pro',
        pressureBar: 6,
        basketId: SAMPLE_IDS.basket,
        basketSizeG: 18,
        grinderId: SAMPLE_IDS.grinder,
        grinderName: 'Comandante C40 MK4',
        grindSetting: { kind: 'clicks', value: 18 },
        burrEpochId: SAMPLE_IDS.burrEpoch,
        packId: SAMPLE_IDS.bag,
        packName: 'Local roaster · Ethiopia Guji · Natural',
        packRoastDate: '2026-09-22',
        packOpenDate: '2026-09-26',
        containerId: SAMPLE_IDS.cup,
        lastDescaleDate: '2026-08-01',
        lastBackflushDate: '2026-09-23',
        lastGrinderCareDate: null,
      },
      SAMPLE_START + 40_000,
    ),
    createShot(
      {
        id: SAMPLE_IDS.shotOnB,
        recordingId: SAMPLE_IDS.recordingB,
        anchorTMs: 1500.5,
        source: 'manual',
        direction: 'balanced',
        tags: [],
        grindSetting: { kind: 'stepless', value: 4.75 },
      },
      SAMPLE_START + 3_700_000,
    ),
    createShot(
      {
        id: SAMPLE_IDS.shotOnC,
        recordingId: SAMPLE_IDS.recordingC,
        anchorTMs: 61_000,
        source: 'manual',
        channelled: true,
      },
      SAMPLE_START + 2 * day,
    ),
  ];
}

/**
 * Entities of every kind, in id order: the ones the full shot names, with every field set; a
 * removed grinder; a pack and a container with nothing optional set; a tag with an awkward name;
 * and the Espresso seed as seeded.
 */
export function sampleEntities(): EntityLists {
  const at = SAMPLE_START - 30 * 86_400_000;
  const later = SAMPLE_START - 86_400_000;
  return {
    machines: [
      updateEntity(
        'machines',
        createEntity(
          'machines',
          {
            id: SAMPLE_IDS.machine,
            name: 'Gaggia Classic Pro',
            pressureBar: 6,
            baskets: [
              { id: SAMPLE_IDS.basket, name: 'LM 17 g', sizeG: 18 },
              { id: SAMPLE_IDS.smallBasket, name: null, sizeG: 9 },
            ],
            descale: { lastDoneDate: '2026-08-01', reminderDays: 60 },
            backflush: { lastDoneDate: '2026-09-23', reminderDays: 14 },
          },
          at,
        ),
        { pressureBar: 6 },
        later,
      ),
    ],
    grinders: [
      createEntity(
        'grinders',
        {
          id: SAMPLE_IDS.grinder,
          brand: 'Comandante',
          model: 'C40 MK4',
          settingKind: 'clicks',
          currentSetting: 18,
          settingStep: null,
          care: { lastDoneDate: null, reminderDays: 30 },
        },
        at,
      ),
      updateEntity(
        'grinders',
        createEntity(
          'grinders',
          {
            id: SAMPLE_IDS.oldGrinder,
            brand: '',
            model: 'Hand grinder',
            settingKind: 'stepless',
            currentSetting: 4.75,
            settingStep: null,
            care: NO_MAINTENANCE,
          },
          at,
        ),
        { removedAtEpochMs: later },
        later,
      ),
    ],
    recipes: [
      createEntity(
        'recipes',
        { id: SAMPLE_IDS.recipe, name: 'Flat white', coffeeRatio: 2.25, milkRatio: 4 },
        at,
      ),
      SEEDS.recipes[1],
    ].sort((a, b) => (a.id < b.id ? -1 : 1)),
    packs: [
      createEntity(
        'packs',
        {
          id: SAMPLE_IDS.bag,
          brand: 'Local roaster',
          name: 'Ethiopia Guji · Natural',
          weightG: 250,
          roastDate: '2026-09-22',
          openDate: '2026-09-26',
          flavours: ['Blueberry', 'Jasmine', 'Bergamot'],
          finishedDate: null,
          buyAgain: null,
        },
        at,
      ),
      createEntity(
        'packs',
        {
          id: SAMPLE_IDS.finishedPack,
          brand: null,
          name: 'Brazil Cerrado',
          weightG: null,
          roastDate: '2026-08-20',
          openDate: null,
          flavours: [],
          finishedDate: '2026-09-06',
          buyAgain: false,
        },
        at,
      ),
    ],
    containers: [
      createEntity(
        'containers',
        {
          id: SAMPLE_IDS.cup,
          name: 'Glass tumbler',
          emptyMassG: 182,
          roles: ['cup'],
          dismissedWarningIds: [SAMPLE_IDS.jug],
        },
        at,
      ),
      createEntity(
        'containers',
        {
          id: SAMPLE_IDS.jug,
          name: 'Milk jug 350 ml',
          emptyMassG: 181.4,
          roles: ['milk'],
          dismissedWarningIds: [],
        },
        at,
      ),
    ],
    tags: [
      createEntity(
        'tags',
        { id: SAMPLE_IDS.tag, name: 'Warm-up ☕ “10 min”\u2028', group: 'Notes', isDefault: true },
        at,
      ),
    ],
  };
}

export function sampleSettings(): ExportSettings {
  return {
    'capture.fields': { direction: true, tags: false, order: ['dose', 'ratio'] },
    'last.doseG': 18.2,
    'last.packId': null,
    'empty.list': [],
    'ключ ☕': 'значение',
    // A computed key makes an own property; a literal `__proto__:` would set the prototype.
    ['__proto__']: 'just data',
  };
}

/** A bundle with both recordings, every shot, the entities and the settings. */
export function sampleBundle(): ExportBundle {
  return {
    exportedAtEpochMs: SAMPLE_START + 2 * 86_400_000 + 1234,
    app: SAMPLE_APP,
    recordings: [sampleRecordingA(), sampleRecordingB()],
    shots: sampleShots(),
    entities: sampleEntities(),
    settings: sampleSettings(),
  };
}
