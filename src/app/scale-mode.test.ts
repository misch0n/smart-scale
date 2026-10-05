/**
 * The scale-mode check (T1.25; D-057, D-073) on the simulator, through a link's mock transport
 * on a manual clock: the check on connect in each of the scale's modes, the checks again while
 * it isn't the timer mode, the warning clearing once the user switches modes, and never a
 * command during a shot.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MODE_CHECK_REASON, TIMER_START_WINDOW_MS } from '../core/live';
import { MANUAL_START, type AppEvent } from '../core/model';
import { tareAndStartTimer } from '../core/protocol';
import type { ScaleMode, Scenario, ScriptEvent } from '../core/sim';
import { freshIndexedDB } from '../storage/fake-idb';
import { openStorage, type AppStorage } from '../storage';
import { Emitter } from '../transport/emitter';
import { MockTransport } from '../transport/mock';
import { ManualClock } from '../transport/scheduler';
import { FakeLocks } from './fake-locks';
import { ScaleLinks, type ScaleLink } from './links';
import type { PageLifecycle, PageVisibility, PageVisibilityState } from './page-lifecycle';
import { MODE_RECHECK_MS, type ScaleModeState } from './scale-mode';

const APP = { commit: 'abc1234', buildTime: '2026-10-05T07:00:00.000Z' };
/** The mock connects 300 ms after `connect()`: the session's time 0. */
const CONNECT_MS = 300;

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

/** Runs the clock by `ms`, letting the writes and storage keep up. */
async function runFor(ms: number, stepMs = 50): Promise<void> {
  const end = clock.now() + ms;
  while (clock.now() < end) {
    clock.advanceTo(Math.min(end, clock.now() + stepMs));
    await settle();
  }
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
  readonly transport: MockTransport;
  /** Every app event of the link's recordings. */
  readonly events: AppEvent[];
  /** Every state the check emitted. */
  readonly states: ScaleModeState[];
}

/** A link on `scenario`'s simulated scale, not connected yet. */
function setup(scenario: Scenario): Setup {
  const page = new FakePage();
  const transport = new MockTransport({ scenario, scheduler: clock });
  const links = new ScaleLinks({
    storage,
    app: APP,
    userAgent: 'test agent',
    makeTransport: () => transport,
    recorder: { timers: clock, locks: new FakeLocks(), page, epochNow: () => clock.now() },
    connector: { timers: clock },
    visibility: page,
  });
  const link = links.get({ kind: 'mock', speed: 1 });
  const events: AppEvent[] = [];
  link.recorder.onEvent((event) => events.push(event));
  const states: ScaleModeState[] = [];
  link.mode.onChange((state) => states.push(state));
  return { link, transport, events, states };
}

/** Taps Connect and runs on to the session's time 0. */
async function connect({ link }: Setup): Promise<void> {
  link.connector.connect();
  await runFor(CONNECT_MS);
}

/** An empty scale in `mode`, for `durationMs`, with `script`. */
function scaleIn(mode: ScaleMode, script: ScriptEvent[] = [], durationMs = 120_000): Scenario {
  return { seed: 3, durationMs, script, scale: { mode } };
}

/** The mode check's commands, as `name@s` on the recording's timeline. */
function checkCommands(events: readonly AppEvent[]): string[] {
  return events.flatMap((event) =>
    event.type === 'command-sent' && event.data.reason === MODE_CHECK_REASON
      ? [`${event.data.command}@${Math.floor(event.tMs / 1000)}`]
      : [],
  );
}

describe('ScaleModeCheck on connect', () => {
  it('timer mode: one 04, its start, 05 and 06 to put it back, then nothing more', async () => {
    const s = setup(scaleIn('timer'));
    expect(s.link.mode.state.verdict).toBe('unknown');
    await connect(s);
    await runFor(2000);
    expect(s.link.mode.state).toMatchObject({
      verdict: 'timer',
      evidence: { kind: 'started', command: 'startTimer', reason: MODE_CHECK_REASON },
      checking: false,
      checks: 1,
      error: null,
    });
    expect(checkCommands(s.events)).toEqual(['startTimer@0', 'stopTimer@0', 'resetTimer@0']);
    const truth = s.transport.simulator.truth();
    expect(truth.timer.map((change) => change.change)).toEqual(['start', 'stop', 'reset']);
    // The check is over well within a second of connecting.
    expect(truth.timer[2].atMs).toBeLessThan(1000);
    await runFor(30_000);
    expect(checkCommands(s.events)).toHaveLength(3);
    expect(s.link.mode.state.verdict).toBe('timer');
  });

  it('flow-rate mode: the 04 doesn’t start the timer, so the warning; again every 5 s', async () => {
    const s = setup(scaleIn('flow-rate'));
    await connect(s);
    await runFor(1000);
    expect(s.link.mode.state).toMatchObject({
      verdict: 'not-timer',
      evidence: { kind: 'not-started', command: 'startTimer', reason: MODE_CHECK_REASON },
      checking: false,
      checks: 1,
    });
    await runFor(20_000);
    // At connect, then every 5 s, while the scale is idle; only the 04, nothing to put back.
    expect(checkCommands(s.events)).toEqual([
      'startTimer@0',
      'startTimer@5',
      'startTimer@10',
      'startTimer@15',
      'startTimer@20',
    ]);
    expect(MODE_RECHECK_MS).toBe(5000);
    expect(s.transport.simulator.truth().timer).toEqual([]);
    expect(s.link.mode.state).toMatchObject({ verdict: 'not-timer', checks: 5 });
  });

  it('automatic mode, between its runs: the warning too', async () => {
    const s = setup(scaleIn('automatic'));
    await connect(s);
    await runFor(1000);
    expect(s.link.mode.state).toMatchObject({ verdict: 'not-timer', checks: 1 });
    expect(s.link.mode.state.evidence?.kind).toBe('not-started');
  });

  it('shows the check while its 04 is out, and changes state only when something changes', async () => {
    const s = setup(scaleIn('flow-rate'));
    await connect(s);
    await runFor(1000);
    expect(s.states.map((state) => [state.verdict, state.checking])).toEqual([
      ['unknown', true],
      ['not-timer', false],
    ]);
    // The warning lands once the window has passed: about half a second after the 04.
    const sent = s.events.find((event) => event.type === 'command-sent' && event.data.reason);
    const evidence = s.link.mode.state.evidence!;
    expect(evidence.tMs - sent!.tMs).toBeGreaterThanOrEqual(TIMER_START_WINDOW_MS);
  });
});

