import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRecording,
  normaliseRecording,
  RecordingSequence,
  SchemaError,
  type AppEvent,
  type RawFrame,
  type Recording,
} from '../core/model';
import { decodeFrame, encodeWeightFrame } from '../core/protocol';
import { espressoScenario, simulateSession, toRawRecording } from '../core/sim';
import { ManualClock } from '../transport/scheduler';
import { freshIndexedDB, openDirect } from './fake-idb';
import {
  openStorage,
  RecordingWriter,
  StorageError,
  type AppStorage,
  type RecordingWriterOptions,
  type RecordingWriterStorage,
} from './index';

const REC = '01923456-789a-7000-8000-000000000001';
const START = Date.UTC(2026, 9, 3, 7, 30);

function newRecording(id = REC): Recording {
  return createRecording({
    id,
    startedAtEpochMs: START,
    device: { name: 'BOOKOO_MINI', id: null },
    transport: 'mock',
    app: { commit: 'abc1234', buildTime: '2026-10-03T07:00:00.000Z' },
    userAgent: null,
  });
}

let storage: AppStorage;

beforeEach(async () => {
  freshIndexedDB();
  storage = await openStorage({ framesPerChunk: 8 });
});

afterEach(() => {
  storage.close();
  vi.unstubAllGlobals();
});

/** A storage whose next `failures` appends (or creates) fail, as a full disk would. */
function failing(options: { appends?: number; creates?: number }) {
  let appendsLeft = options.appends ?? 0;
  let createsLeft = options.creates ?? 0;
  const appendSizes: number[] = [];
  const failing: RecordingWriterStorage = {
    recordings: {
      create: (recording) => {
        if (createsLeft-- > 0) return Promise.reject(new StorageError('quota', 'full'));
        return storage.recordings.create(recording);
      },
    },
    raw: {
      append: (recordingId, batch) => {
        appendSizes.push(batch.frames.length + batch.events.length);
        if (appendsLeft-- > 0) return Promise.reject(new StorageError('quota', 'full'));
        return storage.raw.append(recordingId, batch);
      },
    },
  };
  return { failing, appendSizes };
}

function setup(options: RecordingWriterOptions & { into?: RecordingWriterStorage } = {}) {
  const clock = new ManualClock();
  const recording = newRecording();
  const sequence = new RecordingSequence(recording.id);
  const errors: Error[] = [];
  const writer = new RecordingWriter(options.into ?? storage, recording, {
    timers: clock,
    onError: (error) => errors.push(error),
    ...options,
  });
  const frames: RawFrame[] = [];
  const events: AppEvent[] = [];
  const addFrames = (count: number): void => {
    for (let i = 0; i < count; i++) {
      const bytes = encodeWeightFrame({ timerMs: frames.length, weightG: 1, flowGps: 0 });
      const frame = sequence.frame(clock.now(), 'ff11', bytes);
      frames.push(frame);
      writer.appendFrame(frame);
    }
  };
  const addEvent = (label = 'note'): void => {
    const event = sequence.event(clock.now(), 'annotation', { label, text: null });
    events.push(event);
    writer.appendEvent(event);
  };
  const stored = async () => (await storage.raw.read(recording.id))?.frames.length ?? null;
  return {
    clock,
    recording,
    sequence,
    writer,
    errors,
    frames,
    events,
    addFrames,
    addEvent,
    stored,
  };
}

