import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEvent, RawFrame } from '../core/model';
import type { Scenario } from '../core/sim';
import { decodeSoundFrame } from '../core/sound';
import { fakeMicrophone } from '../platform/fake-sound';
import { startSoundMeter } from '../platform/sound-meter';
import { freshIndexedDB } from '../storage/fake-idb';
import { openStorage, type AppStorage } from '../storage';
import { Emitter } from '../transport/emitter';
import { MockTransport } from '../transport/mock';
import { ManualClock } from '../transport/scheduler';
import { FakeLocks } from './fake-locks';
import { linkKey, ScaleLinks, type LinkSpec, type ScaleLinksOptions } from './links';
import type { PageLifecycle, PageVisibility, PageVisibilityState } from './page-lifecycle';

const APP = { commit: 'abc1234', buildTime: '2026-10-04T07:00:00.000Z' };

/** A cup on the scale, frames at about 10 Hz. */
const IDLE: Scenario = {
  seed: 3,
  durationMs: 600_000,
  script: [{ type: 'cup-on', atMs: 0, massG: 110 }],
  scale: { settleTauMs: 0 },
  link: { stallProbability: 0 },
};

let storage: AppStorage;
let clock: ManualClock;

beforeEach(async () => {
  freshIndexedDB();
  storage = await openStorage();
  clock = new ManualClock();
});

afterEach(() => {
  storage.close();
  vi.unstubAllGlobals();
});

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function run(ms: number, stepMs = 50): Promise<void> {
  const end = clock.now() + ms;
  while (clock.now() < end) {
    clock.advanceTo(Math.min(end, clock.now() + stepMs));
    await settle();
  }
}

class FakeVisibility implements PageVisibility, PageLifecycle {
  readonly #changes = new Emitter<PageVisibilityState>();

  onChange(listener: (state: PageVisibilityState) => void) {
    return this.#changes.on(listener);
  }

  onHidden(listener: () => void) {
    return this.#changes.on((state) => {
      if (state === 'hidden') listener();
    });
  }

  set(state: PageVisibilityState): void {
    this.#changes.emit(state);
  }
}

class FakeWakeLock {
  readonly calls: string[] = [];
  acquire(): void {
    this.calls.push('acquire');
  }
  release(): void {
    this.calls.push('release');
  }
}

function makeLinks(options: Partial<ScaleLinksOptions> = {}) {
  const page = new FakeVisibility();
  const wakeLock = new FakeWakeLock();
  const made: LinkSpec[] = [];
  const links = new ScaleLinks({
    storage,
    app: APP,
    userAgent: 'test agent',
    makeTransport: (spec) => {
      made.push(spec);
      const speed = spec.kind === 'mock' ? spec.speed : 1;
      return new MockTransport({ scenario: IDLE, scheduler: clock, speed });
    },
    recorder: { timers: clock, locks: new FakeLocks(), page, epochNow: () => 1_000_000 },
    visibility: page,
    wakeLock,
    ...options,
  });
  return { links, page, wakeLock, made };
}

