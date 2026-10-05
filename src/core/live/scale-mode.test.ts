import { describe, expect, it } from 'vitest';
import {
  commandEventData,
  MANUAL_START,
  RecordingSequence,
  type AppEvent,
  type Id,
  type RawFrame,
} from '../model';
import {
  decodeFrame,
  encodeEventFrame,
  encodeWeightFrame,
  resetTimer,
  startTimer,
  stopTimer,
  tare,
  tareAndStartTimer,
  type ScaleCommand,
} from '../protocol';
import {
  ScaleSimulator,
  type ScaleMode,
  type Scenario,
  type ScriptEvent,
  type SessionTruth,
  type SimFrame,
} from '../sim';
import type { ScaleCommandToSend } from './scale-commands';
import {
  MODE_CHECK_REASON,
  modeCheckPutBack,
  modeCheckStart,
  ScaleModeMonitor,
  TIMER_START_LATE_MS,
  TIMER_START_MIN_FRAMES,
  TIMER_START_WINDOW_MS,
  timerStartVerdict,
  type ScaleModeEvidence,
  type TimerReading,
} from './scale-mode';

/*
 * The scale's mode read off what it sends (T1.25; D-038, D-057, D-073), on the simulator in each
 * of its three modes (T1.22): the test stands in for the app, sends the mode check's 04 and the
 * user's taps, logs every command, and puts the check's timer back as the app does.
 */

const RECORDING_ID: Id = '01a10000-0000-7000-8000-000000000025';

/** Something the test does as the app, at a time on the session timeline. */
type Act =
  /** The mode check's 04. */
  | { readonly atMs: number; readonly type: 'check' }
  /** Any other command, logged with its reason. */
  | {
      readonly atMs: number;
      readonly type: 'send';
      readonly command: ScaleCommand;
      readonly reason: string;
    };

interface ModeRun {
  readonly monitor: ScaleModeMonitor;
  readonly evidence: readonly ScaleModeEvidence[];
  readonly log: readonly AppEvent[];
  readonly truth: SessionTruth;
  readonly frames: readonly SimFrame[];
}

/**
 * Streams `scenario` through a `ScaleModeMonitor`, frame by frame as a transport would deliver
 * it, with the test as the app: it sends the commands of `acts` at their times, logs each one,
 * and answers the monitor's evidence as the app does (`modeCheckPutBack`).
 */
function streamMode(scenario: Scenario, acts: readonly Act[] = []): ModeRun {
  const simulator = new ScaleSimulator(scenario);
  const monitor = new ScaleModeMonitor();
  const sequence = new RecordingSequence(RECORDING_ID);
  const sorted = [...acts].sort((a, b) => a.atMs - b.atMs);
  const evidence: ScaleModeEvidence[] = [];
  const log: AppEvent[] = [];
  const frames: SimFrame[] = [];
  const send = ({ command, reason }: ScaleCommandToSend): void => {
    const tMs = simulator.nowMs;
    simulator.write(command.bytes, tMs);
    const event = sequence.event(tMs, 'command-sent', commandEventData(command, reason));
    log.push(event);
    take(monitor.addEvent(event));
  };
  const take = (found: readonly ScaleModeEvidence[]): void => {
    for (const item of found) {
      evidence.push(item);
      for (const command of modeCheckPutBack(item)) send(command);
    }
  };

  let next = 0;
  for (;;) {
    const tMs = Math.min(
      simulator.nextWakeMs() ?? Infinity,
      sorted[next]?.atMs ?? Infinity,
      scenario.durationMs,
    );
    for (const frame of simulator.advanceTo(tMs)) {
      frames.push(frame);
      const raw = sequence.frame(frame.tArrival, frame.source, frame.bytes);
      take(monitor.addFrame(raw, decodeFrame(frame.bytes)));
    }
    while (next < sorted.length && sorted[next].atMs <= tMs) {
      const act = sorted[next++];
      send(act.type === 'check' ? modeCheckStart() : act);
    }
    if (tMs >= scenario.durationMs) break;
  }
  return { monitor, evidence, log, truth: simulator.truth(), frames };
}

/** A scale in `mode`, idle but for `script`. */
function scaleIn(
  mode: ScaleMode,
  script: ScriptEvent[] = [],
  { durationMs = 10_000, seed = 1 } = {},
): Scenario {
  return { seed, durationMs, script, scale: { mode } };
}

