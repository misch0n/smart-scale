/**
 * The brew flow (T1.18) on the simulator through the mock transport: the commands it answers the
 * live shot with while attached (D-066), the manual start, the live shot it stores at "shot
 * done" with its analysis, the grades and Save. Storage is a fake IndexedDB, and the analysis
 * the real runner.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { END_SESSION_REASON, MODE_CHECK_REASON, PHASE_TARE_REASON } from '../core/live';
import {
  AUTO_TARE_REASON,
  MANUAL_START,
  phaseChangeOf,
  SEED_IDS,
  type AppEvent,
  type ContainerRole,
  type Id,
} from '../core/model';
import { tareAndStartTimer } from '../core/protocol';
import { espressoScenario, type Scenario } from '../core/sim';
import { freshIndexedDB } from '../storage/fake-idb';
import { openStorage, type AppStorage } from '../storage';
import { Emitter } from '../transport/emitter';
import { MockTransport } from '../transport/mock';
import { ManualClock } from '../transport/scheduler';
import { AnalysisRunner } from './analysis-runner';
import { BrewFlow, type BrewFlowOptions } from './brew-flow';
import { BrewPreferences, SETTING_KEYS } from './brew-settings';
import { Entities } from './entities';
import { FakeLocks } from './fake-locks';
import { ScaleLinks, type ScaleLink } from './links';
import type { PageLifecycle, PageVisibility, PageVisibilityState } from './page-lifecycle';

const APP = { commit: 'abc1234', buildTime: '2026-10-05T07:00:00.000Z' };
const NOW = Date.UTC(2026, 9, 5, 7, 12);
/** The mock connects 300 ms after `connect()`: the session's time 0. */
const CONNECT_MS = 300;

/**
 * One shot as the user pulls it with the app: the cup on at 1 s, the pump at 6 s, the cup off
 * 15 s after the pump stops. The app sends every command itself.
 */
const SHOT: Scenario = espressoScenario({
  seed: 4,
  cupOnMs: 1000,
  tareAndStartMs: null,
  pumpOnMs: 6000,
  cupOffAfterPumpOffMs: 15_000,
});
/** The pump runs from 6 s to 34 s of the session (pre-infusion 6 s, extraction 22 s). */
const PUMP_OFF_MS = 34_000;

/**
 * A brew in phases: the dosing cup (41 g) and 17.2 g of beans poured into it; back from the
 * grinder at 30 s with 16.9 g of grounds; the cup (110 g), tapped at 44 s, its shot; the jug
 * (181.4 g) after the shot, and 100 g of milk.
 */
const PHASES: Scenario = {
  seed: 6,
  durationMs: 130_000,
  script: [
    { type: 'cup-on', atMs: 1000, massG: 41 },
    { type: 'shot', atMs: 3000, yieldG: 17.2, preInfusionMs: 500, extractionMs: 5000 },
    { type: 'cup-off', atMs: 14_000 },
    { type: 'cup-on', atMs: 30_000, massG: 41, contentsG: 16.9 },
    { type: 'cup-off', atMs: 36_000 },
    { type: 'cup-on', atMs: 40_000, massG: 110 },
    { type: 'shot', atMs: 44_000 },
    { type: 'cup-off', atMs: 90_000 },
    { type: 'cup-on', atMs: 95_000, massG: 181.4 },
    { type: 'shot', atMs: 98_000, yieldG: 100, preInfusionMs: 500, extractionMs: 8000 },
    { type: 'cup-off', atMs: 118_000 },
  ],
};

/** A cup on the scale, and no shot. */
const CUP_ONLY: Scenario = {
  seed: 2,
  durationMs: 120_000,
  script: [{ type: 'cup-on', atMs: 1000, massG: 110 }],
};

let storage: AppStorage;

/** The scale's latest reading, g. */
const reading = (s: Setup) => s.link.recorder.state.stats!.lastWeight!.frame.weightG;
let clock: ManualClock;

beforeEach(async () => {
  freshIndexedDB();
  storage = await openStorage();
  clock = new ManualClock();
});

afterEach(() => {
  storage.close();
});

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Runs the clock to `sessionMs` on the session's timeline, letting storage keep up. */
async function runTo(sessionMs: number, stepMs = 50): Promise<void> {
  const end = sessionMs + CONNECT_MS;
  while (clock.now() < end) {
    clock.advanceTo(Math.min(end, clock.now() + stepMs));
    await settle();
  }
}

/** Lets the promises run until `done()` holds, without moving the clock. */
async function until(done: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 500; i++) {
    if (done()) return;
    await settle();
  }
  throw new Error(`timed out waiting for ${what}`);
}

class FakePage implements PageVisibility, PageLifecycle {
  readonly #changes = new Emitter<PageVisibilityState>();
  onChange(listener: (state: PageVisibilityState) => void) {
    return this.#changes.on(listener);
  }
  onHidden(listener: () => void) {
    return this.#changes.on((state) => {
      if (state === 'hidden') listener();
    });
  }
}

interface Setup {
  readonly link: ScaleLink;
  readonly flow: BrewFlow;
  readonly preferences: BrewPreferences;
  readonly entities: Entities;
  /** Every app event of the link's recordings. */
  readonly events: AppEvent[];
  /** How often the flow said a shot changed. */
  readonly changes: { count: number };
}

async function setup(scenario: Scenario, options: Partial<BrewFlowOptions> = {}): Promise<Setup> {
  const page = new FakePage();
  const epochNow = () => NOW + clock.now();
  const entities = await Entities.load(storage.entities, { epochNow });
  const links = new ScaleLinks({
    storage,
    app: APP,
    userAgent: 'test agent',
    makeTransport: () => new MockTransport({ scenario, scheduler: clock }),
    recorder: { timers: clock, locks: new FakeLocks(), page, epochNow },
    visibility: page,
    containers: () => entities.listed('containers'),
  });
  const link = links.get({ kind: 'mock', speed: 1 });
  const events: AppEvent[] = [];
  link.recorder.onEvent((event) => events.push(event));
  const preferences = await BrewPreferences.load(storage.kv, entities);
  const changes = { count: 0 };
  const flow = new BrewFlow({
    link,
    shots: storage.shots,
    analysis: new AnalysisRunner({ storage, epochNow }),
    preferences,
    onShotsChanged: () => changes.count++,
    timers: clock,
    epochNow,
    containers: () => entities.listed('containers'),
    ...options,
  });
  return { link, flow, preferences, entities, events, changes };
}

