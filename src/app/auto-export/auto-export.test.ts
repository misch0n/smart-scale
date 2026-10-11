/**
 * Automatic export (T1.20) against a fake GitHub, on virtual time: what is uploaded and when,
 * updates in place, compare before writing, retries and stops, the entities' file (T2.1), and
 * that the token goes nowhere but the Authorization header.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseExport, serialiseExport } from '../../core/export';
import { SAMPLE_APP } from '../../core/export/test-samples';
import {
  createEntity,
  createRecording,
  createShot,
  endRecording,
  RecordingSequence,
  SEED_EPOCH_MS,
  SEED_IDS,
  SEEDS,
  updateEntity,
  type CoffeePack,
  type Id,
  type TransportKind,
} from '../../core/model';
import { freshIndexedDB } from '../../storage/fake-idb';
import { openStorage, type AppStorage } from '../../storage';
import { ManualClock } from '../../transport/scheduler';
import { exportAll, exportEntities, exportRecording } from '../export';
import {
  AutoExport,
  RETRY_DELAYS_MS,
  SHOTS_DEBOUNCE_MS,
  type AutoExportOptions,
} from './auto-export';
import { FakeGitHub, json } from './fake-github';
import { GitHubSink } from './github';
import { ENTITIES_LEDGER_KEY, LEDGER_PREFIX } from './ledger';
import { chooseShot, SETTINGS_CHANGED_KEY } from './pull';
import { SettingsError, type SettingsDraft } from './settings';

const BASE = Date.UTC(2026, 9, 4, 8, 0, 0);
const ID1 = '019a1b2c-3d4e-7000-8000-0000000000d1';
const ID2 = '019a1b2c-3d4e-7000-8000-0000000000d2';
const ID3 = '019a1b2c-3d4e-7000-8000-0000000000d3';
/** Recording ID1's path: it starts at BASE, 10:00:00 in Central European Summer Time. */
const PATH1 = 'recordings/2026/10/smart-scale_2026-10-04_100000_000000d1.json';
/** The entities' file (T2.1). */
const ENTITIES_PATH = 'recordings/entities.json';

let clock: ManualClock;
let storage: AppStorage;
let github: FakeGitHub;
let auto: AutoExport;
let online: (() => void)[];
let visibility: ((state: 'visible' | 'hidden') => void)[];

const now = (): number => BASE + clock.now();

function makeAutoExport(options: Partial<AutoExportOptions> = {}): AutoExport {
  return new AutoExport({
    storage,
    app: SAMPLE_APP,
    makeSink: (settings) =>
      new GitHubSink({
        owner: settings.owner,
        repo: settings.repo,
        branch: settings.branch,
        token: settings.token,
        fetch: github.fetch,
        timers: clock,
        epochNow: now,
      }),
    timers: clock,
    epochNow: now,
    timeZoneOffset: () => -120,
    onOnline: (listener) => {
      online.push(listener);
      return () => {};
    },
    visibility: {
      onChange: (listener) => {
        visibility.push(listener);
        return () => {};
      },
    },
    writeIntervalMs: 0,
    ...options,
  });
}

function draft(overrides: Partial<SettingsDraft> = {}): SettingsDraft {
  return {
    owner: github.owner,
    repo: github.repo,
    branch: '',
    pathPrefix: 'recordings/',
    token: github.token,
    ...overrides,
  };
}

async function configure(overrides: Partial<SettingsDraft> = {}): Promise<void> {
  await auto.save(draft(overrides));
  await auto.whenIdle();
}

/** A small recording: connected, three frames. Open unless ended. */
function rawRecording(id: Id, startedAtEpochMs: number, transport: TransportKind) {
  const sequence = new RecordingSequence(id);
  const events = [sequence.event(0, 'connected', { deviceName: 'BOOKOO_MINI', deviceId: 'dev' })];
  const frames = [1, 2, 3].map((i) => sequence.frame(100 * i, 'ff11', new Uint8Array([3, 11, i])));
  const recording = createRecording({
    id,
    startedAtEpochMs,
    device: { name: 'BOOKOO_MINI', id: 'dev' },
    transport,
    app: SAMPLE_APP,
    userAgent: 'test',
  });
  return { recording, frames, events };
}

async function storeClosed(
  id: Id,
  startedAtEpochMs = BASE,
  transport: TransportKind = 'web-bluetooth',
): Promise<void> {
  const raw = rawRecording(id, startedAtEpochMs, transport);
  const recording = endRecording(raw.recording, startedAtEpochMs + 1000, 'user');
  await storage.raw.addRecording({ ...raw, recording });
}

/** Stores an open recording, as the recorder does; `end` ends it. */
async function storeOpen(id: Id, startedAtEpochMs = BASE) {
  const raw = rawRecording(id, startedAtEpochMs, 'web-bluetooth');
  await storage.recordings.create(raw.recording);
  await storage.raw.append(id, { frames: raw.frames, events: raw.events });
  return {
    end: () => storage.recordings.end(id, startedAtEpochMs + 1000, 'device'),
  };
}