/** The evidence as `kind:command:reason`, or `scale-event:state`. */
function kinds(run: Pick<ModeRun, 'evidence'>): string[] {
  return run.evidence.map((item) =>
    item.kind === 'scale-event'
      ? `${item.kind}:${item.state}`
      : `${item.kind}:${item.command}:${item.reason}`,
  );
}

/** The logged commands, as `command:reason`. */
function commands(run: Pick<ModeRun, 'log'>): string[] {
  return run.log.flatMap((event) =>
    event.type === 'command-sent' ? [`${event.data.command}:${event.data.reason}`] : [],
  );
}

const CHECK = { atMs: 1000, type: 'check' } as const;
const TAP = { command: tareAndStartTimer(), reason: MANUAL_START };

describe('timerStartVerdict (D-057)', () => {
  const at = (tMs: number, timerMs = 0): TimerReading => ({ tMs, timerMs });
  /** Readings every 100 ms from 50 ms after the command, sent at 0. */
  const every100 = (count: number, timerMs = 0): TimerReading[] =>
    Array.from({ length: count }, (_, i) => at(50 + 100 * i, timerMs));

  it('is the start as soon as a reading shows the timer above 0', () => {
    expect(timerStartVerdict(0, [at(50), at(150, 100)])).toBe('started');
    expect(timerStartVerdict(0, [at(50, 100)])).toBe('started');
  });

  it('says it didn’t start only once five frames have come, the last half a second on', () => {
    expect(TIMER_START_WINDOW_MS).toBe(500);
    expect(TIMER_START_MIN_FRAMES).toBe(5);
    expect(timerStartVerdict(0, [])).toBe('unknown');
    expect(timerStartVerdict(0, every100(4))).toBe('unknown'); // the last at 350 ms
    expect(timerStartVerdict(0, every100(5))).toBe('unknown'); // the fifth at 450 ms
    expect(timerStartVerdict(0, every100(6))).toBe('not-started'); // the sixth at 550 ms
    // Four frames over a long silence aren't enough either.
    expect(timerStartVerdict(0, [at(50), at(150), at(900), at(1000)])).toBe('unknown');
  });

  it('waits out a stall: the frames held back come in a burst, the start among them', () => {
    // Frames held from 100 ms to 700 ms arrive together: the first four still read 0, as they
    // were sampled before the scale took the command or just after.
    const burst = [at(50), at(700), at(700), at(700), at(700)];
    expect(timerStartVerdict(0, burst)).toBe('not-started');
    expect(timerStartVerdict(0, [...burst, at(700, 100)])).toBe('started');
  });

  it('takes a start within 1.5 s as the command’s, and none later: a timer key, say', () => {
    expect(TIMER_START_LATE_MS).toBe(1500);
    const quiet = every100(15); // to 1450 ms
    expect(timerStartVerdict(0, [...quiet, at(1500, 100)])).toBe('started');
    expect(timerStartVerdict(0, [...quiet, at(1501, 100)])).toBe('not-started');
  });
});