async function connect({ link }: Setup): Promise<void> {
  await Promise.all([link.transport.connect(), runTo(0)]);
}

/** The commands sent, as `name reason`. */
function commands(events: readonly AppEvent[]): string[] {
  return events.flatMap((event) =>
    event.type === 'command-sent' ? [`${event.data.command} ${event.data.reason}`] : [],
  );
}

/** Pulls the shot with the app: the tap 0.1 s after the pump starts, then on past "shot done". */
async function pullShot(setup: Setup): Promise<void> {
  await connect(setup);
  await runTo(6100);
  setup.flow.start();
  await runTo(PUMP_OFF_MS + 3000);
}

describe('BrewFlow, attached', () => {
  it('tares the cup, starts with the tap, and stores the live shot at "shot done"', async () => {
    const s = await setup(SHOT);
    s.flow.attach();
    await connect(s);
    await runTo(5000);
    expect(s.link.shot.snapshot().phase).toBe('ready');
    expect(commands(s.events)).toEqual([
      'flowSmoothingOff connect',
      // The link's mode check, before the cup: the timer mode (T1.25).
      `startTimer ${MODE_CHECK_REASON}`,
      `stopTimer ${MODE_CHECK_REASON}`,
      `resetTimer ${MODE_CHECK_REASON}`,
      `stopTimer ${AUTO_TARE_REASON}`,
      `resetTimer ${AUTO_TARE_REASON}`,
      `tare ${AUTO_TARE_REASON}`,
    ]);

    await runTo(6100);
    s.flow.start();
    await runTo(6500);
    expect(s.link.shot.snapshot().phase).toBe('running');
    expect(s.events.filter((e) => e.type === 'ui-action').map((e) => e.data)).toContainEqual({
      action: MANUAL_START,
      detail: null,
    });
    expect(commands(s.events).at(-1)).toBe(`tareAndStartTimer ${MANUAL_START}`);
    expect(s.flow.state.card).toBeNull();

    await runTo(PUMP_OFF_MS + 3000);
    const card = s.flow.state.card!;
    expect(card).not.toBeNull();
    expect(commands(s.events).at(-1)).toBe('stopTimer shot-done');
    const { shot } = card;
    expect(shot).toMatchObject({
      source: 'live',
      // The dose is the analysis's: no phase weighed it, so the basket's (T2.5).
      doseG: null,
      targetRatio: 2,
      recipeId: SEED_IDS.espresso,
      recipeName: 'Espresso',
      milkRatio: null,
      tags: ['WDT', 'Puck screen'],
      direction: null,
      channelled: null,
      recordingId: s.link.recorder.recording!.id,
      // The seeded context: the spec's machine, basket and grinder, no setting or pack yet.
      machineId: SEED_IDS.gaggia,
      machineName: 'Gaggia Classic Pro',
      pressureBar: 6,
      basketId: SEED_IDS.lm17,
      basketSizeG: 17,
      grinderId: SEED_IDS.oro,
      grinderName: 'Eureka ORO Mignon Single Dose Pro',
      grindSetting: null,
      packId: null,
      // Straight to the extraction, without containers to put on: the others skipped (T2.5).
      beansPhase: 'skipped',
      grindPhase: null,
      milkPhase: null,
      containerId: null,
    });
    // Anchored at "shot done": inside the shot, after the pump stopped (D-047).
    expect(shot.anchorTMs).toBeGreaterThan(PUMP_OFF_MS);
    expect(shot.anchorTMs).toBeLessThan(PUMP_OFF_MS + 3000);
    expect(card.display.phase).toBe('done');
    expect(card.display.series.length).toBeGreaterThan(100);
    await until(() => s.changes.count > 0, 'the shot to be stored');
    expect(await storage.shots.get(shot.id)).toEqual(shot);
  });

  it('records the cup’s container, recognised as it went on (T2.4)', async () => {
    const s = await setup(SHOT);
    const cup = s.entities.add('containers', {
      name: 'Espresso cup',
      emptyMassG: 110,
      roles: ['cup'],
      dismissedWarningIds: [],
    });
    s.entities.add('containers', {
      name: 'Dosing cup',
      emptyMassG: 41,
      roles: ['bean', 'grind'],
      dismissedWarningIds: [],
    });
    s.flow.attach();
    await connect(s);
    await runTo(5000);
    expect(s.link.vessel.onScale?.container?.id).toBe(cup.id);
    await runTo(6100);
    s.flow.start();
    await runTo(PUMP_OFF_MS + 3000);
    expect(s.flow.state.card?.shot.containerId).toBe(cup.id);
  });

  it('records no container when the user picked none of two that weigh the same', async () => {
    const s = await setup(SHOT);
    for (const name of ['Cup A', 'Cup B']) {
      s.entities.add('containers', {
        name,
        emptyMassG: 110,
        roles: ['cup'],
        dismissedWarningIds: [],
      });
    }
    s.flow.attach();
    await connect(s);
    await runTo(5000);
    expect(s.link.vessel.onScale?.match.kind).toBe('ambiguous');
    await runTo(6100);
    s.flow.start();
    await runTo(PUMP_OFF_MS + 3000);
    expect(s.flow.state.card?.shot.containerId).toBeNull();
  });

  it('records the container the user picked', async () => {
    const s = await setup(SHOT);
    const [, b] = ['Cup A', 'Cup B'].map((name) =>
      s.entities.add('containers', {
        name,
        emptyMassG: 110,
        roles: ['cup'],
        dismissedWarningIds: [],
      }),
    );
    s.flow.attach();
    await connect(s);
    await runTo(5000);
    s.link.vessel.pick(b.id);
    expect(s.link.vessel.onScale?.container?.id).toBe(b.id);
    await runTo(6100);
    s.flow.start();
    await runTo(PUMP_OFF_MS + 3000);
    expect(s.flow.state.card?.shot.containerId).toBe(b.id);
  });

  it('follows a brew through its phases, and the card shows what the analysis weighed (T2.5)', async () => {
    const s = await setup(PHASES);
    const add = (name: string, emptyMassG: number, roles: ContainerRole[]) =>
      s.entities.add('containers', { name, emptyMassG, roles, dismissedWarningIds: [] });
    add('Dosing cup', 41, ['bean', 'grind']);
    const cup = add('Espresso cup', 110, ['cup']);
    add('Milk jug', 181.4, ['milk']);
    s.preferences.setRecipe(SEED_IDS.cappuccino);
    s.flow.attach();
    await connect(s);

    await runTo(12_000);
    expect(s.flow.phases).toMatchObject({ current: 'beans', vesselOn: true });
    expect(s.flow.phases.beansG).toBeCloseTo(17.2, 0);
    expect(s.flow.dose.source).toBe('beans');

    // The cup back from the grinder with 16.9 g of grounds: the beans' cup, no grind (D-101).
    await runTo(35_000);
    expect(s.flow.phases).toMatchObject({ current: 'beans' });
    expect(s.flow.phases.beansG).toBeCloseTo(16.9, 0);
    // The target follows what the cup holds: 16.9 g × 2.
    expect(s.link.shot.snapshot().targetG).toBeCloseTo(33.8, 0);

    await runTo(43_900);
    expect(s.flow.phases).toMatchObject({ current: 'extraction' });
    s.flow.start();
    await runTo(80_000);
    const card = s.flow.state.card!;
    expect(card.shot).toMatchObject({
      beansPhase: 'done',
      grindPhase: null,
      milkPhase: null,
      containerId: cup.id,
      doseG: null,
    });
    await until(() => s.flow.state.card?.result !== null, 'the first analysis');
    let result = s.flow.state.card!.result!;
    // The last the beans' cup held (analysis 14, D-101).
    expect(result.phases.beansG).toBeCloseTo(16.9, 1);
    expect(result.dose?.source).toBe('beans');

    // The jug after the shot opens the milk, with the card open.
    await runTo(97_000);
    expect(s.flow.phases).toMatchObject({ current: 'milk', shotDone: true });
    await runTo(116_000);
    expect(s.flow.phases.milkG).toBeCloseTo(100, 0);
    s.flow.endMilk('done');
    expect(s.flow.phases.current).toBe('extraction');
    await until(() => (s.flow.state.card?.result?.phases.milkG ?? null) !== null, 'the milk');
    result = s.flow.state.card!.result!;
    expect(result.phases.milkG).toBeCloseTo(100, 0);
    expect(s.flow.state.card!.shot.milkPhase).toBe('done');

    // The log has the flow, for the analysis.
    const logged = s.events.flatMap((event) => {
      const change = phaseChangeOf(event);
      return change === null ? [] : [`${change.phase} ${change.state} ${change.by}`];
    });
    expect(logged).toEqual([
      'beans open container',
      'beans done container',
      'extraction open container',
      'extraction done shot',
      'milk open container',
      'milk done user',
    ]);
    expect(await s.flow.save()).toBe(true);
    expect(await storage.shots.get(card.shot.id)).toMatchObject({ milkPhase: 'done' });
    // The next brew starts on the beans: there is a bean cup to put on.
    expect(s.flow.phases).toMatchObject({ current: 'beans', shotDone: false, beansG: null });
  });

  it('reads the milk again as it settles when Done is tapped mid-pour (T2.11)', async () => {
    const s = await setup(PHASES);
    const add = (name: string, emptyMassG: number, roles: ContainerRole[]) =>
      s.entities.add('containers', { name, emptyMassG, roles, dismissedWarningIds: [] });
    add('Dosing cup', 41, ['bean', 'grind']);
    add('Espresso cup', 110, ['cup']);
    add('Milk jug', 181.4, ['milk']);
    s.preferences.setRecipe(SEED_IDS.cappuccino);
    s.flow.attach();
    await connect(s);
    await runTo(43_900);
    s.flow.start();
    await runTo(97_000);
    expect(s.flow.phases).toMatchObject({ current: 'milk', shotDone: true });
    // Done with the milk still pouring (98 s to about 107 s): nothing stable to read yet.
    await runTo(101_000);
    s.flow.endMilk('done');
    await until(() => s.flow.state.card?.analysing === true, 'the analysis');
    await runTo(112_000);
    await until(() => (s.flow.state.card?.result?.phases.milkG ?? null) !== null, 'the milk');
    expect(s.flow.state.card!.result!.phases.milkG).toBeCloseTo(100, 0);
  });

  it('changes the milk ratio in place: the default, and the open card’s shot (T2.11)', async () => {
    const s = await setup(SHOT);
    s.preferences.setRecipe(SEED_IDS.cappuccino);
    s.flow.attach();
    await pullShot(s);
    expect(s.flow.milkRecipes.map((recipe) => recipe.name)).toEqual([
      'Cortado',
      'Cappuccino',
      'Flat white',
      'Latte',
    ]);
    s.flow.setMilkRecipe(SEED_IDS.espresso); // no milk: not a milk ratio
    expect(s.flow.state.card!.shot.recipeName).toBe('Cappuccino');
    s.flow.setMilkRecipe(SEED_IDS.latte);
    expect(s.preferences.value.recipe.id).toBe(SEED_IDS.latte);
    const id = s.flow.state.card!.shot.id;
    expect(s.flow.state.card!.shot).toMatchObject({
      recipeName: 'Latte',
      milkRatio: 6,
      targetRatio: 2,
    });
    await until(() => s.changes.count >= 2, 'the change to be stored');
    expect(await storage.shots.get(id)).toMatchObject({ recipeId: SEED_IDS.latte, milkRatio: 6 });
  });

  it('skips the milk of a milk drink saved without it', async () => {
    const s = await setup(SHOT);
    s.preferences.setRecipe(SEED_IDS.cappuccino);
    s.flow.attach();
    await pullShot(s);
    const id = s.flow.state.card!.shot.id;
    expect(await s.flow.save()).toBe(true);
    expect(await storage.shots.get(id)).toMatchObject({ milkPhase: 'skipped' });
    expect(s.events.some((event) => phaseChangeOf(event)?.phase === 'milk')).toBe(true);
  });

  it('analyses the recording so far, and again as the tail settles', async () => {
    const s = await setup(SHOT);
    s.flow.attach();
    await pullShot(s);
    await until(() => s.flow.state.card?.result !== null, 'the first analysis');
    let card = s.flow.state.card!;
    expect(card.result?.segment).not.toBeNull();
    expect(card.analysing).toBe(true); // more are due
    expect(card.recordingStartedAtEpochMs).toBe(s.link.recorder.recording!.startedAtEpochMs);

    await runTo(PUMP_OFF_MS + 14_000);
    await until(() => !s.flow.state.card!.analysing, 'the last analysis');
    card = s.flow.state.card!;
    const metrics = card.result!.segment!.metrics;
    expect(metrics.yieldG).toBeCloseTo(38, 0);
    expect(metrics.firstDripS).toBeCloseTo(5.9, 0);
    expect(metrics.extractionS).toBeCloseTo(22, 0);
    // Over the dose: no phase weighed one, so the LM 17 g basket's (T2.5).
    expect(card.result!.dose).toEqual({ g: 17, source: 'basket' });
    expect(card.result!.match.ratio).toBeCloseTo(38 / 17, 1);
    expect(card.analysisError).toBeNull();
    expect(card.refusedFrames).toBe(false);
  });

  it('stores each grade as it is tapped, and Save stores them all and closes the card', async () => {
    const s = await setup(SHOT);
    s.flow.attach();
    await pullShot(s);
    const id: Id = s.flow.state.card!.shot.id;
    s.flow.setTaste('sour');
    s.flow.setTaste('balanced');
    s.flow.toggleTag('RDT');
    s.flow.toggleTag('WDT');
    expect(s.flow.addTag('  Bottomless  ')).toBe('Bottomless');
    expect(s.flow.state.card!.shot).toMatchObject({
      direction: 'balanced',
      channelled: null,
      tags: ['Puck screen', 'RDT', 'Bottomless'],
    });
    await until(() => s.changes.count >= 6, 'the grades to be stored');
    expect(await storage.shots.get(id)).toMatchObject({
      direction: 'balanced',
      channelled: null,
      tags: ['Puck screen', 'RDT', 'Bottomless'],
    });
    expect(s.preferences.value.tags.at(-1)).toMatchObject({ name: 'Bottomless', isDefault: false });
    await s.preferences.whenStored();
    expect((await storage.entities.list('tags')).at(-1)).toMatchObject({ name: 'Bottomless' });

    expect(await s.flow.save()).toBe(true);
    expect(s.flow.state.card).toBeNull();
    // Left off, channelling is saved as no.
    expect(await storage.shots.get(id)).toMatchObject({ direction: 'balanced', channelled: false });
  });

  it('clears the taste when it is tapped again, and keeps channelling when it is on', async () => {
    const s = await setup(SHOT);
    s.flow.attach();
    await pullShot(s);
    const id = s.flow.state.card!.shot.id;
    s.flow.setTaste('bitter');
    s.flow.setTaste(null);
    s.flow.setChannelled(true);
    expect(await s.flow.save()).toBe(true);
    expect(await storage.shots.get(id)).toMatchObject({ direction: null, channelled: true });
  });

  it('follows the recipe and the basket with its target', async () => {
    const s = await setup(SHOT);
    expect(s.link.shot.snapshot().targetG).toBeNull();
    const detach = s.flow.attach();
    // No phase weighed a dose: the LM 17 g basket's.
    expect(s.flow.dose).toEqual({ g: 17, source: 'basket' });
    expect(s.link.shot.snapshot().targetG).toBe(34);
    s.preferences.setRecipe(SEED_IDS.ristretto);
    expect(s.link.shot.snapshot().targetG).toBeCloseTo(25.5, 9);
    // An edited recipe moves the target too, and so does another basket.
    s.entities.update('recipes', SEED_IDS.ristretto, { coffeeRatio: 1.6 });
    expect(s.link.shot.snapshot().targetG).toBeCloseTo(27.2, 9);
    s.entities.update('machines', SEED_IDS.gaggia, (machine) => ({
      baskets: machine.baskets.map((basket) => ({ ...basket, sizeG: 18 })),
    }));
    expect(s.link.shot.snapshot().targetG).toBeCloseTo(28.8, 9);
    detach();
    s.preferences.setRecipe(SEED_IDS.lungo);
    expect(s.link.shot.snapshot().targetG).toBeCloseTo(28.8, 9);
  });

  it('records the brew’s context as ids next to their values at "shot done" (T2.1)', async () => {
    const s = await setup(SHOT);
    const pack = s.entities.add('packs', {
      brand: 'Local roaster',
      name: 'Ethiopia Guji · Natural',
      weightG: 250,
      roastDate: '2026-09-22',
      openDate: '2026-09-26',
      flavours: ['Blueberry'],
      finishedDate: null,
      buyAgain: null,
    });
    s.entities.update('grinders', SEED_IDS.c40, {
      currentSetting: 22,
      care: { lastDoneDate: '2026-09-10', reminderDays: 30 },
    });
    s.entities.update('machines', SEED_IDS.gaggia, {
      descale: { lastDoneDate: '2026-08-01', reminderDays: 60 },
      backflush: { lastDoneDate: '2026-09-23', reminderDays: null },
    });
    await storage.kv.set(SETTING_KEYS.grinderId, SEED_IDS.c40);
    await storage.kv.set(SETTING_KEYS.packId, pack.id);
    await s.preferences.reload();
    s.preferences.setRecipe(SEED_IDS.cappuccino);
    s.flow.attach();
    await pullShot(s);
    const { shot } = s.flow.state.card!;
    expect(shot).toMatchObject({
      doseG: null,
      targetRatio: 2,
      recipeId: SEED_IDS.cappuccino,
      recipeName: 'Cappuccino',
      milkRatio: 3,
      grinderId: SEED_IDS.c40,
      grinderName: 'Comandante C40 MK4 Red Clix',
      grindSetting: { kind: 'clicks', value: 22 },
      packId: pack.id,
      packName: 'Local roaster · Ethiopia Guji · Natural',
      packRoastDate: '2026-09-22',
      packOpenDate: '2026-09-26',
      lastDescaleDate: '2026-08-01',
      lastBackflushDate: '2026-09-23',
      lastGrinderCareDate: '2026-09-10',
    });
    await until(() => s.changes.count > 0, 'the shot to be stored');
    expect(await storage.shots.get(shot.id)).toEqual(shot);

    // Editing the entities later never rewrites the shot (D-068).
    s.entities.update('grinders', SEED_IDS.c40, { currentSetting: 21 });
    await s.entities.whenStored();
    expect((await storage.shots.get(shot.id))!.grindSetting).toEqual({ kind: 'clicks', value: 22 });
  });

  it('stops and zeroes the scale’s timer after a tap with no shot', async () => {
    const s = await setup(CUP_ONLY);
    s.flow.attach();
    await connect(s);
    await runTo(5000);
    s.flow.start();
    await runTo(22_000);
    expect(commands(s.events).slice(-3)).toEqual([
      `tareAndStartTimer ${MANUAL_START}`,
      'stopTimer pump-lapsed',
      'resetTimer pump-lapsed',
    ]);
    expect(s.link.shot.snapshot().phase).toBe('ready');
    expect(s.flow.state.card).toBeNull();
  });

  it('keeps the card when a grade can’t be stored, and says why', async () => {
    const failing = {
      create: storage.shots.create.bind(storage.shots),
      update: () => Promise.reject(new Error('disk full')),
    };
    const s = await setup(SHOT, { shots: failing });
    s.flow.attach();
    await pullShot(s);
    s.flow.setTaste('sour');
    expect(await s.flow.save()).toBe(false);
    expect(s.flow.state.card).toMatchObject({ storeError: 'disk full' });
    expect(s.flow.state.card!.shot.direction).toBe('sour');
  });

  it('shows why an analysis failed', async () => {
    const s = await setup(SHOT, {
      analysis: { analyze: () => Promise.reject(new Error('no raw')) },
      reanalyseAfterMs: [],
    });
    s.flow.attach();
    await pullShot(s);
    await until(() => s.flow.state.card?.analysisError !== null, 'the analysis to fail');
    expect(s.flow.state.card).toMatchObject({ analysisError: 'no raw', analysing: false });
  });
});

