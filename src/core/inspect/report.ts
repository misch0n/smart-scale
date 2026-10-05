/**
 * The inspection report (T1.15): every recording in one or more export files analysed, as JSON,
 * with a chart per recording and per segment.
 *
 * Per recording, the report holds:
 * - `analysis`: the `RecordingAnalysis` exactly as the app's derived cache keeps it (T1.14):
 *   markers, tail fits, metrics and flags per segment, and the recording's steps;
 * - `diagnostics`: per segment, what the pump detectors saw, which the cache leaves out (D-047):
 *   the vibration's noise step, the variance step at pump_off and the regime change;
 * - `matching`: the file's shots for the recording, matched to its segments (D-047);
 * - `events`: the app events, one line each, on the timeline (s);
 * - `truth`: for a simulated recording, the simulator's markers and metrics per shot, and the
 *   analysis's error against them;
 * - `charts`: the names of its charts.
 *
 * Pure: `inspect` reads export text and returns the report and the charts' SVG. Reading files
 * and writing them is the CLI's (`scripts/analyze.mjs`).
 */

import {
  analyzeRecording,
  ANALYSIS_VERSION,
  type AnalysisOverrides,
  type NoiseStep,
  type PostHocShot,
  type RecordingAnalysis,
  type RegimeChange,
  type SegmentAnalysis,
  type ShotMatch,
  type VarianceStep,
} from '../analysis';
import {
  ExportFormatError,
  parseExport,
  type ExportedRecording,
  type ParsedExport,
} from '../export';
import type {
  FrameSource,
  Id,
  RecordingEndReason,
  Shot,
  ShotSource,
  TransportKind,
} from '../model';
import type { ShotTruth } from '../sim';
import { renderChart } from './chart';
import { eventSummary, recordingChart, segmentChart, type TrueMarkers } from './charts';

/** One export file to inspect. */
export interface InspectInput {
  /** What the report calls it: the path given, or what was simulated. */
  readonly source: string;
  /** The file's text. */
  readonly text: string;
  /** For a simulated export, the simulator's truth about its recording. */
  readonly truth?: SimulationTruth;
}

/** The simulator's truth about a simulated recording (`simulatedExport`). */
export interface SimulationTruth {
  readonly recordingId: Id;
  /** Timeline time less the true sample time, s: the link's least latency (T1.9). */
  readonly offsetS: number;
  readonly shots: readonly ShotTruth[];
}

export interface InspectOptions {
  /** Parameters to change from their defaults (`--param`). */
  readonly overrides?: AnalysisOverrides;
  /** Draw the charts. Default true; without them, `charts` is empty. */
  readonly charts?: boolean;
}

/** A chart: a file name, and the SVG to write to it. */
export interface Chart {
  readonly name: string;
  readonly svg: string;
}

export interface Inspection {
  readonly report: InspectionReport;
  readonly charts: readonly Chart[];
}

export interface InspectionReport {
  readonly analysisVersion: number;
  /** The parameters changed from their defaults; `{}` for none. */
  readonly overrides: AnalysisOverrides;
  readonly files: readonly FileReport[];
}

export interface FileReport {
  readonly source: string;
  /** The file's export format version, before any migration. */
  readonly formatVersion: number;
  readonly exportedAt: string;
  readonly recordings: readonly RecordingReport[];
}

export interface RecordingReport {
  readonly id: Id;
  readonly startedAt: string;
  /** To its end, or to its last record while it was still open when exported, s. */
  readonly durationS: number;
  readonly endReason: RecordingEndReason | null;
  readonly device: string | null;
  readonly transport: TransportKind;
  /** The build that captured it. */
  readonly app: string;
  readonly records: { readonly [K in FrameSource]: number } & { readonly events: number };
  readonly analysis: RecordingAnalysis;
  /** Per segment, in order. */
  readonly diagnostics: readonly SegmentDiagnostics[];
  readonly matching: MatchingReport;
  readonly events: readonly EventLine[];
  /** For a simulated recording; null for a real one. */
  readonly truth: readonly TruthReport[] | null;
  /** Chart names: the recording's, then one per segment; empty without charts. */
  readonly charts: readonly string[];
}

/** What the pump detectors saw in a segment (T1.13, D-036), which the cache leaves out. */
export interface SegmentDiagnostics {
  readonly index: number;
  /** The noise step before the first drip: whether the vibration shows. */
  readonly vibration: NoiseStep | null;
  /** The noise step down at pump_off, when the vibration showed. */
  readonly varianceStep: VarianceStep | null;
  /** The knee at pump_off: pump_off without the vibration, else a check. */
  readonly regimeChange: RegimeChange | null;
}