describe('the mode check on the simulator, in each mode (T1.22, D-038)', () => {
  it('timer mode: its 04 starts the timer within half a second, and 05, 06 put it back', () => {
    const run = streamMode(scaleIn('timer'), [CHECK]);
    expect(kinds(run)).toEqual([`started:startTimer:${MODE_CHECK_REASON}`]);
    const [started] = run.evidence;
    expect(started.tMs - 1000).toBeLessThan(TIMER_START_WINDOW_MS);
    // The app's answer: a stop and a reset, logged as the check's.
    expect(commands(run)).toEqual([
      `startTimer:${MODE_CHECK_REASON}`,
      `stopTimer:${MODE_CHECK_REASON}`,
      `resetTimer:${MODE_CHECK_REASON}`,
    ]);
    expect(run.truth.timer.map((change) => change.change)).toEqual(['start', 'stop', 'reset']);
    // The timer ran a tick or two, and reads 0 from then on.
    expect(run.monitor.snapshot()).toMatchObject({ verdict: 'timer', timerMs: 0, awaiting: null });
    expect(run.truth.timer[1].valueMs).toBeLessThanOrEqual(200);
  });

  it('flow-rate mode: its 04 does nothing, so it isn’t the timer mode', () => {
    const run = streamMode(scaleIn('flow-rate'), [CHECK]);
    expect(kinds(run)).toEqual([`not-started:startTimer:${MODE_CHECK_REASON}`]);
    expect(run.evidence[0].tMs - 1000).toBeGreaterThanOrEqual(TIMER_START_WINDOW_MS);
    expect(run.evidence[0].tMs - 1000).toBeLessThan(TIMER_START_WINDOW_MS + 150);
    // Nothing to put back.
    expect(commands(run)).toEqual([`startTimer:${MODE_CHECK_REASON}`]);
    expect(run.truth.commands.map((command) => command.effect)).toEqual(['no-op']);
    expect(run.monitor.snapshot().verdict).toBe('not-timer');
  });

  it('automatic mode, between its runs: its 04 does nothing either', () => {
    const run = streamMode(scaleIn('automatic'), [CHECK]);
    expect(kinds(run)).toEqual([`not-started:startTimer:${MODE_CHECK_REASON}`]);
    expect(run.truth.timer).toEqual([]);
    expect(run.monitor.snapshot().verdict).toBe('not-timer');
  });

  it('reads each mode right over 30 seeds on session 1’s link', () => {
    const expected: Record<ScaleMode, string> = {
      timer: 'timer',
      'flow-rate': 'not-timer',
      automatic: 'not-timer',
    };
    for (const mode of ['timer', 'flow-rate', 'automatic'] as const) {
      for (let seed = 1; seed <= 30; seed++) {
        const run = streamMode(scaleIn(mode, [], { seed, durationMs: 5000 }), [CHECK]);
        expect(run.evidence, `${mode}, seed ${seed}`).toHaveLength(1);
        expect(run.monitor.snapshot().verdict, `${mode}, seed ${seed}`).toBe(expected[mode]);
      }
    }
  });
});