describe('BrewFlow, the phases without a tap (D-101)', () => {
  it('weighs the beans through the trip to the grinder, then the cup opens the extraction', async () => {
    // The bean cup and 17.1 g of beans; lifted at 15 s; back at 35 s with 14 g of grounds;
    // lifted at 42 s; the coffee cup at 46 s.
    const s = await setup({
      seed: 10,
      durationMs: 60_000,
      script: [
        { type: 'cup-on', atMs: 1000, massG: 119.8 },
        { type: 'shot', atMs: 3000, yieldG: 17.1, preInfusionMs: 500, extractionMs: 5000 },
        { type: 'cup-off', atMs: 15_000 },
        { type: 'cup-on', atMs: 35_000, massG: 119.8, contentsG: 14 },
        { type: 'cup-off', atMs: 42_000 },
        { type: 'cup-on', atMs: 46_000, massG: 257.2 },
      ],
    });
    const add = (name: string, emptyMassG: number, roles: ContainerRole[]) =>
      s.entities.add('containers', { name, emptyMassG, roles, dismissedWarningIds: [] });
    add('Bean cup', 119.8, ['bean']);
    add('Coffee cup', 257.2, ['cup']);
    s.flow.attach();
    await connect(s);
    await runTo(20_000);
    // Off to the grinder: a pause, the beans weighed.
    expect(s.flow.phases).toMatchObject({ current: 'beans', vesselOn: false });
    expect(s.flow.phases.beansG).toBeCloseTo(17.1, 0);
    const tares = () => commands(s.events).filter((line) => line.startsWith('tare '));
    const before = tares().length;
    await runTo(40_000);
    // The cup back with what it carries: not tared, the scale shows it.
    expect(tares()).toHaveLength(before);
    expect(s.flow.phases.beansG).toBeCloseTo(14, 0);
    expect(reading(s)).toBeCloseTo(14, 0);
    await runTo(50_000);
    expect(s.flow.phases).toMatchObject({
      current: 'extraction',
      status: { beans: 'done', grind: 'pending' },
    });
    // The coffee cup is tared as it goes on.
    expect(tares()).toHaveLength(before + 1);
    expect(Math.abs(reading(s))).toBeLessThan(0.1);
    const logged = s.events.flatMap((event) => {
      const change = phaseChangeOf(event);
      return change === null ? [] : [`${change.phase} ${change.state} ${change.by}`];
    });
    expect(logged).toEqual([
      'beans open container',
      'beans done container',
      'extraction open container',
    ]);
  });
});