describe('RecordingWriter', () => {
  it('stores the recording at once, before any record is due', async () => {
    const { writer, recording } = setup();
    await writer.whenIdle();
    expect(await storage.recordings.get(recording.id)).toEqual(recording);
    expect(writer.writtenCount).toBe(0);
  });

  it('writes what arrives with the recording in that first write', async () => {
    const { writer, addEvent, addFrames, events } = setup();
    addEvent('connected');
    addFrames(2);
    await writer.whenIdle();
    expect((await storage.raw.read(REC))!.events).toEqual(events);
    expect(writer.writtenCount).toBe(3);
  });

  it('writes a batch a second after its first record, not before', async () => {
    const { clock, writer, addFrames, stored } = setup();
    await writer.whenIdle();
    addFrames(3);
    clock.advance(600);
    addFrames(2);
    clock.advance(399);
    await writer.whenIdle();
    expect(await stored()).toBe(0);
    expect(writer.pendingCount).toBe(5);

    clock.advance(1);
    await writer.whenIdle();
    expect(await stored()).toBe(5);
    expect(writer.pendingCount).toBe(0);
    expect(writer.writtenCount).toBe(5);
    expect(clock.pendingTimers).toBe(0);
  });

  it('writes at once when 20 records wait, events included', async () => {
    const { writer, addFrames, addEvent, stored, clock } = setup();
    await writer.whenIdle();
    addFrames(18);
    addEvent();
    await writer.whenIdle();
    expect(await stored()).toBe(0);

    addFrames(1); // the 20th record
    await writer.whenIdle();
    expect(await stored()).toBe(19);
    expect(writer.writtenCount).toBe(20);
    expect(clock.pendingTimers).toBe(0); // the write took the waiting records' timer with it
  });

  it('writes everything on flush()', async () => {
    const { writer, addFrames, addEvent, frames, events } = setup();
    addFrames(3);
    addEvent();
    await writer.flush();
    expect(writer.pendingCount).toBe(0);
    const raw = (await storage.raw.read(REC))!;
    expect(raw.frames).toEqual(frames);
    expect(raw.events).toEqual(events);
  });

  it('resolves flush() at once when there is nothing to write', async () => {
    const { writer } = setup();
    await writer.flush();
    await writer.flush();
    expect(writer.writtenCount).toBe(0);
  });

  it('puts records that arrive during a write into the next, losing none when chunks fill', async () => {
    const { writer, addFrames, frames } = setup();
    await writer.whenIdle();
    addFrames(20); // a write is due...
    await Promise.resolve(); // ...and starts on the next microtask, taking these 20
    addFrames(45); // these wait for the next one
    expect(writer.pendingCount).toBe(65);
    await writer.flush();
    expect(writer.pendingCount).toBe(0);

    const db = await openDirect();
    const chunks = (await db.getAll('frameChunks')) as { frames: { seq: number }[] }[];
    db.close();
    // 8 frames per chunk: the first write's 20, then the second's 45.
    expect(chunks.map((c) => c.frames.length)).toEqual([8, 8, 4, 8, 8, 8, 8, 8, 5]);
    expect((await storage.raw.read(REC))!.frames).toEqual(frames);
  });

  it("keeps a failed write's records and retries them in order, about once a second", async () => {
    const { failing: into, appendSizes } = failing({ appends: 2 });
    const { clock, writer, errors, addFrames, frames, stored } = setup({ into });
    await writer.whenIdle();
    addFrames(20); // a write, which fails
    await writer.whenIdle();
    expect(errors).toHaveLength(1);
    expect(writer.lastError).toMatchObject({ code: 'quota' });
    expect(writer.pendingCount).toBe(20);

    addFrames(25); // over the threshold, but after a failure only the timer writes
    await writer.whenIdle();
    expect(appendSizes).toEqual([20]);

    clock.advance(1000); // the retry, with everything waiting: fails again
    await writer.whenIdle();
    expect(appendSizes).toEqual([20, 45]);
    expect(errors).toHaveLength(2);

    clock.advance(1000); // succeeds
    await writer.whenIdle();
    expect(appendSizes).toEqual([20, 45, 45]);
    expect(writer.lastError).toBeNull();
    expect(writer.pendingCount).toBe(0);
    expect(await stored()).toBe(45);
    expect((await storage.raw.read(REC))!.frames).toEqual(frames);
  });

  it("puts a failed write's records back ahead of those that arrived during it", async () => {
    const { failing: into } = failing({ appends: 1 });
    const { clock, writer, addFrames, frames } = setup({ into });
    await writer.whenIdle();
    addFrames(20); // a write is due...
    await Promise.resolve(); // ...starts with these 20, and fails
    addFrames(5); // while these arrive
    await writer.whenIdle();
    expect(writer.pendingCount).toBe(25);
    clock.advance(1000);
    await writer.whenIdle();
    expect((await storage.raw.read(REC))!.frames).toEqual(frames);
  });

  it('retries a failed create with the next write', async () => {
    const { failing: into } = failing({ creates: 1 });
    const { clock, writer, errors, addFrames, recording } = setup({ into });
    await writer.whenIdle();
    expect(errors).toHaveLength(1);
    expect(await storage.recordings.get(recording.id)).toBeNull();

    addFrames(3);
    clock.advance(1000);
    await writer.whenIdle();
    expect(await storage.recordings.get(recording.id)).toEqual(recording);
    expect(writer.writtenCount).toBe(3);
  });

  it('rejects flush() when its write fails, and a later flush() stores everything', async () => {
    const { failing: into } = failing({ appends: 1 });
    const { writer, addFrames, frames } = setup({ into });
    addFrames(3);
    await expect(writer.flush()).rejects.toMatchObject({ code: 'quota' });
    expect(writer.pendingCount).toBe(3);
    await writer.flush();
    expect((await storage.raw.read(REC))!.frames).toEqual(frames);
  });

  it("refuses a record that isn't next in this recording, without queueing it", async () => {
    const { writer, addFrames, sequence, frames } = setup();
    addFrames(2);
    const otherRecording = new RecordingSequence('01923456-789a-7000-8000-000000000009');
    expect(() => writer.appendFrame(otherRecording.frame(5, 'ff11', new Uint8Array(1)))).toThrow(
      TypeError,
    );
    expect(() => writer.appendFrame(frames[1])).toThrow(RangeError); // seq again
    const malformed = { ...sequence.frame(5, 'ff11', new Uint8Array(1)), tMs: Number.NaN };
    expect(() => writer.appendFrame(malformed)).toThrow(SchemaError);
    expect(writer.pendingCount).toBe(2);

    addFrames(1); // a gap in seq (the malformed frame used one): allowed
    await writer.flush();
    expect((await storage.raw.read(REC))!.frames.map((f) => f.seq)).toEqual([0, 1, 3]);
  });

  it("keeps going when its error listener throws, and still surfaces the listener's error", async () => {
    const queued: (() => void)[] = [];
    vi.stubGlobal('queueMicrotask', (task: () => void) => queued.push(task));
    const { failing: into } = failing({ appends: 1 });
    const { writer, addFrames } = setup({
      into,
      onError: () => {
        throw new Error('listener bug');
      },
    });
    addFrames(2);
    await expect(writer.flush()).rejects.toMatchObject({ code: 'quota' });
    expect(queued).toHaveLength(1);
    expect(() => queued[0]()).toThrow('listener bug');
    await writer.flush();
    expect(writer.writtenCount).toBe(2);
  });

  it('refuses bad options', () => {
    expect(() => setup({ maxRecords: 0 })).toThrow(RangeError);
    expect(() => setup({ maxDelayMs: Number.NaN })).toThrow(RangeError);
  });

  it('stores a simulated session exactly as recorded, damaged frames and all', async () => {
    const session = simulateSession(
      espressoScenario({
        link: { corruptProbability: 0.02, truncateProbability: 0.01, stallProbability: 0.02 },
      }),
    );
    const raw = toRawRecording(session, { recordingId: REC });
    const records = [...raw.frames, ...raw.events].sort((a, b) => a.seq - b.seq);
    const damaged = raw.frames.filter((f) => decodeFrame(f.bytes).kind === 'invalid');
    expect(damaged.length).toBeGreaterThan(0);

    // The recorder's flow: an open recording, records as they arrive, then flush and end.
    const clock = new ManualClock();
    const open = normaliseRecording({ ...raw.recording, endedAtEpochMs: null, endReason: null });
    const appends: number[] = [];
    const counting: RecordingWriterStorage = {
      recordings: storage.recordings,
      raw: {
        append: (id, batch) => {
          appends.push(batch.frames.length + batch.events.length);
          return storage.raw.append(id, batch);
        },
      },
    };
    const writer = new RecordingWriter(counting, open, { timers: clock });
    for (const record of records) {
      clock.advanceTo(Math.max(clock.now(), record.tMs));
      if ('bytes' in record) writer.appendFrame(record);
      else writer.appendEvent(record);
      await writer.whenIdle();
    }
    await writer.flush();
    await storage.recordings.end(REC, raw.recording.endedAtEpochMs!, raw.recording.endReason!);

    expect(writer.writtenCount).toBe(records.length);
    expect(await storage.raw.read(REC)).toEqual(raw);
    // About one write a second, none larger than the threshold.
    const seconds = raw.frames[raw.frames.length - 1].tMs / 1000;
    expect(appends.length).toBeGreaterThan(seconds * 0.8);
    expect(appends.length).toBeLessThan(seconds * 1.5);
    expect(Math.max(...appends)).toBeLessThanOrEqual(20);
  });
});
