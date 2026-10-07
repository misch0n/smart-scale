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
    // Lifted with the beans in it: off to the grinder (T2.24).
    expect(lines(r.vesselOff(10_000))).toEqual(['beans done container', 'grind open container']);
    expect(r.state).toMatchObject({ current: 'grind', beansG: 17.2, vesselOn: false });

    // Back after the grinder, 16.9 g of grounds in it: the dosing cup's, less its empty weight.
    expect(lines(r.vesselOn(on(57.9, null), 30_000))).toEqual([]);
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

  it('takes whatever the beans’ cup brings back to the grind for the grounds, however soon (T2.24)', () => {
    const r = router();
    r.vesselOn(on(41, dosing), 1000);
    r.measure(on(41, dosing, 18.5));
    r.vesselOff(10_000);
    // Three seconds later, 0.6 g poured back into the bag: the user's rule takes it as it comes.
    expect(lines(r.vesselOn(on(58.9, null), 13_000))).toEqual([]);
    expect(r.state).toMatchObject({ current: 'grind', beansG: 18.5, groundG: 17.9 });
    // A lift before anything is weighed is a pause.
    const empty = router();
    empty.vesselOn(on(41, dosing), 1000);
    empty.measure(on(41, dosing, 0.1));
    expect(lines(empty.vesselOff(5000))).toEqual([]);
    expect(empty.state.current).toBe('beans');
  });

  it('weighs the grounds tipped into the dosing cup back empty, and keeps the last ones (T2.24)', () => {
    const r = router();
    r.vesselOn(on(41, dosing), 1000);
    r.measure(on(41, dosing, 17));
    r.vesselOff(10_000);
    expect(lines(r.vesselOn(on(41.1, dosing), 25_000))).toEqual([]);
    r.measure(on(41.1, dosing, 0));
    expect(r.state.groundG ?? 0).toBe(0);
    r.measure(on(41.1, dosing, 16.8));
    expect(r.state.groundG).toBe(16.8);
    // The grounds tipped out and the cup put back empty: the last weight stands.
    r.vesselOff(40_000);
    r.vesselOn(on(41, dosing), 45_000);
    r.measure(on(41, dosing, 0));
    expect(r.state.groundG).toBe(16.8);
  });

  it('keeps the weighed beans when a bean-only cup comes back empty from the grinder (T2.14)', () => {
    const beanCup = container('Bean cup', 119.8, ['bean']);
    const r = new PhaseRouter({ containers: () => [beanCup, cup] });
    expect(lines(r.vesselOn(on(119.8, beanCup), 16_000))).toEqual(['beans open container']);
    r.measure(on(119.8, beanCup, 17.1));
    expect(lines(r.vesselOff(58_000))).toEqual(['beans done container', 'grind open container']);
    // Back empty 10 s later: the beans went into the grinder.
    expect(lines(r.vesselOn(on(119.8, beanCup), 68_000))).toEqual([]);
    r.measure(on(119.8, beanCup, 0));
    expect(r.state).toMatchObject({ current: 'grind', beansG: 17.1 });
    expect(r.state.groundG ?? 0).toBe(0);
  });

  it('keeps them after a tap back to Beans, the cup then put back empty (T2.14)', () => {
    // Session 3: Grind tapped with the cup off, Beans tapped back, the cup back empty.
    const beanCup = container('Bean cup', 119.8, ['bean']);
    const r = new PhaseRouter({ containers: () => [beanCup] });
    r.vesselOn(on(119.8, beanCup), 16_000);
    r.measure(on(119.8, beanCup, 17.1));
    expect(lines(r.vesselOff(58_500))).toEqual(['beans done container', 'grind open container']);
    expect(lines(r.select('grind'))).toEqual([]);
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

  it('weighs the grind tapped open with the beans in the cup from what comes back (T2.21)', () => {
    // Session 4: Grind tapped with the bean cup and its beans still on the scale.
    const beanCup = container('Bean cup', 119.8, ['bean']);
    const r = new PhaseRouter({ containers: () => [beanCup, cup] });
    r.vesselOn(on(119.8, beanCup), 16_000);
    r.measure(on(119.8, beanCup, 17.1));
    expect(lines(r.select('grind'))).toEqual(['beans done user', 'grind open user']);
    r.measure(on(119.8, beanCup, 17.1));
    expect(r.state).toMatchObject({ current: 'grind', beansG: 17.1, groundG: 0 });
    // The same cup again (its container picked): still its beans.
    r.vesselOn(on(119.8, beanCup), 16_000);
    r.measure(on(119.8, beanCup, 17.1));
    expect(r.state.groundG).toBe(0);
    // Lifted to the grinder: the beans it held are no grounds.
    r.vesselOff(30_000);
    expect(r.state.groundG).toBe(0);
    // Back with 16.9 g of grounds: those are the grind's.
    expect(lines(r.vesselOn(on(136.7, null), 52_000))).toEqual([]);
    r.measure(on(136.7, null, 0));
    expect(r.state).toMatchObject({ groundG: 16.9, container: beanCup });
    r.measure(on(136.7, null, 0.1));
    expect(r.state.groundG).toBe(17);
    // Grind tapped again: what the cup carried back stays, what went in since counts from here.
    expect(lines(r.select('grind'))).toEqual([]);
    r.measure(on(136.7, null, 0.1));
    expect(r.state.groundG).toBe(16.9);
    // The empty cup back while the grind is open, beans poured into it again and Grind tapped
    // once more (session 4 at 137.6 s): those are beans too.
    const again = new PhaseRouter({ containers: () => [beanCup] });
    again.vesselOn(on(119.8, beanCup), 1000);
    again.measure(on(119.8, beanCup, 17.1));
    again.select('grind');
    again.vesselOff(10_000);
    again.vesselOn(on(119.8, beanCup), 60_000);
    again.measure(on(119.8, beanCup, 17.1));
    expect(again.state.groundG).toBe(17.1);
    expect(lines(again.select('grind'))).toEqual([]);
    again.measure(on(119.8, beanCup, 17.1));
    expect(again.state).toMatchObject({ current: 'grind', beansG: 17.1, groundG: 0 });
    // Ground into the cup on the scale, the grind weighs what goes in from the tap.
    const onScale = new PhaseRouter({ containers: () => [beanCup] });
    onScale.vesselOn(on(119.8, beanCup), 1000);
    onScale.measure(on(119.8, beanCup, 17.1));
    onScale.select('grind');
    onScale.measure(on(119.8, beanCup, 17.1));
    onScale.measure(on(119.8, beanCup, 33.9));
    expect(onScale.state.groundG).toBe(16.8);
    expect(lines(onScale.select('extraction'))).toEqual([
      'grind done user',
      'extraction open user',
    ]);
    // Left for the extraction with no grounds weighed (Skip grind), it is skipped.
    const skipped = new PhaseRouter({ containers: () => [beanCup] });
    skipped.vesselOn(on(119.8, beanCup), 1000);
    skipped.measure(on(119.8, beanCup, 17.1));
    skipped.select('grind');
    skipped.measure(on(119.8, beanCup, 17.1));
    expect(lines(skipped.select('extraction'))).toEqual([
      'grind skipped user',
      'extraction open user',
    ]);
  });

  it('takes the cup back to the open grind for its grounds, whatever the retention (T2.22)', () => {
    // Session 5: 17.8 g of beans, Grind tapped, the cup back with 14.6 g: 3.2 g short.
    const beanCup = container('Bean cup', 119.8, ['bean']);
    const r = new PhaseRouter({ containers: () => [beanCup] });
    r.vesselOn(on(119.8, beanCup), 60_000);
    r.measure(on(119.8, beanCup, 17.8));
    r.vesselOff(93_000);
    r.select('grind');
    expect(lines(r.vesselOn(on(134.4, null), 134_900))).toEqual([]);
    expect(r.state).toMatchObject({ current: 'grind', groundG: 14.6, container: beanCup });
    // More than the beans is taken as it comes (T2.24); past a dose it is no cup of grounds.
    const over = new PhaseRouter({ containers: () => [beanCup] });
    over.vesselOn(on(119.8, beanCup), 1000);
    over.measure(on(119.8, beanCup, 17.8));
    over.vesselOff(10_000);
    over.vesselOn(on(140, null), 40_000);
    expect(over.state.groundG).toBe(20.2);
    over.vesselOff(45_000);
    over.vesselOn(on(257.2, null), 50_000);
    expect(over.state.groundG).toBe(20.2);
    // No beans weighed: whatever the cup brings back to the open grind.
    const skipped = new PhaseRouter({ containers: () => [beanCup] });
    skipped.select('grind');
    skipped.vesselOn(on(136.6, null), 40_000);
    expect(skipped.state).toMatchObject({ groundG: 16.8, container: beanCup });
  });

  it('drops a lift’s push, and never tares the cup carrying beans or grounds (T2.23, T2.24)', () => {
    // Session 6: Grind tapped with 17.1 g of beans in the cup, lifted, back 4.7 s later with them.
    const beanCup = container('Bean cup', 119.8, ['bean']);
    const r = new PhaseRouter({ containers: () => [beanCup] });
    r.vesselOn(on(119.8, beanCup), 14_600);
    r.measure(on(119.8, beanCup, 17.1));
    r.select('grind');
    r.measure(on(119.8, beanCup, 17.1));
    // The hand on the cup as it lifts it reads a gram more: no grounds.
    r.measure(on(119.8, beanCup, 18.1));
    expect(r.state.groundG).toBe(1);
    r.vesselOff(66_500);
    expect(r.state.groundG).toBe(0);
    // Back 4.7 s later with the beans: the user's rule takes what comes back as it comes.
    const back = on(136.9, null);
    expect(lines(r.vesselOn(back, 71_200))).toEqual([]);
    r.measure(on(136.9, null, 0));
    expect(r.state).toMatchObject({ current: 'grind', groundG: 17.1 });
    // Never tared: it carries them.
    expect(r.carries(back)).toBe(true);
    // Back from the grinder: the last weight is the grounds.
    r.vesselOff(76_700);
    r.vesselOn(on(136.6, null), 100_000);
    expect(r.state.groundG).toBe(16.8);
    // An empty cup, or one in the extraction, carries nothing.
    expect(r.carries(on(119.8, beanCup))).toBe(false);
    r.select('extraction');
    expect(r.carries(back)).toBe(false);
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
