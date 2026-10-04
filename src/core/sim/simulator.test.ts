import { describe, expect, it } from 'vitest';
import {
  decodeFrame,
  fromHex,
  keepAlive,
  resetTimer,
  setAutoOff,
  setBuzzer,
  startTimer,
  stopTimer,
  tare,
  tareAndStartTimer,
  flowSmoothingOff,
  toHex,
  type EventFrame,
  type WeightFrame,
} from '../protocol';
import type { LinkParams, ScaleParams } from './params';
import type { ScriptEvent } from './script';
import { espressoScenario, simulateSession } from './session';
import { AUTOMATIC_MODE, ScaleSimulator, type Scenario, type SimFrame } from './simulator';

/** A link that only adds its fixed latency: arrival = sample + 15 ms. */
const QUIET_LINK: Partial<LinkParams> = {
  connectionIntervalMs: 0,
  jitterMeanMs: 0,
  stallProbability: 0,
};

/** A scale with no noise, instant settling and 0.01 g steps, so weights are exact. */
const EXACT_SCALE: Partial<ScaleParams> = {
  noiseSigmaG: 0,
  vibrationSigmaG: 0,
  settleTauMs: 0,
  sampleJitterMs: 0,
  resolutionG: 0.01,
};

function weight(frame: SimFrame): WeightFrame {
  const decoded = decodeFrame(frame.bytes);
  if (decoded.kind !== 'weight') throw new Error(`expected a weight frame, got ${decoded.kind}`);
  return decoded;
}

/** A cup of 110 g on an exact scale from time 0, plus `script`. */
function cupScenario(script: ScriptEvent[] = [], scale: Partial<ScaleParams> = {}): Scenario {
  return {
    seed: 1,
    durationMs: 10_000,
    script: [{ type: 'cup-on', atMs: 0, massG: 110 }, ...script],
    scale: { ...EXACT_SCALE, ...scale },
    link: QUIET_LINK,
  };
}

/** Weight frames by sample time. */
function samples(frames: readonly SimFrame[]) {
  return frames
    .filter((f) => f.truth.kind === 'weight' && f.truth.corruption === null)
    .map((f) => ({ t: f.truth.sampleTMs, frame: weight(f), truth: f.truth }));
}

