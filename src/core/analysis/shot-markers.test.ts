/**
 * shotMarkers' two levels (T1.16, D-059): first_drip on the pre-infusion's level, the yields
 * from the stable level before the pump. Against the simulator's truth, at 0.1 g without the
 * pump's vibration, as the real scale is (D-048).
 */

import { describe, expect, it } from 'vitest';
import type { RawFrame } from '../model';
import { decodeFrame, encodeWeightFrame, tareAndStartTimer } from '../protocol';
import { espressoScenario, type ScriptEvent, type SimulatedSession } from '../sim';
import { prePumpBaseline, shotMarkers } from './shot-markers';
import { phasedPumpOnMs, seeds, simulateRun } from './test-runs';

/** The reading `dipG` lower while the pump runs, from `fromMs` to `toMs`: shot B's dip. */
const dipping =
  (fromMs: number, toMs: number, dipG: number) =>
  (frames: RawFrame[], session: SimulatedSession): RawFrame[] =>
    frames.map((frame, i) => {
      const decoded = decodeFrame(frame.bytes);
      const ms = session.frames[i].truth.sampleTMs;
      if (decoded.kind !== 'weight' || ms < fromMs || ms >= toMs) return frame;
      const weightG = Math.round((decoded.weightG - dipG) * 10) / 10 + 0;
      return {
        ...frame,
        bytes: encodeWeightFrame({ ...decoded, weightG, weightSignByte: undefined }),
      };
    });

/** The usual shot at 0.1 g without vibration, tapped with the pump, its reading dipping 0.2 g. */
function dippedShot(seed: number, dipG = 0.2) {
  const pumpOnMs = phasedPumpOnMs(seed);
  const usual = espressoScenario({ seed, pumpOnMs, scale: { vibrationSigmaG: 0 } });
  const tap: ScriptEvent = {
    type: 'command',
    atMs: pumpOnMs,
    command: tareAndStartTimer(),
    reason: 'manual-start',
  };
  const scenario = { ...usual, script: [...usual.script, tap] };
  // The usual shot: 6 s of pre-infusion, 22 s of extraction.
  const pumpOffMs = pumpOnMs + 6000 + 22_000;
  const run = simulateRun(scenario, dipping(pumpOnMs + 300, pumpOffMs, dipG));
  const window = run.segmentation.shotWindows[0];
  return { run, window, m: shotMarkers(run.segmentation, window), pumpOnMs };
}

describe('shotMarkers: the level before the pump (D-059)', () => {
  it('measures the yields from before the pump, and first_drip on the dip', () => {
    for (const seed of seeds(8)) {
      const { run, window, m, pumpOnMs } = dippedShot(seed);
      const [truth] = run.session.truth.shots;
      // The segmentation's baseline is the dip's level, which runs on to the first drip.
      expect(window.baseline.endT).toBeGreaterThan(run.at(truth.firstDripMs) - 1);
      // The yields' baseline ends at the tap, at the cup's own 110 g; the window's sits in the
      // dip, plus the first drops it runs on past (D-034).
      expect(m.window.baseline.endT).toBeCloseTo(pumpOnMs / 1000, 9);
      expect(Math.abs(m.window.baseline.levelG - 110)).toBeLessThan(0.01);
      expect(Math.abs(window.baseline.levelG - 109.8)).toBeLessThan(0.05);
      expect(Math.abs(m.liquid.settled!.weightG - truth.yieldG)).toBeLessThan(0.06);
      expect(Math.abs(m.liquid.cupRemoved!.weightG - truth.honestYieldG!)).toBeLessThan(0.06);
      expect(Math.abs(m.liquid.firstDrip!.t - run.at(truth.firstDripMs))).toBeLessThan(0.15);
    }
  });

  it('reads the cup itself where the reading holds its level as the pump starts', () => {
    // Without the vibration the window's baseline runs on past the first drops (D-034): the
    // level before the pump leaves them out.
    for (const seed of seeds(4)) {
      const { m, window } = dippedShot(seed, 0);
      expect(Math.abs(m.window.baseline.levelG - 110)).toBeLessThan(0.01);
      expect(Math.abs(window.baseline.levelG - 110)).toBeLessThan(0.05);
    }
  });

  it('keeps the window’s baseline when it ends before the pump starts', () => {
    const { run, window } = dippedShot(1);
    expect(prePumpBaseline(run.segmentation, window, window.baseline.endT + 0.5)).toBeNull();
    // Nor is there one before a pump started as the cup went on.
    const cupOnT = window.cupPlaced!.endT;
    expect(prePumpBaseline(run.segmentation, window, cupOnT + 0.2)).toBeNull();
  });
});
