/**
 * The brew flow (T1.18) on the simulator through the mock transport: the commands it answers the
 * live shot with while attached (D-066), the manual start, the live shot it stores at "shot
 * done" with its analysis, the grades and Save. Storage is a fake IndexedDB, and the analysis
 * the real runner.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MODE_CHECK_REASON } from '../core/live';
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
      grindPhase: 'skipped',
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

    await runTo(35_000);
    expect(s.flow.phases).toMatchObject({ current: 'grind' });
    expect(s.flow.phases.status.beans).toBe('done');
    expect(s.flow.phases.groundG).toBeCloseTo(16.9, 0);
    // The target follows the grounds: 16.9 g × 2.
    expect(s.link.shot.snapshot().targetG).toBeCloseTo(33.8, 0);

    await runTo(43_900);
    expect(s.flow.phases).toMatchObject({ current: 'extraction' });
    s.flow.start();
    await runTo(80_000);
    const card = s.flow.state.card!;
    expect(card.shot).toMatchObject({
      beansPhase: 'done',
      grindPhase: 'done',
      milkPhase: null,
      containerId: cup.id,
      doseG: null,
    });
    await until(() => s.flow.state.card?.result !== null, 'the first analysis');
    let result = s.flow.state.card!.result!;
    expect(result.phases.beansG).toBeCloseTo(17.2, 0);
    expect(result.phases.groundG).toBeCloseTo(16.9, 0);
    expect(result.dose?.source).toBe('ground');

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
      'grind open container',
      'grind done container',
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