function variance(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

describe('determinism', () => {
  const scenario = espressoScenario({
    seed: 11,
    link: { dropProbability: 0.02, corruptProbability: 0.01, stallProbability: 0.01 },
  });

  it('gives the same session for the same scenario', () => {
    const a = simulateSession(scenario);
    const b = simulateSession(scenario);
    expect(b.frames).toEqual(a.frames);
    expect(b.truth).toEqual(a.truth);
  });

  it('gives a different session for a different seed', () => {
    const a = simulateSession(scenario);
    const b = simulateSession({ ...scenario, seed: 12 });
    expect(b.frames.map((f) => f.tArrival)).not.toEqual(a.frames.map((f) => f.tArrival));
  });

  it("doesn't depend on how it's stepped", () => {
    const whole = new ScaleSimulator(scenario).advanceTo(scenario.durationMs);
    const stepped = new ScaleSimulator(scenario);
    const frames: SimFrame[] = [];
    for (let t = 0; t < scenario.durationMs; t += 7.3) frames.push(...stepped.advanceTo(t));
    frames.push(...stepped.advanceTo(scenario.durationMs));
    expect(frames).toEqual(whole);
  });

  it('gives the same frames for a command written live as for the same command scripted', () => {
    const scripted = simulateSession(espressoScenario({ seed: 5 }));
    const command = scripted.scenario.script.find((e) => e.type === 'command')!;
    const live = new ScaleSimulator({
      ...scripted.scenario,
      script: scripted.scenario.script.filter((e) => e.type !== 'command'),
    });
    const frames: SimFrame[] = [...live.advanceTo(command.atMs)];
    live.write(tareAndStartTimer().bytes, command.atMs);
    for (let t = command.atMs; t < scripted.scenario.durationMs; t += 50) {
      frames.push(...live.advanceTo(t));
    }
    frames.push(...live.advanceTo(scripted.scenario.durationMs));
    expect(frames).toEqual(scripted.frames);
  });
});

describe('ground truth', () => {
  it('matches every frame the simulator produces', () => {
    const session = simulateSession(espressoScenario({ seed: 3 }));
    const { frames, truth, scale } = session;
    expect(frames.length).toBeGreaterThan(500);
    // 07: the tare once the next frame is out, the start a frame later.
    const [started] = truth.timer;
    expect(started).toMatchObject({ change: 'start', valueMs: 0 });
    expect(started.atMs).toBeGreaterThan(truth.tares[0].atMs);
    let ticks = 0;
    for (const frame of frames) {
      const decoded = weight(frame);
      const t = frame.truth;
      expect(decoded.weightG).toBe(t.weightG);
      expect(decoded.timerMs).toBe(t.timerMs);
      expect(decoded.unitOk).toBe(true);
      expect(decoded.flowSmoothing).toBe(0);
      // The weight is the noisy gross mass minus the zero, rounded to the scale's 0.1 g.
      const step = scale.resolutionG;
      const expected = Math.round((t.grossG + t.noiseG - t.offsetG) / step) * step;
      expect(t.weightG).toBeCloseTo(expected, 9);
      // The timer counts samples from the tare-and-start: 100 ms each, 0 before it.
      if (t.sampleTMs > started.atMs) ticks++;
      expect(t.timerMs).toBe(ticks * scale.samplePeriodMs);
      expect(frame.tArrival).toBeGreaterThanOrEqual(t.sampleTMs + 15);
    }
  });

  it('puts the shot markers and yields where the frames show them', () => {
    const session = simulateSession(
      espressoScenario({ seed: 4, scale: EXACT_SCALE, link: QUIET_LINK }),
    );
    const [shot] = session.truth.shots;
    const rows = samples(session.frames);
    const before = (ms: number) => rows.filter((r) => r.t < ms).at(-1)!;
    const after = (ms: number) => rows.find((r) => r.t >= ms)!;

    // Tared with the cup on, nothing moves until the first drop lands.
    expect(before(shot.firstDripMs).frame.weightG).toBe(0);
    expect(after(shot.firstDripMs).frame.weightG).toBeGreaterThan(0);
    // w(pump_off) lies between the samples either side of pump_off.
    expect(before(shot.pumpOffMs).frame.weightG).toBeLessThanOrEqual(shot.weightAtPumpOffG + 0.005);
    expect(after(shot.pumpOffMs).frame.weightG).toBeGreaterThanOrEqual(
      shot.weightAtPumpOffG - 0.005,
    );
    // Settled, the cup holds the yield. Lifting it takes the cup and the honest yield away,
    // leaving minus the tared cup.
    expect(before(shot.cupRemovedMs!).frame.weightG).toBeCloseTo(shot.yieldG, 2);
    expect(shot.honestYieldG).toBeCloseTo(shot.yieldG, 9);
    expect(rows.at(-1)!.frame.weightG).toBe(-110);
  });

  it("describes the shot with the spec's definitions", () => {
    const [shot] = simulateSession(espressoScenario({ scale: { dropG: 0 } })).truth.shots;
    expect(shot.preInfusionMs).toBe(shot.firstDripMs - shot.pumpOnMs);
    expect(shot.extractionMs).toBe(shot.pumpOffMs - shot.firstDripMs);
    expect(shot.totalMs).toBe(shot.pumpOffMs - shot.pumpOnMs);
    expect(shot.yieldG).toBeCloseTo(
      shot.weightAtPumpOffG + shot.flowAtPumpOffGps * (shot.tailTauMs / 1000),
      9,
    );
    expect(shot.tailMassG).toBeCloseTo(shot.yieldG - shot.weightAtPumpOffG, 12);
    expect(shot.averageFlowGps).toBeCloseTo(shot.weightAtPumpOffG / (shot.extractionMs / 1000), 12);
    expect(shot.ratio).toBeCloseTo(shot.yieldG / shot.doseG, 12);
    expect(shot.settledMs).toBeGreaterThan(shot.pumpOffMs);
  });

  it('lists the physical events in time order', () => {
    const { truth } = simulateSession(espressoScenario());
    expect(truth.events.map((e) => e.type)).toEqual([
      'cup-on',
      'pump-on',
      'first-drip',
      'pump-off',
      'settled',
      'cup-off',
    ]);
    const times = truth.events.map((e) => e.tMs);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('accounts for every frame when the link drops and damages some', () => {
    const session = simulateSession(
      espressoScenario({
        seed: 8,
        link: { dropProbability: 0.05, corruptProbability: 0.03, truncateProbability: 0.02 },
      }),
    );
    const { frames, truth } = session;
    const lost = truth.lostFrames.map((f) => f.truth.sampleIndex);
    expect(lost.length).toBeGreaterThan(10);
    expect(truth.lostFrames.every((f) => f.reason === 'dropped')).toBe(true);
    const seen = frames.map((f) => f.truth.sampleIndex);
    // Every sample either arrived or is listed as lost: the gaps in the indexes are the losses.
    expect([...seen, ...lost].sort((a, b) => a! - b!)).toEqual([
      ...Array(seen.length + lost.length).keys(),
    ]);
    for (const frame of frames) {
      const decoded = decodeFrame(frame.bytes);
      if (frame.truth.corruption === null) expect(decoded.kind).toBe('weight');
      else expect(decoded.kind).toBe('invalid');
    }
    expect(frames.filter((f) => f.truth.corruption === 'bit-flip').length).toBeGreaterThan(5);
    expect(frames.filter((f) => f.truth.corruption === 'truncated').length).toBeGreaterThan(3);
  });
});

describe('pump vibration', () => {
  // Pre-infusion: the pump runs and nothing drips, so the mean is stationary (spec "Markers").
  // In 0.01 g steps, so the scale's own noise shows: at 0.1 g a reading at rest holds still.
  const run = (vibrationSigmaG: number) => {
    const session = simulateSession(
      espressoScenario({ seed: 21, scale: { vibrationSigmaG, resolutionG: 0.01 } }),
    );
    const [shot] = session.truth.shots;
    const rows = samples(session.frames);
    const window = (from: number, to: number) =>
      rows.filter((r) => r.t >= from && r.t < to).map((r) => r.frame.weightG);
    /** Variance over each 1 s (10-sample) window, the median of them. */
    const rollingVariance = (values: number[]) => {
      const vars: number[] = [];
      for (let i = 0; i + 10 <= values.length; i++) vars.push(variance(values.slice(i, i + 10)));
      return median(vars);
    };
    const quiet = window(shot.pumpOnMs - 1500, shot.pumpOnMs);
    const pumping = window(shot.pumpOnMs, shot.firstDripMs);
    return { session, shot, rows, quiet, pumping, rollingVariance };
  };

  it('raises the rolling variance while the pump runs, without moving the mean', () => {
    const { quiet, pumping, rollingVariance } = run(0.1);
    expect(rollingVariance(pumping) / rollingVariance(quiet)).toBeGreaterThan(10);
    const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    expect(Math.abs(mean(pumping) - mean(quiet))).toBeLessThan(0.03);
  });

  it('leaves the variance where it was when vibration σ is 0', () => {
    const { quiet, pumping, rollingVariance } = run(0);
    const ratio = rollingVariance(pumping) / rollingVariance(quiet);
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(3);
  });

  it('draws the same noise whatever the pump does, so adding a flush changes nothing else', () => {
    const base = cupScenario([], { noiseSigmaG: 0.012, vibrationSigmaG: 0.1 });
    const flush: ScriptEvent = { type: 'pump', atMs: 3000, durationMs: 2000 };
    const plain = samples(simulateSession(base).frames);
    const flushed = samples(simulateSession({ ...base, script: [...base.script, flush] }).frames);
    const outside = (rows: typeof plain) =>
      rows.filter((r) => r.t < 3000 || r.t >= 5000).map((r) => [r.t, r.frame.weightG]);
    expect(outside(flushed)).toEqual(outside(plain));
    const inside = (rows: typeof plain) =>
      rows.filter((r) => r.t >= 3000 && r.t < 5000).map((r) => r.frame.weightG);
    expect(inside(flushed)).not.toEqual(inside(plain));
  });

  it('changes nothing outside the pump run', () => {
    const shaking = run(0.1);
    const still = run(0);
    const outside = (r: { t: number }) =>
      r.t < shaking.shot.pumpOnMs || r.t > shaking.shot.pumpOffMs + 2000;
    const weights = (rows: typeof shaking.rows) =>
      rows.filter(outside).map((r) => [r.t, r.frame.weightG]);
    expect(weights(shaking.rows)).toEqual(weights(still.rows));
    expect(shaking.session.frames.map((f) => f.tArrival)).toEqual(
      still.session.frames.map((f) => f.tArrival),
    );
  });
});

describe('sampling', () => {
  it('samples every 100.7 ms of the phone’s clock: 100 ms ticks of a slow clock', () => {
    const sim = new ScaleSimulator(cupScenario([], { sampleJitterMs: 0 }));
    const rows = samples(sim.advanceTo(60_000));
    expect(rows.length).toBeGreaterThanOrEqual(595);
    expect(rows.length).toBeLessThanOrEqual(596);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].t - rows[i - 1].t).toBeCloseTo(100 / (1 - 0.00694), 9);
    }
  });

  it('counts the timer in ticks of one sample period, 100 ms in its first frame (S1)', () => {
    const sim = new ScaleSimulator(
      cupScenario([{ type: 'command', atMs: 0, command: tareAndStartTimer() }], {
        clockDriftPpm: 1000,
        sampleJitterMs: 3,
      }),
    );
    const rows = samples(sim.advanceTo(20_000));
    const [started] = sim.truth().timer;
    const timed = rows.filter((r) => r.t > started.atMs);
    expect(rows.filter((r) => r.t <= started.atMs).every((r) => r.frame.timerMs === 0)).toBe(true);
    timed.forEach((r, i) => expect(r.frame.timerMs).toBe(100 * (i + 1)));
    // The sample instants jitter within the bound; the timer, which counts, doesn't see it.
    const deltas = timed.slice(1).map((r, i) => r.t - timed[i].t);
    expect(Math.min(...deltas)).toBeGreaterThanOrEqual(100 / 1.001 - 6);
    expect(Math.max(...deltas)).toBeLessThanOrEqual(100 / 1.001 + 6);
    expect(new Set(deltas.map((d) => d.toFixed(3))).size).toBeGreaterThan(50);
  });

  it('weighs in 0.1 g steps by default, and holds still at rest (S1)', () => {
    const session = simulateSession(espressoScenario());
    for (const r of samples(session.frames)) {
      expect(Math.round(r.frame.weightG * 10) / 10).toBe(r.frame.weightG);
    }
    // The tared cup reads 0 until the pump starts: its 0.012 g of noise never reaches a step.
    const [shot] = session.truth.shots;
    const tare = session.truth.tares[0].atMs;
    const atRest = samples(session.frames)
      .filter((r) => r.t > tare && r.t < shot.pumpOnMs)
      .map((r) => r.frame.weightG);
    expect(atRest.length).toBeGreaterThan(15);
    expect(new Set(atRest)).toEqual(new Set([0]));
  });

  it('works out its own flow figure from the weight before rounding, so it moves at rest', () => {
    const rows = samples(
      simulateSession({ seed: 2, durationMs: 30_000, script: [], scale: {} }).frames,
    );
    expect(new Set(rows.map((r) => r.frame.weightG))).toEqual(new Set([0]));
    const flows = rows.slice(10).map((r) => r.frame.flowGps);
    // S1 measured σ 0.018 g/s at rest.
    expect(Math.sqrt(variance(flows))).toBeGreaterThan(0.012);
    expect(Math.sqrt(variance(flows))).toBeLessThan(0.024);
  });
});

