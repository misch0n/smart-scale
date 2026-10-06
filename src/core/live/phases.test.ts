import { describe, expect, it } from 'vitest';
import { createEntity, type Container, type ContainerRole, type PhaseChange } from '../model';
import { PhaseRouter, type PhaseVessel } from './phases';

const NOW = Date.UTC(2026, 9, 5, 7, 0);

function container(name: string, emptyMassG: number, roles: ContainerRole[]): Container {
  return createEntity('containers', { name, emptyMassG, roles, dismissedWarningIds: [] }, NOW);
}

const dosing = container('Dosing cup', 41, ['bean', 'grind']);
const cup = container('Espresso cup', 112.6, ['cup']);
const jug = container('Milk jug', 181.4, ['milk']);
const CONTAINERS = [dosing, cup, jug];

const on = (massG: number, known: Container | null, contentsG = 0): PhaseVessel => ({
  massG,
  contentsG,
  container: known,
});

const lines = (changes: readonly PhaseChange[]) =>
  changes.map(({ phase, state, by }) => `${phase} ${state} ${by}`);

function router(options: { milkOffered?: boolean; start?: 'beans' | 'extraction' } = {}) {
  return new PhaseRouter({ containers: () => CONTAINERS, ...options });
}

describe('PhaseRouter', () => {
  it('follows a whole brew: beans, the cup back with its grounds, the shot, the milk', () => {
    const r = router({ milkOffered: true });
    expect(r.state).toMatchObject({ current: 'beans', beansG: null });

    expect(lines(r.vesselOn(on(41, dosing), 1000))).toEqual(['beans open container']);
    r.measure(on(41, dosing, 17.2));
    expect(r.state.beansG).toBe(17.2);
    r.vesselOff(10_000);
    expect(r.state).toMatchObject({ current: 'beans', beansG: 17.2, vesselOn: false });

    // Back after the grinder, 16.9 g of grounds in it: no container weighs that.
    expect(lines(r.vesselOn(on(57.9, null), 30_000))).toEqual([
      'beans done container',
      'grind open container',
    ]);
    expect(r.state).toMatchObject({ current: 'grind', groundG: 16.9, container: dosing });
    r.measure(on(57.9, null, 0.1));
    expect(r.state.groundG).toBe(17);
    r.vesselOff(36_000);

    expect(lines(r.vesselOn(on(112.6, cup), 40_000))).toEqual([
      'grind done container',
      'extraction open container',
    ]);
    expect(lines(r.pumpOn())).toEqual([]);
    expect(r.state.pouring).toBe(true);
    // Nothing put on during the shot changes the phase.
    expect(lines(r.vesselOn(on(181.4, jug), 50_000))).toEqual([]);
    expect(lines(r.shotDone())).toEqual(['extraction done shot']);

    r.vesselOff(70_000);
    expect(lines(r.vesselOn(on(181.4, jug), 75_000))).toEqual(['milk open container']);
    r.measure(on(181.4, jug, 106));
    expect(r.state).toMatchObject({ current: 'milk', milkG: 106 });
    expect(lines(r.endMilk('done'))).toEqual(['milk done user']);
    expect(r.state.status).toEqual({
      beans: 'done',
      grind: 'done',
      extraction: 'open',
      milk: 'done',
    });
  });

  it('skips what the cup put on first leaves out, and the pump does the same', () => {
    const r = router();
    expect(lines(r.vesselOn(on(112.6, cup), 1000))).toEqual([
      'beans skipped container',
      'grind skipped container',
      'extraction open container',
    ]);
    const tapped = router();
    expect(lines(tapped.pumpOn())).toEqual([
      'beans skipped pump',
      'grind skipped pump',
      'extraction open pump',
    ]);
  });

  it('keeps the beans going when the bean cup comes back soon, or with fewer beans', () => {
    const r = router();
    r.vesselOn(on(41, dosing), 1000);
    r.measure(on(41, dosing, 18.5));
    r.vesselOff(10_000);
    // Three seconds later, 0.6 g poured back into the bag.
    expect(lines(r.vesselOn(on(58.9, null), 13_000))).toEqual([]);
    expect(r.state).toMatchObject({ current: 'beans', beansG: 17.9 });
    r.measure(on(58.9, null, 0.2));
    expect(r.state.beansG).toBe(18.1);
  });

  it('opens the grind for the dosing cup back empty after the grinder', () => {
    const r = router();
    r.vesselOn(on(41, dosing), 1000);
    r.measure(on(41, dosing, 17));
    r.vesselOff(10_000);
    expect(lines(r.vesselOn(on(41.1, dosing), 25_000))).toEqual([
      'beans done container',
      'grind open container',
    ]);
    r.measure(on(41.1, dosing, 16.8));
    expect(r.state.groundG).toBe(16.8);
  });

  it('keeps the weighed beans when a bean-only cup comes back empty from the grinder (T2.14)', () => {
    const beanCup = container('Bean cup', 119.8, ['bean']);
    const r = new PhaseRouter({ containers: () => [beanCup, cup] });
    expect(lines(r.vesselOn(on(119.8, beanCup), 16_000))).toEqual(['beans open container']);
    r.measure(on(119.8, beanCup, 17.1));
    r.vesselOff(58_000);
    // Back empty 10 s later: the beans went into the grinder.
    expect(lines(r.vesselOn(on(119.8, beanCup), 68_000))).toEqual([
      'beans done container',
      'grind open container',
    ]);
    r.measure(on(119.8, beanCup, 0));
    expect(r.state).toMatchObject({ current: 'grind', beansG: 17.1, groundG: 0 });
    // Back sooner, it is the beans going on: counted from what it holds.
    const soon = new PhaseRouter({ containers: () => [beanCup] });
    soon.vesselOn(on(119.8, beanCup), 1000);
    soon.measure(on(119.8, beanCup, 17.1));
    soon.vesselOff(10_000);
    expect(lines(soon.vesselOn(on(119.8, beanCup), 13_000))).toEqual([]);
    soon.measure(on(119.8, beanCup, 16.5));
    expect(soon.state).toMatchObject({ current: 'beans', beansG: 16.5 });
  });

  it('keeps them after a tap back to Beans, the cup then put back empty (T2.14)', () => {
    // Session 3: Grind tapped with the cup off, Beans tapped back, the cup back empty.
    const beanCup = container('Bean cup', 119.8, ['bean']);
    const r = new PhaseRouter({ containers: () => [beanCup] });
    r.vesselOn(on(119.8, beanCup), 16_000);
    r.measure(on(119.8, beanCup, 17.1));
    r.vesselOff(58_500);
    expect(lines(r.select('grind'))).toEqual(['beans done user', 'grind open user']);
    expect(lines(r.select('beans'))).toEqual(['beans open user']);
    expect(lines(r.vesselOn(on(119.8, beanCup), 68_200))).toEqual([
      'beans done container',
      'grind open container',
    ]);
    r.measure(on(119.8, beanCup, 0));
    expect(r.state.beansG).toBe(17.1);
    // Lifted and put back 4 s later: still the grind's, the beans done.
    r.vesselOff(74_600);
    expect(lines(r.vesselOn(on(119.8, beanCup), 78_500))).toEqual([]);
    r.measure(on(119.8, beanCup, 0));
    expect(r.state).toMatchObject({ current: 'grind', beansG: 17.1, groundG: 0 });
    // A tap on Beans with the cup on counts them again: what the user asked for.
    expect(lines(r.select('beans'))).toEqual(['beans open user']);
    r.measure(on(119.8, beanCup, 2));
    expect(r.state.beansG).toBe(2);
  });

  it('weighs a phase tapped open from what the vessel holds, not what it carried in for another', () => {
    const r = router();
    r.vesselOn(on(41, dosing), 1000);
    r.measure(on(41, dosing, 17));
    r.vesselOff(10_000);
    // Back with 16.8 g of grounds: the grind, carried in.
    r.vesselOn(on(57.8, null), 30_000);
    expect(r.state.groundG).toBe(16.8);
    r.select('beans');
    r.measure(on(57.8, null, 0));
    expect(r.state.beansG).toBe(0);
  });

  it('ends the open phase at the brew’s ✕: done when it weighed something, else skipped (T2.15)', () => {
    // Nothing announced, nothing to end.
    expect(router().end()).toEqual([]);
    const r = router();
    r.vesselOn(on(41, dosing), 1000);
    r.measure(on(41, dosing, 17));
    expect(lines(r.end())).toEqual(['beans done user']);
    expect(r.end()).toEqual([]);
    const empty = router();
    empty.vesselOn(on(41, dosing), 1000);
    expect(lines(empty.end())).toEqual(['beans skipped user']);
    // The extraction weighs nothing of its own: the analysis has its shot.
    const waiting = router();
    waiting.select('extraction');
    expect(waiting.end()).toEqual([]);
  });

  it('announces the phase on screen with the brew’s first vessel, even one it doesn’t know', () => {
    const r = router();
    expect(lines(r.vesselOn(on(95, null), 1000))).toEqual(['beans open container']);
    r.measure(on(95, null, 17));
    expect(r.state.beansG).toBe(17);
    expect(lines(r.vesselOn(on(95, null), 5000))).toEqual([]);
  });

  it('has no milk phase without a milk ratio', () => {
    const r = router({ start: 'extraction' });
    r.vesselOn(on(112.6, cup), 1000);
    r.pumpOn();
    r.shotDone();
    r.vesselOff(40_000);
    expect(lines(r.vesselOn(on(181.4, jug), 45_000))).toEqual([]);
    expect(lines(r.select('milk'))).toEqual([]);
    expect(lines(r.endMilk('skipped'))).toEqual([]);
  });

  it('opens any phase by a tap, and a later one ends it again', () => {
    const r = router();
    expect(lines(r.select('grind'))).toEqual(['beans skipped user', 'grind open user']);
    expect(lines(r.select('beans'))).toEqual(['beans open user']);
    expect(r.state.status.beans).toBe('open');
    // The grind, left open for the beans, ends with them.
    expect(lines(r.select('extraction'))).toEqual([
      'beans skipped user',
      'grind skipped user',
      'extraction open user',
    ]);
  });

  it('skips the milk when asked, and goes back to the shot', () => {
    const r = router({ milkOffered: true, start: 'extraction' });
    r.pumpOn();
    r.shotDone();
    expect(lines(r.select('milk'))).toEqual(['milk open user']);
    expect(lines(r.endMilk('skipped'))).toEqual(['milk skipped user']);
    expect(r.state).toMatchObject({ current: 'extraction' });
    expect(r.state.status.milk).toBe('skipped');
    expect(lines(r.endMilk('done'))).toEqual([]);
  });
});
