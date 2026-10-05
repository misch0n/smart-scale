/**
 * Export from storage and import into storage (T1.7, T2.1): what a file holds, the round trip
 * through a second database, and the merge rules (raw skipped when stored, open recordings ended
 * as unclean, metadata kept or replaced, an untouched seed replaced).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseExport, type ExportBundle, type ExportedRecording } from '../core/export';
import {
  SAMPLE_APP,
  SAMPLE_IDS,
  SAMPLE_START,
  sampleBundle,
  sampleEntities,
  sampleRecordingA,
  sampleRecordingB,
  sampleSettings,
  sampleShots,
} from '../core/export/test-samples';
import {
  byId,
  createEntity,
  emptyEntityLists,
  ENTITY_KINDS,
  epochMsAt,
  SEED_IDS,
  SEEDS,
  updateEntity,
  type EntityLists,
  type Shot,
} from '../core/model';
import { espressoScenario } from '../core/sim';
import { freshIndexedDB } from '../storage/fake-idb';
import { openStorage, StorageError, type AppStorage } from '../storage';
import { MockTransport } from '../transport/mock';
import { ManualClock } from '../transport/scheduler';
import {
  exportAll,
  exportRecording,
  importBundle,
  jsonEqual,
  type ExportOptions,
  type ImportStorage,
} from './export';
import { FakeLocks } from './fake-locks';
import { Recorder } from './recorder';
import { recoverUncleanRecordings } from './recovery';

const NOW = SAMPLE_START + 3 * 86_400_000;
/** Central European Summer Time: local time is UTC + 2 h. */
const OPTIONS: ExportOptions = { app: SAMPLE_APP, epochNow: () => NOW, timeZoneOffset: () => -120 };

let storage: AppStorage;
let other: AppStorage;

beforeEach(async () => {
  freshIndexedDB();
  storage = await openStorage({ name: 'here', framesPerChunk: 64 });
  other = await openStorage({ name: 'elsewhere' });
});

afterEach(() => {
  storage.close();
  other.close();
});

/** Stores the sample bundle as it would be on the phone: recordings, shots, entities, settings. */
async function storeSamples(target: AppStorage = storage): Promise<void> {
  for (const entry of sampleBundle().recordings) await target.raw.addRecording(entry);
  for (const shot of sampleShots()) await target.shots.create(shot);
  await storeEntities(target, sampleEntities());
  for (const [key, value] of Object.entries(sampleSettings())) await target.kv.set(key, value);
}

/** Stores the entities, each in place of a stored one with its id (a seed, say). */
async function storeEntities(target: AppStorage, entities: EntityLists): Promise<void> {
  for (const kind of ENTITY_KINDS) {
    for (const entity of entities[kind]) {
      if ((await target.entities.get(kind, entity.id)) === null) {
        await target.entities.create(kind, entity);
      } else {
        await target.entities.replace(kind, entity);
      }
    }
  }
}

/** The seeds with `entities` among them: what a new database holds once they are stored. */
function withSeeds(entities: EntityLists): EntityLists {
  const merged = (kind: (typeof ENTITY_KINDS)[number]) => {
    const ids = new Set(entities[kind].map((entity) => entity.id));
    return [...SEEDS[kind].filter((seed) => !ids.has(seed.id)), ...entities[kind]].sort(byId);
  };
  return {
    machines: merged('machines') as EntityLists['machines'],
    grinders: merged('grinders') as EntityLists['grinders'],
    recipes: merged('recipes') as EntityLists['recipes'],
    packs: merged('packs') as EntityLists['packs'],
    containers: merged('containers') as EntityLists['containers'],
    tags: merged('tags') as EntityLists['tags'],
  };
}

/** How many entities of every kind. */
function countOf(entities: EntityLists): number {
  return ENTITY_KINDS.reduce((sum, kind) => sum + entities[kind].length, 0);
}

function bundleWith(overrides: Partial<ExportBundle>): ExportBundle {
  return { ...sampleBundle(), ...overrides };
}