describe('commands', () => {
  /** Runs `cupScenario` with commands written at the given times; returns weight rows. */
  function withCommands(
    commands: [atMs: number, bytes: Uint8Array][],
    scale: Partial<ScaleParams> = {},
    script: ScriptEvent[] = [],
    untilMs = 10_000,
  ) {
    const sim = new ScaleSimulator(cupScenario(script, scale));
    const frames: SimFrame[] = [];
    for (const [atMs, bytes] of commands) {
      frames.push(...sim.advanceTo(atMs));
      sim.write(bytes, atMs);
    }
    frames.push(...sim.advanceTo(untilMs));
    return { sim, frames, rows: samples(frames), truth: sim.truth() };
  }

  it('07 tares once the next frame is out, and starts the timer a frame later (S1)', () => {
    const { frames, rows, truth } = withCommands([[1000, tareAndStartTimer().bytes]]);
    // The scale gets it at 1040. Its next frame still shows the cup and a stopped timer, then it
    // tares; the frame after reads 0 g and 0 ms, then it starts; and the next reads 100 ms.
    const next = rows.findIndex((r) => r.t >= 1040);
    for (const r of rows.slice(0, next + 1)) {
      expect(r.frame.weightG).toBe(110);
      expect(r.frame.timerMs).toBe(0);
    }
    expect(rows[next + 1].frame).toMatchObject({ weightG: 0, timerMs: 0 });
    rows.slice(next + 2).forEach((r, i) => {
      expect(r.frame.weightG).toBe(0);
      expect(r.frame.timerMs).toBe(100 * (i + 1));
    });
    const tareAt = rows[next].t;
    expect(truth.commands).toEqual([
      {
        sentAtMs: 1000,
        appliedAtMs: 1040,
        hex: '030A0700000E',
        reason: null,
        effect: 'tare-and-start',
      },
    ]);
    expect(truth.tares).toEqual([{ atMs: tareAt, source: 'command', offsetG: 110 }]);
    expect(truth.timer).toEqual([{ atMs: rows[next + 1].t, change: 'start', valueMs: 0 }]);
    // The timer mode sends nothing on FF12 for it (S1).
    expect(frames.every((f) => f.source === 'ff11')).toBe(true);
  });

  it('07 while the timer runs only tares: it starts the timer from 0 only, as 04 does', () => {
    const { rows, truth } = withCommands([
      [1000, tareAndStartTimer().bytes],
      [5000, tareAndStartTimer().bytes],
    ]);
    // One run throughout, never back to a small value.
    const running = rows.map((r) => r.frame.timerMs).filter((ms) => ms > 0);
    running.forEach((ms, i) => expect(ms).toBe(100 * (i + 1)));
    expect(truth.commands.map((c) => c.effect)).toEqual(['tare-and-start', 'tare']);
    expect(truth.tares).toHaveLength(2);
    expect(truth.timer.map((c) => c.change)).toEqual(['start']);
  });

  it('01 tares once the next sample is out, and leaves the timer alone', () => {
    const { rows, truth } = withCommands([[1000, tare().bytes]]);
    const [tared] = truth.tares;
    expect(rows.filter((r) => r.t <= tared.atMs).every((r) => r.frame.weightG === 110)).toBe(true);
    expect(rows.filter((r) => r.t > tared.atMs).every((r) => r.frame.weightG === 0)).toBe(true);
    // Exactly one sample after the scale got the command still showed the cup.
    expect(rows.filter((r) => r.t >= 1040 && r.t <= tared.atMs)).toHaveLength(1);
    expect(rows.every((r) => r.frame.timerMs === 0)).toBe(true);
    expect(truth.commands[0].effect).toBe('tare');
  });

  it('04 starts only from 0, 05 freezes, 06 zeroes only a stopped timer (S1)', () => {
    const { rows, truth } = withCommands(
      [
        [1000, startTimer().bytes],
        [3000, stopTimer().bytes],
        [4000, startTimer().bytes], // doesn't resume a frozen timer
        [5000, resetTimer().bytes],
        [6000, startTimer().bytes],
        [7000, resetTimer().bytes], // ignored while it runs
        [8000, startTimer().bytes], // already running
      ],
      {},
      [],
      12_000,
    );
    const between = (from: number, to: number) =>
      rows.filter((r) => r.t > from && r.t < to).map((r) => r.frame.timerMs);
    // The scale takes each command 40 ms after it's written. A stop or a reset shows in the next
    // frame; a start waits until that frame is out, so the one after reads 100 ms.
    const [startFrame, ...first] = between(1040, 3040);
    expect(startFrame).toBe(0);
    first.forEach((ms, i) => expect(ms).toBe(100 * (i + 1)));
    const frozen = first.at(-1)!;
    expect(between(3040, 5040).every((ms) => ms === frozen)).toBe(true);
    expect(between(5040, 6040).every((ms) => ms === 0)).toBe(true);
    const [again, ...second] = between(6040, 12_000);
    expect(again).toBe(0);
    second.forEach((ms, i) => expect(ms).toBe(100 * (i + 1)));
    expect(truth.commands.map((c) => c.effect)).toEqual([
      'timer-start',
      'timer-stop',
      'no-op',
      'timer-reset',
      'timer-start',
      'no-op',
      'no-op',
    ]);
    expect(truth.timer.map((c) => [c.change, c.valueMs])).toEqual([
      ['start', 0],
      ['stop', frozen],
      ['reset', 0],
      ['start', 0],
    ]);
    // The weight never moved: these commands don't tare.
    expect(rows.every((r) => r.frame.weightG === 110)).toBe(true);
  });

  it('in the flow-rate mode, ignores 04 to 07, and still tares (PROVISIONAL until A4, A5)', () => {
    const { frames, rows, truth } = withCommands(
      [
        [1000, tareAndStartTimer().bytes],
        [2000, startTimer().bytes],
        [3000, stopTimer().bytes],
        [4000, resetTimer().bytes],
        [5000, tare().bytes],
      ],
      { mode: 'flow-rate' },
    );
    expect(truth.commands.map((c) => c.effect)).toEqual([
      'no-op',
      'no-op',
      'no-op',
      'no-op',
      'tare',
    ]);
    expect(rows.every((r) => r.frame.timerMs === 0)).toBe(true);
    expect(rows.filter((r) => r.t < 5040).every((r) => r.frame.weightG === 110)).toBe(true);
    expect(rows.at(-1)!.frame.weightG).toBe(0);
    expect(frames.every((f) => f.source === 'ff11')).toBe(true);
  });

  it('08 turns smoothing off, as the smoothing byte shows', () => {
    const { rows, truth } = withCommands([[1000, flowSmoothingOff().bytes]], {
      initialSmoothing: true,
    });
    for (const r of rows) expect(r.frame.flowSmoothing).toBe(r.t < 1040 ? 1 : 0);
    expect(truth.commands[0].effect).toBe('smoothing-off');
  });

  it('02 and 03 set the buzzer and the auto-off time the frames report', () => {
    const { rows } = withCommands([
      [1000, setBuzzer(4).bytes],
      [2000, setAutoOff(15).bytes],
    ]);
    const last = rows.at(-1)!.frame;
    expect(last.buzzerGear).toBe(4);
    expect(last.standbyMin).toBe(15);
    expect(rows[0].frame.buzzerGear).toBe(2);
    expect(rows[0].frame.standbyMin).toBe(5);
  });

  it('25 is accepted and changes nothing visible', () => {
    const { frames, truth } = withCommands([[1000, keepAlive().bytes]]);
    const { frames: none } = withCommands([]);
    expect(truth.commands[0].effect).toBe('keep-alive');
    expect(frames).toEqual(none);
  });

  it('ignores malformed frames and unknown sub-commands, as firmware would', () => {
    const badChecksum = fromHex('03 0A 01 00 00 09');
    const unknownSub = fromHex('03 0A 0B 01 00 03'); // valid checksum, not on the whitelist
    const short = fromHex('03 0A 01');
    const { rows, truth } = withCommands([
      [1000, badChecksum],
      [2000, unknownSub],
      [3000, short],
    ]);
    expect(truth.commands.map((c) => c.effect)).toEqual([
      'ignored-malformed',
      'ignored-unknown',
      'ignored-malformed',
    ]);
    expect(rows.every((r) => r.frame.weightG === 110)).toBe(true);
  });

  it.each([
    ['calibration', '03 0A 09 00 00 00'],
    ['shutdown', '03 0A 15 00 00 1C'],
  ])('throws on %s bytes: a transport must never let them through', (_, hex) => {
    const sim = new ScaleSimulator(cupScenario());
    expect(() => sim.write(fromHex(hex), 0)).toThrow(/must never be sent/);
    expect(sim.truth().commands).toEqual([]);
  });

  it('refuses a write earlier than the simulation has run', () => {
    const sim = new ScaleSimulator(cupScenario());
    sim.advanceTo(1000);
    expect(() => sim.write(tare().bytes, 999)).toThrow(RangeError);
    expect(() => sim.advanceTo(999)).toThrow(RangeError);
    expect(() => sim.advanceTo(Infinity)).toThrow(RangeError);
  });
});

