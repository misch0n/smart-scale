/**
 * T1.7 acceptance: an export reads back exactly. Raw bytes come back identical, every field is
 * present, nulls included, and three minutes at 10 Hz is under about 150 KB. Also the layout
 * (one record per line) and the serialiser's refusal of malformed bundles.
 */

import { describe, expect, it } from 'vitest';
import {
  APP_EVENT_TYPES,
  emptyEntityLists,
  ENTITY_KINDS,
  normaliseEntity,
  normaliseShot,
  SchemaError,
  type EntityKind,
  type Shot,
} from '../model';
import { decodeFrame, toHex } from '../protocol';
import { espressoScenario, simulateSession, toRawRecording } from '../sim';
import { EXPORT_FORMAT, FORMAT_VERSION, type ExportBundle } from './format';
import { parseExport } from './parse';
import { serialiseExport } from './serialise';
import {
  SAMPLE_APP,
  SAMPLE_IDS,
  SAMPLE_START,
  sampleBundle,
  sampleEntities,
  sampleRecordingA,
  sampleShots,
} from './test-samples';

function roundTrip(bundle: ExportBundle): ExportBundle {
  return parseExport(serialiseExport(bundle)).bundle;
}

/** The file's JSON, as plain data. */
function fileJson(bundle: ExportBundle): Record<string, unknown> {
  return JSON.parse(serialiseExport(bundle)) as Record<string, unknown>;
}

const SHOT_KEYS = Object.keys(sampleShots()[0]);