describe('BrewFlow, the coffee cup opens the extraction (T2.34, session 7)', () => {
  const containers = (s: Awaited<ReturnType<typeof setup>>) => {
    const add = (name: string, emptyMassG: number, roles: ContainerRole[]) =>
      s.entities.add('containers', { name, emptyMassG, roles, dismissedWarningIds: [] });
    add('Bean cup', 119.8, ['bean']);
    add('Coffee cup', 264.8, ['cup']);
  };
  const logged = (s: Awaited<ReturnType<typeof setup>>) =>
    s.events.flatMap((event) => {
      const change = phaseChangeOf(event);
      return change === null ? [] : [`${change.phase} ${change.state} ${change.by}`];
    });

  it('put down first (from Home), goes straight to the extraction, the basket the dose', async () => {
    const s = await setup({
      seed: 11,
      durationMs: 20_000,
      script: [{ type: 'cup-on', atMs: 1000, massG: 264.8 }],
    });
    containers(s);
    s.flow.attach();
    await connect(s);
    await runTo(8000);
    expect(s.flow.phases.current).toBe('extraction');
    expect(logged(s)).toEqual(['beans skipped container', 'extraction open container']);
    // No beans weighed: the basket's 17 g, × 2.
    expect(s.flow.dose).toEqual({ g: 17, source: 'basket' });
    expect(s.link.shot.snapshot().targetG).toBe(34);
  });

  it('put down after the beans, opens the extraction with the beans for the dose', async () => {
    const s = await setup({
      seed: 12,
      durationMs: 40_000,
      script: [
        { type: 'cup-on', atMs: 1000, massG: 119.8 },
        { type: 'shot', atMs: 3000, yieldG: 17.3, preInfusionMs: 500, extractionMs: 5000 },
        { type: 'cup-off', atMs: 15_000 },
        { type: 'cup-on', atMs: 20_000, massG: 264.8 },
      ],
    });
    containers(s);
    s.flow.attach();
    await connect(s);
    await runTo(30_000);
    expect(s.flow.phases.current).toBe('extraction');
    expect(logged(s)).toEqual([
      'beans open container',
      'beans done container',
      'extraction open container',
    ]);
    expect(s.flow.dose.source).toBe('beans');
    expect(s.flow.dose.g).toBeCloseTo(17.3, 0);
  });

  it('put down after a bean cup that weighed nothing, the basket is the dose', async () => {
    // The bean cup on and off with a few grams at most: no dose.
    const s = await setup({
      seed: 13,
      durationMs: 40_000,
      script: [
        { type: 'cup-on', atMs: 1000, massG: 119.8 },
        { type: 'shot', atMs: 3000, yieldG: 2, preInfusionMs: 500, extractionMs: 2000 },
        { type: 'cup-off', atMs: 12_000 },
        { type: 'cup-on', atMs: 20_000, massG: 264.8 },
      ],
    });
    containers(s);
    s.flow.attach();
    await connect(s);
    await runTo(30_000);
    expect(s.flow.phases.current).toBe('extraction');
    expect(s.flow.phases.beansG).toBeGreaterThan(0.3);
    expect(s.flow.dose).toEqual({ g: 17, source: 'basket' });
    expect(s.link.shot.snapshot().targetG).toBe(34);
  });

  it("isn't the coffee cup at a weight 7.6 g off its own: session 7's cup as first learned", async () => {
    // The cup weighed 264.8 g that morning, learned as 257.2 g: no match within 3 g, so the beans
    // stayed open until the hint was tapped (or the cup learned again).
    const s = await setup({
      seed: 14,
      durationMs: 20_000,
      script: [
        { type: 'cup-on', atMs: 1000, massG: 119.8 },
        { type: 'cup-off', atMs: 5000 },
        { type: 'cup-on', atMs: 8000, massG: 264.8 },
      ],
    });
    const add = (name: string, emptyMassG: number, roles: ContainerRole[]) =>
      s.entities.add('containers', { name, emptyMassG, roles, dismissedWarningIds: [] });
    add('Bean cup', 119.8, ['bean']);
    add('Coffee cup', 257.2, ['cup']);
    s.flow.attach();
    await connect(s);
    await runTo(15_000);
    expect(s.flow.phases.current).toBe('beans');
    s.flow.selectPhase('extraction');
    expect(s.flow.phases.current).toBe('extraction');
  });
});

