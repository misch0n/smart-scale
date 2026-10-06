import { describe, expect, it } from 'vitest';
import { wantsTare, type TareCheck } from './tare-rules';

const ZERO_G = 0.15;
const steady = (check: Partial<TareCheck>): TareCheck => ({
  readingG: 0,
  stable: true,
  vesselOn: false,
  holdsG: 0,
  ...check,
});

describe('wantsTare (T2.20)', () => {
  it('tares an empty scale that reads negative, or the mat it wasn’t zeroed with', () => {
    expect(wantsTare(steady({ readingG: -119.8 }), ZERO_G)).toBe(true);
    expect(wantsTare(steady({ readingG: 15.5 }), ZERO_G)).toBe(true);
  });

  it('leaves a scale at 0, or one whose weight moves', () => {
    expect(wantsTare(steady({ readingG: 0.1 }), ZERO_G)).toBe(false);
    expect(wantsTare(steady({ readingG: -119.8, stable: false }), ZERO_G)).toBe(false);
    expect(wantsTare(steady({ readingG: null }), ZERO_G)).toBe(false);
  });

  it('tares an empty vessel reading its own weight, never one holding what the phase weighs', () => {
    expect(wantsTare(steady({ readingG: 119.8, vesselOn: true }), ZERO_G)).toBe(true);
    // Beans poured in, or the bean cup back with its grounds: the scale shows them.
    expect(wantsTare(steady({ readingG: 136.9, vesselOn: true, holdsG: 17.1 }), ZERO_G)).toBe(
      false,
    );
    expect(wantsTare(steady({ readingG: 17, vesselOn: true, holdsG: 17 }), ZERO_G)).toBe(false);
  });
});