describe('the automatic mode (S1)', () => {
  /** An empty platform; a cup goes on at 1 s; a shot drips from 5 s; commands as given. */
  function automatic(commands: [atMs: number, bytes: Uint8Array][], extra: ScriptEvent[] = []) {
    const sim = new ScaleSimulator({
      seed: 1,
      durationMs: 60_000,
      script: [
        { type: 'cup-on', atMs: 1000, massG: 110 },
        { type: 'shot', atMs: 3000, preInfusionMs: 2000 },
        ...extra,
      ],
      scale: { ...EXACT_SCALE, mode: 'automatic' },
      link: QUIET_LINK,
    });
    const frames: SimFrame[] = [];
    for (const [atMs, bytes] of commands) {
      frames.push(...sim.advanceTo(atMs));
      sim.write(bytes, atMs);
    }
    frames.push(...sim.advanceTo(60_000));
    const truth = sim.truth();
    return { frames, rows: samples(frames), truth, shot: truth.shots[0] };
  }

  it('tares the cup once it settles, and times its own run from the first liquid', () => {
    const { frames, rows, truth, shot } = automatic([]);
    const [tared] = truth.tares;
    expect(tared).toMatchObject({ source: 'auto', offsetG: 110 });
    expect(tared.atMs).toBeGreaterThan(1000);
    expect(tared.atMs).toBeLessThan(1400);
    // The run starts once 0.3 g has landed, about a second into the default shot's ramp: about
    // what the 1 s its timer starts from makes up for. Its first frame reads 1.1 s, as in
    // session 1.
    const [started] = truth.timer;
    expect(started.change).toBe('start');
    expect(started.valueMs).toBe(1000);
    expect(started.atMs).toBeGreaterThan(shot.firstDripMs + 500);
    expect(started.atMs).toBeLessThan(shot.firstDripMs + 1500);
    const ticking = rows.filter((r) => r.t > started.atMs);
    ticking.forEach((r, i) => expect(r.frame.timerMs).toBe(1100 + 100 * i));
    expect(rows.filter((r) => r.t <= started.atMs).every((r) => r.frame.timerMs === 0)).toBe(true);
    const atStart = rows.filter((r) => r.t <= started.atMs).at(-1)!.frame.weightG;
    expect(atStart).toBeGreaterThanOrEqual(AUTOMATIC_MODE.liquidG);
    // FF12 says so, in the Mini's frame: the state and nothing else.
    const events = frames.filter((f) => f.source === 'ff12');
    expect(events.map((f) => toHex(f.bytes, ''))).toEqual([
      '030D01000000000000000000000000000000000F',
    ]);
    expect(events[0].truth.sampleTMs).toBe(started.atMs);
  });

  it('ignores tare and 04 during its run; 05 ends it, the timer at once, the weight next', () => {
    const { frames, rows, truth, shot } = automatic([
      [10_000, tare().bytes],
      [11_000, startTimer().bytes],
      [40_000, stopTimer().bytes],
      [45_000, startTimer().bytes],
      [46_000, tareAndStartTimer().bytes],
    ]);
    expect(truth.commands.map((c) => c.effect)).toEqual([
      'no-op',
      'no-op',
      'run-ended',
      'no-op',
      'no-op',
    ]);
    // No tare during the run: the cup fills to the yield.
    const end = rows.findIndex((r) => r.t >= 40_040);
    expect(rows[end - 1].frame.weightG).toBeCloseTo(shot.yieldG, 1);
    expect(rows[end - 1].frame.timerMs).toBeGreaterThan(30_000);
    // The first sample after 05 reads timer 0 with the liquid still there; the next, 0 g.
    expect(rows[end].frame.timerMs).toBe(0);
    expect(rows[end].frame.weightG).toBeCloseTo(shot.yieldG, 1);
    expect(rows.slice(end + 1).every((r) => r.frame.weightG === 0)).toBe(true);
    expect(rows.slice(end).every((r) => r.frame.timerMs === 0)).toBe(true);
    expect(truth.timer.map((c) => [c.change, c.valueMs])).toEqual([
      ['start', 1000],
      ['reset', 0],
    ]);
    expect(truth.tares.map((t) => t.source)).toEqual(['auto', 'command']);
    const events = frames.filter((f) => f.source === 'ff12');
    expect(events.map((f) => (decodeFrame(f.bytes) as EventFrame).state)).toEqual([
      'started',
      'stopped',
    ]);
    expect(events[1].truth.sampleTMs).toBe(40_040);
  });

  it('starts a run on a touch of a few grams, as session 1’s did on an empty platform', () => {
    const sim = new ScaleSimulator({
      seed: 1,
      durationMs: 5000,
      script: [{ type: 'bump', atMs: 1000, durationMs: 300, peakG: 3 }],
      scale: { ...EXACT_SCALE, mode: 'automatic' },
      link: QUIET_LINK,
    });
    sim.advanceTo(5000);
    expect(sim.truth().timer.map((c) => c.change)).toEqual(['start']);
    expect(sim.truth().tares).toEqual([]);
  });

  it('leaves a vessel put on during its run untared', () => {
    const { truth } = automatic(
      [],
      [
        { type: 'cup-off', atMs: 30_000 },
        { type: 'cup-on', atMs: 32_000, massG: 95 },
      ],
    );
    expect(truth.tares.map((t) => t.source)).toEqual(['auto']);
  });
});