describe('exportRecording', () => {
  it("holds the recording's raw records and its shots, and no entities or settings", async () => {
    await storeSamples();
    const file = await exportRecording(storage, SAMPLE_IDS.recordingA, OPTIONS);
    const { bundle } = parseExport(file.text);
    const a = sampleRecordingA();
    expect(bundle.recordings).toEqual([a]);
    expect(bundle.shots).toEqual(
      sampleShots().filter((shot) => shot.recordingId === SAMPLE_IDS.recordingA),
    );
    expect(bundle.shots.some((shot) => shot.discardedAtEpochMs !== null)).toBe(true);
    expect(bundle.entities).toBeNull();
    expect(bundle.settings).toBeNull();
    expect(bundle.exportedAtEpochMs).toBe(NOW);
    expect(bundle.app).toEqual(SAMPLE_APP);
    expect(file.summary).toEqual({
      recordings: 1,
      frames: a.frames.length,
      events: a.events.length,
      shots: 2,
      entities: null,
      settings: null,
    });
  });

  it('names the file by the local start time and the short id', async () => {
    await storeSamples();
    const file = await exportRecording(storage, SAMPLE_IDS.recordingA, OPTIONS);
    // SAMPLE_START is 06:30:05 UTC, 08:30:05 in CEST.
    expect(file.fileName).toBe('smart-scale_2026-10-04_083005_000000a1.json');
    const offsets: number[] = [];
    await exportRecording(storage, SAMPLE_IDS.recordingA, {
      ...OPTIONS,
      timeZoneOffset: (epochMs) => (offsets.push(epochMs), 0),
    });
    expect(offsets).toEqual([SAMPLE_START]);
  });

  it("refuses a recording that isn't stored", async () => {
    const exporting = exportRecording(storage, SAMPLE_IDS.recordingC, OPTIONS);
    await expect(exporting).rejects.toThrow(StorageError);
    await expect(exporting).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('exportAll', () => {
  it('holds every recording, every shot, every entity and every setting', async () => {
    await storeSamples();
    const file = await exportAll(storage, OPTIONS);
    const { bundle } = parseExport(file.text);
    const entities = withSeeds(sampleEntities());
    expect(bundle).toEqual({ ...sampleBundle(), exportedAtEpochMs: NOW, entities });
    expect(bundle.entities!.grinders.some((g) => g.removedAtEpochMs !== null)).toBe(true);
    expect(file.fileName).toBe('smart-scale_2026-10-07_083005_all.json');
    expect(file.summary.recordings).toBe(2);
    expect(file.summary.shots).toBe(4);
    expect(file.summary.entities).toBe(countOf(entities));
    expect(file.summary.settings).toBe(Object.keys(sampleSettings()).length);
  });

  it('exports an empty history as a valid file with the seeds', async () => {
    const file = await exportAll(storage, OPTIONS);
    expect(parseExport(file.text).bundle).toEqual({
      exportedAtEpochMs: NOW,
      app: SAMPLE_APP,
      recordings: [],
      shots: [],
      entities: SEEDS,
      settings: {},
    });
  });
});

describe('a round trip through another database', () => {
  it('stores in the other database exactly what this one holds', async () => {
    const ended = sampleRecordingA();
    await storage.raw.addRecording(ended);
    for (const shot of sampleShots()) await storage.shots.create(shot);
    await storeEntities(storage, sampleEntities());
    // A seed edited here: the other database's untouched one takes it.
    await storage.entities.update('recipes', SEED_IDS.lungo, { coffeeRatio: 2.5 }, NOW);
    for (const [key, value] of Object.entries(sampleSettings())) await storage.kv.set(key, value);

    const file = await exportAll(storage, OPTIONS);
    const report = await importBundle(other, parseExport(file.text).bundle);
    expect(report.recordings).toEqual([
      { id: ended.recording.id, outcome: 'imported', endedUnclean: false, recordsNotImported: 0 },
    ]);

    expect(await other.raw.read(ended.recording.id)).toEqual(ended);
    expect(await other.shots.list()).toEqual(await storage.shots.list());
    expect(await other.entities.all()).toEqual(await storage.entities.all());
    expect((await other.entities.get('recipes', SEED_IDS.lungo))!.coffeeRatio).toBe(2.5);
    expect(await other.kv.entries()).toEqual(await storage.kv.entries());
    // And so the other database exports the same file.
    expect((await exportAll(other, OPTIONS)).text).toBe(file.text);
  });

  it('carries a recording the recorder made, byte for byte', async () => {
    const clock = new ManualClock(5000);
    const scenario = espressoScenario({
      link: { corruptProbability: 0.03, truncateProbability: 0.02 },
    });
    const mock = new MockTransport({ scenario, scheduler: clock });
    const recorder = new Recorder({
      transport: mock,
      storage,
      app: SAMPLE_APP,
      userAgent: 'test',
      epochNow: () => SAMPLE_START + clock.now(),
      timers: clock,
      locks: new FakeLocks(),
      page: { onHidden: () => () => {} },
    });
    const connecting = mock.connect();
    for (let t = 0; t < scenario.durationMs; t += 250) {
      clock.advance(250);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await connecting;
    const id = recorder.state.recording!.id;
    recorder.annotate('pump-on');
    await mock.disconnect();
    await recorder.whenIdle();

    const stored = (await storage.raw.read(id))!;
    expect(stored.frames.length).toBeGreaterThan(500);
    expect(stored.recording.endReason).toBe('user');
    const file = await exportRecording(storage, id, OPTIONS);
    await importBundle(other, parseExport(file.text).bundle);
    expect(await other.raw.read(id)).toEqual(stored);
  });
});

describe('importBundle', () => {
  it('is idempotent: importing the same file again changes nothing', async () => {
    const bundle = sampleBundle();
    await importBundle(storage, bundle);
    const before = (await exportAll(storage, OPTIONS)).text;

    const again = await importBundle(storage, bundle);
    expect(again.recordings.map((r) => [r.outcome, r.recordsNotImported])).toEqual([
      ['skipped', 0],
      ['skipped', 0],
    ]);
    expect(again.shots).toMatchObject({ added: 0, unchanged: 4, kept: 0, replaced: 0 });
    expect(again.entities).toEqual({
      added: 0,
      unchanged: countOf(sampleEntities()),
      kept: 0,
      replaced: 0,
      conflicts: [],
    });
    expect(again.settings).toEqual({
      added: 0,
      unchanged: Object.keys(sampleSettings()).length,
      kept: 0,
      replaced: 0,
    });
    expect((await exportAll(storage, OPTIONS)).text).toBe(before);
  });

  it('stores an open recording ended as unclean at its last record, as recovery would', async () => {
    const b = sampleRecordingB();
    expect(b.recording.endedAtEpochMs).toBeNull();
    const report = await importBundle(storage, bundleWith({ recordings: [b], shots: [] }));
    expect(report.recordings).toEqual([
      { id: b.recording.id, outcome: 'imported', endedUnclean: true, recordsNotImported: 0 },
    ]);
    const lastTMs = Math.max(b.frames.at(-1)!.tMs, b.events.at(-1)!.tMs);
    const stored = (await storage.recordings.get(b.recording.id))!;
    expect(stored).toEqual({
      ...b.recording,
      endedAtEpochMs: epochMsAt(b.recording, lastTMs),
      endReason: 'unclean',
    });
    expect((await storage.raw.read(b.recording.id))!.frames).toEqual(b.frames);
    // Nothing is left open for startup recovery to find.
    expect(await storage.recordings.listOpen()).toEqual([]);
    expect((await recoverUncleanRecordings(storage, { locks: new FakeLocks() })).ended).toEqual([]);
  });

  it('ends an open recording without records at its start', async () => {
    const b = sampleRecordingB();
    const empty: ExportedRecording = { recording: b.recording, frames: [], events: [] };
    await importBundle(storage, bundleWith({ recordings: [empty], shots: [] }));
    expect((await storage.recordings.get(b.recording.id))!.endedAtEpochMs).toBe(
      b.recording.startedAtEpochMs,
    );
  });

  it('never replaces stored raw, and reports what a longer copy holds that it lacks', async () => {
    const b = sampleRecordingB();
    // A snapshot taken while recording: the first 10 frames.
    const snapshot = { ...b, frames: b.frames.slice(0, 10) };
    await importBundle(storage, bundleWith({ recordings: [snapshot], shots: [] }));
    const report = await importBundle(storage, bundleWith({ recordings: [b], shots: [] }));
    expect(report.recordings).toEqual([
      {
        id: b.recording.id,
        outcome: 'skipped',
        endedUnclean: false,
        recordsNotImported: b.frames.length - 10,
      },
    ]);
    expect((await storage.raw.read(b.recording.id))!.frames).toEqual(snapshot.frames);
  });

  it('leaves a stored recording open, even when the file has more of it', async () => {
    const open = sampleRecordingB();
    await storage.raw.addRecording({ ...open, frames: open.frames.slice(0, 5) });
    const report = await importBundle(storage, bundleWith({ recordings: [open], shots: [] }));
    expect(report.recordings[0].outcome).toBe('skipped');
    expect((await storage.recordings.get(open.recording.id))!.endedAtEpochMs).toBeNull();
  });

  describe('shots', () => {
    async function storedShot(change: Partial<Shot>): Promise<Shot> {
      const original = sampleShots()[0];
      const edited = { ...original, ...change };
      await storage.shots.create(edited);
      return edited;
    }

    it('adds new shots, and keeps a stored one that differs by default', async () => {
      const mine = await storedShot({ direction: 'bitter', updatedAtEpochMs: NOW });
      const report = await importBundle(storage, sampleBundle());
      expect(report.shots).toEqual({
        added: 3,
        unchanged: 0,
        kept: 1,
        replaced: 0,
        conflicts: [],
        withoutRecording: 1,
      });
      expect(await storage.shots.get(mine.id)).toEqual(mine);
    });

    it('replaces a stored shot that differs when asked to', async () => {
      const mine = await storedShot({ direction: 'bitter', tags: null, updatedAtEpochMs: NOW });
      const report = await importBundle(storage, sampleBundle(), { metadata: 'replace' });
      expect(report.shots).toMatchObject({ added: 3, kept: 0, replaced: 1, conflicts: [] });
      expect(await storage.shots.get(mine.id)).toEqual(sampleShots()[0]);
    });

    it('never replaces a stored shot with another identity (D-019)', async () => {
      const mine = await storedShot({ anchorTMs: 1, direction: 'bitter' });
      for (const metadata of ['keep', 'replace'] as const) {
        const report = await importBundle(storage, sampleBundle(), { metadata });
        expect(report.shots.conflicts).toEqual([mine.id]);
        expect(report.shots.kept + report.shots.replaced).toBe(0);
      }
      expect(await storage.shots.get(mine.id)).toEqual(mine);
    });

    it('imports a shot whose recording is nowhere, and counts it', async () => {
      const report = await importBundle(storage, sampleBundle());
      expect(report.shots.withoutRecording).toBe(1);
      expect(await storage.shots.get(SAMPLE_IDS.shotOnC)).toEqual(sampleShots()[3]);

      // Once that recording is stored, the shot has one.
      const c = sampleRecordingA();
      const recordingC = { ...c.recording, id: SAMPLE_IDS.recordingC };
      await storage.raw.addRecording({ recording: recordingC, frames: [], events: [] });
      const again = await importBundle(storage, sampleBundle());
      expect(again.shots.withoutRecording).toBe(0);
    });
  });

  describe('entities', () => {
    const noRaw = { recordings: [], shots: [], settings: null };

    it('adds new entities, keeps a stored one that differs by default, and replaces it when asked', async () => {
      const guji = sampleEntities().packs[0];
      const mine = { ...guji, openDate: '2026-09-27', updatedAtEpochMs: NOW };
      await storage.entities.create('packs', mine);
      const file = bundleWith(noRaw);

      const keep = await importBundle(storage, file);
      // Every sample entity but the Espresso seed, which is stored already and equal.
      const total = countOf(sampleEntities());
      expect(keep.entities).toEqual({
        added: total - 2,
        unchanged: 1,
        kept: 1,
        replaced: 0,
        conflicts: [],
      });
      expect(await storage.entities.get('packs', guji.id)).toEqual(mine);

      const replace = await importBundle(storage, file, { metadata: 'replace' });
      expect(replace.entities).toMatchObject({ added: 0, unchanged: total - 1, replaced: 1 });
      expect(await storage.entities.get('packs', guji.id)).toEqual(guji);
    });

    it('lets a seed nobody changed here take the file’s version, whatever the policy', async () => {
      // A restore onto a new database: its seeds are as seeded, the file's were edited.
      const espresso = updateEntity('recipes', SEEDS.recipes[1], { coffeeRatio: 2.2 }, NOW);
      const removedRdt = updateEntity('tags', SEEDS.tags[2], { removedAtEpochMs: NOW }, NOW);
      const entities = { ...emptyEntityLists(), recipes: [espresso], tags: [removedRdt] };
      const report = await importBundle(storage, bundleWith({ ...noRaw, entities }));
      expect(report.entities).toMatchObject({ kept: 0, replaced: 2 });
      expect(await storage.entities.get('recipes', espresso.id)).toEqual(espresso);
      expect(await storage.entities.get('tags', removedRdt.id)).toEqual(removedRdt);

      // Once changed here, a seed is the user's: kept, unless asked.
      const pristine = { ...emptyEntityLists(), recipes: [SEEDS.recipes[1]] };
      const back = await importBundle(storage, bundleWith({ ...noRaw, entities: pristine }));
      expect(back.entities).toMatchObject({ kept: 1, replaced: 0 });
      expect(await storage.entities.get('recipes', espresso.id)).toEqual(espresso);
    });

    it('never replaces a stored entity with another identity', async () => {
      const at = NOW - 1000;
      const mine = createEntity(
        'containers',
        { name: 'Cup', emptyMassG: 112.6, roles: ['cup'], dismissedWarningIds: [] },
        at,
      );
      await storage.entities.create('containers', mine);
      const theirs = { ...mine, name: 'Espresso cup', createdAtEpochMs: at - 1 };
      const entities = { ...emptyEntityLists(), containers: [theirs] };
      for (const metadata of ['keep', 'replace'] as const) {
        const report = await importBundle(storage, bundleWith({ ...noRaw, entities }), {
          metadata,
        });
        expect(report.entities.conflicts).toEqual([{ kind: 'containers', id: mine.id }]);
        expect(report.entities.kept + report.entities.replaced).toBe(0);
      }
      expect(await storage.entities.get('containers', mine.id)).toEqual(mine);
    });

    it('imports nothing from a file without entities', async () => {
      const report = await importBundle(storage, bundleWith({ entities: null }), {
        metadata: 'replace',
      });
      expect(report.entities).toEqual({
        added: 0,
        unchanged: 0,
        kept: 0,
        replaced: 0,
        conflicts: [],
      });
      expect(await storage.entities.all()).toEqual(SEEDS);
    });
  });

  describe('settings', () => {
    it('adds new settings, keeps differing ones by default, and replaces them when asked', async () => {
      await storage.kv.set('last.doseG', 17);
      // Equal JSON with its keys in another order counts as unchanged.
      await storage.kv.set('capture.fields', {
        order: ['dose', 'ratio'],
        tags: false,
        direction: true,
      });
      const keep = await importBundle(storage, bundleWith({ recordings: [], shots: [] }));
      const total = Object.keys(sampleSettings()).length;
      expect(keep.settings).toEqual({ added: total - 2, unchanged: 1, kept: 1, replaced: 0 });
      expect(await storage.kv.get('last.doseG')).toBe(17);

      const replace = await importBundle(storage, bundleWith({ recordings: [], shots: [] }), {
        metadata: 'replace',
      });
      expect(replace.settings).toEqual({ added: 0, unchanged: total - 1, kept: 0, replaced: 1 });
      expect(await storage.kv.get('last.doseG')).toBe(18.2);
    });

    it('imports nothing from a file without settings', async () => {
      await storage.kv.set('last.doseG', 17);
      const report = await importBundle(storage, bundleWith({ settings: null }), {
        metadata: 'replace',
      });
      expect(report.settings).toEqual({ added: 0, unchanged: 0, kept: 0, replaced: 0 });
      expect(await storage.kv.entries()).toEqual([['last.doseG', 17]]);
    });
  });

  it('can run again after a failure, and finishes the job', async () => {
    let adds = 0;
    const failing: ImportStorage = {
      ...storage,
      raw: {
        last: (id) => storage.raw.last(id),
        addRecording: async (raw) => {
          // The first recording goes in; the second fails, and the import stops there.
          if (++adds === 2) throw new StorageError('quota', 'Adding recording: QuotaExceeded');
          await storage.raw.addRecording(raw);
        },
      },
    };
    const bundle = sampleBundle();
    await expect(importBundle(failing, bundle)).rejects.toMatchObject({ code: 'quota' });
    expect(await storage.recordings.get(SAMPLE_IDS.recordingA)).not.toBeNull();
    expect(await storage.recordings.get(SAMPLE_IDS.recordingB)).toBeNull();
    expect(await storage.shots.list()).toEqual([]);

    const retry = await importBundle(storage, bundle);
    expect(retry.recordings.map((r) => r.outcome)).toEqual(['skipped', 'imported']);
    expect(retry.shots.added).toBe(4);
    expect((await exportAll(storage, OPTIONS)).text).toBe(
      (await exportAll(await withSamples(other), OPTIONS)).text,
    );
  });
});

/** The database with the sample bundle imported into it. */
async function withSamples(target: AppStorage): Promise<AppStorage> {
  await importBundle(target, sampleBundle());
  return target;
}

describe('jsonEqual', () => {
  it('compares JSON values deeply, ignoring object key order', () => {
    expect(jsonEqual({ a: 1, b: [1, { c: null }] }, { b: [1, { c: null }], a: 1 })).toBe(true);
    expect(jsonEqual([1, 2], [2, 1])).toBe(false);
    expect(jsonEqual({ a: null }, {})).toBe(false);
    expect(jsonEqual({}, { a: null })).toBe(false);
    expect(jsonEqual({ a: 1 }, { b: 1 })).toBe(false);
    expect(jsonEqual([], {})).toBe(false);
    expect(jsonEqual({}, [])).toBe(false);
    expect(jsonEqual(null, {})).toBe(false);
    expect(jsonEqual('1', 1)).toBe(false);
    expect(jsonEqual([1, [2]], [1, [2, 3]])).toBe(false);
    expect(jsonEqual(0, 0)).toBe(true);
  });
});
