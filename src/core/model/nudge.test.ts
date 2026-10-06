import { describe, expect, it } from 'vitest';
import { tasteNudge, type NudgeContext } from './nudge';
import type { Direction } from './shot';

const GAGGIA = 'machine-gaggia';
const ORO = 'grinder-oro';
const C40 = 'grinder-c40';
const GUJI = 'pack-guji';
const KENYA = 'pack-kenya';

const BREW: NudgeContext = { machineId: GAGGIA, grinderId: ORO, packId: GUJI };

let n = 0;
function shot(direction: Direction | null, changes: Partial<NudgeContext> = {}) {
  n += 1;
  return {
    id: `shot-${n}`,
    direction,
    machineId: GAGGIA,
    grinderId: ORO,
    packId: GUJI,
    ...changes,
  };
}

describe('tasteNudge', () => {
  it('says grind finer after a sour shot, and coarser after a bitter one', () => {
    const sour = shot('sour');
    expect(tasteNudge([sour], BREW)).toEqual({ shotId: sour.id, taste: 'sour', grind: 'finer' });
    const bitter = shot('bitter');
    expect(tasteNudge([bitter, sour], BREW)).toEqual({
      shotId: bitter.id,
      taste: 'bitter',
      grind: 'coarser',
    });
  });

  it('says nothing after a balanced or ungraded shot, though one before was sour', () => {
    const sour = shot('sour');
    expect(tasteNudge([shot('balanced'), sour], BREW)).toBeNull();
    expect(tasteNudge([shot(null), sour], BREW)).toBeNull();
    expect(tasteNudge([], BREW)).toBeNull();
  });

  it('looks only at shots with the same machine, grinder and pack', () => {
    const sour = shot('sour');
    const others = [
      shot('balanced', { grinderId: C40 }),
      shot('balanced', { packId: KENYA }),
      shot('balanced', { machineId: null }),
      shot('balanced', { packId: null }),
    ];
    expect(tasteNudge([...others, sour], BREW)?.shotId).toBe(sour.id);
    expect(tasteNudge([sour], { ...BREW, grinderId: C40 })).toBeNull();
    expect(tasteNudge([sour], { ...BREW, packId: KENYA })).toBeNull();
  });

  it('takes no pack as the same no pack', () => {
    const bitter = shot('bitter', { packId: null });
    expect(tasteNudge([bitter], { ...BREW, packId: null })?.grind).toBe('coarser');
    expect(tasteNudge([bitter], BREW)).toBeNull();
  });
});
