import { describe, expect, it } from 'vitest';
import type { FirstDrip } from './first-drip';
import { markersInOrder, shotMetrics, type SegmentMarkers } from './metrics';
import type { TailFit } from './tail';

const firstDrip = (t: number): FirstDrip => ({
  t,
  onset: 'gradual',
  changeT: t,
  alarmT: t + 0.3,
  sigmaG: 0.1,
  fitPoints: 20,
  fitRmsG: 0.1,
});

/** A shot: pump on at 10 s, first drip at 16 s, pump off at 38 s, 35.25 g by then, 38 g in all. */
const full: SegmentMarkers = {
  pumpOn: { t: 10, source: 'variance' },
  firstDrip: firstDrip(16),
  pumpOff: { t: 38, detector: 'variance', weightG: 35.25 },
  settled: { t: 43, weightG: 38, source: 'measured' },
  cupRemoved: { t: 70, weightG: 37.9 },
};

const tail: TailFit = {
  source: 'flow',
  tauS: 1.5,
  flowAtPumpOffGps: 1.83,
  finalWeightG: 38,
  rSquared: 0.99,
  points: 40,
  startT: 38.2,
  endT: 43,
};

describe('shotMetrics', () => {
  it("computes the spec's durations, flow and yields from the markers", () => {
    const metrics = shotMetrics(full, tail);
    expect(metrics).toEqual({
      firstDripS: 6,
      extractionS: 22,
      totalS: 28,
      averageFlowGps: 35.25 / 22,
      pumpOffWeightG: 35.25,
      yieldG: 38,
      honestYieldG: 37.9,
      tailMassG: 38 - 35.25,
      tauS: 1.5,
    });
  });

  it('ends no duration at the last drip: the cup staying on changes none of them', () => {
    const later = shotMetrics({ ...full, cupRemoved: { t: 300, weightG: 38 } }, tail);
    const metrics = shotMetrics(full, tail);
    expect(later.firstDripS).toBe(metrics.firstDripS);
    expect(later.extractionS).toBe(metrics.extractionS);
    expect(later.totalS).toBe(metrics.totalS);
    expect(later.averageFlowGps).toBe(metrics.averageFlowGps);
  });

  it('leaves the first-drip time and the total null without pump_on (Q4)', () => {
    const metrics = shotMetrics({ ...full, pumpOn: null }, tail);
    expect(metrics.firstDripS).toBeNull();
    expect(metrics.totalS).toBeNull();
    expect(metrics.extractionS).toBe(22);
    expect(metrics.averageFlowGps).toBeCloseTo(35.25 / 22, 12);
  });

  it('leaves what needs pump_off null without it', () => {
    const metrics = shotMetrics({ ...full, pumpOff: null }, null);
    expect(metrics).toMatchObject({
      firstDripS: 6,
      extractionS: null,
      totalS: null,
      averageFlowGps: null,
      pumpOffWeightG: null,
      tailMassG: null,
      tauS: null,
      // The yield can still come from the plateau the window ends on (T1.12).
      yieldG: 38,
      honestYieldG: 37.9,
    });
  });

  it('leaves the flow and tail mass null without w(pump_off), the durations not', () => {
    const metrics = shotMetrics(
      { ...full, pumpOff: { t: 38, detector: 'regime-change', weightG: null } },
      tail,
    );
    expect(metrics.extractionS).toBe(22);
    expect(metrics.averageFlowGps).toBeNull();
    expect(metrics.tailMassG).toBeNull();
  });

  it('leaves everything null without markers', () => {
    const none: SegmentMarkers = {
      pumpOn: null,
      firstDrip: null,
      pumpOff: null,
      settled: null,
      cupRemoved: null,
    };
    expect(Object.values(shotMetrics(none, null)).every((value) => value === null)).toBe(true);
  });

  it('gives no duration of 0 or less, and no flow from one', () => {
    const backwards: SegmentMarkers = {
      ...full,
      pumpOff: { t: 15, detector: 'regime-change', weightG: 0.2 },
    };
    expect(markersInOrder(backwards)).toBe(false);
    const metrics = shotMetrics(backwards, null);
    expect(metrics.extractionS).toBeNull();
    expect(metrics.averageFlowGps).toBeNull();
    expect(metrics.totalS).toBe(5); // pump_on → pump_off still runs forward
    expect(markersInOrder(full)).toBe(true);
    expect(markersInOrder({ ...full, pumpOn: null, pumpOff: null })).toBe(true);
  });
});
