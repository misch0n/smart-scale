import { describe, expect, it } from 'vitest';
import { AUTO_TARE_REASON, MANUAL_START, RecordingSequence } from '../model';
import { decodeFrame } from '../protocol';
import {
  espressoScenario,
  ScaleSimulator,
  type EspressoScenarioOptions,
  type Scenario,
  type ScriptEvent,
} from '../sim';
import { END_SESSION_REASON, PUMP_LAPSED_REASON, SHOT_DONE_REASON } from './scale-commands';
import { ShotMonitor, type ShotDisplay } from './shot-monitor';
import { eventsOf, streamLive, type StreamOptions } from './test-stream';

/*
 * The live pipeline streamed through simulated sessions (T1.17): the simulator delivers each
 * frame as a transport would, and the test stands in for the app. It sends the scale what
 * `scaleCommandsFor` says for the monitor's events (D-066) and makes the Tare + start tap with
 * the pump (Q4), 0.15 s late.
 */

const TAP_LATENCY_MS = 150;

/** One espresso shot, with no scripted tare: the monitor's own replaces it. */
function espresso(options: EspressoScenarioOptions = {}): Scenario {
  return espressoScenario({ tareAndStartMs: null, ...options });
}

/** The shot's pump start, from the scenario's script. */
function pumpOnMs(scenario: Scenario): number {
  const shot = scenario.script.find((event) => event.type === 'shot');
  if (!shot) throw new Error('no shot in the scenario');
  return shot.atMs;
}

/** Streams `scenario` with the tap made at its pump start. */
function withTap(scenario: Scenario, options: StreamOptions = {}) {
  return streamLive(scenario, {
    targetG: 36,
    ...options,
    actions: [
      { atMs: pumpOnMs(scenario) + TAP_LATENCY_MS, type: 'tap' },
      ...(options.actions ?? []),
    ],
  });
}

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

