import { describe, expect, it } from 'vitest';
import { espressoScenario, simulateSession, toRawRecording } from '../sim';
import { parseRecordingAnalysis } from './analysis-schema';
import { bridgeGaps, curveTime, CURVE_LEAD_S, CURVE_TRAIL_S, type SegmentCurve } from './curve';
import { windowLiquid } from './liquid';
import { analyzeRaw } from './recording-analysis';
import { timelineOffset } from './test-runs';

/** A simulated espresso shot, with a Tare + start tap at the pump, analysed. */
function simulatedShot(seed: number) {
  const session = simulateSession(espressoScenario({ seed, manualStartMs: 7000 }));
  const raw = toRawRecording(session);
  const run = analyzeRaw(raw);
  const offset = timelineOffset(session, raw.frames, run.timeline);
  const segment = run.analysis.segments.find((s) => s.espresso)!;
  const index = run.analysis.segments.indexOf(segment);
  return {
    run,
    segment,
    liquid: windowLiquid(run.segmentation, run.markers[index].window),
    truth: session.truth.shots[0],
    at: (ms: number) => ms / 1000 + offset,
  };
}

/** The curve's point nearest `t`, s on the timeline. */
function pointAt(curve: SegmentCurve, t: number) {
  const i = Math.round((t - curve.startT) / curve.stepS);
  return { weightG: curve.weightG[i] ?? null, flowGps: curve.flowGps[i] ?? null };
}

describe('segmentCurve', () => {
  it('follows simulated shots: dry before the first drip, the yield once settled', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { segment, truth, at } = simulatedShot(seed);
      const { curve } = segment;
      expect(curve.weightG.length).toBe(curve.flowGps.length);
      expect(curve.weightG.every((g) => g !== null)).toBe(true);

      // Before the first drip, the cup holds nothing; after it settles, the yield.
      const dry = pointAt(curve, at(truth.firstDripMs) - 1);
      expect(Math.abs(dry.weightG!)).toBeLessThan(0.15);
      expect(Math.abs(dry.flowGps!)).toBeLessThan(0.3);
      const settled = pointAt(curve, at(truth.settledMs) + 2);
      expect(settled.weightG).toBeCloseTo(truth.yieldG, 0);
      // Halfway through the extraction, the weight and the flow are the shot's.
      const midMs = (truth.firstDripMs + truth.pumpOffMs) / 2;
      const mid = pointAt(curve, at(midMs));
      expect(Math.abs(mid.flowGps! - truth.averageFlowGps)).toBeLessThan(
        0.35 * truth.averageFlowGps,
      );
      expect(mid.weightG!).toBeGreaterThan(0.2 * truth.yieldG);
      expect(mid.weightG!).toBeLessThan(0.8 * truth.yieldG);
    }
  });

  it('lies on the liquid it smooths, at the liquid’s times', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { segment, liquid } = simulatedShot(seed);
      const { curve } = segment;
      const { start, step, values } = liquid.grid;
      let compared = 0;
      for (let i = 0; i < curve.weightG.length; i++) {
        const value = values[Math.round((curveTime(curve, i) - start) / step)];
        if (!Number.isFinite(value)) continue;
        // 0.09 g at most on these shots; a point 0.2 s out of place is 0.4 g out at 2 g/s.
        expect(Math.abs(curve.weightG[i]! - value)).toBeLessThan(0.2);
        compared++;
      }
      expect(compared).toBe(curve.weightG.length);
    }
  });

  it('runs from before the shot to after it, inside the window, on whole grid steps', () => {
    const { segment, run } = simulatedShot(3);
    const { curve, window, markers } = segment;
    const end = curveTime(curve, curve.weightG.length - 1);
    const grid = run.analysis.timeline.intervalMs! / 1000;
    expect(curve.stepS / grid).toBeCloseTo(Math.round(curve.stepS / grid), 9);
    expect(curve.stepS).toBeGreaterThan(0.15);
    expect(curve.stepS).toBeLessThan(0.25);
    const startsBy = Math.min(markers.pumpOn!.t, markers.firstDrip!.t, window.baseline.endT);
    expect(curve.startT).toBeGreaterThanOrEqual(window.startT - 1e-9);
    expect(curve.startT).toBeLessThanOrEqual(
      Math.max(window.startT, startsBy - CURVE_LEAD_S) + curve.stepS,
    );
    expect(curve.startT).toBeLessThan(markers.pumpOn!.t);
    const endsBy = Math.max(markers.pumpOff!.t, markers.settled!.t) + CURVE_TRAIL_S;
    expect(end).toBeLessThanOrEqual(Math.min(window.endT, endsBy) + 1e-9);
    expect(end).toBeGreaterThan(Math.min(window.endT, endsBy) - curve.stepS - 0.2);
  });

  it('is JSON-native, in hundredths, and passes the cache’s check', () => {
    const { run } = simulatedShot(2);
    const stored = JSON.parse(JSON.stringify(run.analysis)) as unknown;
    expect(parseRecordingAnalysis(stored)).toEqual(run.analysis);
    for (const { curve } of run.analysis.segments) {
      for (const value of [...curve.weightG, ...curve.flowGps]) {
        if (value === null) continue;
        expect(Math.round(value * 100) / 100).toBe(value);
        expect(Object.is(value, -0)).toBe(false);
      }
    }
  });

  it('is refused by the cache’s check when it is missing', () => {
    const { run } = simulatedShot(2);
    const stored = JSON.parse(JSON.stringify(run.analysis)) as { segments: { curve?: unknown }[] };
    delete stored.segments[0].curve;
    expect(() => parseRecordingAnalysis(stored)).toThrow(/curve/);
  });
});

describe('bridgeGaps', () => {
  it('fills short runs of NaN between two numbers in a straight line', () => {
    const NaN_ = Number.NaN;
    expect(bridgeGaps([0, NaN_, NaN_, 3, 4], 2)).toEqual([0, 1, 2, 3, 4]);
    expect(bridgeGaps([1, NaN_, 1], 1)).toEqual([1, 1, 1]);
  });

  it('leaves longer runs, and runs at either end, as they are', () => {
    const NaN_ = Number.NaN;
    expect(bridgeGaps([0, NaN_, NaN_, NaN_, 4], 2)).toEqual([0, NaN_, NaN_, NaN_, 4]);
    expect(bridgeGaps([NaN_, 1, 2, NaN_], 5)).toEqual([NaN_, 1, 2, NaN_]);
    expect(bridgeGaps([], 5)).toEqual([]);
  });
});