describe('BrewFlow, the milk with no buttons (T2.26)', () => {
  it('ends the milk when the jug is lifted with it, and the card records it', async () => {
    const s = await setup(PHASES);
    const add = (name: string, emptyMassG: number, roles: ContainerRole[]) =>
      s.entities.add('containers', { name, emptyMassG, roles, dismissedWarningIds: [] });
    add('Dosing cup', 41, ['bean']);
    add('Espresso cup', 110, ['cup']);
    add('Milk jug', 181.4, ['milk']);
    s.preferences.setRecipe(SEED_IDS.cappuccino);
    s.flow.attach();
    await connect(s);
    await runTo(43_900);
    s.flow.start();
    await runTo(116_000);
    expect(s.flow.phases).toMatchObject({ current: 'milk' });
    // The jug lifted at 118 s with 100 g of milk: no Done needed.
    await runTo(122_000);
    expect(s.flow.phases.current).toBe('extraction');
    expect(s.flow.phases.status.milk).toBe('done');
    await until(() => s.flow.state.card?.shot.milkPhase === 'done', 'the milk recorded');
    await until(() => (s.flow.state.card?.result?.phases.milkG ?? null) !== null, 'the milk');
    expect(s.flow.state.card!.result!.phases.milkG).toBeCloseTo(100, 0);
    const logged = s.events.flatMap((event) => {
      const change = phaseChangeOf(event);
      return change === null ? [] : [`${change.phase} ${change.state} ${change.by}`];
    });
    expect(logged.slice(-2)).toEqual(['milk open container', 'milk done container']);
  });
});