describe('ShotMonitor: the arm-once tare (spec "Tare arming")', () => {
  it('fires once per shot, as the cup settles, and never as the tail settles', () => {
    const scenario = espresso({ seed: 1 });
    const run = withTap(scenario);
    const tares = eventsOf(run, 'tare');
    expect(tares).toHaveLength(1);
    // The cup goes on at 2 s and settles within a second and a half: long before the pump.
    expect(tares[0].atMs).toBeGreaterThan(2000);
    expect(tares[0].atMs).toBeLessThan(3500);
    // The app logged one auto-tare, a plain one after the timer's stop and reset (D-066), and
    // the scale took it before the tap. Then the tap, and the timer's stop at "shot done".
    expect(
      run.log.map((event) =>
        event.type === 'command-sent'
          ? `${event.data.command}:${event.data.reason}`
          : `${event.type}:${event.type === 'ui-action' ? event.data.action : ''}`,
      ),
    ).toEqual([
      `stopTimer:${AUTO_TARE_REASON}`,
      `resetTimer:${AUTO_TARE_REASON}`,
      `tare:${AUTO_TARE_REASON}`,
      `ui-action:${MANUAL_START}`,
      `tareAndStartTimer:${MANUAL_START}`,
      `stopTimer:${SHOT_DONE_REASON}`,
    ]);
    expect(run.truth.tares[0].atMs).toBeLessThan(pumpOnMs(scenario));
    // The shot ends settled, the tare still disarmed; the cup off re-arms it.
    expect(eventsOf(run, 'shot-done').map((entry) => entry.event.reason)).toEqual(['settled']);
    expect(run.events.map((entry) => entry.event.type)).toEqual([
      'cup-on',
      'tare',
      'pump-on',
      'first-drip',
      'pump-off',
      'shot-done',
      'cup-off',
    ]);
    expect(run.monitor.snapshot().tareArmed).toBe(true);
  });

  it('fires once per cup over two shots', () => {
    const script: ScriptEvent[] = [
      { type: 'cup-on', atMs: 2000, massG: 110 },
      { type: 'shot', atMs: 7000 },
      { type: 'cup-off', atMs: 45_000 },
      { type: 'cup-on', atMs: 55_000, massG: 95 },
      { type: 'shot', atMs: 60_000, yieldG: 36 },
      { type: 'cup-off', atMs: 95_000 },
    ];
    const run = streamLive(
      { seed: 3, durationMs: 100_000, script },
      {
        targetG: 36,
        actions: [
          { atMs: 7000 + TAP_LATENCY_MS, type: 'tap' },
          { atMs: 60_000 + TAP_LATENCY_MS, type: 'tap' },
        ],
      },
    );
    expect(eventsOf(run, 'tare').map((entry) => Math.round(entry.atMs / 1000))).toEqual([3, 56]);
    expect(eventsOf(run, 'shot-done')).toHaveLength(2);
  });

  it('re-arms on a manual reset, which tares what is on the scale at once', () => {
    const scenario = espresso({ seed: 2, cupOffAfterPumpOffMs: null });
    const doneMs = 35_000 + 3000;
    let afterReset: ShotDisplay | null = null;
    const run = withTap(scenario, {
      actions: [
        { atMs: doneMs, type: 'reset' },
        { atMs: doneMs + 5000, type: 'reset' },
      ],
      onFrame: (frame, monitor) => {
        if (afterReset === null && frame.tArrival > doneMs + 1000) afterReset = monitor.snapshot();
      },
    });
    const tares = eventsOf(run, 'tare');
    expect(tares.map((entry) => entry.atMs)).toEqual([tares[0].atMs, doneMs, doneMs + 5000]);
    // The scale took each one, and the display reads the cup, coffee and all, as its new zero.
    expect(run.truth.tares.filter((tare) => tare.atMs > doneMs)).toHaveLength(2);
    expect(afterReset!.phase).toBe('ready');
    expect(Math.abs(afterReset!.netG!)).toBeLessThan(0.1);
    expect(afterReset!.tareArmed).toBe(false);
  });

  it('says what the cup weighed and when it went on, until it comes off', () => {
    const script: ScriptEvent[] = [
      { type: 'cup-on', atMs: 2000, massG: 112.6 },
      { type: 'shot', atMs: 8000 },
      { type: 'cup-off', atMs: 50_000 },
    ];
    // The display at the first frame past each of these times.
    const checkpoints = [1000, 5000, 30_000, 54_000];
    const seen: ShotDisplay[] = [];
    const run = streamLive(
      { seed: 6, durationMs: 55_000, script },
      {
        targetG: 36,
        actions: [{ atMs: 8000 + TAP_LATENCY_MS, type: 'tap' }],
        onFrame: (frame, monitor) => {
          if (frame.tArrival >= (checkpoints[seen.length] ?? Infinity)) {
            seen.push(monitor.snapshot());
          }
        },
      },
    );
    expect(seen).toHaveLength(checkpoints.length);
    const [before, ready, pouring, after] = seen;
    expect(before).toMatchObject({ phase: 'idle', cupG: null, cupOnMs: null });
    expect(ready.phase).toBe('ready');
    expect(ready.cupG).toBeCloseTo(112.6, 0);
    // Taken as it settles, a second or so after it went on.
    expect(ready.cupOnMs).toBeGreaterThan(2000);
    expect(ready.cupOnMs).toBeLessThan(3500);
    expect(pouring).toMatchObject({ phase: 'running', cupOnMs: ready.cupOnMs });
    expect(pouring.cupG).toBeCloseTo(112.6, 0);
    expect(after).toMatchObject({ phase: 'idle', cupG: null, cupOnMs: null });
    expect(eventsOf(run, 'shot-done')).toHaveLength(1);
  });

  it('re-arms when the cup is taken away before the shot', () => {
    const script: ScriptEvent[] = [
      { type: 'cup-on', atMs: 2000, massG: 110 },
      { type: 'cup-off', atMs: 6000 },
      { type: 'cup-on', atMs: 9000, massG: 112.6 },
      { type: 'shot', atMs: 14_000 },
      { type: 'cup-off', atMs: 60_000 },
    ];
    const run = streamLive(
      { seed: 4, durationMs: 65_000, script },
      { targetG: 36, actions: [{ atMs: 14_000 + TAP_LATENCY_MS, type: 'tap' }] },
    );
    expect(eventsOf(run, 'tare')).toHaveLength(2);
    expect(eventsOf(run, 'cup-off')).toHaveLength(2);
    expect(eventsOf(run, 'shot-done')).toHaveLength(1);
  });
});

