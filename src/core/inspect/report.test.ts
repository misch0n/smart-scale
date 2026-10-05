import { describe, expect, it } from 'vitest';
import probeSession from '../../../fixtures/real/2026-10-04_probe-session_20444bd0.json?raw';
import twoShots from '../../../fixtures/real/2026-10-05_two-shots_0a69da56.json?raw';
import { analyzeRaw, analyzeRecording } from '../analysis';
import { ExportFormatError, FORMAT_VERSION, parseExport, serialiseExport } from '../export';
import { createShot, type Shot } from '../model';
import { espressoScenario, simulateSession, toRawRecording } from '../sim';
import { inspect, reportJson, type InspectionReport } from './report';
import { simulatedExport } from './simulate';
import { summarise } from './summary';
import { wellFormed } from './test-svg';

/** A simulated espresso shot's export, with `shots` in it. */
function exportOf(shots: (recordingId: string) => Shot[] = () => []) {
  const raw = toRawRecording(simulateSession(espressoScenario({ seed: 3 })));
  const text = serialiseExport({
    exportedAtEpochMs: raw.recording.endedAtEpochMs!,
    app: raw.recording.app,
    recordings: [raw],
    shots: shots(raw.recording.id),
    settings: null,
  });
  return { raw, text };
}

describe('inspect on a simulated export', () => {
  const simulated = simulatedExport('espresso', 2);
  const { report, charts } = inspect([simulated]);
  const [file] = report.files;
  const [recording] = file.recordings;
  const { bundle } = parseExport(simulated.text);

  it('reports the analysis exactly as the app caches it', () => {
    expect(report.analysisVersion).toBe(recording.analysis.analysisVersion);
    expect(recording.analysis).toEqual(analyzeRaw(bundle.recordings[0]).analysis);
    expect(file.source).toBe('simulated espresso, seed 2');
    expect(file.formatVersion).toBe(FORMAT_VERSION);
  });

  it('adds the pump detectors’ diagnostics per segment', () => {
    const run = analyzeRaw(bundle.recordings[0]);
    expect(recording.diagnostics).toEqual(
      run.markers.map(({ pump }, index) => ({
        index,
        vibration: pump.vibration,
        varianceStep: pump.varianceStep,
        regimeChange: pump.regimeChange,
      })),
    );
    // The simulator's scale shows no vibration (D-048): pump_off is the regime change.
    expect(recording.diagnostics[0].vibration?.clear ?? false).toBe(false);
    expect(recording.diagnostics[0].regimeChange?.accepted).toBe(true);
  });

  it('measures the analysis against the simulator’s truth', () => {
    const [shot] = recording.truth!;
    const segment = recording.analysis.segments[0];
    expect(shot.segment).toBe(0);
    expect(shot.truth.yieldG).toBe(simulated.truth.shots[0].yieldG);
    expect(shot.error.firstDripT).toBeCloseTo(
      segment.markers.firstDrip!.t - shot.truth.firstDripT!,
      9,
    );
    expect(shot.error.yieldG).toBeCloseTo(segment.metrics.yieldG! - shot.truth.yieldG!, 9);
    // On the simulator's defaults the markers are where D-047 measured them.
    expect(Math.abs(shot.error.firstDripT!)).toBeLessThan(0.3);
    expect(Math.abs(shot.error.pumpOffT!)).toBeLessThan(0.3);
    expect(Math.abs(shot.error.yieldG!)).toBeLessThan(0.2);
  });

  it('counts the records and lists the events', () => {
    const raw = bundle.recordings[0];
    expect(recording.records).toEqual({
      ff11: raw.frames.length,
      ff12: 0,
      mic: 0,
      events: raw.events.length,
    });
    expect(recording.events.map((event) => event.summary)).toEqual([
      'connected to BOOKOO simulator',
      '07 tare + start (auto-tare)',
      '07 tare + start (manual-start)',
      'disconnected (user)',
    ]);
    const { startedAtEpochMs, endedAtEpochMs } = raw.recording;
    expect(recording.durationS).toBeCloseTo((endedAtEpochMs! - startedAtEpochMs) / 1000, 9);
  });

  it('draws the recording and each segment, as well-formed SVG', () => {
    const short = recording.id.slice(-8);
    expect(recording.charts).toEqual([`${short}-overview.svg`, `${short}-segment-0.svg`]);
    expect(charts.map((chart) => chart.name)).toEqual(recording.charts);
    for (const chart of charts) expect(wellFormed(chart.svg)).toBe(true);
  });

  it('writes JSON that reads back as the report', () => {
    const json = reportJson(report);
    expect(json.endsWith('}\n')).toBe(true);
    expect(JSON.parse(json)).toEqual(report);
  });
});

