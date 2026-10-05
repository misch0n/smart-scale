/**
 * History entries from simulated shots, for the history's view tests (test support only): a
 * scenario through the simulator and the analysis, with a live shot anchored after its pump
 * stopped, as the brew flow stores one at "shot done".
 */

import { shotTimeEpochMs, type HistoryEntry } from '../../app/history';
import { analyzeRecording, NO_PHASE_RESULTS, shotDose } from '../../core/analysis';
import { createShot, type NewShot } from '../../core/model';
import {
  espressoScenario,
  simulateSession,
  toRawRecording,
  type EspressoScenarioOptions,
  type ShotTruth,
} from '../../core/sim';

export interface SimulatedEntry {
  readonly entry: HistoryEntry;
  readonly truth: ShotTruth;
}

/** 2026-10-04 07:00 local time: a Sunday morning. */
export const SUNDAY_7AM = new Date(2026, 9, 4, 7).getTime();

export function simulatedEntry(
  scenario: EspressoScenarioOptions = {},
  shot: Partial<Omit<NewShot, 'recordingId' | 'anchorTMs' | 'source'>> = {},
  startedAtEpochMs = SUNDAY_7AM,
): SimulatedEntry {
  const session = simulateSession(espressoScenario({ manualStartMs: 7000, ...scenario }));
  const raw = toRawRecording(session, { startedAtEpochMs });
  const truth = session.truth.shots[0];
  const live = createShot(
    {
      recordingId: raw.recording.id,
      anchorTMs: truth.pumpOffMs + 2000,
      source: 'live',
      doseG: 18,
      targetRatio: 2,
      recipeName: 'Espresso',
      ...shot,
    },
    startedAtEpochMs + truth.pumpOffMs + 2000,
  );
  const { analysis, matching } = analyzeRecording(raw, [live]);
  const match = matching.shots[0];
  const segment = match.segment === null ? null : analysis.segments[match.segment];
  const result = {
    shot: live,
    segment,
    match,
    phases: NO_PHASE_RESULTS,
    dose: shotDose(live, null),
  };
  return {
    entry: {
      ...result,
      recording: raw.recording,
      atEpochMs: shotTimeEpochMs(raw.recording, result),
      refusedFrames: false,
    },
    truth,
  };
}