async function addShot(recordingId: Id, id: Id): Promise<void> {
  await storage.shots.create(
    createShot({ id, recordingId, anchorTMs: 200, source: 'live', doseG: 18 }, now()),
  );
}

/** Moves virtual time on, then waits for the passes it started. */
async function advance(ms: number): Promise<void> {
  clock.advance(ms);
  await auto.whenIdle();
}

beforeEach(async () => {
  freshIndexedDB();
  storage = await openStorage();
  clock = new ManualClock();
  github = new FakeGitHub();
  online = [];
  visibility = [];
  auto = makeAutoExport();
  await auto.start();
  await auto.whenIdle();
});

afterEach(() => {
  auto.dispose();
  storage.close();
});

describe('without settings', () => {
  it('is off, and nothing calls the network', async () => {
    await storeClosed(ID1);
    auto.recordingsChanged();
    auto.shotsChanged();
    await advance(SHOTS_DEBOUNCE_MS);
    online.forEach((listener) => listener());
    await auto.whenIdle();
    expect(auto.status.state).toBe('off');
    expect(auto.status.pending).toBeNull();
    expect(auto.settings).toBeNull();
    expect(github.requests).toEqual([]);
  });

  it('is off again once the token is removed', async () => {
    await configure();
    await auto.save(draft({ token: null }));
    await auto.whenIdle();
    expect(auto.status.state).toBe('off');
    expect(auto.settings?.tokenSet).toBe(false);
    const requests = github.requests.length;
    await storeClosed(ID1);
    auto.recordingsChanged();
    await auto.whenIdle();
    expect(github.requests).toHaveLength(requests);
  });
});

describe('what is uploaded, and when', () => {
  it('uploads a recording once, when it ends, and never while open', async () => {
    await configure();
    const open = await storeOpen(ID1);
    auto.recordingsChanged(); // connected: the recording is stored, still open
    await auto.whenIdle();
    expect(github.writes).toEqual([]);
    expect(auto.status).toMatchObject({ state: 'idle', pending: 0 });

    await open.end();
    auto.recordingsChanged();
    await auto.whenIdle();
    expect(github.commits).toEqual([
      { branch: 'main', path: PATH1, message: 'Add smart-scale_2026-10-04_100000_000000d1.json' },
    ]);
    const uploaded = parseExport(github.file(PATH1) ?? '').bundle;
    const stored = await exportRecording(storage, ID1, { app: SAMPLE_APP });
    expect(uploaded.recordings).toEqual(stored.bundle.recordings);
    expect(uploaded.recordings[0].recording.endReason).toBe('device');
    expect(auto.status).toMatchObject({
      state: 'idle',
      pending: 0,
      lastExportEpochMs: now(),
      lastError: null,
    });

    const requests = github.requests.length;
    auto.recordingsChanged();
    await auto.whenIdle();
    expect(github.requests).toHaveLength(requests); // unchanged: skipped without a request
  });

  it("uploads at startup what isn't uploaded yet, oldest first, but not the simulator's", async () => {
    await storage.local.set('autoExport.settings', {
      owner: github.owner,
      repo: github.repo,
      branch: null,
      pathPrefix: 'backup/',
      token: github.token,
    });
    await storeClosed(ID2, BASE + 60_000);
    await storeClosed(ID1, BASE);
    await storeClosed(ID3, BASE + 120_000, 'mock');
    auto.dispose();
    auto = makeAutoExport();
    await auto.start();
    await auto.whenIdle();
    expect(github.paths()).toEqual([
      'backup/2026/10/smart-scale_2026-10-04_100000_000000d1.json',
      'backup/2026/10/smart-scale_2026-10-04_100100_000000d2.json',
    ]);
    expect(auto.status).toMatchObject({ state: 'idle', pending: 0 });
  });

  it('checks the repo before uploading, and needs nothing when nothing waits', async () => {
    await configure();
    // Saved: the repo is checked and read back (T3.21); empty, it holds nothing to pull.
    expect(github.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /repos/someone/smart-scale-data',
      'GET /repos/someone/smart-scale-data',
      'GET /repos/someone/smart-scale-data/git/trees/main',
    ]);
    github.requests.length = 0;
    auto.recordingsChanged();
    await auto.whenIdle();
    expect(github.requests).toEqual([]); // nothing to upload, no pull due: no request at all
    await storeClosed(ID1);
    auto.recordingsChanged();
    await auto.whenIdle();
    // A new file is created without a sha, which GitHub refuses if one is there: no read first.
    expect(github.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /repos/someone/smart-scale-data',
      `PUT /repos/someone/smart-scale-data/contents/${PATH1}`,
    ]);
    expect(github.writes[0].body).not.toHaveProperty('sha');
  });

  it('updates the file in place when its shots change, debounced', async () => {
    await configure();
    await storeClosed(ID1);
    await addShot(ID1, '019a1b2c-3d4e-7000-9000-0000000000e1');
    auto.recordingsChanged();
    await auto.whenIdle();
    const first = github.writes.length;

    await storage.shots.update(
      '019a1b2c-3d4e-7000-9000-0000000000e1',
      { direction: 'sour' },
      now(),
    );
    auto.shotsChanged();
    await advance(SHOTS_DEBOUNCE_MS / 2);
    await storage.shots.update('019a1b2c-3d4e-7000-9000-0000000000e1', { tags: ['wdt'] }, now());
    auto.shotsChanged();
    await advance(SHOTS_DEBOUNCE_MS / 2);
    expect(github.writes).toHaveLength(first); // still settling
    await advance(SHOTS_DEBOUNCE_MS / 2);
    expect(github.writes).toHaveLength(first + 1);
    const put = github.writes.at(-1);
    expect(put?.body).toMatchObject({ sha: expect.any(String) as unknown });
    expect(github.commits.at(-1)?.message).toBe(
      'Update smart-scale_2026-10-04_100000_000000d1.json',
    );
    const shot = parseExport(github.file(PATH1) ?? '').bundle.shots[0];
    expect(shot).toMatchObject({ direction: 'sour', tags: ['wdt'] });

    // A shot changed and changed back makes no upload.
    auto.shotsChanged();
    await advance(SHOTS_DEBOUNCE_MS);
    expect(github.writes).toHaveLength(first + 1);
  });

  it('keeps the path a recording was first uploaded to', async () => {
    await configure();
    await storeClosed(ID1);
    auto.recordingsChanged();
    await auto.whenIdle();
    await addShot(ID1, '019a1b2c-3d4e-7000-9000-0000000000e1');
    auto.dispose();
    // The phone has moved to New York: new names would say 04:00.
    auto = makeAutoExport({ timeZoneOffset: () => 240 });
    await auto.start();
    await auto.whenIdle();
    expect(github.paths()).toEqual([PATH1]);
    expect(github.writes.at(-1)?.path).toContain(PATH1);
  });

  it('uploads everything again, comparing first, when the destination changes', async () => {
    await configure();
    await storeClosed(ID1);
    auto.recordingsChanged();
    await auto.whenIdle();
    await configure({ pathPrefix: 'elsewhere' });
    expect(github.paths()).toEqual([
      'elsewhere/2026/10/smart-scale_2026-10-04_100000_000000d1.json',
      PATH1,
    ]);
    // Back to the first folder: its file is found equal, and isn't written again.
    const commits = github.commits.length;
    await configure();
    expect(github.commits).toHaveLength(commits);
    expect(auto.status).toMatchObject({ state: 'idle', pending: 0 });
  });

  it('paces writes a second apart', async () => {
    auto.dispose();
    auto = makeAutoExport({ writeIntervalMs: 1000 });
    await auto.start();
    await storeClosed(ID1, BASE);
    await storeClosed(ID2, BASE + 60_000);
    await auto.save(draft());
    // The first write goes at once; the second waits for its timer.
    await vi.waitFor(() => expect(clock.pendingTimers).toBe(1));
    expect(github.writes).toHaveLength(1);
    clock.advance(999); // not `advance`: the pass is waiting, so it isn't idle
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(github.writes).toHaveLength(1);
    await advance(1);
    expect(github.writes).toHaveLength(2);
  });
});