describe('BrewFlow, the user’s tares (T2.20, Q33)', () => {
  /** The cup on at 1 s, tared as it settles; lifted at 10 s: the scale then reads −110 g. */
  const LIFTED: Scenario = {
    seed: 3,
    durationMs: 40_000,
    script: [
      { type: 'cup-on', atMs: 1000, massG: 110 },
      { type: 'cup-off', atMs: 10_000 },
    ],
  };
  const phaseTares = (events: readonly AppEvent[]) =>
    commands(events).filter((line) => line.endsWith(PHASE_TARE_REASON));

  it('tares an empty scale reading negative at a phase’s start', async () => {
    const s = await setup(LIFTED);
    s.flow.attach();
    await connect(s);
    await runTo(14_000);
    expect(reading(s)).toBeCloseTo(-110, 0);
    expect(phaseTares(s.events)).toEqual([]);
    s.flow.selectPhase('beans');
    await runTo(16_000);
    expect(phaseTares(s.events)).toEqual([
      `stopTimer ${PHASE_TARE_REASON}`,
      `resetTimer ${PHASE_TARE_REASON}`,
      `tare ${PHASE_TARE_REASON}`,
    ]);
    expect(Math.abs(reading(s))).toBeLessThan(0.1);
    // Once: the next phase finds the scale at 0.
    s.flow.selectPhase('extraction');
    await runTo(18_000);
    expect(phaseTares(s.events)).toHaveLength(3);
  });

  it('leaves on the scale what the bean cup brings back, 3.2 g short of the beans (session 5)', async () => {
    // The bean cup and 17.8 g of beans; Grind tapped (nothing now) with the cup at the grinder;
    // back at 40 s with 14.6 g, lifted and put back at 50 s.
    const s = await setup({
      seed: 8,
      durationMs: 60_000,
      script: [
        { type: 'cup-on', atMs: 1000, massG: 119.8 },
        { type: 'shot', atMs: 3000, yieldG: 17.8, preInfusionMs: 500, extractionMs: 5000 },
        { type: 'cup-off', atMs: 15_000 },
        { type: 'cup-on', atMs: 40_000, massG: 119.8, contentsG: 14.6 },
        { type: 'cup-off', atMs: 47_000 },
        { type: 'cup-back', atMs: 50_000 },
      ],
    });
    s.entities.add('containers', {
      name: 'Bean cup',
      emptyMassG: 119.8,
      roles: ['bean'],
      dismissedWarningIds: [],
    });
    s.flow.attach();
    await connect(s);
    await runTo(20_000);
    const tares = () => commands(s.events).filter((line) => line.startsWith('tare '));
    const before = tares().length;
    await runTo(58_000);
    // No tare for the cup with what it carries, either time: the scale shows it.
    expect(tares()).toHaveLength(before);
    expect(s.flow.phases).toMatchObject({ current: 'beans' });
    expect(s.flow.phases.beansG).toBeCloseTo(14.6, 0);
    expect(reading(s)).toBeCloseTo(14.6, 0);
  });

  it('leaves the beans on the scale when the cup comes straight back with them (session 6)', async () => {
    // The bean cup and 17.1 g of beans; Grind tapped with the cup on; lifted at 25 s, back at
    // 29 s with the beans still in it.
    const s = await setup({
      seed: 9,
      durationMs: 45_000,
      script: [
        { type: 'cup-on', atMs: 1000, massG: 119.8 },
        { type: 'shot', atMs: 3000, yieldG: 17.1, preInfusionMs: 500, extractionMs: 5000 },
        { type: 'cup-off', atMs: 25_000 },
        { type: 'cup-back', atMs: 29_000 },
      ],
    });
    s.entities.add('containers', {
      name: 'Bean cup',
      emptyMassG: 119.8,
      roles: ['bean'],
      dismissedWarningIds: [],
    });
    s.flow.attach();
    await connect(s);
    await runTo(20_000);
    const tares = () => commands(s.events).filter((line) => line.startsWith('tare '));
    const before = tares().length;
    await runTo(40_000);
    // Never tared: the scale shows them, still the beans.
    expect(tares()).toHaveLength(before);
    expect(s.flow.phases).toMatchObject({ current: 'beans' });
    expect(s.flow.phases.beansG).toBeCloseTo(17.1, 0);
    expect(reading(s)).toBeCloseTo(17.1, 0);
  });

  it('tares an empty cup the screen finds untared as it opens, as after Home (session 4)', async () => {
    const s = await setup(CUP_ONLY);
    await connect(s);
    await runTo(5000);
    // The live view's tare came with no screen to send it.
    expect(reading(s)).toBeCloseTo(110, 0);
    s.flow.attach();
    await runTo(7000);
    expect(phaseTares(s.events)).toEqual([
      `stopTimer ${PHASE_TARE_REASON}`,
      `resetTimer ${PHASE_TARE_REASON}`,
      `tare ${PHASE_TARE_REASON}`,
    ]);
    expect(Math.abs(reading(s))).toBeLessThan(0.1);
    expect(s.link.vessel.onScale).toMatchObject({ vessel: { massG: 110 }, contentsG: 0 });
  });

  it('leaves the bean cup back with its grounds untared: the scale shows them', async () => {
    const s = await setup(PHASES);
    s.entities.add('containers', {
      name: 'Dosing cup',
      emptyMassG: 41,
      roles: ['bean', 'grind'],
      dismissedWarningIds: [],
    });
    s.flow.attach();
    await connect(s);
    await runTo(35_000);
    expect(phaseTares(s.events)).toEqual([]);
    // Back with 16.9 g of grounds: the scale shows them.
    expect(reading(s)).toBeCloseTo(16.9, 0);
  });

  it('never tares while the shot pours', async () => {
    const s = await setup(SHOT);
    s.flow.attach();
    await connect(s);
    await runTo(6100);
    s.flow.start();
    await runTo(15_000);
    expect(s.link.shot.phase).toBe('running');
    s.flow.selectPhase('beans');
    await runTo(16_000);
    expect(phaseTares(s.events)).toEqual([]);
  });
});

