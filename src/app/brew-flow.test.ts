/**
 * The brew flow (T1.18) on the simulator through the mock transport: the commands it answers the
 * live shot with while attached (D-066), the manual start, the live shot it stores at "shot
 * done" with its analysis, the grades and Save. Storage is a fake IndexedDB, and the analysis
 * the real runner.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MODE_CHECK_REASON } from '../core/live';
import { AUTO_TARE_REASON, MANUAL_START, type AppEvent, type Id } from '../core/model';
import { tareAndStartTimer } from '../core/protocol';
import { espressoScenario, type Scenario } from '../core/sim';
import { freshIndexedDB } from '../storage/fake-idb';
import { openStorage, type AppStorage } from '../storage';
import { Emitter } from '../transport/emitter';
import { MockTransport } from '../transport/mock';
import { ManualClock } from '../transport/scheduler';
import { AnalysisRunner } from './analysis-runner';
import { BrewFlow, type BrewFlowOptions } from './brew-flow';
import { BrewPreferences } from './brew-settings';
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
  /** Every app event of the link's recordings. */
  readonly events: AppEvent[];
  /** How often the flow said a shot changed. */
  readonly changes: { count: number };
}

async function setup(scenario: Scenario, options: Partial<BrewFlowOptions> = {}): Promise<Setup> {
  const page = new FakePage();
  const epochNow = () => NOW + clock.now();
  const links = new ScaleLinks({
    storage,
    app: APP,
    userAgent: 'test agent',
    makeTransport: () => new MockTransport({ scenario, scheduler: clock }),
    recorder: { timers: clock, locks: new FakeLocks(), page, epochNow },
    visibility: page,
  });
  const link = links.get({ kind: 'mock', speed: 1 });
  const events: AppEvent[] = [];
  link.recorder.onEvent((event) => events.push(event));
  const preferences = await BrewPreferences.load(storage.kv);
  const changes = { count: 0 };
  const flow = new BrewFlow({
    link,
    shots: storage.shots,
    analysis: new AnalysisRunner({ storage, epochNow }),
    preferences,
    onShotsChanged: () => changes.count++,
    timers: clock,
    epochNow,
    ...options,
  });
  return { link, flow, preferences, events, changes };
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
      doseG: 18,
      targetRatio: 2,
      recipeName: 'Espresso',
      milkRatio: null,
      tags: ['WDT', 'Puck screen'],
      direction: null,
      channelled: null,
      recordingId: s.link.recorder.recording!.id,
    });
    // Anchored at "shot done": inside the shot, after the pump stopped (D-047).
    expect(shot.anchorTMs).toBeGreaterThan(PUMP_OFF_MS);
    expect(shot.anchorTMs).toBeLessThan(PUMP_OFF_MS + 3000);
    expect(card.display.phase).toBe('done');
    expect(card.display.series.length).toBeGreaterThan(100);
    await until(() => s.changes.count > 0, 'the shot to be stored');
    expect(await storage.shots.get(shot.id)).toEqual(shot);
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
    expect(card.result!.match.ratio).toBeCloseTo(38 / 18, 1);
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
    expect(s.preferences.value.tags.at(-1)).toEqual({ name: 'Bottomless', isDefault: false });

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

  it('follows the recipe and the dose with its target', async () => {
    const s = await setup(SHOT);
    expect(s.link.shot.snapshot().targetG).toBeNull();
    const detach = s.flow.attach();
    expect(s.link.shot.snapshot().targetG).toBe(36);
    s.preferences.setRecipe('Ristretto');
    expect(s.link.shot.snapshot().targetG).toBe(27);
    s.preferences.setDoseG(17);
    expect(s.link.shot.snapshot().targetG).toBeCloseTo(25.5, 9);
    detach();
    s.preferences.setRecipe('Lungo');
    expect(s.link.shot.snapshot().targetG).toBeCloseTo(25.5, 9);
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