describe('compare before writing', () => {
  it('adopts an equal file a wiped device finds at the path, without writing', async () => {
    await storeClosed(ID1);
    const other = await exportRecording(storage, ID1, {
      app: { commit: 'old1234', buildTime: '2026-10-01T00:00:00.000Z' },
      epochNow: () => BASE + 5000,
      timeZoneOffset: () => -120,
    });
    const sha = github.plant(PATH1, other.text);
    await configure();
    // The pull reads it (T3.21): equal, so nothing is merged, and nothing written.
    expect(github.requests.map((r) => r.method)).toEqual(['GET', 'GET', 'GET', 'GET']);
    expect(github.commits).toEqual([]);
    const entry = await storage.local.get(LEDGER_PREFIX + ID1);
    expect(entry).toMatchObject({ state: 'synced', version: sha, path: PATH1 });
    expect(auto.status).toMatchObject({ state: 'idle', pending: 0, lastExportEpochMs: now() });
  });

  it('keeps a file with more records found while uploading, until a pull merges it', async () => {
    await configure(); // pulled: the repo is empty
    await storeClosed(ID1);
    const fuller = await exportRecording(storage, ID1, { app: SAMPLE_APP });
    const bundle = fuller.bundle;
    const extra = createShot(
      {
        id: '019a1b2c-3d4e-7000-9000-0000000000e9',
        recordingId: ID1,
        anchorTMs: 50,
        source: 'manual',
      },
      BASE,
    );
    const { serialiseExport } = await import('../../core/export');
    // Another device uploads it between this device's pull and its upload.
    github.plant(PATH1, serialiseExport({ ...bundle, shots: [extra] }));
    auto.recordingsChanged();
    await auto.whenIdle();
    expect(github.commits).toEqual([]);
    expect(auto.status.held).toEqual([
      {
        id: ID1,
        path: PATH1,
        reason: "Kept the repo's file: the repo's copy has 1 more shot that this device lacks.",
      },
    ]);
    expect(auto.status.state).toBe('idle');
    // Held files aren't compared again until this device's shots change.
    const requests = github.requests.length;
    auto.recordingsChanged();
    await auto.whenIdle();
    expect(github.requests).toHaveLength(requests);
    expect(auto.status.held).toHaveLength(1);
    // Retry pulls: the shot is merged here, the file is the same, and nothing is held.
    auto.retry();
    await auto.whenIdle();
    expect(await storage.shots.get(extra.id)).toEqual(extra);
    expect(github.commits).toEqual([]);
    expect(auto.status.held).toEqual([]);
  });

  it('replaces a file with fewer records, naming its sha', async () => {
    await storeClosed(ID1);
    await addShot(ID1, '019a1b2c-3d4e-7000-9000-0000000000e1');
    const older = await exportRecording(storage, ID1, { app: SAMPLE_APP });
    const { serialiseExport } = await import('../../core/export');
    const sha = github.plant(PATH1, serialiseExport({ ...older.bundle, shots: [] }));
    await configure();
    // Pulled first (nothing to merge), so the upload knows the repo's version.
    expect(github.commits).toHaveLength(1);
    expect(github.writes.map((w) => (w.body as { sha?: string }).sha)).toEqual([sha]);
    expect(parseExport(github.file(PATH1) ?? '').bundle.shots).toHaveLength(1);
  });

  it('compares again when another device wrote the file since', async () => {
    await configure();
    await storeClosed(ID1);
    auto.recordingsChanged();
    await auto.whenIdle();
    const ours = await storage.local.get(LEDGER_PREFIX + ID1);
    // Another device rewrites the file (same records), so the ledger's sha is stale.
    const text = github.file(PATH1) ?? '';
    const theirs = github.plant(
      PATH1,
      text.replace('"exportedAtEpochMs": ', '"exportedAtEpochMs": 1'),
    );
    await addShot(ID1, '019a1b2c-3d4e-7000-9000-0000000000e1');
    auto.shotsChanged();
    await advance(SHOTS_DEBOUNCE_MS);
    const shas = github.writes.slice(1).map((w) => (w.body as { sha?: string }).sha);
    // The ledger's sha (refused with 409), then, after reading the file again, its own.
    expect(shas).toEqual([(ours as { version: string }).version, theirs]);
    expect(parseExport(github.file(PATH1) ?? '').bundle.shots).toHaveLength(1);
    expect(auto.status).toMatchObject({ state: 'idle', lastError: null });
  });

  it('holds a file GitHub refuses, and goes on with the others', async () => {
    await storeClosed(ID1);
    await storeClosed(ID2, BASE + 60_000);
    await addShot(ID1, '019a1b2c-3d4e-7000-9000-0000000000e1'); // makes ID1's file larger
    const size = async (id: Id) =>
      new TextEncoder().encode((await exportRecording(storage, id, { app: SAMPLE_APP })).text)
        .length;
    expect(await size(ID1)).toBeGreaterThan((await size(ID2)) + 100);
    github.maxFileBytes = (await size(ID2)) + 50;
    await configure();
    expect(github.paths()).toEqual([
      'recordings/2026/10/smart-scale_2026-10-04_100100_000000d2.json',
    ]);
    expect(auto.status.held).toHaveLength(1);
    expect(auto.status.held[0].reason).toContain('too large');
    expect(auto.status).toMatchObject({ state: 'idle', pending: 0 });
  });
});