describe('BrewFlow on the scale mat (T2.17)', () => {
  /** The mat (15.5 g) on at 1 s, the dosing cup on it at 6 s, 17.2 g of beans poured in. */
  const MAT_BREW: Scenario = {
    seed: 8,
    durationMs: 40_000,
    script: [
      { type: 'mat-on', atMs: 1000, massG: 15.5 },
      { type: 'cup-on', atMs: 6000, massG: 41 },
      { type: 'shot', atMs: 9000, yieldG: 17.2, preInfusionMs: 500, extractionMs: 5000 },
    ],
  };

  it('weighs the beans in the bean cup on the mat, the mat part of the platform', async () => {
    const s = await setup(MAT_BREW);
    const add = (name: string, emptyMassG: number, roles: ContainerRole[]) =>
      s.entities.add('containers', { name, emptyMassG, roles, dismissedWarningIds: [] });
    add('Scale mat', 15.5, ['accessory']);
    const dosing = add('Dosing cup', 41, ['bean', 'grind']);
    s.flow.attach();
    await connect(s);
    await runTo(5000);
    // The mat on: no vessel, so no phase routed or logged.
    expect(s.flow.phases.vesselOn).toBe(false);
    expect(s.link.vessel.onScale).toBeNull();
    await runTo(25_000);
    expect(s.flow.phases).toMatchObject({ current: 'beans', vesselOn: true, container: dosing });
    expect(s.flow.phases.beansG).toBeCloseTo(17.2, 0);
    const logged = s.events.flatMap((event) => {
      const change = phaseChangeOf(event);
      return change === null ? [] : [`${change.phase} ${change.state} ${change.by}`];
    });
    expect(logged).toEqual(['beans open container']);
    // The cup is tared as it settles on the mat, as on the bare platform.
    expect(commands(s.events).filter((line) => line.endsWith(AUTO_TARE_REASON))).toEqual([
      `stopTimer ${AUTO_TARE_REASON}`,
      `resetTimer ${AUTO_TARE_REASON}`,
      `tare ${AUTO_TARE_REASON}`,
    ]);
  });
});

