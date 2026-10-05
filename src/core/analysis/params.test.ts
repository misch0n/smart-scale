import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIQUID_PARAMS,
  DEFAULT_PUMP_PARAMS,
  DEFAULT_SEGMENTATION_PARAMS,
  DEFAULT_TIMELINE_PARAMS,
  resolveAnalysisParams,
  resolveLiquidParams,
  resolvePumpParams,
  resolveSegmentationParams,
  resolveTimelineParams,
} from './params';

describe('resolveSegmentationParams', () => {
  it('fills in the defaults and applies overrides', () => {
    expect(resolveSegmentationParams()).toEqual(DEFAULT_SEGMENTATION_PARAMS);
    expect(resolveSegmentationParams({ stableRangeG: 0.1, minRiseG: undefined })).toEqual({
      ...DEFAULT_SEGMENTATION_PARAMS,
      stableRangeG: 0.1,
    });
  });

  it('is plain JSON, so a result can carry the set that made it', () => {
    const params = resolveSegmentationParams();
    expect(JSON.parse(JSON.stringify(params))).toEqual(params);
  });

  it('refuses unknown names and values that are no positive finite number', () => {
    expect(() => resolveSegmentationParams({ nonsense: 1 } as never)).toThrow(RangeError);
    for (const value of [0, -1, Number.NaN, Infinity]) {
      expect(() => resolveSegmentationParams({ jumpG: value })).toThrow(RangeError);
    }
  });
});

describe('resolveLiquidParams', () => {
  it('fills in the defaults and applies overrides, as plain JSON', () => {
    expect(resolveLiquidParams()).toEqual(DEFAULT_LIQUID_PARAMS);
    const params = resolveLiquidParams({ riseFitG: 2, dropG: undefined });
    expect(params).toEqual({ ...DEFAULT_LIQUID_PARAMS, riseFitG: 2 });
    expect(JSON.parse(JSON.stringify(params))).toEqual(params);
  });

  it('allows 0 only where it means something: no drops, no margin, no delay', () => {
    expect(resolveLiquidParams({ dropG: 0, linearOnsetMargin: 0, tailStartS: 0 })).toMatchObject({
      dropG: 0,
      linearOnsetMargin: 0,
      tailStartS: 0,
    });
    expect(() => resolveLiquidParams({ riseFitG: 0 })).toThrow(RangeError);
    expect(() => resolveLiquidParams({ dropG: -0.01 })).toThrow(RangeError);
    expect(() => resolveLiquidParams({ sgWindowS: Number.NaN })).toThrow(RangeError);
    expect(() => resolveLiquidParams({ jumpG: 1 } as never)).toThrow(RangeError);
  });
});

describe('resolvePumpParams', () => {
  it('fills in the defaults and applies overrides, as plain JSON', () => {
    expect(resolvePumpParams()).toEqual(DEFAULT_PUMP_PARAMS);
    const params = resolvePumpParams({ vibrationRatio: 6, minTailS: undefined });
    expect(params).toEqual({ ...DEFAULT_PUMP_PARAMS, vibrationRatio: 6 });
    expect(JSON.parse(JSON.stringify(params))).toEqual(params);
  });

  it('refuses unknown names and values that are no positive finite number', () => {
    expect(() => resolvePumpParams({ riseFitG: 1 } as never)).toThrow(RangeError);
    for (const value of [0, -1, Number.NaN, Infinity]) {
      expect(() => resolvePumpParams({ maxDrainTauS: value })).toThrow(RangeError);
    }
  });
});

describe('resolveTimelineParams', () => {
  it('fills in the timeline’s defaults, allowing 0 where the timeline does', () => {
    expect(resolveTimelineParams()).toEqual(DEFAULT_TIMELINE_PARAMS);
    expect(resolveTimelineParams({ minFitSpanMs: 0, maxDriftPpm: 0 })).toEqual({
      ...DEFAULT_TIMELINE_PARAMS,
      minFitSpanMs: 0,
      maxDriftPpm: 0,
    });
  });

  it('refuses values JSON would lose, and unknown names', () => {
    expect(() => resolveTimelineParams({ maxDriftPpm: Infinity })).toThrow(RangeError);
    expect(() => resolveTimelineParams({ minFitSpanMs: Number.NaN })).toThrow(RangeError);
    expect(() => resolveTimelineParams({ minRunFrames: 0 })).toThrow(RangeError);
    const unknown = { maxDriftPPM: 1 } as Parameters<typeof resolveTimelineParams>[0];
    expect(() => resolveTimelineParams(unknown)).toThrow(RangeError);
  });
});

describe('resolveAnalysisParams', () => {
  it('resolves every stage, so a result can carry the whole set as JSON', () => {
    const params = resolveAnalysisParams({ liquid: { sgWindowS: 0.6 } });
    expect(params).toEqual({
      timeline: DEFAULT_TIMELINE_PARAMS,
      segmentation: DEFAULT_SEGMENTATION_PARAMS,
      liquid: { ...DEFAULT_LIQUID_PARAMS, sgWindowS: 0.6 },
      pump: DEFAULT_PUMP_PARAMS,
    });
    expect(JSON.parse(JSON.stringify(params))).toEqual(params);
    expect(() => resolveAnalysisParams({ timeline: { maxDriftPpm: Infinity } })).toThrow(
      RangeError,
    );
  });
});
