import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRecording,
  RecordingSequence,
  type AppEvent,
  type RawFrame,
  type Recording,
} from '../core/model';
import { encodeWeightFrame } from '../core/protocol';
import { freshIndexedDB } from '../storage/fake-idb';
import { openStorage, StorageError, type AppStorage } from '../storage';
import { MockTransport } from '../transport/mock';
import { ManualClock } from '../transport/scheduler';
import { FakeLocks } from './fake-locks';
import { Recorder } from './recorder';
import { recordingLockName } from './recording-locks';
import {
  RECENT_WITHOUT_LOCKS_MS,
  recoverUncleanRecordings,
  type RecoveryStorage,
} from './recovery';

const START = Date.UTC(2026, 9, 3, 7, 30);
const APP = { commit: 'abc1234', buildTime: '2026-10-03T07:00:00.000Z' };
const NO_PAGE = { onHidden: () => () => {} };

let storage: AppStorage;

beforeEach(async () => {
  freshIndexedDB();
  storage = await openStorage();
});

afterEach(() => {
  storage.close();
  vi.unstubAllGlobals();
});

/** Stores an open recording with a frame at each of `frames` and an event at each of `events`. */
async function openRecording(
  times: { readonly frames?: readonly number[]; readonly events?: readonly number[] } = {},
  startedAtEpochMs = START,
): Promise<Recording> {
  const recording = createRecording({
    startedAtEpochMs,
    device: { name: 'BOOKOO_SC', id: null },
    transport: 'mock',
    app: APP,
    userAgent: null,
  });
  await storage.recordings.create(recording);
  const sequence = new RecordingSequence(recording.id);
  const frames: RawFrame[] = [];
  const events: AppEvent[] = [];
  const records = [
    ...(times.frames ?? []).map((tMs) => ({ tMs, frame: true })),
    ...(times.events ?? []).map((tMs) => ({ tMs, frame: false })),
  ].sort((a, b) => a.tMs - b.tMs);
  for (const { tMs, frame } of records) {
    if (frame)
      frames.push(sequence.frame(tMs, 'ff11', encodeWeightFrame({ timerMs: 0, weightG: 1 })));
    else events.push(sequence.event(tMs, 'annotation', { label: 'note', text: null }));
  }
  if (records.length > 0) await storage.raw.append(recording.id, { frames, events });
  return recording;
}

/** `storage`, with `end` and `last` going through the given stand-ins first. */
function wrapped(overrides: {
  end?: RecoveryStorage['recordings']['end'];
  last?: RecoveryStorage['raw']['last'];
  listOpen?: RecoveryStorage['recordings']['listOpen'];
}): RecoveryStorage {
  return {
    recordings: {
      listOpen: overrides.listOpen ?? (() => storage.recordings.listOpen()),
      end: overrides.end ?? ((id, at, reason) => storage.recordings.end(id, at, reason)),
    },
    raw: { last: overrides.last ?? ((id) => storage.raw.last(id)) },
  };
}