describe('ScaleLinks', () => {
  it('makes one link per spec, on first use, and keeps it', () => {
    const { links, made } = makeLinks();
    const bluetooth = links.get({ kind: 'web-bluetooth' });
    expect(links.get({ kind: 'web-bluetooth' })).toBe(bluetooth);
    const slow = links.get({ kind: 'mock', speed: 1 });
    const fast = links.get({ kind: 'mock', speed: 10 });
    expect(new Set([bluetooth, slow, fast]).size).toBe(3);
    expect(links.get({ kind: 'mock', speed: 10 })).toBe(fast);
    expect(made).toEqual([
      { kind: 'web-bluetooth' },
      { kind: 'mock', speed: 1 },
      { kind: 'mock', speed: 10 },
    ]);
    expect(links.links.map((link) => link.key)).toEqual(['web-bluetooth', 'mock@1', 'mock@10']);
  });

  it('uses the real transports by default', () => {
    const links = new ScaleLinks({
      storage,
      app: APP,
      userAgent: null,
      visibility: new FakeVisibility(),
    });
    expect(links.get({ kind: 'web-bluetooth' }).transport.kind).toBe('web-bluetooth');
    expect(links.get({ kind: 'mock', speed: 5 }).transport.kind).toBe('mock');
    expect(() => links.get({ kind: 'mock', speed: 0 })).toThrow(RangeError);
  });

  it('names links by kind and speed', () => {
    expect(linkKey({ kind: 'web-bluetooth' })).toBe('web-bluetooth');
    expect(linkKey({ kind: 'mock', speed: 2.5 })).toBe('mock@2.5');
  });

  it('records each connection, and feeds the monitors the recording in progress', async () => {
    const { links } = makeLinks();
    const link = links.get({ kind: 'mock', speed: 1 });
    await Promise.all([link.transport.connect(), run(300)]);
    await run(2000);
    const recording = link.recorder.state.recording!;
    const snapshot = link.monitor.snapshot();
    expect(snapshot.recordingId).toBe(recording.id);
    // The live shot sees the cup that was on from the start as the platform's level.
    expect(link.shot.snapshot()).toMatchObject({ recordingId: recording.id, phase: 'idle' });
    expect(link.shot.snapshot().readingG).toBeCloseTo(110, 0);
    expect(snapshot.counts.ff11).toBe(link.recorder.state.stats!.frames);
    expect(snapshot.events.at(-1)?.type).toBe('connected');
    expect(snapshot.weightWindows[1].summary?.mean).toBeCloseTo(110, 0);

    await link.transport.disconnect();
    await link.recorder.whenIdle();
    expect((await storage.recordings.get(recording.id))?.endReason).toBe('user');
  });

  it('wants the wake lock while any link is connecting or connected', async () => {
    const { links, wakeLock } = makeLinks();
    const a = links.get({ kind: 'mock', speed: 1 });
    const b = links.get({ kind: 'mock', speed: 2 });
    await Promise.all([a.transport.connect(), b.transport.connect(), run(300)]);
    expect(wakeLock.calls).toEqual(['acquire', 'acquire', 'acquire', 'acquire']);
    expect(links.active).toBe(true);
    await a.transport.disconnect();
    expect(wakeLock.calls).not.toContain('release'); // b is still connected
    await b.transport.disconnect();
    expect(wakeLock.calls.at(-1)).toBe('release');
    expect(links.active).toBe(false);
    await links.flush();
  });

  it('releases the wake lock after a failed connect', async () => {
    const { links, wakeLock } = makeLinks();
    const link = links.get({ kind: 'mock', speed: 1 });
    const connecting = link.transport.connect();
    await link.transport.disconnect(); // cancels
    await expect(connecting).rejects.toThrow('Cancelled');
    expect(wakeLock.calls).toEqual(['acquire', 'release']);
  });

  it('logs the page being hidden and shown on the recording in progress, before the flush', async () => {
    const { links, page } = makeLinks();
    const idle = links.get({ kind: 'mock', speed: 2 }); // made, never connected
    const link = links.get({ kind: 'mock', speed: 1 });
    await Promise.all([link.transport.connect(), run(300)]);
    await run(500);
    const id = link.recorder.state.recording!.id;
    const logged: AppEvent[] = [];
    link.recorder.onEvent((event) => logged.push(event));
    page.set('hidden');
    // The recorder flushes on hidden; the event is in that flush, with no timer advanced.
    await settle();
    await settle();
    const stored = await storage.raw.read(id);
    expect(stored?.events.at(-1)).toMatchObject({
      type: 'ui-action',
      data: { action: 'page-hidden', detail: null },
    });
    page.set('visible');
    expect(logged.map((e) => (e.type === 'ui-action' ? e.data.action : e.type))).toEqual([
      'page-hidden',
      'page-visible',
    ]);
    expect(idle.recorder.state.recording).toBeNull();
    await link.transport.disconnect();
    await link.recorder.whenIdle();
  });

  it('says when the stored recordings change: a new one is stored, an ended one is ended', async () => {
    const { links } = makeLinks();
    const link = links.get({ kind: 'mock', speed: 1 });
    const seen: string[] = [];
    links.onRecordingsChanged(() => {
      void storage.recordings.list().then((list) => {
        seen.push(list.map((r) => r.endReason ?? 'open').join(','));
      });
    });
    await Promise.all([link.transport.connect(), run(300)]);
    await run(200);
    expect(seen).toEqual(['open']);
    await link.transport.disconnect();
    await link.recorder.whenIdle();
    await settle();
    await settle();
    expect(seen).toEqual(['open', 'user']);
  });

  it('records the microphone’s levels into each recording, beside the scale’s frames (T1.24)', async () => {
    const mic = fakeMicrophone();
    const { links } = makeLinks({
      startSoundMeter: ({ listener }) => startSoundMeter({ listener, ...mic, timers: clock }),
    });
    const link = links.get({ kind: 'mock', speed: 1 });
    // Turned on before Connect: one microphone request for every recording that follows.
    await links.sound.start();
    expect(links.sound.state.status).toBe('on');
    const ids: string[] = [];
    for (const [ms, stop] of [
      [2000, false],
      [1000, true],
    ] as const) {
      await Promise.all([link.transport.connect(), run(300)]);
      ids.push(link.recorder.recording!.id);
      await run(ms);
      if (stop) links.sound.stop();
      await run(500);
      await link.transport.disconnect();
      await link.recorder.whenIdle();
    }
    expect(mic.asked).toHaveLength(1);

    for (const [i, id] of ids.entries()) {
      const raw = (await storage.raw.read(id))!;
      const records = [...raw.frames, ...raw.events].sort((a, b) => a.seq - b.seq);
      // One sequence, in time order, the levels among the scale's frames.
      expect(records.map((record) => record.seq)).toEqual(records.map((_, seq) => seq));
      const times = records.map((record) => record.tMs);
      expect(times).toEqual([...times].sort((a, b) => a - b));
      const kind = (record: RawFrame | AppEvent) =>
        'source' in record ? record.source : record.type;
      const opening = records.slice(0, 4).map(kind);
      expect(opening).toEqual([
        'connected',
        'characteristic-properties',
        'characteristic-properties',
        'sound-started',
      ]);
      const levels = raw.frames.filter((frame) => frame.source === 'mic');
      const ff11 = raw.frames.filter((frame) => frame.source === 'ff11');
      const levelsMs = i === 0 ? 2500 : 1000;
      // About 20 a second, against the scale's 10.
      expect(Math.abs(levels.length - levelsMs / 50)).toBeLessThanOrEqual(1);
      expect(ff11.length).toBeGreaterThan(levelsMs / 110);
      const gaps = levels.slice(1).map((frame, k) => frame.tMs - levels[k].tMs);
      expect(new Set(gaps)).toEqual(new Set([50]));
      expect(decodeSoundFrame(levels[0].bytes)?.levelsDb[1]).toBe(-20); // 70-130 Hz
      const started = raw.events.find((event) => event.type === 'sound-started');
      expect(started?.data).toMatchObject({ continued: true, input: 'iPhone Microphone' });
      const stopped = raw.events.filter((event) => event.type === 'sound-stopped');
      if (i === 0) {
        expect(stopped).toEqual([]);
      } else {
        expect(stopped.map((event) => event.data)).toEqual([{ reason: 'user', message: null }]);
        expect(levels.every((frame) => frame.seq < stopped[0].seq)).toBe(true);
      }
    }
    expect(mic.track.stopped).toBe(1);
    expect(links.sound.state.status).toBe('off');
  });

  it('flushes every link', async () => {
    const { links } = makeLinks();
    const link = links.get({ kind: 'mock', speed: 1 });
    await Promise.all([link.transport.connect(), run(300)]);
    await run(300, 300); // frames arrive; the writer's 1 s batch timer hasn't fired
    expect(link.recorder.state.unsaved).toBeGreaterThan(0);
    await links.flush();
    expect(link.recorder.state.unsaved).toBe(0);
    await link.transport.disconnect();
    await link.recorder.whenIdle();
  });
});