describe('inspect on the real recordings (fixtures/real)', () => {
  const { report, charts } = inspect([
    { source: 'fixtures/real/2026-10-05_two-shots_0a69da56.json', text: twoShots },
    { source: 'fixtures/real/2026-10-04_probe-session_20444bd0.json', text: probeSession },
  ]);
  const [shots, probe] = report.files.map((file) => file.recordings[0]);

  it('reads both, in their own export format version', () => {
    expect(report.files.map((file) => file.formatVersion)).toEqual([1, 1]);
    expect(shots.id).toBe('01a10aa8-63dc-720e-9083-0b290a69da56');
    expect(shots.startedAt).toBe('2026-10-05T06:02:50.204Z');
    expect(shots.durationS).toBeCloseTo(612.855, 3);
    expect(shots.endReason).toBe('user');
    // Session 1 was exported while recording: no end, so its last record times it.
    expect(probe.endReason).toBeNull();
    expect(probe.durationS).toBeGreaterThan(338);
  });

  it('finds session 2’s bean pour and two shots, and session 1’s none', () => {
    expect(shots.analysis.segments).toHaveLength(3);
    expect(shots.analysis).toEqual(analyzeRaw(parseExport(twoShots).bundle.recordings[0]).analysis);
    expect(probe.analysis.segments).toEqual([]);
    expect(shots.records).toEqual({ ff11: 6085, ff12: 2, mic: 0, events: 22 });
    expect(shots.truth).toBeNull();
  });

  it('lists the Tare + start taps that started the shots (Q4)', () => {
    const taps = shots.events.filter((event) => event.summary.startsWith('07 tare + start'));
    expect(taps.map((event) => event.t)).toEqual([264.73, 551.082]);
  });

  it('draws one chart per recording and one per segment', () => {
    expect(charts.map((chart) => chart.name)).toEqual([
      '0a69da56-overview.svg',
      '0a69da56-segment-0.svg',
      '0a69da56-segment-1.svg',
      '0a69da56-segment-2.svg',
      '20444bd0-overview.svg',
    ]);
    for (const chart of charts) expect(wellFormed(chart.svg)).toBe(true);
    // Shot B: its tap, 0.4 s before its window starts, is on its chart.
    expect(charts[3].svg).toContain('>07 tare + start</text>');
  });
});