/** A recorder on the mock, recording, whose tab will "crash": it never disconnects. */
async function recordingTab(locks: FakeLocks) {
  const clock = new ManualClock(0);
  const transport = new MockTransport({ scheduler: clock });
  const recorder = new Recorder({
    transport,
    storage,
    app: APP,
    userAgent: null,
    epochNow: () => START + clock.now(),
    timers: clock,
    locks,
    page: NO_PAGE,
  });
  const connecting = transport.connect();
  clock.advance(300);
  await connecting;
  for (let i = 0; i < 30; i++) {
    clock.advance(100);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  await recorder.flush();
  const id = recorder.state.recording!.id;
  return { clock, transport, recorder, id };
}

describe('recoverUncleanRecordings', () => {
  it('ends a recording left open by a crashed tab at its last record, adding nothing', async () => {
    const crashed = await recordingTab(new FakeLocks());
    const before = (await storage.raw.read(crashed.id))!;
    // The crashed tab's locks went with it: this tab's lock manager has none held.
    const result = await recoverUncleanRecordings(storage, { locks: new FakeLocks() });

    const lastTMs = Math.max(before.frames.at(-1)!.tMs, before.events.at(-1)!.tMs);
    const ended = {
      ...before.recording,
      endReason: 'unclean',
      endedAtEpochMs: START + 300 + lastTMs,
    };
    expect(result).toEqual({ ended: [ended], skipped: [], failed: [] });
    const after = (await storage.raw.read(crashed.id))!;
    expect(after).toEqual({ ...before, recording: ended });
    expect(after.events.at(-1)?.type).not.toBe('disconnected');
  });

  it('leaves alone a recording another tab is recording, which then ends it normally', async () => {
    const locks = new FakeLocks();
    const tab = await recordingTab(locks);
    const result = await recoverUncleanRecordings(storage, { locks });
    expect(result).toEqual({ ended: [], skipped: [tab.id], failed: [] });
    expect((await storage.recordings.get(tab.id))?.endReason).toBeNull();

    await tab.transport.disconnect();
    await tab.recorder.whenIdle();
    expect((await storage.recordings.get(tab.id))?.endReason).toBe('user');
  });

  it('ends each recording while holding its lock, and skips those another tab holds', async () => {
    const locks = new FakeLocks();
    const free = await openRecording({ frames: [100, 200], events: [0, 250] });
    const busy = await openRecording({ frames: [100] });
    const release = locks.hold(recordingLockName(busy.id));
    const heldWhileEnding: boolean[] = [];
    const result = await recoverUncleanRecordings(
      wrapped({
        end: (id, at, reason) => {
          heldWhileEnding.push(locks.isHeld(recordingLockName(id)));
          return storage.recordings.end(id, at, reason);
        },
      }),
      { locks },
    );
    expect(result.ended.map((r) => [r.id, r.endReason, r.endedAtEpochMs])).toEqual([
      [free.id, 'unclean', START + 250],
    ]);
    expect(result.skipped).toEqual([busy.id]);
    expect(heldWhileEnding).toEqual([true]);
    expect(locks.isHeld(recordingLockName(free.id))).toBe(false);
    expect(locks.requests.filter((r) => r.ifAvailable).map((r) => r.name)).toEqual([
      recordingLockName(free.id),
      recordingLockName(busy.id),
    ]);
    release();
  });

  it('ends a recording with no records at its start', async () => {
    const empty = await openRecording();
    const result = await recoverUncleanRecordings(storage, { locks: new FakeLocks() });
    expect(result.ended).toEqual([{ ...empty, endReason: 'unclean', endedAtEpochMs: START }]);
  });

  it('without Web Locks, ends only recordings that stored nothing in the last minute', async () => {
    const now = START + 1_000_000;
    const old = await openRecording({ frames: [100_000] });
    const recent = await openRecording({ events: [10_000] }, now - RECENT_WITHOUT_LOCKS_MS + 1);
    const justQuiet = await openRecording({ frames: [5000] }, now - RECENT_WITHOUT_LOCKS_MS - 5000);
    const result = await recoverUncleanRecordings(storage, { locks: null, epochNow: () => now });
    expect(result.ended.map((r) => [r.id, r.endedAtEpochMs])).toEqual([
      [old.id, START + 100_000],
      [justQuiet.id, now - RECENT_WITHOUT_LOCKS_MS],
    ]);
    expect(result.skipped).toEqual([recent.id]);
    expect((await storage.recordings.get(recent.id))?.endReason).toBeNull();
  });

  it('falls back to the rule without Web Locks where the browser has none', async () => {
    // Node has no navigator.locks, like a browser without Web Locks.
    const old = await openRecording({ frames: [100] }, Date.now() - 10 * 60_000);
    const live = await openRecording({ frames: [100] }, Date.now());
    const result = await recoverUncleanRecordings(storage);
    expect(result.ended.map((r) => r.id)).toEqual([old.id]);
    expect(result.skipped).toEqual([live.id]);
  });

  it("uses the browser's Web Locks by default", async () => {
    const locks = new FakeLocks();
    vi.stubGlobal('navigator', { locks });
    const recording = await openRecording({ frames: [100] }, Date.now());
    const result = await recoverUncleanRecordings(storage);
    expect(result.ended.map((r) => r.id)).toEqual([recording.id]);
    expect(locks.requests).toEqual([{ name: recordingLockName(recording.id), ifAvailable: true }]);
  });

  it('counts a recording another tab ended first as skipped', async () => {
    const recording = await openRecording({ frames: [100] });
    const result = await recoverUncleanRecordings(
      wrapped({ end: () => Promise.reject(new StorageError('already-ended', 'Ended already')) }),
      { locks: new FakeLocks() },
    );
    expect(result).toEqual({ ended: [], skipped: [recording.id], failed: [] });
  });

  it('reports a recording it could not end, and carries on with the rest', async () => {
    const broken = await openRecording({ frames: [100] });
    const fine = await openRecording({ frames: [100] });
    const error = new StorageError('failed', 'Reading: UnknownError');
    const result = await recoverUncleanRecordings(
      wrapped({
        last: (id) => (id === broken.id ? Promise.reject(error) : storage.raw.last(id)),
      }),
      { locks: new FakeLocks() },
    );
    expect(result.failed).toEqual([{ id: broken.id, error }]);
    expect(result.ended.map((r) => r.id)).toEqual([fine.id]);
    expect((await storage.recordings.get(broken.id))?.endReason).toBeNull();
  });

  it('does nothing when every recording has ended', async () => {
    const recording = await openRecording({ frames: [100] });
    await storage.recordings.end(recording.id, START + 100, 'user');
    expect(await recoverUncleanRecordings(storage, { locks: new FakeLocks() })).toEqual({
      ended: [],
      skipped: [],
      failed: [],
    });
  });

  it("fails when the open recordings can't be listed", async () => {
    const error = new StorageError('newer-version', 'Reload');
    await expect(
      recoverUncleanRecordings(wrapped({ listOpen: () => Promise.reject(error) })),
    ).rejects.toBe(error);
  });
});
