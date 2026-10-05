/**
 * The history (T1.19): which shots it lists and when they were pulled, the reanalysis once per
 * analysis version, the post-hoc shots of recordings that end, and the detail's grades, on
 * simulated recordings in a fake IndexedDB.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIdGenerator, createShot, SEEDS, type Id, type NewShot } from '../core/model';
import { demoScenario, espressoScenario, simulateSession, toRawRecording } from '../core/sim';
import type { Scenario } from '../core/sim';
import { freshIndexedDB } from '../storage/fake-idb';
import { openStorage, type AppStorage } from '../storage';
import { AnalysisRunner } from './analysis-runner';
import { resolveBrewSettings } from './brew-settings';
import { ANALYSED_VERSION_KEY, History, type HistoryOptions } from './history';

const NOW = Date.UTC(2026, 9, 5, 9);
let idMs = NOW;
const newId = createIdGenerator({ now: () => idMs++ });
/** 2026-10-04 07:00 and 2026-10-05 07:00 UTC: two mornings' recordings. */
const DAY1 = Date.UTC(2026, 9, 4, 7);
const DAY2 = Date.UTC(2026, 9, 5, 7);

let storage: AppStorage;

beforeEach(async () => {
  freshIndexedDB();
  storage = await openStorage();
});

afterEach(() => {
  storage.close();
});

/** Stores a simulated recording, ended unless `open`, and returns it. */
async function store(scenario: Scenario, startedAtEpochMs: number, open = false) {
  const raw = toRawRecording(simulateSession(scenario), {
    recordingId: newId(),
    startedAtEpochMs,
  });
  const recording = open
    ? { ...raw.recording, endedAtEpochMs: null, endReason: null }
    : raw.recording;
  await storage.raw.addRecording({ ...raw, recording });
  return recording;
}

function history(options: Partial<HistoryOptions> = {}) {
  const analysis = new AnalysisRunner({ storage, epochNow: () => NOW });
  return new History({
    storage,
    analysis,
    preferences: { value: resolveBrewSettings(SEEDS, {}) },
    epochNow: () => NOW,
    ...options,
  });
}

function shot(recordingId: Id, overrides: Partial<NewShot> & { anchorTMs: number }) {
  return createShot({ recordingId, source: 'live', ...overrides }, NOW);
}

/** A single espresso shot with its Tare + start tap at 7 s, as the brew flow records it. */
const ESPRESSO = espressoScenario({ seed: 4, manualStartMs: 7000 });