describe('the entities’ file (T2.1)', () => {
  function pack(name: string): CoffeePack {
    return createEntity(
      'packs',
      {
        brand: 'Local roaster',
        name,
        weightG: 250,
        roastDate: '2026-09-22',
        openDate: null,
        flavours: [],
        finishedDate: null,
        buyAgain: null,
      },
      now(),
    );
  }

  /** The entities' file as this device would write it, at another time by another build. */
  async function entitiesFile(): Promise<string> {
    return (await exportEntities(storage, { app: SAMPLE_APP, epochNow: () => BASE - 1000 })).text;
  }

  it('uploads nothing while the entities are seeds as seeded', async () => {
    await configure();
    auto.entitiesChanged();
    await advance(SHOTS_DEBOUNCE_MS);
    expect(github.writes).toEqual([]);
    expect(auto.status).toMatchObject({ entitiesPending: false, entitiesHeld: null });
  });

  it('uploads them once something is the user’s, after the recordings, and again on a change', async () => {
    await configure();
    await storeClosed(ID1);
    await storage.entities.create('packs', pack('Ethiopia Guji'));
    auto.recordingsChanged();
    await auto.whenIdle();
    expect(github.commits.map((c) => c.message)).toEqual([
      'Add smart-scale_2026-10-04_100000_000000d1.json',
      'Add entities.json',
    ]);
    const uploaded = parseExport(github.file(ENTITIES_PATH) ?? '').bundle;
    expect(uploaded.entities).toEqual(await storage.entities.all());
    expect([uploaded.recordings, uploaded.shots, uploaded.settings]).toEqual([[], [], null]);
    expect(await storage.local.get(ENTITIES_LEDGER_KEY)).toMatchObject({
      state: 'synced',
      path: ENTITIES_PATH,
    });
    expect(auto.status).toMatchObject({
      state: 'idle',
      pending: 0,
      entitiesPending: false,
      lastExportEpochMs: now(),
    });

    const requests = github.requests.length;
    auto.entitiesChanged();
    await advance(SHOTS_DEBOUNCE_MS);
    expect(github.requests).toHaveLength(requests); // unchanged: no request

    await storage.entities.update('recipes', SEED_IDS.lungo, { coffeeRatio: 2.5 }, now());
    auto.entitiesChanged();
    await advance(SHOTS_DEBOUNCE_MS / 2);
    expect(github.commits).toHaveLength(2); // still settling
    await advance(SHOTS_DEBOUNCE_MS / 2);
    expect(github.commits.at(-1)?.message).toBe('Update entities.json');
    expect(github.writes.at(-1)?.body).toMatchObject({ sha: expect.any(String) as unknown });
    const lungo = parseExport(github.file(ENTITIES_PATH) ?? '').bundle.entities?.recipes.find(
      (recipe) => recipe.id === SEED_IDS.lungo,
    );
    expect(lungo?.coffeeRatio).toBe(2.5);
  });

  it('adopts an equal file a wiped device finds, without writing', async () => {
    await storage.entities.create('packs', pack('Ethiopia Guji'));
    github.plant(ENTITIES_PATH, await entitiesFile());
    await configure();
    expect(github.commits).toEqual([]);
    expect(auto.status).toMatchObject({
      state: 'idle',
      entitiesPending: false,
      entitiesHeld: null,
    });
    expect(await storage.local.get(ENTITIES_LEDGER_KEY)).toMatchObject({ state: 'synced' });
  });

  it('merges a file with an entity this device lacks, or a newer version (T3.21)', async () => {
    const guji = pack('Ethiopia Guji');
    await storage.entities.create('packs', guji);
    const theirs = await exportEntities(storage, { app: SAMPLE_APP });
    // Another device's edit, after the seed's time (the test's clock starts before it).
    const espresso = updateEntity(
      'recipes',
      SEEDS.recipes[1],
      { coffeeRatio: 2.2 },
      SEED_EPOCH_MS + 60_000,
    );
    const entities = theirs.bundle.entities!;
    github.plant(
      ENTITIES_PATH,
      serialiseExport({
        ...theirs.bundle,
        entities: {
          ...entities,
          packs: [...entities.packs, pack('Kenya Nyeri')],
          recipes: entities.recipes.map((r) => (r.id === espresso.id ? espresso : r)),
        },
      }),
    );
    await configure();
    // Pulled: the pack is added and the newer recipe wins; the files then agree.
    expect(github.commits).toEqual([]);
    const all = await storage.entities.all();
    expect(all.packs.map((p) => p.name).sort()).toEqual(['Ethiopia Guji', 'Kenya Nyeri']);
    expect(all.recipes.find((r) => r.id === espresso.id)?.coffeeRatio).toBe(2.2);
    expect(auto.status).toMatchObject({ state: 'idle', entitiesHeld: null });
    expect(auto.status.lastPull?.report.entities).toEqual({ added: 1, updated: 1 });
  });

  it('replaces a file with fewer entities, or older versions, naming its sha', async () => {
    await storage.entities.create('packs', pack('Ethiopia Guji'));
    const older = await exportEntities(storage, { app: SAMPLE_APP });
    const sha = github.plant(
      ENTITIES_PATH,
      serialiseExport({ ...older.bundle, entities: { ...older.bundle.entities!, packs: [] } }),
    );
    await configure();
    expect(github.writes.map((w) => (w.body as { sha?: string }).sha)).toEqual([sha]);
    expect(parseExport(github.file(ENTITIES_PATH) ?? '').bundle.entities?.packs).toHaveLength(1);
  });

  it('keeps a file at that path that isn’t entities alone', async () => {
    await storage.entities.create('packs', pack('Ethiopia Guji'));
    await storeClosed(ID1);
    const recording = await exportRecording(storage, ID1, { app: SAMPLE_APP });
    github.plant(ENTITIES_PATH, recording.text);
    await configure({ pathPrefix: 'recordings/' });
    expect(auto.status.entitiesHeld?.reason).toBe(
      "Kept the repo's file: the repo's file holds more than the entities.",
    );
  });
});