describe("ShotMonitor and the scale's own timer (Q9, D-066)", () => {
  it('runs the timer from each tap to its "shot done", never from the cup', () => {
    const script: ScriptEvent[] = [
      { type: 'cup-on', atMs: 2000, massG: 110 },
      { type: 'shot', atMs: 7000 },
      { type: 'cup-off', atMs: 45_000 },
      { type: 'cup-on', atMs: 55_000, massG: 95 },
      { type: 'shot', atMs: 60_000, yieldG: 36 },
      { type: 'cup-off', atMs: 95_000 },
    ];
    const taps = [7000 + TAP_LATENCY_MS, 60_000 + TAP_LATENCY_MS];
    const run = streamLive(
      { seed: 17, durationMs: 100_000, script },
      { targetG: 36, actions: taps.map((atMs) => ({ atMs, type: 'tap' as const })) },
    );
    const done = eventsOf(run, 'shot-done').map((entry) => entry.atMs);
    expect(done).toHaveLength(2);
    // Each cup's tare zeroes the stopped timer; each tap starts it; each "shot done" stops it.
    const timer = run.truth.timer;
    expect(timer.map((change) => change.change)).toEqual([
      'reset',
      'start',
      'stop',
      'reset',
      'start',
      'stop',
    ]);
    for (const [i, tapMs] of taps.entries()) {
      const [reset, start, stop] = timer.slice(3 * i, 3 * i + 3);
      expect(reset.atMs).toBeLessThan(tapMs);
      expect(start.atMs - tapMs).toBeGreaterThan(0);
      expect(start.atMs - tapMs).toBeLessThan(500);
      expect(start.valueMs).toBe(0);
      expect(stop.atMs - done[i]).toBeGreaterThanOrEqual(0);
      expect(stop.atMs - done[i]).toBeLessThan(200);
      // The scale then shows the shot's time, on its own slow clock (D-037).
      expect(Math.abs(stop.valueMs - (done[i] - start.atMs))).toBeLessThan(600);
    }
  });

  it('puts the timer back after a tap that lapsed, so the next tap starts it from 0', () => {
    const scenario = espresso({ seed: 18, pumpOnMs: 30_000 });
    const run = streamLive(scenario, {
      targetG: 36,
      actions: [
        { atMs: 8000, type: 'tap' },
        { atMs: 30_000 + TAP_LATENCY_MS, type: 'tap' },
      ],
    });
    expect(eventsOf(run, 'pump-lapsed')).toHaveLength(1);
    const lapsedMs = eventsOf(run, 'pump-lapsed')[0].atMs;
    expect(lapsedMs - 8000).toBeGreaterThan(15_000);
    expect(lapsedMs - 8000).toBeLessThan(15_500);
    expect(
      run.log
        .filter(
          (event) => event.type === 'command-sent' && event.data.reason === PUMP_LAPSED_REASON,
        )
        .map((event) => (event.type === 'command-sent' ? event.data.command : null)),
    ).toEqual(['stopTimer', 'resetTimer']);
    expect(run.truth.timer.map((change) => change.change)).toEqual([
      'reset',
      'start',
      'stop',
      'reset',
      'start',
      'stop',
    ]);
    const secondStart = run.truth.timer[4];
    expect(secondStart.atMs).toBeGreaterThan(30_000 + TAP_LATENCY_MS);
    expect(secondStart.valueMs).toBe(0);
  });
});

