/**
 * A simulated export for the inspection CLI (T1.15): a simulator session (T1.3) as the recorder
 * would store it, written by the export serialiser (T1.7), with the simulator's truth beside it.
 * The CLI reads it like any file, so a simulated shot and a real one can be inspected side by
 * side (T1.16 brings the simulator to the real shots).
 */

import { serialiseExport } from '../export';
import { median } from '../signal';
import { demoScenario, espressoScenario, simulateSession, toRawRecording } from '../sim';
import { buildTimeline } from '../timebase';
import type { InspectInput, SimulationTruth } from './report';

/**
 * - `espresso`: one shot into a cup, started with Tare + start (`espressoScenario`);
 * - `demo`: two shots into two cups, with the scale's tare button pressed in between
 *   (`demoScenario`).
 */
export const SIMULATED_SCENARIOS = ['espresso', 'demo'] as const;
export type SimulatedScenario = (typeof SIMULATED_SCENARIOS)[number];

export interface SimulatedExport extends InspectInput {
  /** A file name for the export, to save it beside the charts. */
  readonly fileName: string;
  readonly truth: SimulationTruth;
}

/** The export of a simulated `scenario` with `seed`, and its truth. Deterministic. */
export function simulatedExport(scenario: SimulatedScenario, seed: number): SimulatedExport {
  const session = simulateSession(
    scenario === 'espresso' ? espressoScenario({ seed }) : demoScenario(seed),
  );
  const raw = toRawRecording(session);
  const text = serialiseExport({
    exportedAtEpochMs: raw.recording.endedAtEpochMs ?? raw.recording.startedAtEpochMs,
    app: raw.recording.app,
    recordings: [raw],
    shots: [],
    settings: null,
  });
  // toRawRecording keeps the frames in arrival order, as the session has them: frame i's truth
  // is session.frames[i].truth.
  const truthBySeq = new Map(raw.frames.map((frame, i) => [frame.seq, session.frames[i].truth]));
  const timeline = buildTimeline(raw.frames);
  const offsets = timeline.samples.flatMap((sample) => {
    const truth = truthBySeq.get(sample.seq);
    return truth ? [sample.t - truth.sampleTMs / 1000] : [];
  });
  return {
    source: `simulated ${scenario}, seed ${seed}`,
    fileName: `simulated-${scenario}-seed-${seed}.json`,
    text,
    truth: {
      recordingId: raw.recording.id,
      offsetS: offsets.length > 0 ? median(offsets) : 0,
      shots: session.truth.shots,
    },
  };
}