describe('History.load', () => {
  it('lists the post-hoc shots of ended recordings, newest first, timed from pump_on', async () => {
    const day1 = await store(demoScenario(1), DAY1);
    const day2 = await store(ESPRESSO, DAY2);
    const { entries, failures } = await history().load();
    expect(failures).toEqual([]);
    expect(entries.map((entry) => entry.recording.id)).toEqual([day2.id, day1.id, day1.id]);
    for (const entry of entries) {
      expect(entry.shot.source).toBe('post-hoc');
      expect(entry.segment).not.toBeNull();
      expect(entry.refusedFrames).toBe(false);
    }
    // The tapped shot is timed from its tap (pump_on); the demo's, without one, from the first
    // drip, the second shot first.
    const [espresso, second, first] = entries;
    const pumpOn = espresso.segment!.markers.pumpOn!.t;
    expect(espresso.atEpochMs).toBe(DAY2 + Math.round(pumpOn * 1000));
    expect(Math.abs(espresso.atEpochMs - (DAY2 + 7000))).toBeLessThan(500);
    expect(first.segment!.markers.pumpOn).toBeNull();
    expect(first.atEpochMs).toBe(DAY1 + Math.round(first.segment!.markers.firstDrip!.t * 1000));
    expect(second.atEpochMs).toBeGreaterThan(first.atEpochMs + 60_000);
  });

  it('hides discarded shots and untouched post-hoc shots without a segment', async () => {
    const recording = await store(ESPRESSO, DAY2);
    const h = history();
    const [postHoc] = (await h.load()).entries;
    // A shot past the end of the recording: no segment. Post-hoc and never edited, it holds
    // nothing the user entered; live, or edited, it stays, flagged.
    const lost = createShot(
      { recordingId: recording.id, anchorTMs: 150_000, source: 'post-hoc' },
      NOW,
    );
    const edited = createShot(
      { recordingId: recording.id, anchorTMs: 151_000, source: 'post-hoc' },
      NOW,
    );
    const live = shot(recording.id, { anchorTMs: 152_000, direction: 'sour' });
    for (const s of [lost, edited, live]) await storage.shots.create(s);
    await storage.shots.update(edited.id, { tags: ['WDT'] }, NOW + 1);
    await storage.shots.discard(postHoc.shot.id, NOW + 2);

    const { entries } = await h.load();
    expect(entries.map((entry) => entry.shot.id).sort()).toEqual([edited.id, live.id].sort());
    for (const entry of entries) {
      expect(entry.segment).toBeNull();
      expect(entry.match.unmatched).toBe('no-segment');
      // Timed from its anchor.
      expect(entry.atEpochMs).toBe(DAY2 + entry.shot.anchorTMs);
    }
  });

  it('lists an open recording’s live shot with its segment, and adds no post-hoc shot', async () => {
    const recording = await store(ESPRESSO, DAY2, true);
    const h = history();
    expect((await h.load()).entries).toEqual([]);
    // The brew flow stores the live shot at "shot done", inside its segment.
    const live = shot(recording.id, { anchorTMs: 40_000, doseG: 18, targetRatio: 2 });
    await storage.shots.create(live);
    const { entries } = await h.load();
    expect(entries.map((entry) => entry.shot.id)).toEqual([live.id]);
    expect(entries[0].segment?.espresso).toBe(true);
    expect(await storage.shots.listForRecording(recording.id)).toHaveLength(1);
  });

  it('reanalyses everything once per analysis version, and keeps the version locally', async () => {
    await store(demoScenario(2), DAY1);
    const analysis = new AnalysisRunner({ storage, epochNow: () => NOW });
    const reanalyse = vi.spyOn(analysis, 'reanalyzeAll');
    const first = history({ analysis, version: 41 });
    expect((await first.load()).entries).toHaveLength(2);
    await first.load();
    expect(reanalyse).toHaveBeenCalledTimes(1);
    expect(await storage.local.get(ANALYSED_VERSION_KEY)).toBe(41);
    // Another start of the app, on the same version: none; on a new one: once more.
    await history({ analysis, version: 41 }).load();
    expect(reanalyse).toHaveBeenCalledTimes(1);
    await history({ analysis, version: 42 }).load();
    expect(reanalyse).toHaveBeenCalledTimes(2);
    expect(await storage.local.get(ANALYSED_VERSION_KEY)).toBe(42);
  });

  it('runs one reanalysis for loads at once, and tries again after one fails', async () => {
    await store(demoScenario(2), DAY1);
    const analysis = new AnalysisRunner({ storage, epochNow: () => NOW });
    const reanalyse = vi
      .spyOn(analysis, 'reanalyzeAll')
      .mockRejectedValueOnce(new Error('disk full'));
    const h = history({ analysis });
    await expect(h.load()).rejects.toThrow('disk full');
    const [a, b] = await Promise.all([h.load(), h.load()]);
    expect(reanalyse).toHaveBeenCalledTimes(2);
    expect(a.entries).toHaveLength(2);
    expect(b.entries).toHaveLength(2);
  });

  it('reports a recording that can’t be analysed, and lists the rest', async () => {
    const good = await store(demoScenario(1), DAY1);
    const bad = await store(ESPRESSO, DAY2);
    const analysis = new AnalysisRunner({ storage, epochNow: () => NOW });
    const analyze = analysis.analyze.bind(analysis);
    vi.spyOn(analysis, 'analyze').mockImplementation((id) =>
      id === bad.id ? Promise.reject(new Error('malformed frame')) : analyze(id),
    );
    const { entries, failures } = await history({ analysis }).load();
    expect(failures).toEqual([{ recordingId: bad.id, error: 'malformed frame' }]);
    expect(entries.map((entry) => entry.recording.id)).toEqual([good.id, good.id]);
  });
});

