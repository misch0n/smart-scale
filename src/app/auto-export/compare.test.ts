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
import { updateShot } from '../../core/model';
import { compareWithRemote } from './compare';

const shotsOfA = () => sampleShots().filter((s) => s.recordingId === SAMPLE_IDS.recordingA);

/** Recording A's file, as this device would upload it. */
function localA(overrides: Partial<ExportBundle> = {}): ExportBundle {
  return {
    exportedAtEpochMs: SAMPLE_START + 86_400_000,
    app: SAMPLE_APP,
    recordings: [sampleRecordingA()],
    shots: shotsOfA(),
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
  });

  it('wants a one-recording file to compare', () => {
    expect(() => compareWithRemote(localA({ recordings: [] }), remote())).toThrow(RangeError);
  });
});