export interface MatchingReport {
  /** The file's shots for this recording, in its order, each with its match. */
  readonly shots: readonly (ShotMatch & ShotSummary)[];
  /** Per segment, the id of the shot that claims it, or null. */
  readonly claims: readonly (Id | null)[];
  /** Segments that look like espresso and that no shot claims: the app would add a shot. */
  readonly postHoc: readonly PostHocShot[];
}

/** What matching reads of a shot. */
export interface ShotSummary {
  readonly anchorT: number;
  readonly source: ShotSource;
  readonly discarded: boolean;
  readonly doseG: number | null;
}

export interface EventLine {
  readonly seq: number;
  /** s on the recording's clock, which the timeline follows. */
  readonly t: number;
  readonly type: string;
  readonly summary: string;
}

/** Marker times (s on the timeline) and metrics, as the analysis names them. */
export interface ShotFigures {
  readonly pumpOnT: number | null;
  readonly firstDripT: number | null;
  readonly pumpOffT: number | null;
  readonly settledT: number | null;
  readonly cupRemovedT: number | null;
  readonly firstDripS: number | null;
  readonly extractionS: number | null;
  readonly totalS: number | null;
  readonly averageFlowGps: number | null;
  readonly pumpOffWeightG: number | null;
  readonly yieldG: number | null;
  readonly honestYieldG: number | null;
  readonly tailMassG: number | null;
  readonly tauS: number | null;
}

/** One simulated shot: the truth, and how far the analysis is from it. */
export interface TruthReport {
  readonly index: number;
  /** The segment whose window holds the true first drip, or null. */
  readonly segment: number | null;
  readonly truth: ShotFigures;
  /** The analysis less the truth; null where either is missing. */
  readonly error: ShotFigures;
}

/** Inspects the export files: see the module comment. Pure. */
export function inspect(inputs: readonly InspectInput[], options: InspectOptions = {}): Inspection {
  const overrides = options.overrides ?? {};
  const charts: Chart[] = [];
  const taken = new Set<string>();
  const unique = (name: string): string => {
    let candidate = name;
    for (let n = 2; taken.has(candidate); n++) candidate = name.replace(/\.svg$/, `-${n}.svg`);
    taken.add(candidate);
    return candidate;
  };

  const files = inputs.map((input): FileReport => {
    const { formatVersion, bundle } = parseNamed(input);
    const recordings = bundle.recordings.map((entry) => {
      const shots = bundle.shots.filter((shot) => shot.recordingId === entry.recording.id);
      const truth = input.truth?.recordingId === entry.recording.id ? input.truth : null;
      const draw = options.charts ?? true;
      const report = inspectRecording(input.source, entry, shots, truth, overrides, draw);
      const names = report.charts.map((chart) => unique(chart.name));
      report.charts.forEach((chart, i) => charts.push({ name: names[i], svg: chart.svg }));
      return { ...report.report, charts: names };
    });
    return {
      source: input.source,
      formatVersion,
      exportedAt: new Date(bundle.exportedAtEpochMs).toISOString(),
      recordings,
    };
  });
  return { report: { analysisVersion: ANALYSIS_VERSION, overrides, files }, charts };
}

/**
 * The report as JSON text, indented. A number that isn't finite is written as a string, such as
 * "Infinity", where `JSON.stringify` would write null and hide it.
 */
export function reportJson(report: InspectionReport): string {
  const json = JSON.stringify(
    report,
    (_, value: unknown) =>
      typeof value === 'number' && !Number.isFinite(value) ? String(value) : value,
    2,
  );
  return `${json}\n`;
}

/** `parseExport`, with the input's source in the message of any error. */
function parseNamed(input: InspectInput): ParsedExport {
  try {
    return parseExport(input.text);
  } catch (error) {
    if (!(error instanceof ExportFormatError)) throw error;
    throw new ExportFormatError(error.code, `${input.source}: ${error.message}`, { cause: error });
  }
}