describe('History.entry', () => {
  it('reads one shot with its segment, a discarded one too; null for an unknown id', async () => {
    await store(ESPRESSO, DAY2);
    const h = history();
    const [listed] = (await h.load()).entries;
    await storage.shots.discard(listed.shot.id, NOW + 1);
    const entry = await h.entry(listed.shot.id);
    expect(entry?.segment).toEqual(listed.segment);
    expect(entry?.shot.discardedAtEpochMs).toBe(NOW + 1);
    expect(await h.entry('01890000-0000-7000-8000-000000000000')).toBeNull();
  });
});

describe('History.recordingsChanged', () => {
  it('adds the post-hoc shots of a recording that ends while it runs, once', async () => {
    const older = await store(demoScenario(1), NOW - 3_600_000);
    const told = vi.fn();
    const analysis = new AnalysisRunner({ storage, epochNow: () => NOW });
    const analyze = vi.spyOn(analysis, 'analyze');
    const h = history({ analysis });
    h.onChange(told);
    // Ended an hour before the history was made: left to a load.
    await h.recordingsChanged();
    expect(analyze).not.toHaveBeenCalled();
    expect(await storage.shots.listForRecording(older.id)).toEqual([]);

    const ended = await store(ESPRESSO, NOW - 60_000);
    expect(ended.endedAtEpochMs).toBeGreaterThan(NOW);
    await Promise.all([h.recordingsChanged(), h.recordingsChanged()]);
    expect(analyze.mock.calls).toEqual([[ended.id]]);
    expect(await storage.shots.listForRecording(ended.id)).toHaveLength(1);
    expect(told).toHaveBeenCalledTimes(1);
  });
});

describe('History.editor', () => {
  it('stores the grades in order, in the list’s tag order, and tells of each', async () => {
    const recording = await store(ESPRESSO, DAY2);
    const exported = vi.fn();
    const changed = vi.fn();
    const h = history({ onShotsChanged: exported });
    h.onChange(changed);
    const live = shot(recording.id, { anchorTMs: 40_000, tags: ['Puck screen'] });
    await storage.shots.create(live);
    const editor = h.editor((await h.entry(live.id))!.shot);
    const seen = vi.fn();
    editor.onChange(seen);

    void editor.setTaste('sour');
    void editor.toggleTag('Experiment');
    void editor.toggleTag('WDT');
    void editor.setChannelled(true);
    void editor.setTaste(null);
    // Applied at once, stored behind.
    expect(editor.shot).toMatchObject({
      direction: null,
      channelled: true,
      tags: ['WDT', 'Puck screen', 'Experiment'],
    });
    expect(seen).toHaveBeenCalledTimes(5);
    await editor.whenStored();
    expect(await storage.shots.get(live.id)).toMatchObject({
      direction: null,
      channelled: true,
      tags: ['WDT', 'Puck screen', 'Experiment'],
    });
    expect(exported).toHaveBeenCalledTimes(5);
    expect(changed).toHaveBeenCalledTimes(5);
    expect(editor.storeError).toBeNull();

    await editor.toggleTag('puck screen');
    expect((await storage.shots.get(live.id))?.tags).toEqual(['WDT', 'Experiment']);
  });

  it('keeps a change that couldn’t be stored, says why, and clears it on the next', async () => {
    const recording = await store(ESPRESSO, DAY2);
    const live = shot(recording.id, { anchorTMs: 40_000 });
    await storage.shots.create(live);
    const update = vi.spyOn(storage.shots, 'update').mockRejectedValueOnce(new Error('quota'));
    const editor = history().editor(live);
    expect(await editor.setTaste('bitter')).toBe(false);
    expect(editor.shot.direction).toBe('bitter');
    expect(editor.storeError).toBe('quota');
    expect(await editor.setChannelled(false)).toBe(true);
    expect(editor.storeError).toBeNull();
    expect(update).toHaveBeenCalledTimes(2);
    expect((await storage.shots.get(live.id))?.channelled).toBe(false);
  });
});