describe('ShotMonitor and a scale accessory (T2.17)', () => {
  // A heavy one, which the monitor takes for a cup: the 15.5 g mat is under `cupMinG` anyway.
  const script: ScriptEvent[] = [
    { type: 'mat-on', atMs: 1000, massG: 40 },
    { type: 'cup-on', atMs: 8000, massG: 110 },
    { type: 'shot', atMs: 14_000 },
    { type: 'cup-off', atMs: 60_000 },
  ];
  const tap = { atMs: 14_000 + TAP_LATENCY_MS, type: 'tap' as const };

  it('tares the cup put on it once the app says it is the platform', () => {
    const run = streamLive(
      { seed: 9, durationMs: 65_000, script },
      { targetG: 36, actions: [{ atMs: 5000, type: 'platform' }, tap] },
    );
    expect(eventsOf(run, 'cup-on')).toHaveLength(2);
    expect(eventsOf(run, 'tare')).toHaveLength(2);
    expect(eventsOf(run, 'tare')[1].atMs).toBeGreaterThan(8000);
    expect(eventsOf(run, 'shot-done')).toHaveLength(1);
  });

  it('else takes it for a cup, and the cup put on it for another on top: tared too (T2.20)', () => {
    const run = streamLive(
      { seed: 9, durationMs: 65_000, script },
      { targetG: 36, actions: [tap] },
    );
    expect(eventsOf(run, 'cup-on')).toHaveLength(2);
    expect(eventsOf(run, 'tare')).toHaveLength(2);
    expect(eventsOf(run, 'shot-done')).toHaveLength(1);
  });

  it('tares a cup swapped in too fast to see the first one off (session 4)', () => {
    const swap: ScriptEvent[] = [
      { type: 'cup-on', atMs: 2000, massG: 137 },
      { type: 'cup-off', atMs: 10_000 },
      { type: 'cup-on', atMs: 10_300, massG: 265 },
      { type: 'shot', atMs: 16_000 },
    ];
    const run = streamLive(
      { seed: 12, durationMs: 60_000, script: swap },
      { targetG: 36, actions: [{ atMs: 16_000 + TAP_LATENCY_MS, type: 'tap' }] },
    );
    expect(eventsOf(run, 'cup-off')).toHaveLength(0);
    expect(eventsOf(run, 'tare').map((entry) => entry.atMs > 10_300)).toEqual([false, true]);
    expect(run.truth.tares.some((tare) => tare.atMs > 10_300)).toBe(true);
    expect(eventsOf(run, 'shot-done')).toHaveLength(1);
  });

  it('leaves a shot under way alone', () => {
    const run = streamLive(
      { seed: 9, durationMs: 65_000, script },
      {
        targetG: 36,
        actions: [{ atMs: 5000, type: 'platform' }, tap, { atMs: 25_000, type: 'platform' }],
      },
    );
    expect(eventsOf(run, 'shot-done')).toHaveLength(1);
  });
});

describe('ShotMonitor at the brew’s ✕ (T2.15)', () => {
  it('forgets the tap that started no shot, and the scale’s timer is stopped and zeroed', () => {
    // A Start with no shot (session 3), then ✕ before the tap lapses; the next shot as usual.
    const scenario = espresso({ seed: 18, pumpOnMs: 30_000 });
    const phases = new Map<number, string>();
    const run = streamLive(scenario, {
      targetG: 36,
      actions: [
        { atMs: 8000, type: 'tap' },
        { atMs: 12_000, type: 'end' },
        { atMs: 30_000 + TAP_LATENCY_MS, type: 'tap' },
      ],
      onFrame: (frame, monitor) =>
        phases.set(Math.round(frame.tArrival / 1000), monitor.snapshot().phase),
    });
    expect(phases.get(10)).toBe('running');
    // Idle with the cup on, which is the platform now: no tare, and no lapse to answer.
    expect(phases.get(14)).toBe('idle');
    expect(phases.get(25)).toBe('idle');
    expect(eventsOf(run, 'pump-lapsed')).toHaveLength(0);
    expect(eventsOf(run, 'tare')).toHaveLength(1);
    expect(
      run.log.flatMap((event) =>
        event.type === 'command-sent' && event.data.reason === END_SESSION_REASON
          ? [event.data.command]
          : [],
      ),
    ).toEqual(['stopTimer', 'resetTimer', 'tare']);
    // The timer: zeroed for the cup, started by the tap, stopped and zeroed by ✕; then the shot.
    expect(run.truth.timer.map((change) => change.change)).toEqual([
      'reset',
      'start',
      'stop',
      'reset',
      'start',
      'stop',
    ]);
    const [, , stop, reset] = run.truth.timer;
    expect(stop.atMs - 12_000).toBeLessThan(200);
    expect(reset.valueMs).toBe(0);
    // The scale took the tare; the next tap starts a shot from the cup on the scale.
    expect(run.truth.tares.some((tare) => tare.atMs >= 12_000 && tare.atMs < 12_500)).toBe(true);
    expect(eventsOf(run, 'first-drip')).toHaveLength(1);
    expect(eventsOf(run, 'shot-done')).toHaveLength(1);
  });

  it('forgets a shot under way: no "shot done" for it', () => {
    const scenario = espresso({ seed: 3 });
    const pumpMs = pumpOnMs(scenario);
    const run = withTap(scenario, { actions: [{ atMs: pumpMs + 12_000, type: 'end' }] });
    expect(eventsOf(run, 'first-drip')).toHaveLength(1);
    expect(eventsOf(run, 'shot-done')).toHaveLength(0);
    expect(run.monitor.snapshot()).toMatchObject({ phase: 'idle', pumpOnMs: null, series: [] });
  });
});