function inspectRecording(
  source: string,
  entry: ExportedRecording,
  shots: readonly Shot[],
  truth: SimulationTruth | null,
  overrides: AnalysisOverrides,
  draw: boolean,
): { report: RecordingReport; charts: Chart[] } {
  const { recording, frames, events } = entry;
  const run = analyzeRecording(entry, shots, overrides);
  const { analysis, matching } = run;
  const short = recording.id.slice(-8);
  // A loop, not Math.max(...): an hour of sound levels is more records than a call takes.
  let lastTMs = 0;
  for (const record of [frames, events].flat()) lastTMs = Math.max(lastTMs, record.tMs);
  const trueMarkers = truth ? truth.shots.map((shot) => trueMarkersOf(shot, truth.offsetS)) : [];

  const records = { ff11: 0, ff12: 0, mic: 0, events: events.length };
  for (const frame of frames) records[frame.source]++;

  const fileName = source.split(/[\\/]/).pop() ?? source;
  const changed = (Object.keys(overrides) as (keyof AnalysisOverrides)[]).flatMap((stage) =>
    Object.entries(overrides[stage] ?? {}).map(
      ([name, value]) => `${stage}.${name}=${String(value)}`,
    ),
  );
  const input = {
    label: `${fileName} · recording ${short}`,
    frames,
    events,
    run,
    truth: trueMarkers,
    notes: [
      `analysis version ${ANALYSIS_VERSION}` +
        (changed.length > 0 ? ` · parameters changed: ${changed.join(', ')}` : ''),
    ],
  };
  const charts: Chart[] = draw
    ? [
        { name: `${short}-overview.svg`, svg: renderChart(recordingChart(input)) },
        ...analysis.segments.map((segment) => ({
          name: `${short}-segment-${segment.index}.svg`,
          svg: renderChart(segmentChart(input, segment.index)),
        })),
      ]
    : [];

  const report: RecordingReport = {
    id: recording.id,
    startedAt: new Date(recording.startedAtEpochMs).toISOString(),
    durationS:
      (recording.endedAtEpochMs === null
        ? lastTMs
        : recording.endedAtEpochMs - recording.startedAtEpochMs) / 1000,
    endReason: recording.endReason,
    device: recording.device.name,
    transport: recording.transport,
    app: recording.app.commit,
    records,
    analysis,
    diagnostics: run.markers.map(({ pump }, index) => ({
      index,
      vibration: pump.vibration,
      varianceStep: pump.varianceStep,
      regimeChange: pump.regimeChange,
    })),
    matching: {
      shots: matching.shots.map((match, i) => ({
        ...match,
        anchorT: shots[i].anchorTMs / 1000,
        source: shots[i].source,
        discarded: shots[i].discardedAtEpochMs !== null,
        doseG: shots[i].doseG,
      })),
      claims: matching.claims,
      postHoc: matching.postHoc,
    },
    events: events.map((event) => ({
      seq: event.seq,
      t: event.tMs / 1000,
      type: event.type,
      summary: eventSummary(event),
    })),
    truth: truth ? truthReports(trueMarkers, truth.shots, analysis.segments) : null,
    charts: [],
  };
  return { report, charts };
}

/** A simulated shot's true markers on the timeline. */
function trueMarkersOf(shot: ShotTruth, offsetS: number): TrueMarkers {
  const at = (ms: number) => ms / 1000 + offsetS;
  return {
    index: shot.index,
    pumpOnT: at(shot.pumpOnMs),
    firstDripT: at(shot.firstDripMs),
    pumpOffT: at(shot.pumpOffMs),
    settledT: at(shot.settledMs),
    cupRemovedT: shot.cupRemovedMs === null ? null : at(shot.cupRemovedMs),
  };
}

function truthReports(
  markers: readonly TrueMarkers[],
  shots: readonly ShotTruth[],
  segments: readonly SegmentAnalysis[],
): TruthReport[] {
  return shots.map((shot, i) => {
    const marker = markers[i];
    const truth: ShotFigures = {
      pumpOnT: marker.pumpOnT,
      firstDripT: marker.firstDripT,
      pumpOffT: marker.pumpOffT,
      settledT: marker.settledT,
      cupRemovedT: marker.cupRemovedT,
      firstDripS: shot.preInfusionMs / 1000,
      extractionS: shot.extractionMs / 1000,
      totalS: shot.totalMs / 1000,
      averageFlowGps: shot.averageFlowGps,
      pumpOffWeightG: shot.weightAtPumpOffG,
      yieldG: shot.yieldG,
      honestYieldG: shot.honestYieldG,
      tailMassG: shot.tailMassG,
      tauS: shot.tailTauMs / 1000,
    };
    const segment =
      segments.find(
        ({ window }) => window.startT <= marker.firstDripT && marker.firstDripT <= window.endT,
      ) ?? null;
    const found: ShotFigures | null = segment && {
      pumpOnT: segment.markers.pumpOn?.t ?? null,
      firstDripT: segment.markers.firstDrip?.t ?? null,
      pumpOffT: segment.markers.pumpOff?.t ?? null,
      settledT: segment.markers.settled?.t ?? null,
      cupRemovedT: segment.markers.cupRemoved?.t ?? null,
      ...segment.metrics,
    };
    const error = Object.fromEntries(
      (Object.keys(truth) as (keyof ShotFigures)[]).map((key) => {
        const value = found?.[key] ?? null;
        const real = truth[key];
        return [key, value === null || real === null ? null : value - real];
      }),
    ) as unknown as ShotFigures;
    return { index: shot.index, segment: segment?.index ?? null, truth, error };
  });
}