describe('round trip', () => {
  it('reads back the bundle it wrote, exactly', () => {
    const bundle = sampleBundle();
    const parsed = parseExport(serialiseExport(bundle));
    expect(parsed.formatVersion).toBe(FORMAT_VERSION);
    expect(parsed.bundle).toEqual(bundle);
  });

  it('covers every event type, both characteristics, damaged and empty frames', () => {
    const a = sampleRecordingA();
    expect(new Set(a.events.map((e) => e.type))).toEqual(new Set(APP_EVENT_TYPES));
    expect(a.frames.some((f) => f.source === 'ff12')).toBe(true);
    expect(a.frames.some((f) => f.bytes.length === 0)).toBe(true);
    const invalid = a.frames.filter((f) => decodeFrame(f.bytes).kind === 'invalid');
    expect(invalid.length).toBeGreaterThan(10);
  });

  it('brings every frame back byte for byte, with its seq, time and source', () => {
    const bundle = sampleBundle();
    const back = roundTrip(bundle);
    bundle.recordings.forEach((entry, i) => {
      const frames = back.recordings[i].frames;
      expect(frames).toHaveLength(entry.frames.length);
      entry.frames.forEach((frame, j) => {
        const read = frames[j];
        expect(toHex(read.bytes)).toBe(toHex(frame.bytes));
        expect(read.bytes).toBeInstanceOf(Uint8Array);
        expect(read.bytes.byteLength).toBe(frame.bytes.byteLength);
        expect([read.recordingId, read.seq, read.source]).toEqual([
          frame.recordingId,
          frame.seq,
          frame.source,
        ]);
        expect(Object.is(read.tMs, frame.tMs)).toBe(true);
      });
    });
  });

  it('keeps full-precision times', () => {
    const times = [0, 0.1 + 0.2, 1503.7500000000002, 234.44399999999996, 179_912.3456789, 2 ** 40];
    const a = sampleRecordingA();
    const frames = times.map((tMs, i) => ({ ...a.frames[i], seq: i, tMs }));
    const bundle: ExportBundle = {
      ...sampleBundle(),
      recordings: [{ recording: a.recording, frames, events: [] }],
    };
    expect(roundTrip(bundle).recordings[0].frames.map((f) => f.tMs)).toEqual(times);
  });

  it('writes every field, nulls included, and reads every field back', () => {
    const json = fileJson(sampleBundle());
    const shots = json.shots as Record<string, unknown>[];
    const empty = shots.find((s) => s.id === SAMPLE_IDS.emptyShot)!;
    expect(Object.keys(empty)).toEqual(SHOT_KEYS);
    for (const key of SHOT_KEYS) {
      if (!['id', 'recordingId', 'anchorTMs', 'source'].includes(key) && !key.endsWith('EpochMs')) {
        expect(empty[key], key).toBeNull();
      }
    }
    expect(empty.discardedAtEpochMs).toBeNull();

    const back = roundTrip(sampleBundle());
    for (const shot of back.shots) expect(Object.keys(shot)).toEqual(SHOT_KEYS);
    const emptyBack = back.shots.find((s) => s.id === SAMPLE_IDS.emptyShot)!;
    expect(emptyBack.tags).toBeNull();
    expect(back.shots.find((s) => s.id === SAMPLE_IDS.shotOnB)!.tags).toEqual([]);

    const open = back.recordings[1].recording;
    expect(open.endedAtEpochMs).toBeNull();
    expect(open.endReason).toBeNull();
    expect(open.userAgent).toBeNull();
    expect(open.device).toEqual({ name: null, id: null });
  });

  it('writes discarded shots, and shots whose recording is not in the file', () => {
    const back = roundTrip(sampleBundle());
    expect(back.shots.find((s) => s.id === SAMPLE_IDS.fullShot)!.discardedAtEpochMs).toBe(
      SAMPLE_START + 86_400_000,
    );
    expect(back.shots.find((s) => s.id === SAMPLE_IDS.shotOnC)!.recordingId).toBe(
      SAMPLE_IDS.recordingC,
    );
  });

  it('round-trips settings, including awkward keys and nested values', () => {
    const back = roundTrip(sampleBundle()).settings!;
    expect(back).toEqual(sampleBundle().settings);
    expect(Object.hasOwn(back, '__proto__')).toBe(true);
    expect(back.__proto__).toBe('just data');
    expect(Object.getPrototypeOf(back)).toBe(Object.prototype);
  });

  it('round-trips every kind of entity, removed ones too, with every field', () => {
    const entities = roundTrip(sampleBundle()).entities!;
    expect(entities).toEqual(sampleEntities());
    for (const kind of ENTITY_KINDS) {
      expect(entities[kind].length, kind).toBeGreaterThan(0);
      for (const entity of entities[kind]) {
        expect(Object.keys(entity)).toEqual(Object.keys(normaliseEntity(kind, entity)));
      }
    }
    expect(entities.grinders.some((g) => g.removedAtEpochMs !== null)).toBe(true);
    const packs = (fileJson(sampleBundle()).entities as Record<string, unknown[]>).packs;
    expect((packs[1] as Record<string, unknown>).brand).toBeNull();
  });

  it('writes null entities for a file that carries none, and empty lists for none of a kind', () => {
    const bundle: ExportBundle = { ...sampleBundle(), entities: null };
    expect(fileJson(bundle).entities).toBeNull();
    expect(roundTrip(bundle).entities).toBeNull();
    const empty: ExportBundle = { ...sampleBundle(), entities: emptyEntityLists() };
    expect(roundTrip(empty).entities).toEqual(emptyEntityLists());
  });

  it('writes null settings for a file that carries none', () => {
    const bundle: ExportBundle = { ...sampleBundle(), settings: null };
    expect(fileJson(bundle).settings).toBeNull();
    expect(roundTrip(bundle).settings).toBeNull();
    const empty: ExportBundle = { ...sampleBundle(), settings: {} };
    expect(roundTrip(empty).settings).toEqual({});
  });

  it('round-trips an empty export', () => {
    const empty: ExportBundle = {
      exportedAtEpochMs: SAMPLE_START,
      app: SAMPLE_APP,
      recordings: [],
      shots: [],
      entities: null,
      settings: null,
    };
    expect(roundTrip(empty)).toEqual(empty);
    const first = sampleRecordingA();
    const noRecords: ExportBundle = {
      ...empty,
      recordings: [{ recording: first.recording, frames: [], events: [] }],
    };
    expect(roundTrip(noRecords)).toEqual(noRecords);
  });

  it('is deterministic, and writing what it read gives the same text', () => {
    const text = serialiseExport(sampleBundle());
    expect(serialiseExport(sampleBundle())).toBe(text);
    expect(serialiseExport(parseExport(text).bundle)).toBe(text);
  });

  it('round-trips a simulated session as the recorder would store it', () => {
    const raw = toRawRecording(
      simulateSession(
        espressoScenario({ link: { corruptProbability: 0.02, dropProbability: 0.01 } }),
      ),
    );
    const bundle: ExportBundle = {
      exportedAtEpochMs: SAMPLE_START,
      app: SAMPLE_APP,
      recordings: [raw],
      shots: [],
      entities: null,
      settings: null,
    };
    expect(roundTrip(bundle)).toEqual(bundle);
  });
});

