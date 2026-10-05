import { describe, expect, it } from 'vitest';
import { DEFAULT_LIVE_PARAMS, resolveLiveParams } from './params';

describe('resolveLiveParams', () => {
  it('gives the defaults, and an override in their place', () => {
    expect(resolveLiveParams()).toEqual(DEFAULT_LIVE_PARAMS);
    expect(resolveLiveParams({ emaTauMs: 300, cupMinG: undefined })).toEqual({
      ...DEFAULT_LIVE_PARAMS,
      emaTauMs: 300,
    });
  });

  it('refuses unknown names and values that are not finite numbers above 0', () => {
    expect(() => resolveLiveParams({ nope: 1 } as never)).toThrow(/unknown parameter nope/);
    expect(() => resolveLiveParams({ dripG: 0 })).toThrow(/dripG 0/);
    expect(() => resolveLiveParams({ jumpG: -1 })).toThrow(/jumpG -1/);
    expect(() => resolveLiveParams({ emaTauMs: NaN })).toThrow(/emaTauMs NaN/);
    expect(() => resolveLiveParams({ cupMinG: Infinity })).toThrow(/cupMinG Infinity/);
  });

  it('allows 0 where it means something: no margin, a first drip at once', () => {
    const p = resolveLiveParams({ overMarginG: 0, minPreInfusionMs: 0 });
    expect(p.overMarginG).toBe(0);
    expect(p.minPreInfusionMs).toBe(0);
  });

  it('wants whole counts, and two readings at least for a slope', () => {
    expect(() => resolveLiveParams({ stableMinFrames: 4.5 })).toThrow(/whole number/);
    expect(() => resolveLiveParams({ flowMinFrames: 1 })).toThrow(/fewer than 2/);
    expect(resolveLiveParams({ flowMinFrames: 2 }).flowMinFrames).toBe(2);
  });

  it('wants the tail to start below where a pour resumes', () => {
    expect(() => resolveLiveParams({ tailFlowRatio: 0.5, resumeFlowRatio: 0.5 })).toThrow(
      /tail < resume/,
    );
    expect(() => resolveLiveParams({ resumeFlowRatio: 1.5 })).toThrow(/resume ≤ 1/);
  });
});
