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
  it('follows a whole brew: the beans, a lift, the shot, the milk; no grind (D-101)', () => {
    const r = router({ milkOffered: true });
    expect(r.state).toMatchObject({ current: 'beans', beansG: null });

    expect(lines(r.vesselOn(on(41, dosing)))).toEqual(['beans open container']);
    r.measure(on(41, dosing, 17.2));
    expect(r.state.beansG).toBe(17.2);
    // A lift is a pause: off to the grinder, or to pour some back.
    expect(r.vesselOff()).toEqual([]);
    expect(r.state).toMatchObject({ current: 'beans', beansG: 17.2, vesselOn: false });
    // The cup put back with 16.5 g: the beans going on, counted from what it carried.
    expect(lines(r.vesselOn(on(57.5, null)))).toEqual([]);
    expect(r.state).toMatchObject({ current: 'beans', beansG: 16.5, container: dosing });
    r.vesselOff();

    expect(lines(r.vesselOn(on(112.6, cup)))).toEqual([
      'beans done container',
      'extraction open container',
    ]);
    expect(lines(r.pumpOn())).toEqual([]);
    expect(r.state.pouring).toBe(true);
    // Nothing put on during the shot changes the phase.
    expect(lines(r.vesselOn(on(181.4, jug)))).toEqual([]);
    expect(lines(r.shotDone())).toEqual(['extraction done shot']);

    r.vesselOff();
    expect(lines(r.vesselOn(on(181.4, jug)))).toEqual(['milk open container']);
    r.measure(on(181.4, jug, 106));
    expect(r.state).toMatchObject({ current: 'milk', milkG: 106 });
    expect(lines(r.endMilk('done'))).toEqual(['milk done user']);
    expect(r.state.status).toEqual({
      beans: 'done',
      grind: 'pending',
      extraction: 'open',
      milk: 'done',
    });
  });

  it('skips what the cup put on first leaves out, and the pump does the same', () => {
    const r = router();
    expect(lines(r.vesselOn(on(112.6, cup)))).toEqual([
      'beans skipped container',
      'extraction open container',
    ]);
    const tapped = router();
    expect(lines(tapped.pumpOn())).toEqual(['beans skipped pump', 'extraction open pump']);
  });

  it('never opens the grind: a grind cup is a bean cup, a tap on Grind does nothing (D-101)', () => {
    const grindCup = container('Grind cup', 60, ['grind']);
    const r = new PhaseRouter({ containers: () => [grindCup, cup] });
    expect(lines(r.vesselOn(on(60, grindCup)))).toEqual(['beans open container']);
    expect(lines(r.select('grind'))).toEqual([]);
    expect(r.state.current).toBe('beans');
    expect(new PhaseRouter({ start: 'grind' }).state.current).toBe('beans');
  });

  it('keeps the weighed beans when the cup comes back empty, and counts them again on a tap', () => {
    const beanCup = container('Bean cup', 119.8, ['bean']);
    const r = new PhaseRouter({ containers: () => [beanCup, cup] });
    r.vesselOn(on(119.8, beanCup));
    r.measure(on(119.8, beanCup, 17.1));
    r.vesselOff();
    // Back empty: the beans went into the grinder; the beans stay open, and their weight.
    expect(lines(r.vesselOn(on(119.8, beanCup)))).toEqual([]);
    r.measure(on(119.8, beanCup, 0));
    expect(r.state).toMatchObject({ current: 'beans', beansG: 17.1 });
    // The coffee cup ends them, done with their weight.
    r.vesselOff();
    expect(lines(r.vesselOn(on(112.6, cup)))).toEqual([
      'beans done container',
      'extraction open container',
    ]);
    expect(r.state.beansG).toBe(17.1);
    // Back empty again and beans poured anew: those count.
    const again = new PhaseRouter({ containers: () => [beanCup] });
    again.vesselOn(on(119.8, beanCup));
    again.measure(on(119.8, beanCup, 17.1));
    again.vesselOff();
    again.vesselOn(on(119.8, beanCup));
    again.measure(on(119.8, beanCup, 0));
    expect(again.state.beansG).toBe(17.1);
    again.measure(on(119.8, beanCup, 18.2));
    expect(again.state.beansG).toBe(18.2);
    // A tap on Beans with a cup on counts them again: what the user asked for.
    expect(lines(r.select('beans'))).toEqual(['beans open user']);
    r.measure(on(112.6, cup, 2));
    expect(r.state.beansG).toBe(2);
  });

  it('never tares a bean cup carrying beans (T2.23)', () => {
    const r = router();
    r.vesselOn(on(41, dosing));
    r.measure(on(41, dosing, 17));
    r.vesselOff();
    expect(r.carries(on(58, null))).toBe(true);
    expect(r.carries(on(41, dosing))).toBe(false);
    // Past the beans and a gram, it is no bean cup of beans.
    expect(r.carries(on(80, null))).toBe(false);
    r.select('extraction');
    expect(r.carries(on(58, null))).toBe(false);
  });

  it('ends the open phase at the brew’s ✕: done when it weighed something, else skipped (T2.15)', () => {
    // Nothing announced, nothing to end.
    expect(router().end()).toEqual([]);
    const r = router();
    r.vesselOn(on(41, dosing));
    r.measure(on(41, dosing, 17));
    expect(lines(r.end())).toEqual(['beans done user']);
    expect(r.end()).toEqual([]);
    const empty = router();
    empty.vesselOn(on(41, dosing));
    expect(lines(empty.end())).toEqual(['beans skipped user']);
    // The extraction weighs nothing of its own: the analysis has its shot.
    const waiting = router();
    waiting.select('extraction');
    expect(waiting.end()).toEqual([]);
  });

  it('announces the phase on screen with the brew’s first vessel, even one it doesn’t know', () => {
    const r = router();
    expect(lines(r.vesselOn(on(95, null)))).toEqual(['beans open container']);
    r.measure(on(95, null, 17));
    expect(r.state.beansG).toBe(17);
    expect(lines(r.vesselOn(on(95, null)))).toEqual([]);
  });

  it('has no milk phase without a milk ratio', () => {
    const r = router({ start: 'extraction' });
    r.vesselOn(on(112.6, cup));
    r.pumpOn();
    r.shotDone();
    r.vesselOff();
    expect(lines(r.vesselOn(on(181.4, jug)))).toEqual([]);
    expect(lines(r.select('milk'))).toEqual([]);
    expect(lines(r.endMilk('skipped'))).toEqual([]);
  });

  it('opens a phase by a tap, and a later one ends it again', () => {
    const r = router();
    expect(lines(r.select('extraction'))).toEqual(['beans skipped user', 'extraction open user']);
    expect(lines(r.select('beans'))).toEqual(['beans open user']);
    expect(r.state.status.beans).toBe('open');
    expect(lines(r.select('extraction'))).toEqual(['beans skipped user', 'extraction open user']);
  });

  it('ends the milk when the jug is lifted with its milk, not when it is lifted empty (T2.26)', () => {
    const r = router({ milkOffered: true, start: 'extraction' });
    r.pumpOn();
    r.shotDone();
    expect(lines(r.vesselOn(on(181.4, jug)))).toEqual(['milk open container']);
    r.measure(on(181.4, jug, 0.4));
    // Lifted empty (a hand's push reads a little): put back, it goes on.
    expect(r.vesselOff()).toEqual([]);
    expect(lines(r.vesselOn(on(181.4, jug)))).toEqual([]);
    expect(r.state.current).toBe('milk');
    r.measure(on(181.4, jug, 120));
    // The scale's own tare with the milk in: the jug still has it.
    r.measure(on(181.4, jug, 0.1));
    expect(lines(r.vesselOff())).toEqual(['milk done container']);
    expect(r.state).toMatchObject({ current: 'extraction', milkG: 0.1 });
    expect(r.state.status.milk).toBe('done');
    // Put back again, nothing more: the milk is done.
    expect(lines(r.vesselOn(on(301.4, null)))).toEqual([]);
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
