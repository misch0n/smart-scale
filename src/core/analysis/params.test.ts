import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIQUID_PARAMS,
  DEFAULT_SEGMENTATION_PARAMS,
  resolveLiquidParams,
  resolveSegmentationParams,
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
