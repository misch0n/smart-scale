import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  commandEventData,
  createRecording,
  endRecording,
  normaliseRawFrame,
  RecordingSequence,
  SchemaError,
  type AppEvent,
  type RawFrame,
  type Recording,
} from '../core/model';
import { encodeWeightFrame, tareAndStartTimer } from '../core/protocol';
import { freshIndexedDB, openDirect } from './fake-idb';
import { openStorage, StorageError, type AppStorage, type RawRecording } from './index';

const REC = '01923456-789a-7000-8000-000000000001';
const OTHER = '01923456-789a-7000-8000-000000000002';
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

function weightBytes(i: number): Uint8Array<ArrayBuffer> {
  return encodeWeightFrame({ timerMs: i * 100, weightG: i / 10, flowGps: 0.5 });
}

/** Builds a recording's records the way the recorder does: one sequence for both. */
class Timeline {
  readonly sequence: RecordingSequence;
  readonly frames: RawFrame[] = [];
  readonly events: AppEvent[] = [];
  #tMs = 0;

  constructor(recordingId = REC) {
    this.sequence = new RecordingSequence(recordingId);
  }

  addFrames(count: number): RawFrame[] {
    const made: RawFrame[] = [];
    for (let i = 0; i < count; i++) {
      this.#tMs += 100;
      made.push(this.sequence.frame(this.#tMs, 'ff11', weightBytes(this.frames.length)));
      this.frames.push(made[made.length - 1]);
    }
    return made;
  }

  event(label = 'note'): AppEvent {
    const event = this.sequence.event(this.#tMs, 'annotation', { label, text: null });
    this.events.push(event);
    return event;
  }
}

function seqsOf(raw: RawRecording): number[] {
  return [...raw.frames, ...raw.events].map((r) => r.seq).sort((a, b) => a - b);
}

let storage: AppStorage;

beforeEach(async () => {
  freshIndexedDB();
  storage = await openStorage({ framesPerChunk: 4 });
  await storage.recordings.create(newRecording());
});

afterEach(() => {
  storage.close();
});

describe('raw', () => {
  it('reads back what was appended, in seq order, across chunk boundaries', async () => {
    const t = new Timeline();
    const connected = t.sequence.event(0, 'connected', {
      deviceName: 'BOOKOO_MINI',
      deviceId: null,
    });
    t.events.push(connected);
    await storage.raw.append(REC, { frames: [], events: [connected] });
    // Batches of 3, 1, 9 and 6 frames at 4 per chunk, with events between them.
    await storage.raw.append(REC, { frames: t.addFrames(3), events: [t.event()] });
    const one = t.addFrames(1);
    await storage.raw.append(REC, { frames: one, events: [] });
    const nine = t.addFrames(9);
    const mid = t.event('pump-on');
    const more = t.addFrames(6);
    await storage.raw.append(REC, { frames: [...nine, ...more], events: [mid] });

    const raw = await storage.raw.read(REC);
    expect(raw).not.toBeNull();
    expect(raw!.recording).toEqual(newRecording());
    expect(raw!.frames).toEqual(t.frames);
    expect(raw!.events).toEqual(t.events);
    // One counter for frames and events, no gaps, no repeats.
    expect(seqsOf(raw!)).toEqual(Array.from({ length: t.sequence.used }, (_, i) => i));
    expect(raw!.frames.map((f) => [...f.bytes])).toEqual(t.frames.map((f) => [...f.bytes]));
  });

  it('splits a batch across chunks when a chunk fills mid-batch', async () => {
    const t = new Timeline();
    await storage.raw.append(REC, { frames: t.addFrames(10), events: [] });
    await storage.raw.append(REC, { frames: t.addFrames(3), events: [] });

    const db = await openDirect();
    const chunks = (await db.getAll('frameChunks')) as {
      firstSeq: number;
      frames: { seq: number }[];
    }[];
    db.close();
    // Each chunk is written once: a new append starts a new chunk.
    expect(chunks.map((c) => c.frames.map((f) => f.seq))).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [8, 9],
      [10, 11, 12],
    ]);
    expect(chunks.map((c) => c.firstSeq)).toEqual([0, 4, 8, 10]);
    expect((await storage.raw.read(REC))!.frames).toEqual(t.frames);
  });

  it('stores a chunk without repeating the recording id in every frame', async () => {
    const t = new Timeline();
    await storage.raw.append(REC, { frames: t.addFrames(2), events: [] });
    const db = await openDirect();
    const [chunk] = (await db.getAll('frameChunks')) as Record<string, unknown>[];
    db.close();
    expect(Object.keys(chunk)).toEqual(['recordingId', 'firstSeq', 'frames']);
    expect(Object.keys((chunk.frames as object[])[0])).toEqual(['seq', 'tMs', 'source', 'bytes']);
  });

  it('keeps every frame verbatim, however damaged', async () => {
    const good = weightBytes(1);
    const badChecksum = good.slice();
    badChecksum[19] ^= 0xff;
    const sequence = new RecordingSequence(REC);
    const frames = [
      sequence.frame(10, 'ff11', good),
      sequence.frame(20, 'ff11', badChecksum),
      sequence.frame(30, 'ff11', good.subarray(0, 7)), // truncated
      sequence.frame(40, 'ff11', new Uint8Array(0)), // empty
      sequence.frame(50, 'ff12', Uint8Array.of(0x03, 0x0d, 0x01)), // unknown header, on FF12
    ];
    await storage.raw.append(REC, { frames, events: [] });
    const read = (await storage.raw.read(REC))!.frames;
    expect(read).toEqual(frames);
    expect(read.map((f) => f.bytes.length)).toEqual([20, 20, 7, 0, 3]);
    expect(read[1].bytes[19]).toBe(badChecksum[19]);
  });

  it("stores only the frame's own bytes when they are a view into a larger buffer", async () => {
    const buffer = new Uint8Array(4096);
    buffer.set(weightBytes(3), 100);
    const view = normaliseRawFrame({
      recordingId: REC,
      seq: 0,
      tMs: 1,
      source: 'ff11',
      bytes: buffer.subarray(100, 120),
    });
    await storage.raw.append(REC, { frames: [view], events: [] });
    const [frame] = (await storage.raw.read(REC))!.frames;
    expect([...frame.bytes]).toEqual([...weightBytes(3)]);
    expect(frame.bytes.buffer.byteLength).toBe(20);
  });

  it('stores events with their data, and normalises them on the way out', async () => {
    const sequence = new RecordingSequence(REC);
    const command = sequence.event(5, 'command-sent', commandEventData(tareAndStartTimer(), null));
    const action = sequence.event(6, 'ui-action', { action: 'manual-start', detail: { n: [1] } });
    await storage.raw.append(REC, { frames: [], events: [command, action] });
    expect((await storage.raw.read(REC))!.events).toEqual([command, action]);

    // An older build's annotation without `text`: it reads back as null.
    const db = await openDirect();
    await db.put('events', {
      recordingId: REC,
      seq: 2,
      tMs: 7,
      type: 'annotation',
      data: { label: 'cup-on' },
    });
    db.close();
    const [, , annotation] = (await storage.raw.read(REC))!.events;
    expect(annotation).toEqual({
      recordingId: REC,
      seq: 2,
      tMs: 7,
      type: 'annotation',
      data: { label: 'cup-on', text: null },
    });
  });

  it('keeps recordings apart', async () => {
    await storage.recordings.create(newRecording(OTHER));
    const mine = new Timeline(REC);
    const theirs = new Timeline(OTHER);
    await storage.raw.append(OTHER, { frames: theirs.addFrames(5), events: [theirs.event()] });
    await storage.raw.append(REC, { frames: mine.addFrames(6), events: [mine.event()] });
    await storage.raw.append(OTHER, { frames: theirs.addFrames(2), events: [] });

    expect((await storage.raw.read(REC))!.frames).toEqual(mine.frames);
    expect((await storage.raw.read(OTHER))!.frames).toEqual(theirs.frames);
    expect((await storage.raw.read(OTHER))!.events).toEqual(theirs.events);
  });

  it('allows a gap in seq, which records a loss', async () => {
    const sequence = new RecordingSequence(REC);
    const kept = sequence.frame(1, 'ff11', weightBytes(0));
    sequence.frame(2, 'ff11', weightBytes(1)); // made, then lost before it was stored
    const after = sequence.frame(3, 'ff11', weightBytes(2));
    await storage.raw.append(REC, { frames: [kept], events: [] });
    await storage.raw.append(REC, { frames: [after], events: [] });
    expect((await storage.raw.read(REC))!.frames.map((f) => f.seq)).toEqual([0, 2]);
  });

  it('does nothing for an empty batch', async () => {
    await storage.raw.append(REC, { frames: [], events: [] });
    expect(await storage.raw.read(REC)).toEqual({
      recording: newRecording(),
      frames: [],
      events: [],
    });
  });

  it("returns null for a recording that isn't stored", async () => {
    expect(await storage.raw.read(OTHER)).toBeNull();
  });

  describe('refuses', () => {
    async function expectNothingStored(): Promise<void> {
      const raw = (await storage.raw.read(REC))!;
      expect(raw.frames).toEqual([]);
      expect(raw.events).toEqual([]);
    }

    it("records of a recording that isn't stored", async () => {
      const t = new Timeline(OTHER);
      const append = storage.raw.append(OTHER, { frames: t.addFrames(2), events: [] });
      await expect(append).rejects.toThrow(StorageError);
      await expect(append).rejects.toMatchObject({ code: 'not-found' });
      const db = await openDirect();
      expect(await db.count('frameChunks')).toBe(0);
      db.close();
    });

    it("records that don't come after what is stored, frames and events alike", async () => {
      const t = new Timeline();
      const first = t.addFrames(3); // seqs 0–2
      const event = t.event(); // seq 3
      await storage.raw.append(REC, { frames: first, events: [event] });

      const sequence = new RecordingSequence(REC); // a second counter: a bug
      const replay = [sequence.frame(1, 'ff11', weightBytes(0))];
      await expect(storage.raw.append(REC, { frames: replay, events: [] })).rejects.toMatchObject({
        code: 'out-of-order',
      });
      // Seq 3 is an event's: a frame can't take it.
      const clash = normaliseRawFrame({ ...first[0], seq: 3, tMs: 999 });
      await expect(storage.raw.append(REC, { frames: [clash], events: [] })).rejects.toMatchObject({
        code: 'out-of-order',
      });
      expect((await storage.raw.read(REC))!.frames).toEqual(first);
    });

    it('a batch out of seq order, or with a seq used twice', async () => {
      const t = new Timeline();
      const [a, b] = t.addFrames(2);
      await expect(storage.raw.append(REC, { frames: [b, a], events: [] })).rejects.toThrow(
        RangeError,
      );
      const event = { ...t.event(), seq: a.seq } as AppEvent;
      await expect(storage.raw.append(REC, { frames: [a, b], events: [event] })).rejects.toThrow(
        /both have seq 0/,
      );
      await expectNothingStored();
    });

    it("a batch holding another recording's records", async () => {
      const mine = new Timeline(REC).addFrames(1);
      const theirs = new Timeline(OTHER).addFrames(1);
      const append = storage.raw.append(REC, { frames: [...mine, ...theirs], events: [] });
      await expect(append).rejects.toThrow(TypeError);
      await expectNothingStored();
    });

    it('a malformed record', async () => {
      const [frame] = new Timeline().addFrames(1);
      const bad = { ...frame, tMs: Number.NaN };
      await expect(storage.raw.append(REC, { frames: [bad], events: [] })).rejects.toThrow(
        SchemaError,
      );
      await expectNothingStored();
    });

    it("all of a batch when any of it can't be stored", async () => {
      // A chunk already stored under the key the batch's frames need. It holds no frames, so
      // the order check passes and IndexedDB itself refuses the write.
      const db = await openDirect();
      await db.put('frameChunks', { recordingId: REC, firstSeq: 1, frames: [] });
      db.close();
      const t = new Timeline();
      const event = t.event(); // seq 0
      const append = storage.raw.append(REC, { frames: t.addFrames(2), events: [event] });
      await expect(append).rejects.toMatchObject({ code: 'exists' });
      expect((await storage.raw.read(REC))!.events).toEqual([]);
    });
  });

  it('fails loudly on a malformed stored frame, naming where it is', async () => {
    const db = await openDirect();
    await db.put('frameChunks', {
      recordingId: REC,
      firstSeq: 0,
      frames: [{ seq: 0, tMs: 1, source: 'ff13', bytes: new Uint8Array(20) }],
    });
    db.close();
    await expect(storage.raw.read(REC)).rejects.toThrow(SchemaError);
    await expect(storage.raw.read(REC)).rejects.toThrow(/frameChunks\[0\]\.frames\[0\]\.source/);
  });

  describe('addRecording', () => {
    /** An ended recording of OTHER: an event, 10 frames, an event, 3 frames. */
    function whole(): RawRecording & { timeline: Timeline } {
      const t = new Timeline(OTHER);
      t.events.push(t.sequence.event(0, 'connected', { deviceName: null, deviceId: null }));
      t.addFrames(10);
      t.event('pump-on');
      t.addFrames(3);
      const recording = endRecording(newRecording(OTHER), START + 5000, 'user');
      return { recording, frames: t.frames, events: t.events, timeline: t };
    }

    async function storedChunks(): Promise<number[][]> {
      const db = await openDirect();
      const chunks = (await db.getAll('frameChunks')) as { frames: { seq: number }[] }[];
      db.close();
      return chunks.map((chunk) => chunk.frames.map((frame) => frame.seq));
    }

    it('stores the recording and every record at once, and reads them back as they were', async () => {
      const { recording, frames, events } = whole();
      await storage.raw.addRecording({ recording, frames, events });
      expect(await storage.raw.read(OTHER)).toEqual({ recording, frames, events });
      expect(await storage.recordings.get(OTHER)).toEqual(recording);
      // 13 frames at 4 per chunk.
      expect((await storedChunks()).map((seqs) => seqs.length)).toEqual([4, 4, 4, 1]);
    });

    it('stores an open recording, and one without records', async () => {
      const open = newRecording(OTHER);
      await storage.raw.addRecording({ recording: open, frames: [], events: [] });
      expect(await storage.raw.read(OTHER)).toEqual({ recording: open, frames: [], events: [] });
      expect(await storage.recordings.listOpen()).toEqual([newRecording(), open]);
    });

    it('refuses a recording that is stored, and changes nothing (raw is never replaced)', async () => {
      const first = whole();
      await storage.raw.addRecording(first);
      const longer = whole();
      longer.timeline.addFrames(5);
      const again = storage.raw.addRecording({ ...longer, frames: longer.timeline.frames });
      await expect(again).rejects.toThrow(StorageError);
      await expect(again).rejects.toMatchObject({ code: 'exists' });
      expect((await storage.raw.read(OTHER))!.frames).toEqual(first.frames);

      // The open, empty recording from beforeEach stays open and empty.
      const ended = endRecording(newRecording(), START + 1, 'user');
      const frames = new Timeline(REC).addFrames(2);
      await expect(
        storage.raw.addRecording({ recording: ended, frames, events: [] }),
      ).rejects.toMatchObject({ code: 'exists' });
      expect(await storage.raw.read(REC)).toEqual({
        recording: newRecording(),
        frames: [],
        events: [],
      });
    });

    it('lets an open recording grow by append afterwards, seq still only growing', async () => {
      const t = new Timeline(OTHER);
      const open = newRecording(OTHER);
      await storage.raw.addRecording({ recording: open, frames: t.addFrames(3), events: [] });
      await storage.raw.append(OTHER, { frames: t.addFrames(2), events: [] });
      expect((await storage.raw.read(OTHER))!.frames).toEqual(t.frames);
      const stale = normaliseRawFrame({ ...t.frames[0], tMs: 1 });
      await expect(
        storage.raw.append(OTHER, { frames: [stale], events: [] }),
      ).rejects.toMatchObject({ code: 'out-of-order' });
    });

    it('checks the records before storing anything', async () => {
      const { recording, frames, events } = whole();
      const cases = [
        { frames: [frames[1], frames[0]], events: [] },
        { frames, events: [{ ...events[1], seq: frames[0].seq } as AppEvent] },
        { frames: new Timeline(REC).addFrames(1), events: [] },
        { frames: [{ ...frames[0], tMs: Number.NaN }], events: [] },
      ];
      const errors = [RangeError, RangeError, TypeError, SchemaError];
      for (let i = 0; i < cases.length; i++) {
        await expect(storage.raw.addRecording({ recording, ...cases[i] })).rejects.toThrow(
          errors[i],
        );
      }
      await expect(
        storage.raw.addRecording({
          recording: { ...recording, id: 'nope' },
          frames: [],
          events: [],
        }),
      ).rejects.toThrow(SchemaError);
      expect(await storage.recordings.get(OTHER)).toBeNull();
      expect(await storedChunks()).toEqual([]);
    });

    it("stores nothing, not even the recording, when any record can't be stored", async () => {
      // A chunk already stored under the key of the import's first chunk (seq 1; the
      // connected event is seq 0). The checks pass, and IndexedDB refuses the write.
      const db = await openDirect();
      await db.put('frameChunks', { recordingId: OTHER, firstSeq: 1, frames: [] });
      db.close();
      const add = storage.raw.addRecording(whole());
      await expect(add).rejects.toMatchObject({ code: 'exists' });
      expect(await storage.recordings.get(OTHER)).toBeNull();
      const after = await openDirect();
      expect(await after.count('events')).toBe(0);
      expect(await after.count('frameChunks')).toBe(1);
      after.close();
    });
  });

  describe('last', () => {
    it('returns the last frame and the last event stored', async () => {
      const t = new Timeline();
      await storage.raw.append(REC, { frames: t.addFrames(6), events: [t.event()] });
      await storage.raw.append(REC, { frames: t.addFrames(5), events: [] });
      expect(await storage.raw.last(REC)).toEqual({
        frame: t.frames[t.frames.length - 1],
        event: t.events[0],
      });
    });

    it('returns nulls where nothing is stored', async () => {
      expect(await storage.raw.last(REC)).toEqual({ frame: null, event: null });
      expect(await storage.raw.last(OTHER)).toEqual({ frame: null, event: null });
    });
  });
});
