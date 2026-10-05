/**
 * The analysis runner (T1.14): the read-through derived cache, the version that invalidates it,
 * post-hoc shots for ended recordings, and `reanalyzeAll`, on simulated recordings in a fake
 * IndexedDB.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ANALYSIS_VERSION, analyzeRaw, parseRecordingAnalysis } from '../core/analysis';
import {
  createIdGenerator,
  createShot,
  SchemaError,
  type Id,
  type JsonValue,
  type NewShot,
} from '../core/model';
import { demoScenario, espressoScenario, simulateSession, toRawRecording } from '../core/sim';
import type { Scenario } from '../core/sim';
import { freshIndexedDB } from '../storage/fake-idb';
import { openStorage, StorageError, type AppStorage, type RawRecording } from '../storage';
import { AnalysisRunner, type AnalysisRunnerOptions } from './analysis-runner';

const NOW = Date.UTC(2026, 9, 5, 9);
let idMs = NOW;
const newId = createIdGenerator({ now: () => idMs++ });

let storage: AppStorage;

beforeEach(async () => {
  freshIndexedDB();
  storage = await openStorage();
});

afterEach(() => {
  storage.close();
});

/** Stores a simulated recording, ended unless `open`, and returns its id. */
async function store(scenario: Scenario, open = false): Promise<Id> {
  const raw = toRawRecording(simulateSession(scenario), { recordingId: newId() });
  const recording = open
    ? { ...raw.recording, endedAtEpochMs: null, endReason: null }
    : raw.recording;
  await storage.raw.addRecording({ ...raw, recording });
  return recording.id;
}

function runner(options: Partial<AnalysisRunnerOptions> = {}): AnalysisRunner {
  return new AnalysisRunner({ storage, epochNow: () => NOW, ...options });
}

function shot(recordingId: Id, overrides: Partial<NewShot> & { anchorTMs: number }) {
  return createShot({ recordingId, source: 'live', ...overrides }, NOW);
}

