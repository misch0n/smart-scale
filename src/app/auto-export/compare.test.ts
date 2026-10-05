import { describe, expect, it } from 'vitest';
import { FORMAT_VERSION, serialiseExport, type ExportBundle } from '../../core/export';
import {
  SAMPLE_APP,
  SAMPLE_IDS,
  SAMPLE_START,
  sampleRecordingA,
  sampleRecordingB,
  sampleShots,
} from '../../core/export/test-samples';
import {
  emptyEntityLists,
  SEEDS,
  updateEntity,
  updateShot,
  type EntityLists,
} from '../../core/model';
import { compareEntitiesWithRemote, compareWithRemote } from './compare';

const shotsOfA = () => sampleShots().filter((s) => s.recordingId === SAMPLE_IDS.recordingA);

/** Recording A's file, as this device would upload it. */
function localA(overrides: Partial<ExportBundle> = {}): ExportBundle {
  return {
    exportedAtEpochMs: SAMPLE_START + 86_400_000,
    app: SAMPLE_APP,
    recordings: [sampleRecordingA()],
    shots: shotsOfA(),
    entities: null,
    settings: null,
    ...overrides,
  };
}

/** The repo's file: A's, written at another time by another build, unless overridden. */
function remote(overrides: Partial<ExportBundle> = {}): string {
  return serialiseExport({
    ...localA(),
    exportedAtEpochMs: SAMPLE_START + 5 * 86_400_000,
    app: { commit: 'def5678', buildTime: '2026-10-09T06:00:00.000Z' },
    ...overrides,
  });
}

describe('compareWithRemote', () => {
  it('finds files the same when only the time and build that wrote them differ', () => {
    expect(compareWithRemote(localA(), remote())).toEqual({ kind: 'same' });
    const reversed = remote({ shots: [...shotsOfA()].reverse() });
    expect(compareWithRemote(localA(), reversed)).toEqual({ kind: 'same' });
  });

  it('replaces a snapshot taken while recording, which holds fewer records', () => {
    const a = sampleRecordingA();
    const snapshot = {
      recording: { ...a.recording, endedAtEpochMs: null, endReason: null },
      frames: a.frames.slice(0, 100),
      events: a.events.slice(0, 3),
    };
    expect(compareWithRemote(localA(), remote({ recordings: [snapshot] }))).toEqual({
      kind: 'replace',
    });
  });

  it('replaces a file whose shots this device has changed since', () => {
    const graded = shotsOfA().map((shot) =>
      updateShot(shot, { direction: 'bitter' }, SAMPLE_START + 2 * 86_400_000),
    );
    expect(compareWithRemote(localA({ shots: graded }), remote())).toEqual({ kind: 'replace' });
  });

  it('keeps a file with records this device lacks', () => {
    const a = sampleRecordingA();
    const fewer = { ...a, frames: a.frames.slice(0, -2), events: a.events.slice(0, -1) };
    expect(compareWithRemote(localA({ recordings: [fewer] }), remote())).toEqual({
      kind: 'keep',
      reason: "the repo's copy has 2 more frames, 1 more event that this device lacks",
    });
    expect(compareWithRemote(localA({ shots: shotsOfA().slice(1) }), remote())).toEqual({
      kind: 'keep',
      reason: "the repo's copy has 1 more shot that this device lacks",
    });
  });

  it("keeps a file this build can't read, such as a newer version", () => {
    const newer = remote().replace(
      `"formatVersion": ${FORMAT_VERSION}`,
      `"formatVersion": ${FORMAT_VERSION + 1}`,
    );
    const verdict = compareWithRemote(localA(), newer);
    expect(verdict.kind).toBe('keep');
    expect(verdict.kind === 'keep' && verdict.reason).toContain("isn't an export this build");
    expect(compareWithRemote(localA(), 'not json').kind).toBe('keep');
  });

  it('keeps a file that holds another recording, or more than this one', () => {
    const b = sampleRecordingB();
    expect(compareWithRemote(localA(), remote({ recordings: [b], shots: [] }))).toEqual({
      kind: 'keep',
      reason: "the repo's file at this path holds another recording",
    });
    const both = remote({ recordings: [sampleRecordingA(), b] });
    expect(compareWithRemote(localA(), both)).toEqual({
      kind: 'keep',
      reason: "the repo's file holds more than this recording",
    });
    expect(compareWithRemote(localA(), remote({ settings: { 'last.doseG': 18 } })).kind).toBe(
      'keep',
    );
    expect(compareWithRemote(localA(), remote({ settings: {} }))).toEqual({ kind: 'same' });
    const withTags = { ...emptyEntityLists(), tags: SEEDS.tags };
    expect(compareWithRemote(localA(), remote({ entities: withTags }))).toEqual({
      kind: 'keep',
      reason: "the repo's file holds more than this recording",
    });
    expect(compareWithRemote(localA(), remote({ entities: emptyEntityLists() }))).toEqual({
      kind: 'same',
    });
  });

  it('wants a one-recording file to compare', () => {
    expect(() => compareWithRemote(localA({ recordings: [] }), remote())).toThrow(RangeError);
  });
});