describe('ScaleModeCheck: the warning clears', () => {
  it('within about 5 s of the user switching the scale to its timer mode', async () => {
    const s = setup(scaleIn('flow-rate', [{ type: 'mode', atMs: 12_000, mode: 'timer' }]));
    await connect(s);
    await runFor(14_000);
    expect(s.link.mode.state.verdict).toBe('not-timer');
    await runFor(3000); // the check at 15 s
    expect(s.link.mode.state.verdict).toBe('timer');
    expect(checkCommands(s.events)).toEqual([
      'startTimer@0',
      'startTimer@5',
      'startTimer@10',
      'startTimer@15',
      'stopTimer@15',
      'resetTimer@15',
    ]);
    await runFor(20_000);
    expect(checkCommands(s.events)).toHaveLength(6);
  });

  it('and comes back with the automatic mode’s 03 0D, with no check needed', async () => {
    const s = setup(
      scaleIn('timer', [
        { type: 'mode', atMs: 5000, mode: 'automatic' },
        { type: 'bump', atMs: 8000, durationMs: 300, peakG: 3 }, // a touch: its run starts
      ]),
    );
    await connect(s);
    await runFor(10_000);
    expect(s.link.mode.state).toMatchObject({
      verdict: 'not-timer',
      evidence: { kind: 'scale-event', state: 'started' },
      checks: 1,
    });
  });
});

describe('ScaleModeCheck never acts during a shot', () => {
  it('a reconnect while the timer runs sends nothing', async () => {
    const s = setup(scaleIn('timer'));
    await connect(s);
    await runFor(2000);
    // The Tare + start tap, as the brew flow makes it: the scale's timer runs for the shot.
    s.link.recorder.logUiAction(MANUAL_START);
    await s.link.recorder.sendCommand(tareAndStartTimer(), MANUAL_START);
    await runFor(2000);
    // The link drops, and the app connects again mid-shot.
    s.link.connector.disconnect();
    await runFor(1000);
    expect(s.link.mode.state.verdict).toBe('unknown');
    const before = s.events.length;
    await connect(s);
    await runFor(20_000);
    const since = s.events.slice(before);
    expect(since[0]).toMatchObject({ type: 'connected' });
    expect(checkCommands(since)).toEqual([]);
    expect(s.link.mode.state).toMatchObject({ verdict: 'unknown', checks: 0 });
    // The timer the tap started still runs.
    expect(s.transport.simulator.truth().timer.at(-1)?.change).toBe('start');
  });

  it('leaves a timer it started to the tap that came meanwhile', async () => {
    const s = setup(scaleIn('timer'));
    // The tap lands as the check's 04 is logged, before its start shows.
    s.link.recorder.onEvent((event) => {
      if (event.type === 'command-sent' && event.data.reason === MODE_CHECK_REASON) {
        s.link.recorder.logUiAction(MANUAL_START);
      }
    });
    await connect(s);
    await runFor(3000);
    expect(s.link.shot.phase).toBe('running');
    // The start was the check's, but the shot has it now: no stop, no reset.
    expect(checkCommands(s.events)).toEqual(['startTimer@0']);
    expect(s.link.mode.state.verdict).toBe('timer');
    expect(s.transport.simulator.truth().timer.map((change) => change.change)).toEqual(['start']);
  });

  it('waits while a cup is on the scale, and checks again once it is off', async () => {
    const s = setup(
      scaleIn('flow-rate', [
        { type: 'cup-on', atMs: 3000, massG: 110 },
        { type: 'cup-off', atMs: 23_000 },
      ]),
    );
    await connect(s);
    await runFor(30_000);
    // At connect; then the cup from 3 s to 23 s; then 5 s after the last.
    const seconds = checkCommands(s.events).map((entry) => Number(entry.split('@')[1]));
    expect(seconds[0]).toBe(0);
    expect(seconds.filter((t) => t >= 4 && t < 23)).toEqual([]);
    expect(seconds.filter((t) => t >= 23).length).toBeGreaterThanOrEqual(1);
  });
});

describe('ScaleModeCheck when the command fails', () => {
  it('says why, and checks again 5 s on', async () => {
    const s = setup(scaleIn('flow-rate'));
    const send = s.transport.send.bind(s.transport);
    let failures = 1;
    s.transport.send = (command) => {
      if (command.name === 'startTimer' && failures-- > 0) {
        return Promise.reject(new Error('GATT write failed'));
      }
      return send(command);
    };
    await connect(s);
    await runFor(1000);
    expect(s.link.mode.state).toMatchObject({
      verdict: 'unknown',
      checking: false,
      checks: 1,
      error: 'GATT write failed',
    });
    expect(s.events.some((event) => event.type === 'command-failed')).toBe(true);
    await runFor(5000);
    expect(s.link.mode.state).toMatchObject({ verdict: 'not-timer', checks: 2, error: null });
  });
});