describe('the pull (T3.21)', () => {
  const S1 = '019a1b2c-3d4e-7000-9000-0000000000e1';
  const S2 = '019a1b2c-3d4e-7000-9000-0000000000e2';
  const S3 = '019a1b2c-3d4e-7000-9000-0000000000e3';
  const SETTINGS_PATH = 'recordings/settings.json';

  /** This device's storage cleared, as Safari's "clear website data" does, and the app reopened. */
  async function wipe(): Promise<void> {
    auto.dispose();
    storage.close();
    freshIndexedDB();
    storage = await openStorage();
    auto = makeAutoExport();
    await auto.start();
    await auto.whenIdle();
  }

  /** A settings file as another device wrote it at `exportedAtEpochMs`. */
  function settingsFile(settings: Record<string, number>, exportedAtEpochMs: number): string {
    return serialiseExport({
      exportedAtEpochMs,
      app: SAMPLE_APP,
      recordings: [],
      shots: [],
      entities: null,
      settings,
    });
  }

  async function settingsChanged(): Promise<void> {
    auto.settingsChanged();
    await vi.waitFor(async () => expect(await storage.local.get(SETTINGS_CHANGED_KEY)).toBe(now()));
  }

  it('brings back a wiped device’s recordings, shots, setup and settings', async () => {
    await configure();
    await storeClosed(ID1);
    await addShot(ID1, S1);
    await storage.shots.update(S1, { direction: 'sour', tags: ['WDT'] }, now());
    const guji = createEntity(
      'packs',
      {
        brand: 'Local roaster',
        name: 'Ethiopia Guji',
        weightG: 250,
        roastDate: '2026-09-22',
        openDate: null,
        flavours: [],
        finishedDate: null,
        buyAgain: null,
      },
      now(),
    );
    await storage.entities.create('packs', guji);
    await storage.kv.set('lastUsed.doseG', 17.5);
    await settingsChanged();
    auto.recordingsChanged();
    await advance(SHOTS_DEBOUNCE_MS);
    expect(github.commits.map((c) => c.message)).toEqual([
      'Add smart-scale_2026-10-04_100000_000000d1.json',
      'Add entities.json',
      'Add settings.json',
    ]);
    expect(parseExport(github.file(SETTINGS_PATH) ?? '').bundle.settings).toEqual({
      'lastUsed.doseG': 17.5,
    });
    const shot = await storage.shots.get(S1);

    await wipe();
    expect(await storage.recordings.get(ID1)).toBeNull();
    await configure();
    expect(await storage.recordings.get(ID1)).not.toBeNull();
    expect((await storage.raw.read(ID1))?.frames).toHaveLength(3);
    expect(await storage.shots.get(S1)).toEqual(shot);
    expect(await storage.entities.get('packs', guji.id)).toEqual(guji);
    expect(await storage.kv.get('lastUsed.doseG')).toBe(17.5);
    expect(auto.status.lastPull?.report).toMatchObject({
      files: 3,
      recordings: 1,
      shots: { added: 1, updated: 0, copies: 0 },
      entities: { updated: 0 },
      settings: 1,
      unreadable: [],
    });
    // The files agree with what is here now: nothing is written.
    expect(github.commits).toHaveLength(3);
    expect(auto.status).toMatchObject({ state: 'idle', pending: 0, settingsPending: false });

    // Pulled again with nothing changed there: the listing alone.
    github.requests.length = 0;
    auto.retry();
    await auto.whenIdle();
    expect(github.requests.map((r) => r.path.split('/').slice(4).join('/'))).toEqual([
      '',
      '',
      'git/trees/main',
    ]);
  });

  it('takes the repo’s version of a shot unchanged here, keeps one changed only here, and both when both changed', async () => {
    await configure();
    await storeClosed(ID1);
    for (const id of [S1, S2, S3]) await addShot(ID1, id);
    auto.recordingsChanged();
    await auto.whenIdle();
    clock.advance(60_000);

    // Another device: S1 sour, S3 tagged.
    const file = parseExport(github.file(PATH1) ?? '').bundle;
    const edited = file.shots.map((s) =>
      s.id === S1
        ? { ...s, direction: 'sour' as const, updatedAtEpochMs: now() }
        : s.id === S3
          ? { ...s, tags: ['RDT'], updatedAtEpochMs: now() }
          : s,
    );
    github.plant(PATH1, serialiseExport({ ...file, shots: edited }));
    // This device, not yet uploaded: S2 bitter, S3 balanced.
    clock.advance(1000);
    await storage.shots.update(S2, { direction: 'bitter' }, now());
    await storage.shots.update(S3, { direction: 'balanced' }, now());

    auto.retry();
    await auto.whenIdle();
    expect((await storage.shots.get(S1))?.direction).toBe('sour');
    expect((await storage.shots.get(S2))?.direction).toBe('bitter');
    expect(await storage.shots.get(S3)).toMatchObject({ direction: 'balanced', tags: null });
    const shots = await storage.shots.listForRecording(ID1);
    expect(shots).toHaveLength(4);
    const copy = shots.find((s) => ![S1, S2, S3].includes(s.id))!;
    expect(copy).toMatchObject({ anchorTMs: 200, tags: ['RDT'], direction: null });
    expect(auto.status.lastPull?.report.shots).toEqual({ added: 0, updated: 1, copies: 1 });
    // Then this device's merged file goes up, holding both versions of S3.
    expect(parseExport(github.file(PATH1) ?? '').bundle.shots).toHaveLength(4);
  });

  it('keeps a deletion, on either side', () => {
    const base = createShot({ id: S1, recordingId: ID1, anchorTMs: 200, source: 'live' }, BASE);
    const edited = { ...base, direction: 'sour' as const, updatedAtEpochMs: BASE + 2000 };
    const deleted = { ...base, discardedAtEpochMs: BASE + 3000, updatedAtEpochMs: BASE + 3000 };
    expect(chooseShot(deleted, edited, BASE + 1000)).toBe('ours');
    expect(chooseShot(edited, deleted, BASE + 1000)).toBe('theirs');
    // Without a sync to tell which side changed: both.
    expect(chooseShot(edited, { ...edited, direction: 'bitter' }, null)).toBe('both');
  });

  it('takes the newer settings: the repo’s when written after this device’s change', async () => {
    await configure();
    await storage.kv.set('lastUsed.doseG', 17);
    await settingsChanged();
    await advance(SHOTS_DEBOUNCE_MS);
    expect(parseExport(github.file(SETTINGS_PATH) ?? '').bundle.settings).toEqual({
      'lastUsed.doseG': 17,
    });

    // Another device writes 18, later than this device's change: it wins.
    clock.advance(60_000);
    github.plant(SETTINGS_PATH, settingsFile({ 'lastUsed.doseG': 18 }, now()));
    auto.retry();
    await auto.whenIdle();
    expect(await storage.kv.get('lastUsed.doseG')).toBe(18);

    // This device changes it to 19; the repo's 20 was written before that: 19 stays, and goes up.
    clock.advance(60_000);
    const before = now() - 30_000;
    await storage.kv.set('lastUsed.doseG', 19);
    await settingsChanged();
    github.plant(SETTINGS_PATH, settingsFile({ 'lastUsed.doseG': 20 }, before));
    auto.retry();
    await auto.whenIdle();
    expect(await storage.kv.get('lastUsed.doseG')).toBe(19);
    expect(parseExport(github.file(SETTINGS_PATH) ?? '').bundle.settings).toEqual({
      'lastUsed.doseG': 19,
    });
  });
});

