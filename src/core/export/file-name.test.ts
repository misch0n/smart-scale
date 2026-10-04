import { describe, expect, it } from 'vitest';
import { createRecording } from '../model';
import { allExportFileName, recordingArchivePath, recordingExportFileName } from './file-name';

const ID = '019a1b2c-3d4e-7000-8000-0123456789ab';

function recordingAt(startedAtEpochMs: number) {
  return createRecording({
    id: ID,
    startedAtEpochMs,
    device: { name: null, id: null },
    transport: 'mock',
    app: { commit: 'abc1234', buildTime: '2026-10-04T06:00:00.000Z' },
    userAgent: null,
  });
}

describe('export file names', () => {
  it('names a recording by its local start time and short id', () => {
    const start = Date.UTC(2026, 9, 4, 6, 30, 5, 999);
    // Central European Summer Time: local time is UTC + 2 h, so the offset is −120.
    expect(recordingExportFileName(recordingAt(start), -120)).toBe(
      'smart-scale_2026-10-04_083005_456789ab.json',
    );
    expect(recordingExportFileName(recordingAt(start), 0)).toBe(
      'smart-scale_2026-10-04_063005_456789ab.json',
    );
  });

  it("files a recording in an archive by its local start's year and month (T1.20)", () => {
    // 23:30 UTC on 31 October is 00:30 on 1 November in Central European Time (UTC + 1 h).
    const start = Date.UTC(2026, 9, 31, 23, 30);
    expect(recordingArchivePath(recordingAt(start), -60)).toBe(
      '2026/11/smart-scale_2026-11-01_003000_456789ab.json',
    );
    expect(recordingArchivePath(recordingAt(start), 0)).toBe(
      '2026/10/smart-scale_2026-10-31_233000_456789ab.json',
    );
  });

  it('crosses midnight and the year in local time', () => {
    // 02:00 UTC on New Year's Day is 21:00 the day before in New York (UTC − 5 h).
    expect(allExportFileName(Date.UTC(2026, 0, 1, 2), 300)).toBe(
      'smart-scale_2025-12-31_210000_all.json',
    );
    expect(allExportFileName(Date.UTC(2026, 11, 31, 23, 30), -60)).toBe(
      'smart-scale_2027-01-01_003000_all.json',
    );
  });

  it('pads every part, and handles half-hour zones', () => {
    expect(allExportFileName(Date.UTC(2026, 1, 3, 4, 5, 6), 0)).toBe(
      'smart-scale_2026-02-03_040506_all.json',
    );
    // India, UTC + 5:30.
    expect(allExportFileName(Date.UTC(2026, 1, 3, 4, 5, 6), -330)).toBe(
      'smart-scale_2026-02-03_093506_all.json',
    );
  });

  it('refuses a time or an offset that gives no date', () => {
    expect(() => allExportFileName(Number.NaN, 0)).toThrow(RangeError);
    expect(() => allExportFileName(Date.UTC(2026, 0, 1), Number.NaN)).toThrow(RangeError);
    expect(() => allExportFileName(9e15, 0)).toThrow(RangeError);
  });
});