describe('compareEntitiesWithRemote', () => {
  const at = SAMPLE_START + 86_400_000;

  /** The entities' file, holding `entities` alone. */
  function file(entities: EntityLists | null, overrides: Partial<ExportBundle> = {}): ExportBundle {
    return {
      exportedAtEpochMs: at,
      app: SAMPLE_APP,
      recordings: [],
      shots: [],
      entities,
      settings: null,
      ...overrides,
    };
  }

  const text = (entities: EntityLists | null, overrides: Partial<ExportBundle> = {}) =>
    serialiseExport({
      ...file(entities, overrides),
      exportedAtEpochMs: at + 5000,
      app: { commit: 'def5678', buildTime: '2026-10-09T06:00:00.000Z' },
    });

  const lungo = updateEntity('recipes', SEEDS.recipes[2], { coffeeRatio: 2.5 }, at);
  const edited: EntityLists = {
    ...SEEDS,
    recipes: SEEDS.recipes.map((recipe) => (recipe.id === lungo.id ? lungo : recipe)),
  };

  it('finds files the same when only the time and build differ, in any order', () => {
    expect(compareEntitiesWithRemote(file(SEEDS), text(SEEDS))).toEqual({ kind: 'same' });
    const reversed = { ...SEEDS, recipes: [...SEEDS.recipes].reverse() };
    expect(compareEntitiesWithRemote(file(SEEDS), text(reversed))).toEqual({ kind: 'same' });
  });

  it('replaces a file with fewer entities or older versions', () => {
    expect(compareEntitiesWithRemote(file(edited), text(SEEDS))).toEqual({ kind: 'replace' });
    const fewer = { ...SEEDS, tags: SEEDS.tags.slice(1) };
    expect(compareEntitiesWithRemote(file(SEEDS), text(fewer))).toEqual({ kind: 'replace' });
  });

  it('keeps a file with entities this device lacks, or newer versions of them', () => {
    expect(compareEntitiesWithRemote(file(SEEDS), text(edited))).toEqual({
      kind: 'keep',
      reason: "the repo's copy has 1 newer version that this device lacks",
    });
    const fewer = { ...SEEDS, tags: SEEDS.tags.slice(2) };
    expect(compareEntitiesWithRemote(file(fewer), text(edited))).toEqual({
      kind: 'keep',
      reason: "the repo's copy has 2 more entities, 1 newer version that this device lacks",
    });
  });

  it('keeps a file that isn’t the entities alone, or that this build can’t read', () => {
    expect(compareEntitiesWithRemote(file(SEEDS), text(null))).toEqual({
      kind: 'keep',
      reason: "the repo's file at this path holds no entities",
    });
    expect(
      compareEntitiesWithRemote(file(SEEDS), text(SEEDS, { recordings: [sampleRecordingB()] })),
    ).toEqual({ kind: 'keep', reason: "the repo's file holds more than the entities" });
    expect(
      compareEntitiesWithRemote(file(SEEDS), text(SEEDS, { settings: { 'lastUsed.doseG': 18 } }))
        .kind,
    ).toBe('keep');
    expect(compareEntitiesWithRemote(file(SEEDS), 'not json').kind).toBe('keep');
    expect(compareEntitiesWithRemote(file(emptyEntityLists()), text(emptyEntityLists()))).toEqual({
      kind: 'same',
    });
  });

  it('wants the entities alone to compare', () => {
    expect(() => compareEntitiesWithRemote(file(null), text(SEEDS))).toThrow(RangeError);
    expect(() =>
      compareEntitiesWithRemote(file(SEEDS, { shots: shotsOfA() }), text(SEEDS)),
    ).toThrow(RangeError);
  });
});