describe('ShotMonitor: remaining to target', () => {
  it('reads about 0 as the cup reaches the target, over 20 shots', () => {
    for (const seed of SEEDS) {
      const scenario = espresso({ seed, pumpOnMs: 7000 + ((seed * 37) % 100) });
      let atTarget: number | null = null;
      withTap(scenario, {
        onFrame: (frame, monitor) => {
          const liquidG = frame.truth.grossG - 110;
          if (atTarget === null && frame.truth.pumpOn && liquidG >= 36) {
            atTarget = monitor.snapshot().progress!.remainingG;
          }
        },
      });
      // The frame that crossed it may be up to a frame's pour (0.2 g) past it.
      expect(atTarget).toBeGreaterThan(-0.3);
      expect(atTarget).toBeLessThan(0.1);
    }
  });

  it('turns into the over-target warning once past the target by more than 1 g', () => {
    const scenario = espresso({ seed: 5 });
    const flips: { liquidG: number; over: boolean }[] = [];
    withTap(scenario, {
      targetG: 33.8,
      onFrame: (frame, monitor) => {
        const over = monitor.snapshot().progress?.overTarget ?? false;
        if (over !== (flips.at(-1)?.over ?? false)) {
          flips.push({ liquidG: frame.truth.grossG - 110, over });
        }
      },
    });
    // Off until the cup is lifted at the end; on from about 34.8 g.
    expect(flips[0].over).toBe(true);
    expect(flips[0].liquidG).toBeGreaterThan(34.6);
    expect(flips[0].liquidG).toBeLessThan(35.1);
  });

  it('shows while waiting for the tap, but only the tap starts the shot', () => {
    const scenario = espresso({ seed: 6 });
    const remaining: number[] = [];
    const run = streamLive(scenario, {
      targetG: 36,
      onFrame: (frame, monitor) => {
        const display = monitor.snapshot();
        if (frame.truth.pumpOn) {
          expect(display.phase).toBe('ready');
          remaining.push(display.progress!.remainingG);
        }
      },
    });
    expect(run.events.map((entry) => entry.event.type)).toEqual(['cup-on', 'tare', 'cup-off']);
    expect(remaining[0]).toBeCloseTo(36, 0);
    expect(remaining.at(-1)!).toBeLessThan(-1);
  });
});