describe('the passive signs (D-057, D-073)', () => {
  /** A cup on at 1 s, then the Tare + start tap at 4 s with the pump. */
  const shot = (mode: ScaleMode): Scenario =>
    scaleIn(
      mode,
      [
        { type: 'cup-on', atMs: 1000, massG: 110 },
        { type: 'shot', atMs: 4000 },
      ],
      { durationMs: 50_000 },
    );
  const tapAt4s: Act = { atMs: 4000, type: 'send', ...TAP };

  it('a Tare + start tap with the timer at 0: the timer mode if it starts, not if it doesn’t', () => {
    expect(kinds(streamMode(shot('timer'), [tapAt4s]))).toEqual([
      `started:tareAndStartTimer:${MANUAL_START}`,
    ]);
    expect(kinds(streamMode(shot('flow-rate'), [tapAt4s]))).toEqual([
      `not-started:tareAndStartTimer:${MANUAL_START}`,
    ]);
  });

  it('the automatic mode’s 03 0D frames: not the timer mode, as its run starts and ends', () => {
    const run = streamMode(shot('automatic'), [
      tapAt4s,
      // The app's stop at "shot done" ends the run (D-066).
      { atMs: 40_000, type: 'send', command: stopTimer(), reason: 'shot-done' },
    ]);
    // The tap does nothing in this mode; the scale starts its own run on the first liquid, and
    // says so on FF12. The start that follows is the run's, not the tap's.
    expect(kinds(run)).toEqual([
      `not-started:tareAndStartTimer:${MANUAL_START}`,
      'scale-event:started',
      'scale-event:stopped',
    ]);
    expect(run.monitor.snapshot().verdict).toBe('not-timer');
  });

  it('a timer that starts with no command from the app says nothing: the scale’s timer key', () => {
    // The scale gets a 04 the app never sent, as from the key: the log doesn't show it.
    const key: ScriptEvent = { type: 'command', atMs: 2000, command: startTimer() };
    const run = streamMode(scaleIn('timer', [key]));
    expect(run.truth.timer.map((change) => change.change)).toEqual(['start']);
    expect(run.evidence).toEqual([]);
    expect(run.monitor.snapshot().verdict).toBe('unknown');
    // Nor does it undo what the check found: switched to the timer mode, the key starts the
    // timer, and only the next check can say so.
    const switched = streamMode(
      scaleIn('flow-rate', [
        { type: 'mode', atMs: 2500, mode: 'timer' },
        { ...key, atMs: 3000 },
      ]),
      [CHECK],
    );
    expect(switched.truth.timer.map((change) => change.change)).toEqual(['start']);
    expect(kinds(switched)).toEqual([`not-started:startTimer:${MODE_CHECK_REASON}`]);
    expect(switched.monitor.snapshot().verdict).toBe('not-timer');
  });

  it('a 07 at a frozen timer, or a 04 while it runs, says nothing (D-066)', () => {
    const run = streamMode(scaleIn('timer'), [
      { atMs: 1000, type: 'send', command: startTimer(), reason: 'probe' },
      // While it runs: it can't start it.
      { atMs: 2000, type: 'send', command: startTimer(), reason: 'probe' },
      { atMs: 3000, type: 'send', command: stopTimer(), reason: 'shot-done' },
      // Frozen at the shot's time: the tap with no cup put on since (D-066's exception).
      { atMs: 5000, ...TAP, type: 'send' },
    ]);
    expect(kinds(run)).toEqual(['started:startTimer:probe']);
    expect(run.monitor.snapshot().awaiting).toBeNull();
    expect(run.monitor.snapshot().timerMs).toBeGreaterThan(0);
  });

  it('a timer command before the start shows drops the start awaited', () => {
    // The cup's tare (05, 06, 01) right behind the check's 04, before its start shows: which
    // command did what can't be told, so the start that comes proves nothing.
    const run = streamMode(scaleIn('timer'), [
      CHECK,
      { atMs: 1060, type: 'send', command: stopTimer(), reason: 'auto-tare' },
      { atMs: 1060, type: 'send', command: resetTimer(), reason: 'auto-tare' },
      { atMs: 1060, type: 'send', command: tare(), reason: 'auto-tare' },
    ]);
    expect(run.truth.timer.map((change) => change.change)).toContain('start');
    expect(run.evidence).toEqual([]);
    expect(run.monitor.snapshot()).toMatchObject({ verdict: 'unknown', awaiting: null });
  });

  it('in the timer mode, leaves the timer to the Tare + start tap after the check', () => {
    const run = streamMode(shot('timer'), [CHECK, tapAt4s]);
    expect(kinds(run)).toEqual([
      `started:startTimer:${MODE_CHECK_REASON}`,
      `started:tareAndStartTimer:${MANUAL_START}`,
    ]);
    // The tap's run counts from 0, as the check left it.
    expect(run.truth.timer.map((change) => [change.change, change.valueMs])).toEqual([
      ['start', 0],
      ['stop', expect.any(Number)],
      ['reset', 0],
      ['start', 0],
    ]);
    expect(run.truth.timer[3].atMs).toBeGreaterThan(4000);
  });

  it('follows the user switching modes on the scale: the latest evidence decides', () => {
    const run = streamMode(
      scaleIn(
        'flow-rate',
        [
          { type: 'mode', atMs: 3000, mode: 'timer' },
          { type: 'mode', atMs: 8000, mode: 'automatic' },
          { type: 'cup-on', atMs: 9000, massG: 110 },
          { type: 'shot', atMs: 11_000 },
        ],
        { durationMs: 30_000 },
      ),
      [CHECK, { atMs: 5000, type: 'check' }],
    );
    expect(kinds(run)).toEqual([
      `not-started:startTimer:${MODE_CHECK_REASON}`,
      `started:startTimer:${MODE_CHECK_REASON}`,
      'scale-event:started',
    ]);
    expect(run.monitor.snapshot().verdict).toBe('not-timer');
  });
});