describe('failures', () => {
  it('retries a lost connection with backoff, and at once when back online', async () => {
    await storeClosed(ID1);
    github.fail(() => new TypeError('Load failed'));
    await configure();
    expect(auto.status).toMatchObject({
      state: 'waiting',
      retryAtEpochMs: now() + RETRY_DELAYS_MS[0],
    });
    expect(auto.status.lastError).toContain('Load failed');

    github.fail(() => json(503, { message: 'Unavailable' }));
    await advance(RETRY_DELAYS_MS[0]);
    expect(auto.status).toMatchObject({
      state: 'waiting',
      retryAtEpochMs: now() + RETRY_DELAYS_MS[1],
    });

    online.forEach((listener) => listener());
    await auto.whenIdle();
    expect(auto.status).toMatchObject({ state: 'idle', pending: 0, lastError: null });
    expect(github.paths()).toEqual([PATH1]);
    expect(clock.pendingTimers).toBe(0);
  });

  it('retries when the page is shown again', async () => {
    await storeClosed(ID1);
    github.fail(() => json(500, { message: 'Server Error' }));
    await configure();
    expect(auto.status.state).toBe('waiting');
    visibility.forEach((listener) => listener('visible'));
    await auto.whenIdle();
    expect(auto.status.state).toBe('idle');
  });

  it('waits as long as a rate limit asks, even when back online', async () => {
    await storeClosed(ID1);
    github.fail(() => json(429, { message: 'Too many' }, { 'retry-after': '600' }));
    await configure();
    expect(auto.status).toMatchObject({ state: 'waiting', retryAtEpochMs: now() + 600_000 });
    const requests = github.requests.length;
    online.forEach((listener) => listener());
    auto.retry();
    await auto.whenIdle();
    expect(github.requests).toHaveLength(requests);
    await advance(600_000);
    expect(auto.status.state).toBe('idle');
  });

  it.each([
    [401, 'GitHub refused the token'],
    [403, 'Contents read and write'],
    [404, 'the owner, the repo'],
  ])('stops on %i, and says to check the settings, until saved again', async (status, says) => {
    await storeClosed(ID1);
    github.fail(() => json(status, { message: `No (${github.token})` }));
    await configure();
    expect(auto.status.state).toBe('stopped');
    expect(auto.status.lastError).toContain(says);
    expect(auto.status.lastError).toMatch(/check the settings/i);
    expect(auto.status.lastError).not.toContain(github.token);
    expect(auto.status.pending).toBe(1);

    const requests = github.requests.length;
    auto.recordingsChanged();
    online.forEach((listener) => listener());
    await advance(RETRY_DELAYS_MS.at(-1) ?? 0);
    expect(github.requests).toHaveLength(requests); // no loop
    expect(clock.pendingTimers).toBe(0);

    await configure();
    expect(auto.status).toMatchObject({ state: 'idle', pending: 0, lastError: null });
  });

  it('refuses a public repo, and uploads nothing', async () => {
    github.isPrivate = false;
    github.visibility = 'public';
    await storeClosed(ID1);
    await configure();
    expect(auto.status.state).toBe('stopped');
    expect(auto.status.lastError).toContain('is public');
    expect(github.writes).toEqual([]);
  });

  it('stops when the repo has turned public since the last pass', async () => {
    await configure();
    github.isPrivate = false;
    github.visibility = 'public';
    await storeClosed(ID1);
    auto.recordingsChanged();
    await auto.whenIdle();
    expect(auto.status.state).toBe('stopped');
    expect(github.writes).toEqual([]);
  });

  it('starts again on Retry after a stop', async () => {
    await storeClosed(ID1);
    github.fail(() => json(401, { message: 'Bad credentials' }));
    await configure();
    expect(auto.status.state).toBe('stopped');
    auto.retry();
    await auto.whenIdle();
    expect(auto.status.state).toBe('idle');
    expect(github.paths()).toEqual([PATH1]);
  });
});

