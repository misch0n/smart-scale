import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LINK_PARAMS,
  DEFAULT_SCALE_PARAMS,
  resolveLinkParams,
  resolveScaleParams,
  type LinkParams,
  type ScaleParams,
} from './params';

describe('resolveScaleParams', () => {
  it('returns the defaults when given nothing', () => {
    expect(resolveScaleParams()).toEqual(DEFAULT_SCALE_PARAMS);
  });

  it('defaults to the scale hardware session 1 met, in its timer mode (D-037, D-038)', () => {
    const p = resolveScaleParams();
    expect(p.mode).toBe('timer');
    expect(p.resolutionG).toBe(0.1);
    // A frame every 100.7 ms of the phone's clock.
    expect(p.samplePeriodMs / (1 + p.clockDriftPpm * 1e-6)).toBeCloseTo(100.7, 1);
  });

  it('applies overrides and keeps the defaults for undefined values', () => {
    const p = resolveScaleParams({ vibrationSigmaG: 0, dropG: undefined, mode: 'automatic' });
    expect(p.vibrationSigmaG).toBe(0);
    expect(p.dropG).toBe(DEFAULT_SCALE_PARAMS.dropG);
    expect(p.mode).toBe('automatic');
  });

  it('rejects an unknown parameter, so a typo fails loudly', () => {
    expect(() => resolveScaleParams({ vibrationSigma: 0 } as Partial<ScaleParams>)).toThrow(
      /unknown simulator parameter vibrationSigma/,
    );
  });

  it.each<[string, Partial<ScaleParams>]>([
    ['a zero sample period', { samplePeriodMs: 0 }],
    ['jitter of half the period', { samplePeriodMs: 100, sampleJitterMs: 50 }],
    ['negative jitter', { sampleJitterMs: -1 }],
    ['a drift beyond 10%', { clockDriftPpm: 200_000 }],
    ['a NaN drift', { clockDriftPpm: NaN }],
    ['a zero resolution', { resolutionG: 0 }],
    ['negative noise', { noiseSigmaG: -0.01 }],
    ['infinite vibration', { vibrationSigmaG: Infinity }],
    ['a negative drop', { dropG: -0.05 }],
    ['a non-boolean smoothing flag', { initialSmoothing: 1 as unknown as boolean }],
    ['a zero smoothing time constant', { smoothingTauMs: 0 }],
    ['a unit byte above 255', { unitByte: 256 }],
    ['a fractional battery', { batteryPct: 50.5 }],
    ['an auto-off too long for the field', { autoOffMin: 7000 }],
    ['an unknown mode', { mode: 'ratio' as 'timer' }],
  ])('rejects %s', (_, overrides) => {
    expect(() => resolveScaleParams(overrides)).toThrow(RangeError);
  });
});

describe('resolveLinkParams', () => {
  it('returns the defaults when given nothing', () => {
    expect(resolveLinkParams()).toEqual(DEFAULT_LINK_PARAMS);
  });

  it('defaults to a link that loses and damages nothing', () => {
    expect(DEFAULT_LINK_PARAMS.dropProbability).toBe(0);
    expect(DEFAULT_LINK_PARAMS.corruptProbability).toBe(0);
    expect(DEFAULT_LINK_PARAMS.truncateProbability).toBe(0);
  });

  it.each<[string, Partial<LinkParams>]>([
    ['a negative latency', { minLatencyMs: -1 }],
    ['a probability above 1', { dropProbability: 1.5 }],
    ['a frame that always misses its connection event', { retransmitProbability: 1 }],
    ['a negative probability', { stallProbability: -0.1 }],
    ['a stall range upside down', { stallMinMs: 500, stallMaxMs: 100 }],
    [
      'damage probabilities adding up past 1',
      { corruptProbability: 0.6, truncateProbability: 0.6 },
    ],
  ])('rejects %s', (_, overrides) => {
    expect(() => resolveLinkParams(overrides)).toThrow(RangeError);
  });
});
