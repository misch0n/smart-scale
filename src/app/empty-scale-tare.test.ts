/**
 * Setup's tare of an empty scale (T2.20): a link on the mock scale, with the mat learned as a
 * scale accessory; the scale isn't zeroed with the mat, so it reads 15.5 g with nothing on.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEntity, type AppEvent } from '../core/model';
import type { Scenario } from '../core/sim';
import { freshIndexedDB } from '../storage/fake-idb';
import { openStorage, type AppStorage } from '../storage';
import { Emitter } from '../transport/emitter';
import { MockTransport } from '../transport/mock';
import { ManualClock } from '../transport/scheduler';
import { SETUP_TARE_REASON, tareWhileEmpty } from './empty-scale-tare';
import { FakeLocks } from './fake-locks';
import { ScaleLinks } from './links';
import type { PageLifecycle, PageVisibility, PageVisibilityState } from './page-lifecycle';

/** The mat on at 1 s; a cup on it at 10 s, lifted at 16 s. */
const MAT_AND_CUP: Scenario = {
  seed: 4,
  durationMs: 60_000,
  script: [
    { type: 'mat-on', atMs: 1000, massG: 15.5 },
    { type: 'cup-on', atMs: 10_000, massG: 110 },
    { type: 'cup-off', atMs: 16_000 },
  ],
};

const MAT = createEntity(
  'containers',
  { name: 'Scale mat', emptyMassG: 15.5, roles: ['accessory'], dismissedWarningIds: [] },
  Date.UTC(2026, 9, 6, 7),
);

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

async function runTo(ms: number): Promise<void> {
  while (clock.now() < ms) {
    clock.advanceTo(Math.min(ms, clock.now() + 50));
    await settle();
  }
}

function makeLink(scenario: Scenario) {
  const page = new FakePage();
  const links = new ScaleLinks({
    storage,
    app: { commit: 'abc1234', buildTime: '2026-10-06T07:00:00.000Z' },
    userAgent: 'test agent',
    makeTransport: () => new MockTransport({ scenario, scheduler: clock }),
    recorder: { timers: clock, locks: new FakeLocks(), page, epochNow: () => 1_000_000 },
    connector: { timers: clock },
    visibility: page,
    containers: () => [MAT],
  });
  const link = links.get({ kind: 'mock', speed: 1 });
  const events: AppEvent[] = [];
  link.recorder.onEvent((event) => events.push(event));
  return { link, events };
}

const setupTares = (events: readonly AppEvent[]) =>
  events.filter(
    (event) => event.type === 'command-sent' && event.data.reason === SETUP_TARE_REASON,
  );

describe('tareWhileEmpty (T2.20)', () => {
  it('tares the scale reading the mat, once; a cup on it then weighs from 0', async () => {
    const { link, events } = makeLink(MAT_AND_CUP);
    const stop = tareWhileEmpty(link);
    await Promise.all([link.transport.connect(), runTo(300)]);
    await runTo(8000);
    expect(setupTares(events)).toHaveLength(1);
    const reading = () => link.recorder.state.stats!.lastWeight!.frame.weightG;
    expect(Math.abs(reading())).toBeLessThan(0.1);
    await runTo(14_000);
    expect(reading()).toBeCloseTo(110, 0);
    expect(link.vessel.vessel?.massG).toBeCloseTo(110, 0);
    // Lifted: the scale reads 0 again, and needs no tare.
    await runTo(25_000);
    expect(setupTares(events)).toHaveLength(1);
    stop();
  });

  it('sends nothing once stopped', async () => {
    const { link, events } = makeLink(MAT_AND_CUP);
    tareWhileEmpty(link)();
    await Promise.all([link.transport.connect(), runTo(300)]);
    await runTo(8000);
    expect(setupTares(events)).toEqual([]);
  });
});