describe('inspect', () => {
  it('matches the file’s shots to the segments, as the app does', () => {
    const now = Date.UTC(2026, 9, 3);
    const { raw, text } = exportOf((recordingId) => [
      createShot({ recordingId, anchorTMs: 9000, source: 'manual', doseG: 18 }, now),
      // Another recording's shot isn't this recording's.
      createShot(
        { recordingId: '019a1b2c-3d4e-7000-8000-0000000000c3', anchorTMs: 9000, source: 'live' },
        now,
      ),
    ]);
    const [recording] = inspect([{ source: 'shots.json', text }]).report.files[0].recordings;
    const own = parseExport(text).bundle.shots.filter(
      (shot) => shot.recordingId === raw.recording.id,
    );
    const expected = analyzeRecording(raw, own).matching;
    expect(recording.matching.claims).toEqual(expected.claims);
    expect(recording.matching.postHoc).toEqual([]);
    expect(recording.matching.shots).toEqual([
      { ...expected.shots[0], anchorT: 9, source: 'manual', discarded: false, doseG: 18 },
    ]);
    expect(recording.matching.shots[0].ratio).toBeCloseTo(
      recording.analysis.segments[0].metrics.yieldG! / 18,
      9,
    );
  });

  it('runs with the parameters changed, and says so on the charts', () => {
    const { text } = exportOf();
    const overrides = { liquid: { sgWindowS: 0.7 } };
    const { report, charts } = inspect([{ source: 'x.json', text }], { overrides });
    expect(report.overrides).toEqual(overrides);
    expect(report.files[0].recordings[0].analysis.params.liquid.sgWindowS).toBe(0.7);
    for (const chart of charts)
      expect(chart.svg).toContain('parameters changed: liquid.sgWindowS=0.7');
  });

  it('draws nothing when the charts aren’t wanted', () => {
    const { text } = exportOf();
    const { report, charts } = inspect([{ source: 'x.json', text }], { charts: false });
    expect(charts).toEqual([]);
    expect(report.files[0].recordings[0].charts).toEqual([]);
  });

  it('names charts apart when two files hold the same recording', () => {
    const { text } = exportOf();
    const { charts } = inspect([
      { source: 'a.json', text },
      { source: 'b.json', text },
    ]);
    const names = charts.map((chart) => chart.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((name) => name.endsWith('-overview-2.svg'))).toHaveLength(1);
  });

  it('names the file that isn’t an export', () => {
    let caught: unknown;
    try {
      inspect([{ source: 'notes.json', text: '{"hello": 1}' }]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ExportFormatError);
    expect((caught as ExportFormatError).code).toBe('not-an-export');
    expect((caught as ExportFormatError).message).toMatch(/^notes\.json: /);
  });
});

describe('reportJson', () => {
  it('writes an array of numbers on one line, and the rest indented', () => {
    const report = {
      analysisVersion: 8,
      overrides: {},
      files: [{ source: 'x', weightG: [0, -0.5, null, 1.25e-7], tags: ['a', 'b'], empty: [] }],
    } as unknown as InspectionReport;
    const json = reportJson(report);
    expect(json).toContain('"weightG": [0,-0.5,null,1.25e-7]');
    expect(json).toContain('"tags": [\n');
    expect(JSON.parse(json)).toEqual(report);
  });

  it('keeps a number that isn’t finite visible, as a string', () => {
    const report = {
      analysisVersion: 1,
      overrides: {},
      files: [{ source: 'x', spread: Infinity, gap: Number.NaN }],
    } as unknown as InspectionReport;
    expect(JSON.parse(reportJson(report))).toEqual({
      analysisVersion: 1,
      overrides: {},
      files: [{ source: 'x', spread: 'Infinity', gap: 'NaN' }],
    });
  });
});

describe('summarise', () => {
  it('gives each segment’s markers, metrics and flags, and the truth', () => {
    const text = summarise(inspect([simulatedExport('espresso', 2)]).report);
    expect(text).toContain(`simulated espresso, seed 2 (export format ${FORMAT_VERSION})`);
    expect(text).toMatch(
      /segment 0 · [\d.]+–[\d.]+ s, ending cup-removed · rise [\d.]+ g · espresso: yes/,
    );
    expect(text).toMatch(
      /markers: pump_on [\d.]+ \((variance|manual)\), first_drip [\d.]+ \((gradual|abrupt)\), pump_off/,
    );
    expect(text).toMatch(/metrics: first-drip time [\d.]+ s, extraction [\d.]+ s/);
    expect(text).toContain('flags: ');
    expect(text).toMatch(/true shot 0 \(segment 0\): pump_on [\d.]+ \([+-][\d.]+\)/);
    expect(text).toContain('segment 0 would get a post-hoc shot');
  });

  it('says when a recording has no shot windows', () => {
    const text = summarise(inspect([{ source: 'probe.json', text: probeSession }]).report);
    expect(text).toContain('no shot windows');
  });
});