describe('settings', () => {
  it('never hands the token back, keeps it when the draft leaves it out, and checks fields', async () => {
    await configure({ branch: ' ', pathPrefix: '/data//recordings' });
    expect(auto.settings).toEqual({
      owner: 'someone',
      repo: 'smart-scale-data',
      branch: null,
      pathPrefix: 'data/recordings/',
      tokenSet: true,
    });
    await auto.save({ ...draft(), token: undefined, repo: 'smart-scale-data' });
    expect(auto.settings?.tokenSet).toBe(true);
    await expect(auto.save(draft({ owner: 'not an owner' }))).rejects.toThrow(SettingsError);
    await expect(auto.save(draft({ pathPrefix: 'a/../b' }))).rejects.toMatchObject({
      field: 'pathPrefix',
    });
    await expect(auto.save(draft({ branch: 'bad..branch' }))).rejects.toMatchObject({
      field: 'branch',
    });
  });

  it('tests a draft against the repo without saving it or uploading', async () => {
    await storeClosed(ID1);
    expect(await auto.test(draft())).toEqual({
      description: 'someone/smart-scale-data (private), default branch main',
    });
    expect(auto.settings).toBeNull();
    expect(github.writes).toEqual([]);
    await expect(auto.test(draft({ token: 'github_pat_nope_nope' }))).rejects.toMatchObject({
      kind: 'unauthorized',
    });
    await expect(auto.test(draft({ token: null }))).rejects.toThrow(SettingsError);
  });

  it('reports stored settings it cannot read, and recovers on save', async () => {
    await storage.local.set('autoExport.settings', { owner: 3 });
    auto.dispose();
    auto = makeAutoExport();
    await auto.start();
    expect(auto.status.state).toBe('stopped');
    expect(auto.status.lastError).toContain("can't be read");
    auto.recordingsChanged();
    await auto.whenIdle();
    expect(auto.status.state).toBe('stopped'); // still says why
    await configure();
    expect(auto.status.state).toBe('idle');
  });
});

