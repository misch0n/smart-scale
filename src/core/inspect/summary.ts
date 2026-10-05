/**
 * The report as a few lines of text per segment (`npm run analyze -- --summary`): the markers,
 * the metrics and the flags, and for a simulated recording the error against the truth. The
 * JSON report has the rest.
 */

import type { SegmentAnalysis } from '../analysis';
import type { InspectionReport, RecordingReport, ShotFigures, TruthReport } from './report';

/** The report, summarised: see the module comment. */
export function summarise(report: InspectionReport): string {
  const lines: string[] = [];
  const changed = Object.entries(report.overrides).flatMap(([stage, values]) =>
    Object.entries((values ?? {}) as Readonly<Record<string, number>>).map(
      ([name, value]) => `${stage}.${name}=${value}`,
    ),
  );
  lines.push(
    `analysis version ${report.analysisVersion}` +
      (changed.length > 0 ? ` · parameters changed: ${changed.join(', ')}` : ''),
  );
  for (const file of report.files) {
    lines.push('', `${file.source} (export format ${file.formatVersion})`);
    for (const recording of file.recordings) lines.push(...recordingLines(recording));
  }
  return `${lines.join('\n')}\n`;
}

function recordingLines(recording: RecordingReport): string[] {
  const { analysis } = recording;
  const lines = [
    `  recording ${recording.id} · ${recording.startedAt} · ${recording.durationS.toFixed(1)} s` +
      ` · ${analysis.timeline.frames} weight frames · quantum ${analysis.quantisationG} g` +
      ` · flags: ${list(analysis.flags)}`,
  ];
  if (analysis.segments.length === 0) lines.push('    no shot windows');
  for (const segment of analysis.segments) lines.push(...segmentLines(segment));
  for (const match of recording.matching.shots) {
    lines.push(
      `    shot ${match.shotId} (${match.source}${match.discarded ? ', discarded' : ''}) at ` +
        `${match.anchorT.toFixed(2)} s: ` +
        (match.segment === null
          ? `unmatched (${match.unmatched})`
          : `segment ${match.segment}${match.ratio === null ? '' : `, ratio ${match.ratio.toFixed(2)}`}`),
    );
  }
  for (const post of recording.matching.postHoc) {
    lines.push(`    segment ${post.segment} would get a post-hoc shot at ${post.anchorTMs} ms`);
  }
  for (const truth of recording.truth ?? []) lines.push(...truthLines(truth));
  if (recording.charts.length > 0) lines.push(`    charts: ${recording.charts.join(', ')}`);
  return lines;
}

function segmentLines(segment: SegmentAnalysis): string[] {
  const { window, markers, metrics } = segment;
  return [
    `    segment ${segment.index} · ${s(window.startT)}–${s(window.endT)} s, ending ${window.end}` +
      ` · rise ${g(window.riseG)} · espresso: ${segment.espresso ? 'yes' : 'no'}`,
    '      markers: ' +
      [
        `pump_on ${time(markers.pumpOn?.t)}`,
        `first_drip ${time(markers.firstDrip?.t)}${how(markers.firstDrip?.onset)}`,
        `pump_off ${time(markers.pumpOff?.t)}${how(markers.pumpOff?.detector)}`,
        `settled ${time(markers.settled?.t)}${how(markers.settled?.source)}`,
        `cup_removed ${time(markers.cupRemoved?.t)}`,
      ].join(', '),
    '      metrics: ' +
      [
        `first-drip time ${or(metrics.firstDripS, s, ' s')}`,
        `extraction ${or(metrics.extractionS, s, ' s')}`,
        `total ${or(metrics.totalS, s, ' s')}`,
        `average flow ${or(metrics.averageFlowGps, (v) => v.toFixed(2), ' g/s')}`,
        `w(pump_off) ${or(metrics.pumpOffWeightG, g)}`,
        `yield ${or(metrics.yieldG, g)}`,
        `honest yield ${or(metrics.honestYieldG, g)}`,
        `tail ${or(metrics.tailMassG, g)}`,
        `τ ${or(metrics.tauS, s, ' s')}`,
      ].join(', '),
    `      flags: ${list(segment.flags)}`,
  ];
}

const TRUTH_KEYS: readonly (readonly [keyof ShotFigures, string, 's' | 'g' | 'g/s'])[] = [
  ['pumpOnT', 'pump_on', 's'],
  ['firstDripT', 'first_drip', 's'],
  ['pumpOffT', 'pump_off', 's'],
  ['settledT', 'settled', 's'],
  ['yieldG', 'yield', 'g'],
  ['honestYieldG', 'honest yield', 'g'],
  ['tauS', 'τ', 's'],
];

function truthLines(truth: TruthReport): string[] {
  const parts = TRUTH_KEYS.map(([key, name, unit]) => {
    const real = truth.truth[key];
    const error = truth.error[key];
    const shown = real === null ? '—' : unit === 's' ? s(real) : real.toFixed(2);
    const off = error === null ? 'not found' : `${error >= 0 ? '+' : ''}${error.toFixed(2)}`;
    return `${name} ${shown} (${off})`;
  });
  return [`    true shot ${truth.index} (segment ${truth.segment ?? 'none'}): ${parts.join(', ')}`];
}

function s(value: number): string {
  return value.toFixed(2);
}

function g(value: number): string {
  return `${value.toFixed(1)} g`;
}

function time(value: number | undefined): string {
  return value === undefined ? '—' : s(value);
}

function how(value: string | undefined): string {
  return value === undefined ? '' : ` (${value})`;
}

function or(value: number | null, format: (value: number) => string, unit = ''): string {
  return value === null ? '—' : `${format(value)}${unit}`;
}

function list(values: readonly string[]): string {
  return values.length > 0 ? values.join(', ') : 'none';
}
