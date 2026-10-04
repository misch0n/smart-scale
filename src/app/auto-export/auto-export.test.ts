/**
 * Automatic export (T1.20) against a fake GitHub, on virtual time: what is uploaded and when,
 * updates in place, compare before writing, retries and stops, and that the token goes nowhere
 * but the Authorization header.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseExport } from '../../core/export';
import { SAMPLE_APP } from '../../core/export/test-samples';
import {
  createRecording,
  createShot,
  endRecording,
  RecordingSequence,
  type Id,
  type TransportKind,
} from '../../core/model';
import { freshIndexedDB } from '../../storage/fake-idb';
import { openStorage, type AppStorage } from '../../storage';
import { ManualClock } from '../../transport/scheduler';
import { exportAll, exportRecording } from '../export';
import {
  AutoExport,
  RETRY_DELAYS_MS,
  SHOTS_DEBOUNCE_MS,
  type AutoExportOptions,
} from './auto-export';
import { FakeGitHub, json } from './fake-github';
import { GitHubSink } from './github';
import { LEDGER_PREFIX } from './ledger';
import { SettingsError, type SettingsDraft } from './settings';

const BASE = Date.UTC(2026, 9, 4, 8, 0, 0);
const ID1 = '019a1b2c-3d4e-7000-8000-0000000000d1';
const ID2 = '019a1b2c-3d4e-7000-8000-0000000000d2';
const ID3 = '019a1b2c-3d4e-7000-8000-0000000000d3';
/** Recording ID1's path: it starts at BASE, 10:00:00 in Central European Summer Time. */
const PATH1 = 'recordings/2026/10/smart-scale_2026-10-04_100000_000000d1.json';

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
    expect(github.requests).toEqual([]); // nothing to upload: no request at all
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
    // Creating it is refused (422: no sha), so it is read and compared: equal, so not written.
    expect(github.requests.map((r) => r.method)).toEqual(['GET', 'PUT', 'GET']);
    expect(github.commits).toEqual([]);
    const entry = await storage.local.get(LEDGER_PREFIX + ID1);
    expect(entry).toMatchObject({ state: 'synced', version: sha, path: PATH1 });
    expect(auto.status).toMatchObject({ state: 'idle', pending: 0, lastExportEpochMs: now() });
  });

  it('keeps a file with more records, and says so', async () => {
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
    github.plant(PATH1, serialiseExport({ ...bundle, shots: [extra] }));
    await configure();
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
  });

  it('replaces a file with fewer records, naming its sha', async () => {
    await storeClosed(ID1);
    await addShot(ID1, '019a1b2c-3d4e-7000-9000-0000000000e1');
    const older = await exportRecording(storage, ID1, { app: SAMPLE_APP });
    const { serialiseExport } = await import('../../core/export');
    const sha = github.plant(PATH1, serialiseExport({ ...older.bundle, shots: [] }));
    await configure();
    expect(github.commits).toHaveLength(1);
    expect(github.writes.map((w) => (w.body as { sha?: string }).sha)).toEqual([undefined, sha]);
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
