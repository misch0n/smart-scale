import { describe, expect, it } from 'vitest';
import { DEFAULT_SEGMENTATION_PARAMS, resolveSegmentationParams } from './params';

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
