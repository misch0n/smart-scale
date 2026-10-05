import { describe, expect, it } from 'vitest';
import { containerClashes, openClashes } from './containers';
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