describe('ShotMonitor: the shot as it happens', () => {
  it('marks the tap, the first drip, the pump stopping and the shot done, over 20 shots', () => {
    for (const seed of SEEDS) {
      const scenario = espresso({ seed, pumpOnMs: 7000 + ((seed * 37) % 100) });
      const run = withTap(scenario);
      const truth = run.truth.shots[0];
      const tapMs = truth.pumpOnMs + TAP_LATENCY_MS;
      const at = (type: 'pump-on' | 'first-drip' | 'pump-off' | 'shot-done') => {
        const events = eventsOf(run, type);
        expect(events).toHaveLength(1);
        return events[0];
      };
      expect(at('pump-on').event.tMs).toBe(tapMs);
      // Times are arrivals: a frame's sampling and the link's latency late, at most.
      const dripS = (at('first-drip').event.tMs - truth.firstDripMs) / 1000;
      expect(dripS).toBeGreaterThanOrEqual(0);
      expect(dripS).toBeLessThan(0.2);
      // The live pump_off lands into the drain (τ 0.2 s): a display estimate.
      const offS = (at('pump-off').event.tMs - truth.pumpOffMs) / 1000;
      expect(offS).toBeGreaterThan(0);
      expect(offS).toBeLessThan(0.4);
      // "Shot done" about a second after the pump stops, which is all the analysis needs (D-064).
      const doneS = (at('shot-done').atMs - truth.pumpOffMs) / 1000;
      expect(doneS).toBeGreaterThan(0.7);
      expect(doneS).toBeLessThan(1.5);
    }
  });

  it('draws weight and flow from the tap, and stops the clock at done', () => {
    const scenario = espresso({ seed: 7, cupOffAfterPumpOffMs: null });
    const run = withTap(scenario);
    const display = run.monitor.snapshot();
    const tapMs = 7000 + TAP_LATENCY_MS;
    expect(display.phase).toBe('done');
    expect(display.pumpOnMs).toBe(tapMs);
    expect(display.elapsedMs).toBe(display.doneMs! - tapMs);
    const series = display.series;
    expect(series[0].tMs).toBeGreaterThanOrEqual(tapMs);
    expect(series.at(-1)!.tMs).toBe(display.doneMs);
    // About 10 points a second, 0 g at the start and the yield at the end.
    expect(series.length).toBeGreaterThan(250);
    expect(Math.abs(series[0].netG)).toBeLessThan(0.1);
    expect(series.at(-1)!.netG).toBeCloseTo(38, 0);
    expect(Math.max(...series.map((point) => point.flowGps ?? 0))).toBeGreaterThan(1.5);
  });

  it('goes back to waiting, quietly, when no liquid follows a tap within 15 s', () => {
    const scenario = espresso({ seed: 8, pumpOnMs: 30_000 });
    const phases = new Map<number, string>();
    const run = streamLive(scenario, {
      targetG: 36,
      actions: [
        { atMs: 8000, type: 'tap' },
        { atMs: 30_000 + TAP_LATENCY_MS, type: 'tap' },
      ],
      onFrame: (frame, monitor) =>
        phases.set(Math.round(frame.tArrival / 1000), monitor.snapshot().phase),
    });
    expect(phases.get(20)).toBe('running');
    expect(phases.get(25)).toBe('ready');
    expect(eventsOf(run, 'pump-on').map((entry) => entry.event.tMs)).toEqual([8000, 30_150]);
    expect(eventsOf(run, 'first-drip')).toHaveLength(1);
    expect(eventsOf(run, 'shot-done')).toHaveLength(1);
  });

  it('re-arms the tare when a tap before any cup comes to nothing', () => {
    // A Tare + start with nothing on the scale, as the probe's buttons are tried; a cup later.
    const script: ScriptEvent[] = [
      { type: 'cup-on', atMs: 25_000, massG: 110 },
      { type: 'shot', atMs: 30_000 },
      { type: 'cup-off', atMs: 70_000 },
    ];
    const run = streamLive(
      { seed: 16, durationMs: 75_000, script },
      {
        targetG: 36,
        actions: [
          { atMs: 3000, type: 'tap' },
          { atMs: 30_000 + TAP_LATENCY_MS, type: 'tap' },
        ],
      },
    );
    expect(run.events.map((entry) => entry.event.type)).toEqual([
      'pump-on',
      'pump-lapsed',
      'cup-on',
      'tare',
      'pump-on',
      'first-drip',
      'pump-off',
      'shot-done',
      'cup-off',
    ]);
  });

  it('takes no vibrating pump for a first drip, on a scale where vibration shows', () => {
    for (const seed of SEEDS) {
      const scenario = espresso({
        seed,
        pumpOnMs: 7000 + ((seed * 37) % 100),
        scale: { resolutionG: 0.01, vibrationSigmaG: 0.1 },
      });
      const run = withTap(scenario);
      const [drip] = eventsOf(run, 'first-drip');
      expect(drip.event.tMs).toBeGreaterThan(run.truth.shots[0].firstDripMs);
      expect(eventsOf(run, 'shot-done')).toHaveLength(1);
    }
  });
});

