import { describe, expect, it } from 'vitest';
import type { VesselOnScale } from '../../app/live-vessel';
import { createEntity, type Container } from '../../core/model';
import { onScaleAtOpen, opensBrew } from './put-down';

const NOW = Date.UTC(2026, 9, 6, 7, 0);
const cup = createEntity(
  'containers',
  { name: 'Espresso cup', emptyMassG: 110, roles: ['cup'], dismissedWarningIds: [] },
  NOW,
);
const other = createEntity(
  'containers',
  { name: 'Other cup', emptyMassG: 110, roles: ['cup'], dismissedWarningIds: [] },
  NOW,
);

/** A vessel put on at `onMs`: recognised as `known`, or picked as `picked`, or neither. */
function on(
  onMs: number,
  { known = null, picked = null }: { known?: Container | null; picked?: Container | null } = {},
): VesselOnScale {
  return {
    vessel: { massG: 110, onMs, baseG: 0 },
    contentsG: 0,
    match:
      known !== null
        ? { kind: 'known', container: known }
        : { kind: 'ambiguous', candidates: [cup, other] },
    picked,
    container: picked ?? known,
    near: [],
  };
}

describe('opensBrew (T2.16)', () => {
  it('opens the brew for a known container put down after Home opened', () => {
    const atOpen = onScaleAtOpen(null);
    expect(opensBrew(null, atOpen)).toBe(false);
    expect(opensBrew(on(5000, { known: cup }), atOpen)).toBe(true);
  });

  it('not for the vessel on as Home opened, as when a brew ends with its cup on', () => {
    const atOpen = onScaleAtOpen(on(5000, { known: cup }));
    expect(opensBrew(on(5000, { known: cup }), atOpen)).toBe(false);
    // Lifted and put down again: that one opens it.
    expect(opensBrew(on(9000, { known: cup }), atOpen)).toBe(true);
  });

  it('not for a vessel no container matches, until one is picked on Home', () => {
    const atOpen = onScaleAtOpen(null);
    expect(opensBrew(on(5000), atOpen)).toBe(false);
    expect(opensBrew(on(5000, { picked: other }), atOpen)).toBe(true);
  });

  it('opens it for a pick made on Home for the vessel already on, not for an earlier pick', () => {
    const pickedBefore = onScaleAtOpen(on(5000, { picked: cup }));
    expect(opensBrew(on(5000, { picked: cup }), pickedBefore)).toBe(false);
    expect(opensBrew(on(5000, { picked: other }), pickedBefore)).toBe(true);
    const unsure = onScaleAtOpen(on(5000));
    expect(opensBrew(on(5000), unsure)).toBe(false);
    expect(opensBrew(on(5000, { picked: cup }), unsure)).toBe(true);
  });
});