describe('physical events', () => {
  it('a tare-button press moves the zero once the next sample is out, and sends nothing', () => {
    const sim = new ScaleSimulator(cupScenario([{ type: 'tare-button', atMs: 2000 }]));
    const frames = sim.advanceTo(5000);
    expect(frames.every((f) => f.source === 'ff11')).toBe(true);
    const [tared] = sim.truth().tares;
    const rows = samples(frames);
    expect(tared).toEqual({
      atMs: rows.find((r) => r.t >= 2000)!.t,
      source: 'button',
      offsetG: 110,
    });
    for (const r of rows) expect(r.frame.weightG).toBe(r.t <= tared.atMs ? 110 : 0);
  });

  it('drips that miss a lifted cup land on the platform', () => {
    const scenario = espressoScenario({
      cupOffAfterPumpOffMs: 1000,
      trailingMs: 60_000, // long enough for the last drop
      scale: EXACT_SCALE,
      link: QUIET_LINK,
    });
    const session = simulateSession(scenario);
    const [shot] = session.truth.shots;
    expect(shot.honestYieldG!).toBeLessThan(shot.yieldG - 0.5);
    // Tared with the cup on: afterwards the platform holds what missed the cup.
    const last = samples(session.frames).at(-1)!.frame.weightG;
    expect(last).toBeCloseTo(-110 + (shot.yieldG - shot.honestYieldG!), 2);
  });

  it('a bump moves the weight while it lasts, then leaves it', () => {
    const sim = new ScaleSimulator(
      cupScenario([{ type: 'bump', atMs: 2000, durationMs: 500, peakG: 6 }]),
    );
    const rows = samples(sim.advanceTo(4000));
    const during = rows.filter((r) => r.t > 2000 && r.t < 2500).map((r) => r.frame.weightG);
    expect(Math.max(...during)).toBeGreaterThan(115);
    expect(rows.filter((r) => r.t >= 2500).every((r) => r.frame.weightG === 110)).toBe(true);
  });
});