describe('ShotMonitor: what the scale and the user do around it', () => {
  it('keeps its own zero when the tare never lands, as when the writes fail', () => {
    const scenario = espresso({ seed: 9 });
    let atTarget: number | null = null;
    const run = withTap(scenario, {
      respond: () => [],
      onFrame: (frame, monitor) => {
        if (atTarget === null && frame.truth.pumpOn && frame.truth.grossG - 110 >= 36) {
          atTarget = monitor.snapshot().progress!.remainingG;
        }
      },
    });
    // Only the tap's own `07` tares, at about 0.
    expect(eventsOf(run, 'tare')).toHaveLength(1);
    expect(run.truth.tares.every((tare) => tare.atMs > pumpOnMs(scenario))).toBe(true);
    expect(Math.abs(atTarget!)).toBeLessThan(0.3);
  });

  it('gets the plain tare taken in the flow-rate mode too, which has no timer (D-038)', () => {
    const scenario = espresso({ seed: 9, scale: { mode: 'flow-rate' } });
    let atTarget: number | null = null;
    const run = withTap(scenario, {
      onFrame: (frame, monitor) => {
        if (atTarget === null && frame.truth.pumpOn && frame.truth.grossG - 110 >= 36) {
          atTarget = monitor.snapshot().progress!.remainingG;
        }
      },
    });
    expect(run.truth.tares).toHaveLength(1);
    expect(run.truth.tares[0].atMs).toBeLessThan(pumpOnMs(scenario));
    expect(run.truth.timer).toHaveLength(0);
    expect(Math.abs(atTarget!)).toBeLessThan(0.3);
  });

  it('runs the shot from the tap when the scale tares the cup itself (automatic mode)', () => {
    const scenario = espresso({ seed: 10, scale: { mode: 'automatic' } });
    const run = withTap(scenario);
    expect(eventsOf(run, 'cup-on')).toHaveLength(0);
    expect(eventsOf(run, 'shot-done')).toHaveLength(1);
    expect(run.monitor.snapshot().phase).toBe('idle');
  });

  it('takes the cup lifted after its shot and put back for the same cup: no tare', () => {
    const script: ScriptEvent[] = [
      { type: 'cup-on', atMs: 2000, massG: 110 },
      { type: 'shot', atMs: 7000 },
      { type: 'cup-off', atMs: 40_000 },
      { type: 'cup-back', atMs: 43_000 },
    ];
    const run = withTap({ seed: 11, durationMs: 50_000, script });
    expect(run.events.slice(-3).map((entry) => entry.event.type)).toEqual([
      'shot-done',
      'cup-off',
      'cup-back',
    ]);
    expect(eventsOf(run, 'tare')).toHaveLength(1);
    const display = run.monitor.snapshot();
    expect(display.phase).toBe('done');
    expect(display.netG).toBeCloseTo(38, 0);
  });

  it('tares a different cup put on after the shot', () => {
    const script: ScriptEvent[] = [
      { type: 'cup-on', atMs: 2000, massG: 110 },
      { type: 'shot', atMs: 7000 },
      { type: 'cup-off', atMs: 40_000 },
      { type: 'cup-on', atMs: 43_000, massG: 95 },
    ];
    const run = withTap({ seed: 12, durationMs: 50_000, script });
    expect(eventsOf(run, 'tare')).toHaveLength(2);
    expect(run.monitor.snapshot().phase).toBe('ready');
  });

  it("isn't fooled by the scale lifted for the surf before the shot (hardware session 2)", () => {
    // Before each shot the reading plunged to −150 to −400 g for about 1.5 s and came back.
    const scenario = espresso({ seed: 13 });
    const plunged: Scenario = {
      ...scenario,
      script: [...scenario.script, { type: 'bump', atMs: 5000, durationMs: 1500, peakG: -350 }],
    };
    const run = withTap(plunged);
    expect(run.events.map((entry) => entry.event.type)).toEqual([
      'cup-on',
      'tare',
      'pump-on',
      'first-drip',
      'pump-off',
      'shot-done',
      'cup-off',
    ]);
  });

  it('refuses weights it cannot trust (D-005)', () => {
    const run = withTap(espresso({ seed: 14, scale: { unitByte: 0x02 } }));
    const display = run.monitor.snapshot();
    expect(run.events.map((entry) => entry.event.type)).toEqual(['pump-on']);
    expect(display.refusedFrames).toBeGreaterThan(500);
    expect(display.readingG).toBeNull();
  });

  it('starts afresh for another recording', () => {
    const monitor = new ShotMonitor({ targetG: 36 });
    const simulator = new ScaleSimulator(espresso({ seed: 15 }));
    const first = new RecordingSequence('01a10000-0000-7000-8000-00000000000a');
    const second = new RecordingSequence('01a10000-0000-7000-8000-00000000000b');
    for (const frame of simulator.advanceTo(5000)) {
      monitor.addFrame(
        first.frame(frame.tArrival, frame.source, frame.bytes),
        decodeFrame(frame.bytes),
      );
    }
    expect(monitor.snapshot().phase).toBe('ready');
    const [next] = simulator.advanceTo(5200);
    monitor.addFrame(second.frame(0, next.source, next.bytes), decodeFrame(next.bytes));
    const display = monitor.snapshot();
    expect(display.recordingId).toBe(second.recordingId);
    expect(display.phase).toBe('idle');
    expect(display.tareArmed).toBe(true);
    expect(display.tMs).toBe(0);
  });

  it('refuses a target that is not a positive number', () => {
    expect(() => new ShotMonitor({ targetG: 0 })).toThrow(/target 0/);
    const monitor = new ShotMonitor();
    expect(() => monitor.setTargetG(NaN)).toThrow(/target NaN/);
    monitor.setTargetG(null);
    expect(monitor.snapshot().targetG).toBeNull();
  });
});
