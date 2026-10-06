import { describe, expect, it } from 'vitest';
import { containerClashes, isAccessory, matchContainer, openClashes } from './containers';
import { createEntity, type Container } from './entities';

const NOW = Date.UTC(2026, 9, 6, 7, 0);

function container(name: string, emptyMassG: number, extra: Partial<Container> = {}): Container {
  return {
    ...createEntity(
      'containers',
      { name, emptyMassG, roles: ['cup'], dismissedWarningIds: [] },
      NOW,
    ),
    ...extra,
  };
}

describe('containerClashes', () => {
  const dosing = container('Dosing cup', 41);
  const cup = container('Espresso cup', 112.6);
  const jug = container('Milk jug 350 ml', 181.4);
  const tumbler = container('Glass tumbler', 182);

  it('finds the board’s pair within 3 g, and nothing else', () => {
    expect(containerClashes([tumbler, dosing, jug, cup])).toEqual([
      { a: jug, b: tumbler, gapG: 0.6, kind: 'near', dismissed: false },
    ]);
  });

  it('calls the same weight a conflict, which no dismissal hides', () => {
    const twin = container('Second cup', 112.6, { dismissedWarningIds: [cup.id] });
    const clashes = containerClashes([cup, twin]);
    expect(clashes).toHaveLength(1);
    expect(clashes[0]).toMatchObject({ kind: 'same', gapG: 0, dismissed: false });
    expect(openClashes([cup, twin])).toHaveLength(1);
  });

  it('keeps a dismissed warning, marked, out of the open ones', () => {
    const dismissedJug = { ...jug, dismissedWarningIds: [tumbler.id] };
    expect(containerClashes([dismissedJug, tumbler])[0].dismissed).toBe(true);
    expect(
      containerClashes([jug, { ...tumbler, dismissedWarningIds: [jug.id] }])[0].dismissed,
    ).toBe(true);
    expect(openClashes([dismissedJug, tumbler])).toEqual([]);
  });

  it('leaves removed containers out, and goes by the closest first', () => {
    const removed = container('Old jug', 181.5, { removedAtEpochMs: NOW });
    expect(containerClashes([jug, removed])).toEqual([]);
    const a = container('A', 100);
    const b = container('B', 102.5);
    const c = container('C', 101);
    expect(containerClashes([a, b, c]).map((clash) => `${clash.a.name}${clash.b.name}`)).toEqual([
      'AC',
      'CB',
      'AB',
    ]);
    expect(containerClashes([a, container('D', 103)])).toEqual([]);
  });
});

describe('matchContainer', () => {
  const dosing = container('Dosing cup', 41);
  const cup = container('Espresso cup', 112.6);
  const jug = container('Milk jug 350 ml', 181.4);
  const tumbler = container('Glass tumbler', 182);
  const all = [dosing, cup, jug, tumbler];

  it('knows a container at its mass, a little light, or wet up to 3 g heavy', () => {
    expect(matchContainer(112.6, all)).toEqual({ kind: 'known', container: cup });
    expect(matchContainer(112.3, all)).toEqual({ kind: 'known', container: cup });
    expect(matchContainer(115.6, all)).toEqual({ kind: 'known', container: cup });
    expect(matchContainer(41.1, all)).toEqual({ kind: 'known', container: dosing });
  });

  it('knows none further off: lighter by more than 0.3 g, or more than 3 g heavy', () => {
    expect(matchContainer(112.2, all)).toEqual({ kind: 'unknown' });
    expect(matchContainer(115.7, all)).toEqual({ kind: 'unknown' });
    expect(matchContainer(60, all)).toEqual({ kind: 'unknown' });
    expect(matchContainer(112.6, [])).toEqual({ kind: 'unknown' });
  });

  it('takes the nearest of two when it is clearly the nearest', () => {
    expect(matchContainer(181.4, all)).toEqual({ kind: 'known', container: jug });
    expect(matchContainer(182.1, all)).toEqual({ kind: 'known', container: tumbler });
    // A wet jug reads as the tumbler: what the warning is about.
    expect(matchContainer(181.9, all)).toEqual({ kind: 'known', container: tumbler });
  });

  it('leaves it to the user when two are about as near, the nearest first', () => {
    expect(matchContainer(181.7, all)).toEqual({ kind: 'ambiguous', candidates: [jug, tumbler] });
    // Two tenths nearer is clearly nearer.
    expect(matchContainer(181.8, all)).toEqual({ kind: 'known', container: tumbler });
    const twin = container('Second cup', 112.6);
    const match = matchContainer(112.6, [cup, twin]);
    expect(match.kind).toBe('ambiguous');
    expect(match.kind === 'ambiguous' && match.candidates).toHaveLength(2);
  });

  it('leaves removed containers out', () => {
    const removed = { ...tumbler, removedAtEpochMs: NOW };
    expect(matchContainer(181.7, [jug, removed])).toEqual({ kind: 'known', container: jug });
  });
});

describe('isAccessory (T2.17)', () => {
  it('is a container with the scale accessory role', () => {
    expect(isAccessory(container('Scale mat', 15.5, { roles: ['accessory'] }))).toBe(true);
    expect(isAccessory(container('Espresso cup', 110))).toBe(false);
  });
});