describe('smoothing', () => {
  it('lags the weight while on (D-021)', () => {
    const script: ScriptEvent[] = [
      { type: 'cup-off', atMs: 500 },
      { type: 'cup-on', atMs: 2000, massG: 110 },
    ];
    const shown = (initialSmoothing: boolean) =>
      samples(new ScaleSimulator(cupScenario(script, { initialSmoothing })).advanceTo(6000));
    const halfSecondIn = (rows: ReturnType<typeof shown>) =>
      rows.find((r) => r.t >= 2500)!.frame.weightG;
    expect(halfSecondIn(shown(false))).toBe(110);
    const lagged = halfSecondIn(shown(true));
    expect(lagged).toBeGreaterThan(50);
    expect(lagged).toBeLessThan(90);
    expect(shown(true).at(-1)!.frame.weightG).toBeCloseTo(110, 1);
  });
});

describe('power-off', () => {
  const scenario = cupScenario([{ type: 'power-off', atMs: 3000 }]);

  it('stops the frames and loses the link after the supervision timeout', () => {
    const sim = new ScaleSimulator({ ...scenario, link: { stallProbability: 0 } });
    const frames = sim.advanceTo(10_000);
    expect(frames.every((f) => f.truth.sampleTMs < 3000)).toBe(true);
    expect(frames.length).toBeGreaterThan(25);
    expect(sim.linkLostAtMs).toBe(5000);
    expect(sim.nextWakeMs()).toBeNull();
    expect(sim.truth().linkLostAtMs).toBe(5000);
  });

  it('loses frames still on their way when the link goes', () => {
    const sim = new ScaleSimulator({
      ...scenario,
      scale: { ...EXACT_SCALE, supervisionTimeoutMs: 0 },
      link: { ...QUIET_LINK, minLatencyMs: 250 },
    });
    sim.advanceTo(10_000);
    const lost = sim.truth().lostFrames;
    expect(lost.length).toBeGreaterThan(0);
    expect(lost.every((f) => f.reason === 'link-lost')).toBe(true);
  });

  it('ignores commands once off, including ones still taking effect', () => {
    const sim = new ScaleSimulator(scenario);
    sim.advanceTo(2980);
    sim.write(tare().bytes, 2980); // would take effect at 3020
    sim.write(tare().bytes, 4000);
    expect(sim.truth().commands.map((c) => [c.appliedAtMs, c.effect])).toEqual([
      [null, 'ignored-powered-off'],
      [null, 'ignored-powered-off'],
    ]);
  });
});

describe('nextWakeMs', () => {
  it('always lies after the time the simulation has reached', () => {
    const sim = new ScaleSimulator(espressoScenario());
    let wakes = 0;
    for (let next = sim.nextWakeMs(); next !== null && next < 60_000; next = sim.nextWakeMs()) {
      expect(next).toBeGreaterThanOrEqual(sim.nowMs);
      sim.advanceTo(next);
      expect(sim.nextWakeMs()!).toBeGreaterThan(next);
      wakes++;
    }
    expect(wakes).toBeGreaterThan(600);
  });
});