describe('BrewFlow, ended by its ✕ (T2.15)', () => {
  const learn = (s: Setup) => {
    const add = (name: string, emptyMassG: number, roles: ContainerRole[]) =>
      s.entities.add('containers', { name, emptyMassG, roles, dismissedWarningIds: [] });
    add('Dosing cup', 41, ['bean', 'grind']);
    add('Espresso cup', 110, ['cup']);
  };

  it('resets the scale after a Start with no shot: the timer stopped and zeroed, a tare', async () => {
    const s = await setup(CUP_ONLY);
    const detach = s.flow.attach();
    await connect(s);
    await runTo(5000);
    s.flow.start();
    await runTo(8000);
    expect(s.link.recorder.state.stats!.lastWeight!.frame.timerMs).toBeGreaterThan(2000);
    s.flow.end();
    detach();
    expect(s.link.shot.snapshot().phase).toBe('idle');
    await runTo(22_000);
    expect(commands(s.events).slice(-4)).toEqual([
      `tareAndStartTimer ${MANUAL_START}`,
      `stopTimer ${END_SESSION_REASON}`,
      `resetTimer ${END_SESSION_REASON}`,
      `tare ${END_SESSION_REASON}`,
    ]);
    // The scale reads 0 and its timer stays at 0: the tap is forgotten, so it never lapses.
    const frame = s.link.recorder.state.stats!.lastWeight!.frame;
    expect(frame.timerMs).toBe(0);
    expect(Math.abs(frame.weightG)).toBeLessThan(0.1);
    expect(s.link.shot.snapshot().phase).toBe('idle');
    expect(s.flow.state).toMatchObject({ card: null, error: null });
  });

  it('forgets a shot under way: no card, nothing stored', async () => {
    const s = await setup(SHOT);
    const detach = s.flow.attach();
    await connect(s);
    await runTo(6100);
    s.flow.start();
    await runTo(20_000);
    expect(s.link.shot.snapshot().phase).toBe('running');
    s.flow.end();
    detach();
    s.flow.attach();
    await runTo(PUMP_OFF_MS + 3000);
    expect(s.flow.state.card).toBeNull();
    const recordingId = s.link.recorder.recording!.id;
    expect(await storage.shots.listForRecording(recordingId)).toEqual([]);
  });

  it('keeps an open card: nothing sent, the brew goes on', async () => {
    const s = await setup(SHOT);
    s.flow.attach();
    await pullShot(s);
    const card = s.flow.state.card;
    expect(card).not.toBeNull();
    const sent = commands(s.events).length;
    s.flow.end();
    await runTo(PUMP_OFF_MS + 4000);
    expect(commands(s.events).slice(sent)).toEqual([]);
    expect(s.flow.state.card?.shot.id).toBe(card!.shot.id);
    expect(s.flow.phases.shotDone).toBe(true);
  });

  it('sends nothing while not connected, and the next brew starts afresh', async () => {
    const s = await setup(PHASES);
    learn(s);
    s.flow.attach();
    s.flow.selectPhase('extraction');
    expect(s.flow.phases.current).toBe('extraction');
    s.flow.end();
    expect(s.flow.phases).toMatchObject({ current: 'beans', beansG: null });
    expect(commands(s.events)).toEqual([]);
    expect(s.flow.state.error).toBeNull();
  });

  it('ends the open phase in the log, and the next brew takes what is on the scale', async () => {
    const s = await setup(PHASES);
    learn(s);
    const detach = s.flow.attach();
    await connect(s);
    await runTo(12_000);
    expect(s.flow.phases.beansG).toBeCloseTo(17.2, 0);
    s.flow.end();
    detach();
    expect(s.flow.phases).toMatchObject({ current: 'beans', beansG: null, vesselOn: false });
    await runTo(13_000);
    // Shown again: the dosing cup on the scale, its beans in it, is the new brew's first vessel.
    s.flow.attach();
    await runTo(13_200);
    expect(s.flow.phases).toMatchObject({ current: 'beans', vesselOn: true });
    expect(s.flow.phases.beansG).toBeCloseTo(17.2, 0);
    const logged = s.events.flatMap((event) => {
      const change = phaseChangeOf(event);
      return change === null ? [] : [`${change.phase} ${change.state} ${change.by}`];
    });
    expect(logged).toEqual(['beans open container', 'beans done user', 'beans open container']);
  });

  it('gives the next shot none of the ended brew’s beans when it skips them', async () => {
    const s = await setup(PHASES);
    learn(s);
    const detach = s.flow.attach();
    await connect(s);
    await runTo(12_000);
    s.flow.end();
    detach();
    // Back at 20 s, the dosing cup off: Extraction tapped straight away; the cup at 40 s.
    await runTo(20_000);
    s.flow.attach();
    s.flow.selectPhase('extraction');
    await runTo(43_900);
    s.flow.start();
    await runTo(80_000);
    const card = s.flow.state.card!;
    expect(card.shot).toMatchObject({ beansPhase: 'skipped', grindPhase: null });
    await until(() => s.flow.state.card?.result !== null, 'the first analysis');
    const result = s.flow.state.card!.result!;
    // The ended brew weighed 17.2 g of beans, which the recording keeps: not this shot's.
    expect(result.phases).toMatchObject({ beansG: null });
    expect(result.dose?.source).toBe('basket');
  });
});

describe('BrewFlow, detached', () => {
  it('neither tares nor stores anything: the probe’s cup and taps stay its own', async () => {
    const s = await setup(SHOT);
    const detach = s.flow.attach();
    detach();
    detach(); // twice is once
    expect(s.flow.attached).toBe(false);
    await connect(s);
    await runTo(6100);
    // The probe's Tare + start, with the pump.
    await s.link.recorder.sendCommand(tareAndStartTimer(), 'probe');
    await runTo(PUMP_OFF_MS + 3000);
    expect(s.link.shot.snapshot().phase).toBe('done');
    // Only the link's own: smoothing off, and the mode check (T1.25), whichever screen is open.
    expect(commands(s.events)).toEqual([
      'flowSmoothingOff connect',
      `startTimer ${MODE_CHECK_REASON}`,
      `stopTimer ${MODE_CHECK_REASON}`,
      `resetTimer ${MODE_CHECK_REASON}`,
      'tareAndStartTimer probe',
    ]);
    expect(s.flow.state.card).toBeNull();
    const recordingId = s.link.recorder.recording!.id;
    expect(await storage.shots.listForRecording(recordingId)).toEqual([]);
  });
});
