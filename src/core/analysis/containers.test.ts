import { describe, expect, it } from 'vitest';
import { createEntity, type Container, type ContainerRole } from '../model';
import { demoScenario, simulateSession, toRawRecording } from '../sim';
import { knownNotCup, segmentContainers, segmentVesselG } from './containers';
import { analyzeRaw } from './recording-analysis';

const NOW = Date.UTC(2026, 9, 5, 7, 0);

function container(name: string, emptyMassG: number, roles: ContainerRole[]): Container {
  return createEntity('containers', { name, emptyMassG, roles, dismissedWarningIds: [] }, NOW);
}

describe('segmentContainers', () => {
  // The demo session: a 110 g cup, its shot, then a 95 g one and its shot.
  const { analysis } = analyzeRaw(toRawRecording(simulateSession(demoScenario())));

  it('weighs each segment’s vessel by the step that put it on', () => {
    expect(analysis.segments).toHaveLength(2);
    const masses = analysis.segments.map((segment) => segmentVesselG(analysis, segment));
    expect(masses[0]).toBeCloseTo(110, 0);
    expect(masses[1]).toBeCloseTo(95, 0);
  });

  it('labels each with the container it matches, and says which aren’t cups', () => {
    const cup = container('Espresso cup', 110, ['cup']);
    const jug = container('Small jug', 95, ['milk']);
    const labels = segmentContainers(analysis, [cup, jug]);
    expect(labels).toEqual([
      { kind: 'known', container: cup },
      { kind: 'known', container: jug },
    ]);
    expect(labels.map(knownNotCup)).toEqual([false, true]);
    expect(segmentContainers(analysis, [])).toEqual([{ kind: 'unknown' }, { kind: 'unknown' }]);
    expect(knownNotCup(null)).toBe(false);
    expect(knownNotCup({ kind: 'unknown' })).toBe(false);
  });

  it('has no vessel to go by for a segment whose cup was on from the start', () => {
    expect(
      segmentVesselG(analysis, { window: { ...analysis.segments[0].window, cupPlacedT: null } }),
    ).toBeNull();
  });
});
