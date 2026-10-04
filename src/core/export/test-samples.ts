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
 * - Settings with nested values and awkward keys.
 */

import {
  commandEventData,
  createRecording,
  createShot,
  endRecording,
  RecordingSequence,
  type AppEvent,
  type AppInfo,
  type CharacteristicProperties,
  type Id,
  type RawFrame,
  type Shot,
} from '../model';
import { flowSmoothingOff, fromHex, tareAndStartTimer } from '../protocol';
import { espressoScenario, simulateSession } from '../sim';
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
        beansWeighedG: 18.3,
        beanBagId: SAMPLE_IDS.bag,
        grinderId: SAMPLE_IDS.grinder,
        grindSetting: { kind: 'clicks', value: 18 },
        burrEpochId: SAMPLE_IDS.burrEpoch,
        containerId: SAMPLE_IDS.cup,
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

export function sampleSettings(): ExportSettings {
  return {
    'capture.fields': { direction: true, tags: false, order: ['dose', 'ratio'] },
    'last.doseG': 18.2,
    'last.beanBagId': null,
    'empty.list': [],
    'ключ ☕': 'значение',
    // A computed key makes an own property; a literal `__proto__:` would set the prototype.
    ['__proto__']: 'just data',
  };
}

/** A bundle with both recordings, every shot and the settings. */
export function sampleBundle(): ExportBundle {
  return {
    exportedAtEpochMs: SAMPLE_START + 2 * 86_400_000 + 1234,
    app: SAMPLE_APP,
    recordings: [sampleRecordingA(), sampleRecordingB()],
    shots: sampleShots(),
    settings: sampleSettings(),
  };
}