describe('ScaleModeMonitor on frames made by hand', () => {
  const sequence = (): RecordingSequence => new RecordingSequence(RECORDING_ID);
  const weight = (s: RecordingSequence, tMs: number, timerMs: number): RawFrame =>
    s.frame(tMs, 'ff11', encodeWeightFrame({ timerMs, weightG: 0 }));
  const feed = (monitor: ScaleModeMonitor, frame: RawFrame): ScaleModeEvidence[] =>
    monitor.addFrame(frame, decodeFrame(frame.bytes));
  const sent = (s: RecordingSequence, tMs: number, command: ScaleCommand, reason: string) =>
    s.event(tMs, 'command-sent', commandEventData(command, reason));

  it('takes back "not started" when a start held back by a stall comes late', () => {
    const s = sequence();
    const monitor = new ScaleModeMonitor();
    feed(monitor, weight(s, 900, 0));
    monitor.addEvent(sent(s, 1000, startTimer(), MODE_CHECK_REASON));
    feed(monitor, weight(s, 1050, 0));
    // A stall: five frames from before the start arrive together, 0.9 s on.
    const burst = [0, 0, 0, 0].map((timerMs) => feed(monitor, weight(s, 1900, timerMs)));
    expect(burst.flat().map((item) => item.kind)).toEqual(['not-started']);
    expect(monitor.snapshot()).toMatchObject({
      verdict: 'not-timer',
      awaiting: { verdict: 'not-started', reason: MODE_CHECK_REASON },
    });
    // In the same burst, the start: within 1.5 s, so the check's.
    const [late] = feed(monitor, weight(s, 1900, 100));
    expect(late).toMatchObject({ kind: 'started', sentTMs: 1000, tMs: 1900 });
    expect(modeCheckPutBack(late).map(({ command }) => command.name)).toEqual([
      'stopTimer',
      'resetTimer',
    ]);
    expect(monitor.snapshot()).toMatchObject({ verdict: 'timer', awaiting: null });
  });

  it('stops awaiting once a late start can’t come, and takes a later one as a key press', () => {
    const s = sequence();
    const monitor = new ScaleModeMonitor();
    feed(monitor, weight(s, 900, 0));
    monitor.addEvent(sent(s, 1000, startTimer(), MODE_CHECK_REASON));
    for (let tMs = 1050; tMs <= 2550; tMs += 100) feed(monitor, weight(s, tMs, 0));
    expect(monitor.snapshot()).toMatchObject({ verdict: 'not-timer', awaiting: null });
    expect(feed(monitor, weight(s, 2650, 100))).toEqual([]);
    expect(monitor.snapshot().verdict).toBe('not-timer');
  });

  it('takes no start for a command’s that the automatic mode announced first', () => {
    // The run's 03 0D 01 comes a frame before the timer shows it running: a check sent in
    // between, on the last weight frame's 0, must not take the run's start for its own.
    const s = sequence();
    const monitor = new ScaleModeMonitor();
    feed(monitor, weight(s, 900, 0));
    feed(monitor, s.frame(950, 'ff12', encodeEventFrame({ stateByte: 1, timerMs: 0, weightG: 0 })));
    expect(monitor.snapshot().timerMs).toBeNull();
    monitor.addEvent(sent(s, 960, startTimer(), MODE_CHECK_REASON));
    expect(monitor.snapshot().awaiting).toBeNull();
    expect(feed(monitor, weight(s, 1000, 1100))).toEqual([]);
    expect(monitor.snapshot()).toMatchObject({
      verdict: 'not-timer',
      evidence: { kind: 'scale-event', state: 'started' },
      timerMs: 1100,
    });
  });

  it('awaits nothing before the first weight frame says where the timer is', () => {
    const s = sequence();
    const monitor = new ScaleModeMonitor();
    monitor.addEvent(sent(s, 100, startTimer(), MODE_CHECK_REASON));
    expect(monitor.snapshot()).toMatchObject({ timerMs: null, awaiting: null });
  });

  it('puts back only the mode check’s own 04', () => {
    const started = (command: 'startTimer' | 'tareAndStartTimer', reason: string) =>
      modeCheckPutBack({ kind: 'started', tMs: 1, command, reason, sentTMs: 0 });
    expect(started('startTimer', MODE_CHECK_REASON)).toHaveLength(2);
    expect(started('startTimer', 'probe')).toEqual([]);
    expect(started('tareAndStartTimer', MANUAL_START)).toEqual([]);
    expect(
      modeCheckPutBack({
        kind: 'not-started',
        tMs: 600,
        command: 'startTimer',
        reason: MODE_CHECK_REASON,
        sentTMs: 0,
      }),
    ).toEqual([]);
    expect(modeCheckStart()).toMatchObject({
      command: { name: 'startTimer' },
      reason: MODE_CHECK_REASON,
    });
  });

  it('starts afresh with another recording, and leaves the microphone’s frames alone', () => {
    const s = sequence();
    const monitor = new ScaleModeMonitor();
    feed(monitor, s.frame(100, 'ff12', encodeEventFrame({ stateByte: 1, timerMs: 0, weightG: 0 })));
    expect(monitor.snapshot()).toMatchObject({
      recordingId: RECORDING_ID,
      verdict: 'not-timer',
      evidence: { kind: 'scale-event', state: 'started' },
    });
    expect(feed(monitor, s.frame(200, 'mic', new Uint8Array([1, 2, 3])))).toEqual([]);
    const other = new RecordingSequence('01a10000-0000-7000-8000-000000000026');
    feed(monitor, weight(other, 50, 0));
    expect(monitor.snapshot()).toMatchObject({
      recordingId: '01a10000-0000-7000-8000-000000000026',
      verdict: 'unknown',
      evidence: null,
      timerMs: 0,
    });
  });
});