describe('the file', () => {
  it('starts with the format and its version', () => {
    const json = fileJson(sampleBundle());
    expect(json.format).toBe(EXPORT_FORMAT);
    expect(json.formatVersion).toBe(FORMAT_VERSION);
    expect(Object.keys(json)).toEqual([
      'format',
      'formatVersion',
      'exportedAtEpochMs',
      'app',
      'recordings',
      'shots',
      'entities',
      'settings',
    ]);
    expect(Object.keys(json.entities as object)).toEqual(ENTITY_KINDS);
  });

  it('writes frames as [seq, tMs, source, hex] rows, and records without their recording id', () => {
    const a = sampleRecordingA();
    const json = fileJson(sampleBundle());
    const entry = (json.recordings as Record<string, unknown>[])[0];
    expect(Object.keys(entry)).toEqual(['recording', 'frames', 'events']);
    const rows = entry.frames as unknown[][];
    rows.forEach((row, i) => {
      const frame = a.frames[i];
      expect(row).toEqual([frame.seq, frame.tMs, frame.source, toHex(frame.bytes, '')]);
    });
    const events = entry.events as Record<string, unknown>[];
    events.forEach((event, i) => {
      expect(Object.keys(event)).toEqual(['seq', 'tMs', 'type', 'data']);
      expect(event.data).toEqual(a.events[i].data);
    });
    expect(rows.find((row) => row[3] === '')).toBeDefined(); // the empty notification
  });

  it('puts each record on a line of its own', () => {
    const bundle = sampleBundle();
    const lines = serialiseExport(bundle).split('\n');
    const record = (line: string): unknown => JSON.parse(line.trim().replace(/,$/, ''));

    const rowLines = lines.filter((line) => /^ {4}\[/.test(line));
    const frames = bundle.recordings.flatMap((r) => r.frames);
    expect(rowLines).toHaveLength(frames.length);
    rowLines.forEach((line, i) => expect((record(line) as unknown[])[0]).toBe(frames[i].seq));

    const eventLines = lines.filter((line) => line.startsWith('    {"seq":'));
    const events = bundle.recordings.flatMap((r) => r.events);
    expect(eventLines.map((line) => (record(line) as { seq: number }).seq)).toEqual(
      events.map((e) => e.seq),
    );

    const shotLines = lines.filter((line) => line.startsWith('  {"id":'));
    expect(shotLines.map((line) => normaliseShot(record(line)))).toEqual(bundle.shots);

    const recordingLines = lines.filter((line) => line.startsWith('   "recording": '));
    expect(recordingLines).toHaveLength(bundle.recordings.length);

    const entities = bundle.entities!;
    let kind: EntityKind | null = null;
    const entityLines: Record<string, unknown[]> = {};
    for (const line of lines.slice(lines.indexOf(' "entities": {'))) {
      const opening = /^ {2}"(\w+)": \[/.exec(line);
      if (opening) kind = opening[1] as EntityKind;
      else if (kind !== null && line.startsWith('   {"id":')) {
        (entityLines[kind] ??= []).push(normaliseEntity(kind, record(line)));
      }
    }
    for (const k of ENTITY_KINDS) expect(entityLines[k], k).toEqual(entities[k]);
  });

  it('escapes the characters that some tools read as line breaks', () => {
    const text = serialiseExport(sampleBundle());
    expect(text).not.toMatch(/[\u0085\u2028\u2029]/);
    expect(text).toContain('backslash\\u2028');
    const back = roundTrip(sampleBundle()).recordings[0].events.find(
      (e) => e.type === 'annotation' && e.data.label === 'note',
    );
    expect(back?.data).toEqual({
      label: 'note',
      text: 'Line one\nline "two" with ünïcødé ☕ and a \\ backslash\u2028',
    });
    const nel = { ...sampleBundle(), settings: { 'next\u0085line': 'para\u2029graph' } };
    const nelText = serialiseExport(nel);
    expect(nelText).not.toMatch(/[\u0085\u2028\u2029]/);
    expect(parseExport(nelText).bundle.settings).toEqual(nel.settings);
  });

  it('indents by one space, sorts settings by key, and ends with a newline', () => {
    const text = serialiseExport(sampleBundle());
    expect(text.startsWith('{\n "format": "smart-scale-export",\n "formatVersion": 5,\n')).toBe(
      true,
    );
    expect(text.endsWith('\n}\n')).toBe(true);
    const settingsStart = text.indexOf(' "settings": {\n');
    expect(settingsStart).toBeGreaterThan(0);
    const keys = text
      .slice(settingsStart)
      .split('\n')
      .slice(1, -3) // the member lines, without ' }', '}' and the empty last line
      .map((line) => JSON.parse(`{${line.replace(/,$/, '')}}`) as object)
      .map((member) => Object.keys(member)[0]);
    expect(keys).toEqual(Object.keys(sampleBundle().settings!).sort());
  });

  it('writes empty lists on one line', () => {
    const text = serialiseExport({
      exportedAtEpochMs: SAMPLE_START,
      app: SAMPLE_APP,
      recordings: [],
      shots: [],
      entities: emptyEntityLists(),
      settings: {},
    });
    expect(text).toBe(
      [
        '{',
        ' "format": "smart-scale-export",',
        ' "formatVersion": 5,',
        ` "exportedAtEpochMs": ${SAMPLE_START},`,
        ` "app": ${JSON.stringify(SAMPLE_APP)},`,
        ' "recordings": [],',
        ' "shots": [],',
        ' "entities": {',
        '  "machines": [],',
        '  "grinders": [],',
        '  "recipes": [],',
        '  "packs": [],',
        '  "containers": [],',
        '  "tags": []',
        ' },',
        ' "settings": {}',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('stays under 150 KB for three minutes at 10 Hz', () => {
    const session = simulateSession({ ...espressoScenario(), durationMs: 180_000 });
    const raw = toRawRecording(session);
    expect(raw.frames.length).toBeGreaterThanOrEqual(1780); // the scale's 9.93 Hz
    // The simulator's arrival times have 15–17 significant digits, the worst case for size.
    expect(raw.frames.filter((f) => String(f.tMs).length >= 16).length).toBeGreaterThan(1000);
    const bundle: ExportBundle = {
      exportedAtEpochMs: SAMPLE_START,
      app: SAMPLE_APP,
      recordings: [raw],
      shots: sampleShots().filter((s) => s.recordingId === SAMPLE_IDS.recordingA),
      entities: null,
      settings: null,
    };
    const bytes = new TextEncoder().encode(serialiseExport(bundle)).byteLength;
    expect(bytes).toBeLessThan(150_000);
    const empty = new TextEncoder().encode(
      serialiseExport({ ...bundle, recordings: [{ ...raw, frames: [] }] }),
    ).byteLength;
    expect((bytes - empty) / raw.frames.length).toBeLessThan(82);
  });
});

describe('serialising a malformed bundle', () => {
  const base = (): ExportBundle => sampleBundle();

  it('refuses a frame or event of another recording', () => {
    const bundle = base();
    const [a, b] = bundle.recordings;
    const mixed = { ...a, frames: [...a.frames.slice(0, 2), { ...b.frames[0], seq: 999_999 }] };
    expect(() => serialiseExport({ ...bundle, recordings: [mixed] })).toThrow(
      /recordings\[0\]\.frames\[2\]: belongs to recording/,
    );
    const mixedEvents = { ...a, events: [...a.events, { ...b.events[0], seq: 999_999 }] };
    expect(() => serialiseExport({ ...bundle, recordings: [mixedEvents] })).toThrow(SchemaError);
  });

  it('refuses records out of seq order, or a seq used twice', () => {
    const a = sampleRecordingA();
    const swapped = { ...a, frames: [a.frames[1], a.frames[0], ...a.frames.slice(2)] };
    expect(() => serialiseExport({ ...base(), recordings: [swapped] })).toThrow(
      /frames\[1\]: seq \d+ comes after seq \d+, but seq must increase/,
    );
    const shared = { ...a, events: [{ ...a.events[0], seq: a.frames[0].seq }] };
    expect(() => serialiseExport({ ...base(), recordings: [shared] })).toThrow(
      /events\[0\]: seq \d+ is frames\[0\]'s seq too/,
    );
  });

  it('refuses an id used twice', () => {
    const a = sampleRecordingA();
    expect(() => serialiseExport({ ...base(), recordings: [a, a] })).toThrow(
      /recordings\[1\]\.recording\.id: recording .* appears twice/,
    );
    const shot = sampleShots()[0];
    expect(() => serialiseExport({ ...base(), shots: [shot, shot] })).toThrow(
      /shots\[1\]\.id: shot .* appears twice/,
    );
    const entities = sampleEntities();
    const twice = { ...entities, packs: [entities.packs[0], entities.packs[0]] };
    expect(() => serialiseExport({ ...base(), entities: twice })).toThrow(
      /entities\.packs\[1\]\.id: pack .* appears twice/,
    );
    // The same id in two kinds' lists is no clash: each kind is its own store.
    const tag = { ...entities.tags[0], id: entities.packs[0].id };
    expect(() =>
      serialiseExport({ ...base(), entities: { ...entities, tags: [tag] } }),
    ).not.toThrow();
  });

  it('refuses a record that does not normalise', () => {
    const a = sampleRecordingA();
    const nan = { ...a, frames: [{ ...a.frames[0], tMs: Number.NaN }] };
    expect(() => serialiseExport({ ...base(), recordings: [nan] })).toThrow(
      /recordings\[0\]\.frames\[0\]\.tMs/,
    );
    expect(() => serialiseExport({ ...base(), exportedAtEpochMs: Number.NaN })).toThrow(
      SchemaError,
    );
  });

  it('fills missing nullable fields and drops unknown keys', () => {
    const loose: Record<string, unknown> = { ...sampleShots()[1], extra: 'dropped' };
    delete loose.tags;
    const shot = loose as unknown as Shot;
    const json = fileJson({ ...base(), shots: [shot] });
    const written = (json.shots as Record<string, unknown>[])[0];
    expect(Object.keys(written)).toEqual(SHOT_KEYS);
    expect(written.tags).toBeNull();
  });
});