describe('the token', () => {
  it('appears in no export, error, status or log, only in the Authorization header', async () => {
    const logged: unknown[] = [];
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(...args);
      }),
    );
    try {
      await storeClosed(ID1);
      await addShot(ID1, '019a1b2c-3d4e-7000-9000-0000000000e1');
      github.fail(() => json(401, { message: `Bad credentials: ${github.token}` }));
      await configure();
      const stopped = auto.status.lastError ?? '';
      auto.retry();
      await auto.whenIdle();
      const token = github.token;

      const everything = await exportAll(storage, { app: SAMPLE_APP });
      const one = await exportRecording(storage, ID1, { app: SAMPLE_APP });
      expect(everything.text).not.toContain(token);
      expect(everything.bundle.settings).toEqual({});
      expect(one.text).not.toContain(token);
      expect(github.file(PATH1)).not.toContain(token);
      for (const entry of everything.bundle.recordings) {
        expect(JSON.stringify(entry.events)).not.toContain(token);
      }
      expect(stopped).toContain('[token]');
      expect(stopped).not.toContain(token);
      expect(JSON.stringify(auto.status)).not.toContain(token);
      expect(JSON.stringify(auto.settings)).not.toContain(token);
      expect(JSON.stringify(auto)).not.toContain(token);
      expect(logged.map(String).join('\n')).not.toContain(token);
      for (const request of github.requests) {
        const { authorization, ...rest } = request.headers;
        expect(authorization).toBe(`Bearer ${token}`);
        expect(JSON.stringify(rest)).not.toContain(token);
        expect(JSON.stringify(request.body)).not.toContain(token);
        expect(request.path).not.toContain(token);
      }
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });

  it('sends only the headers that GitHub allows a browser to send', async () => {
    await storeClosed(ID1);
    await configure();
    expect(github.paths()).toEqual([PATH1]); // the fake refuses any other header, as CORS does
    expect(new Set(github.requests.flatMap((r) => Object.keys(r.headers)))).toEqual(
      new Set(['accept', 'authorization', 'content-type']),
    );
    expect(github.requests.every((r) => r.cache === 'no-store')).toBe(true);
  });
});
