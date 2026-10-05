/**
 * CLAUDE.md hard rule 1: raw recordings (frames, app events) are append-only, and raw stores
 * have no update or delete API. The type-level checks run under `npm run typecheck`: adding a
 * method to a raw repository fails it.
 */

import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { createRecording, RecordingSequence, type Recording } from '../core/model';
import { encodeWeightFrame } from '../core/protocol';
import { freshIndexedDB } from './fake-idb';
import {
  openStorage,
  type AppStorage,
  type RawRecording,
  type RawRepository,
  type RecordingRepository,
} from './index';

const REC = '01923456-789a-7000-8000-000000000001';

let storage: AppStorage;

beforeEach(async () => {
  freshIndexedDB();
  storage = await openStorage();
});

afterEach(() => {
  storage.close();
});

describe('raw is append-only', () => {
  it('offers no way to change or delete a raw record, at the type level', () => {
    // `addRecording` stores a whole recording for an import (T1.7). Like `append`, it only adds.
    expectTypeOf<keyof RawRepository>().toEqualTypeOf<
      'append' | 'addRecording' | 'read' | 'last'
    >();
    // A recording is created once and ended once (`end`), and changes no other way.
    expectTypeOf<keyof RecordingRepository>().toEqualTypeOf<
      'create' | 'end' | 'get' | 'list' | 'listOpen'
    >();
    // `local` holds device-local values (T1.20), and `entities` user metadata (T2.1), not raw:
    // they may change, and `local` delete.
    expectTypeOf<keyof AppStorage>().toEqualTypeOf<
      'recordings' | 'raw' | 'shots' | 'entities' | 'derived' | 'kv' | 'local' | 'close'
    >();
  });

  it('reads back records whose fields and lists are readonly', () => {
    const tamper = (raw: RawRecording, recording: Recording): void => {
      // @ts-expect-error a stored frame's time can't be reassigned
      raw.frames[0].tMs = 0;
      // @ts-expect-error nor an event's seq
      raw.events[0].seq = 0;
      // @ts-expect-error nor can what was read be rearranged
      raw.frames[0] = raw.frames[1];
      // @ts-expect-error nor can a recording's end be rewritten
      recording.endReason = 'user';
    };
    expect(tamper).toBeTypeOf('function');
  });

  it('has exactly those methods at runtime too', () => {
    expect(Object.keys(storage.raw).sort()).toEqual(['addRecording', 'append', 'last', 'read']);
    expect(Object.keys(storage.recordings).sort()).toEqual([
      'create',
      'end',
      'get',
      'list',
      'listOpen',
    ]);
  });

  it('hands out copies: changing what was read changes nothing stored', async () => {
    await storage.recordings.create(
      createRecording({
        id: REC,
        startedAtEpochMs: 0,
        device: { name: null, id: null },
        transport: 'mock',
        app: { commit: 'abc1234', buildTime: '2026-10-03T07:00:00.000Z' },
        userAgent: null,
      }),
    );
    const bytes = encodeWeightFrame({ timerMs: 0, weightG: 1, flowGps: 0 });
    const frame = new RecordingSequence(REC).frame(1, 'ff11', bytes);
    await storage.raw.append(REC, { frames: [frame], events: [] });

    const first = (await storage.raw.read(REC))!;
    first.frames[0].bytes.fill(0); // Uint8Array contents can't be made readonly in TypeScript
    const second = (await storage.raw.read(REC))!;
    expect([...second.frames[0].bytes]).toEqual([...bytes]);
  });
});