describe('AnalysisRunner.analyze', () => {
  it('analyses an ended recording, caches it and adds a post-hoc shot per espresso', async () => {
    const id = await store(demoScenario(1));
    const told: Id[] = [];
    const results = (await runner({
      onShotsCreated: (recordingId) => told.push(recordingId),
    }).analyze(id))!;
    expect(results.cached).toBe(false);
    expect(results.recording.id).toBe(id);
    expect(results.analysis.segments).toHaveLength(2);
    expect(results.created).toHaveLength(2);
    for (const created of results.created) {
      expect(created).toMatchObject({ recordingId: id, source: 'post-hoc', createdAtEpochMs: NOW });
    }
    expect(results.shots.map(({ shot: s, segment }) => [s.id, segment?.index])).toEqual(
      results.created.map((s, i) => [s.id, i]),
    );
    expect(results.unclaimed).toEqual([]);
    expect(told).toEqual([id]);

    const entry = await storage.derived.get(id, ANALYSIS_VERSION);
    expect(entry).toMatchObject({ analysisVersion: ANALYSIS_VERSION, computedAtEpochMs: NOW });
    expect(parseRecordingAnalysis(entry!.result)).toEqual(results.analysis);
    expect(await storage.shots.listForRecording(id)).toEqual(results.created);
  });

  it('reads it from the cache the next time, and adds nothing more', async () => {
    const id = await store(demoScenario(1));
    let told = 0;
    let computed = 0;
    const analyse = runner({
      onShotsCreated: () => told++,
      analyze: (raw) => {
        computed++;
        return analyzeRaw(raw).analysis;
      },
    });
    const first = (await analyse.analyze(id))!;
    const second = (await analyse.analyze(id))!;
    expect(second.cached).toBe(true);
    expect(second.analysis).toEqual(first.analysis);
    expect(second.created).toEqual([]);
    expect(second.shots).toEqual(first.shots);
    expect([computed, told]).toEqual([1, 1]);
  });

  it('computes again once the version is bumped, and keeps the shots it made', async () => {
    const id = await store(espressoScenario({ seed: 1 }));
    const first = (await runner().analyze(id))!;
    const bumpedVersion = ANALYSIS_VERSION + 1;
    let computed = 0;
    const bumped = runner({
      epochNow: () => NOW + 1,
      version: bumpedVersion,
      analyze: (raw) => {
        computed++;
        return { ...analyzeRaw(raw).analysis, analysisVersion: bumpedVersion };
      },
    });
    const results = (await bumped.analyze(id))!;
    expect(results.cached).toBe(false);
    expect(computed).toBe(1);
    expect((await storage.derived.get(id, bumpedVersion))?.computedAtEpochMs).toBe(NOW + 1);
    // The post-hoc shot the first version made still claims its segment.
    expect(results.created).toEqual([]);
    expect(results.shots.map(({ shot: s }) => s)).toEqual(first.created);
    expect(results.shots[0].segment?.index).toBe(0);
    expect((await bumped.analyze(id))!.cached).toBe(true);
    expect(computed).toBe(1);
  });

  it("computes again over an entry that doesn't check out, and replaces it", async () => {
    const id = await store(espressoScenario({ seed: 1 }));
    const expected = analyzeRaw((await storage.raw.read(id))!).analysis;
    // JSON of the wrong shape, another version's result, a field of the wrong type, and a
    // result from other parameters: a default changed without a version bump.
    const planted = [
      { nonsense: true },
      { ...expected, analysisVersion: ANALYSIS_VERSION + 7 },
      { ...expected, segments: [{ ...expected.segments[0], espresso: 'yes' }] },
      {
        ...expected,
        params: { ...expected.params, liquid: { ...expected.params.liquid, sgWindowS: 0.6 } },
      },
    ].map((result) => JSON.parse(JSON.stringify(result)) as JsonValue);
    for (const result of planted) {
      await storage.derived.put({
        recordingId: id,
        analysisVersion: ANALYSIS_VERSION,
        computedAtEpochMs: 1,
        result,
      });
      const results = (await runner().analyze(id))!;
      expect(results.cached).toBe(false);
      expect(results.analysis).toEqual(expected);
      const entry = await storage.derived.get(id, ANALYSIS_VERSION);
      expect(parseRecordingAnalysis(entry!.result)).toEqual(expected);
    }
  });

  it('analyses an open recording as it stands, without caching it or adding shots', async () => {
    const id = await store(espressoScenario({ seed: 1 }), true);
    const results = (await runner().analyze(id))!;
    expect(results.cached).toBe(false);
    expect(results.analysis.segments).toHaveLength(1);
    expect(results.created).toEqual([]);
    expect(results.unclaimed).toEqual(results.analysis.segments);
    expect(await storage.derived.get(id, ANALYSIS_VERSION)).toBeNull();
    expect(await storage.shots.listForRecording(id)).toEqual([]);
  });

  it("matches the user's shots, with their ratios, and adds post-hoc shots only for the rest", async () => {
    const id = await store(demoScenario(1));
    // "Shot done" 5 s after the first shot's pump stopped (38 s).
    const live = shot(id, { anchorTMs: 43_000, doseG: 18 });
    await storage.shots.create(live);
    const results = (await runner().analyze(id))!;
    expect(results.created).toHaveLength(1);
    const own = results.shots.find((result) => result.shot.id === live.id)!;
    expect(own.segment?.index).toBe(0);
    expect(own.match.ratio).toBeCloseTo(own.segment!.metrics.yieldG! / 18, 12);
    const made = results.shots.find((result) => result.shot.id === results.created[0].id)!;
    expect(made.segment?.index).toBe(1);
  });

  it('flags a shot that matches no segment, and keeps it', async () => {
    const id = await store(espressoScenario({ seed: 1 }));
    // Long after the cup came off (65 s) and the recording ended (70 s).
    const stray = shot(id, { anchorTMs: 200_000, source: 'manual' });
    await storage.shots.create(stray);
    const results = (await runner().analyze(id))!;
    const flagged = results.shots.find((result) => result.shot.id === stray.id)!;
    expect(flagged.segment).toBeNull();
    expect(flagged.match.unmatched).toBe('no-segment');
    expect(results.created).toHaveLength(1);
    expect(await storage.shots.get(stray.id)).toEqual(stray);
  });

  it('lets a discarded shot keep its segment, so none comes back (D-019)', async () => {
    const id = await store(espressoScenario({ seed: 1 }));
    const deleted = shot(id, { anchorTMs: 20_000, discardedAtEpochMs: NOW });
    await storage.shots.create(deleted);
    const results = (await runner().analyze(id))!;
    expect(results.created).toEqual([]);
    expect(results.shots).toHaveLength(1);
    expect(results.shots[0].segment?.index).toBe(0);
  });

  it('adds one post-hoc shot when two analyses of a recording run at once', async () => {
    const id = await store(espressoScenario({ seed: 1 }));
    const [a, b] = await Promise.all([runner().analyze(id), runner().analyze(id)]);
    expect(a!.created.length + b!.created.length).toBe(1);
    expect(await storage.shots.listForRecording(id)).toHaveLength(1);
  });

  it('fails loudly on an analysis that JSON would lose, and caches nothing', async () => {
    const id = await store(espressoScenario({ seed: 1 }));
    const broken = runner({
      analyze: (raw) => ({ ...analyzeRaw(raw).analysis, toleranceG: Number.NaN }),
    });
    await expect(broken.analyze(id)).rejects.toThrow(SchemaError);
    expect(await storage.derived.get(id, ANALYSIS_VERSION)).toBeNull();
    expect(await storage.shots.listForRecording(id)).toEqual([]);
  });

  it("returns null for a recording that isn't stored", async () => {
    expect(await runner().analyze(newId())).toBeNull();
  });

  it("still answers when the cache can't be written", async () => {
    const id = await store(espressoScenario({ seed: 1 }));
    const failing = new AnalysisRunner({
      storage: {
        ...storage,
        derived: {
          ...storage.derived,
          put: () => Promise.reject(new StorageError('quota', 'The disk is full')),
        },
      },
      epochNow: () => NOW,
    });
    const results = (await failing.analyze(id))!;
    expect(results.analysis.segments).toHaveLength(1);
    expect(results.created).toHaveLength(1);
    expect(await storage.derived.get(id, ANALYSIS_VERSION)).toBeNull();
  });
});

describe('AnalysisRunner.reanalyzeAll', () => {
  it('clears the cache and analyses every ended recording, the same each time', async () => {
    const demo = await store(demoScenario(1));
    const single = await store(espressoScenario({ seed: 2 }));
    const open = await store(espressoScenario({ seed: 3 }), true);
    // An old version's entry, which the clearing removes.
    await storage.derived.put({
      recordingId: demo,
      analysisVersion: ANALYSIS_VERSION - 1,
      computedAtEpochMs: 1,
      result: null,
    });
    const analyse = runner();
    const first = await analyse.reanalyzeAll();
    expect(first).toEqual({ analysed: 2, open: 1, created: 3, unmatched: 0, failures: [] });
    expect(await storage.derived.get(demo, ANALYSIS_VERSION - 1)).toBeNull();
    expect(await storage.derived.get(open, ANALYSIS_VERSION)).toBeNull();
    const shots = await storage.shots.list();
    const results = async () =>
      Promise.all(
        [demo, single].map(async (id) => (await storage.derived.get(id, ANALYSIS_VERSION))!.result),
      );
    const cached = await results();

    const second = await analyse.reanalyzeAll();
    expect(second).toEqual({ analysed: 2, open: 1, created: 0, unmatched: 0, failures: [] });
    expect(await storage.shots.list()).toEqual(shots);
    expect(await results()).toEqual(cached);
  });

  it('reports a recording that fails, and carries on with the rest', async () => {
    const good = await store(espressoScenario({ seed: 2 }));
    const bad = await store(espressoScenario({ seed: 3 }));
    const analyse = runner({
      analyze: (raw: RawRecording) => {
        if (raw.recording.id === bad) throw new RangeError('analysis: something broke');
        return analyzeRaw(raw).analysis;
      },
    });
    const summary = await analyse.reanalyzeAll();
    expect(summary).toEqual({
      analysed: 1,
      open: 0,
      created: 1,
      unmatched: 0,
      failures: [{ recordingId: bad, error: 'analysis: something broke' }],
    });
    expect(await storage.shots.listForRecording(good)).toHaveLength(1);
    expect(await storage.shots.listForRecording(bad)).toEqual([]);
  });
});
