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
  type EventFrame,
  type WeightFrame,
} from '../protocol';
import type { LinkParams, ScaleParams } from './params';
import type { ScriptEvent } from './script';
import { espressoScenario, simulateSession } from './session';
import { ScaleSimulator, type Scenario, type SimFrame } from './simulator';

/** A link that only adds its fixed latency: arrival = sample + 15 ms. */
const QUIET_LINK: Partial<LinkParams> = {
  connectionIntervalMs: 0,
  jitterMeanMs: 0,
  stallProbability: 0,
};

/** A scale with no noise and instant settling, so weights are exact. */
const EXACT_SCALE: Partial<ScaleParams> = {
  noiseSigmaG: 0,
  vibrationSigmaG: 0,
  settleTauMs: 0,
  sampleJitterMs: 0,
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
    const tareAt = truth.tares[0].atMs;
    for (const frame of frames) {
      const decoded = weight(frame);
      const t = frame.truth;
      expect(decoded.weightG).toBe(t.weightG);
      expect(decoded.timerMs).toBe(t.timerMs);
      expect(decoded.unitOk).toBe(true);
      expect(decoded.flowSmoothing).toBe(0);
      // The weight is the noisy gross mass minus the zero, quantised.
      const expected = Math.round((t.grossG + t.noiseG - t.offsetG) / scale.resolutionG) * 0.01;
      expect(t.weightG).toBeCloseTo(expected, 9);
      // The timer counts scale time from the tare-and-start, and reads zero before it.
      const elapsed = (t.sampleTMs - tareAt) * (1 + scale.clockDriftPpm * 1e-6);
      expect(t.timerMs).toBe(t.sampleTMs < tareAt ? 0 : Math.floor(elapsed));
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
  const run = (vibrationSigmaG: number) => {
    const session = simulateSession(espressoScenario({ seed: 21, scale: { vibrationSigmaG } }));
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
    const base = cupScenario([], { noiseSigmaG: 0.015, vibrationSigmaG: 0.1 });
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
  it('samples at the drifted period, and the timer counts scale time', () => {
    const sim = new ScaleSimulator(
      cupScenario([{ type: 'command', atMs: 0, command: tareAndStartTimer() }], {
        clockDriftPpm: 1000,
      }),
    );
    const rows = samples(sim.advanceTo(60_000));
    expect(rows.length).toBe(600);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].t - rows[i - 1].t).toBeCloseTo(100 / 1.001, 9);
    }
    const timed = rows.filter((r) => r.t > 100);
    for (let i = 1; i < timed.length; i++) {
      expect(
        Math.abs(timed[i].frame.timerMs - timed[i - 1].frame.timerMs - 100),
      ).toBeLessThanOrEqual(1);
    }
  });

  it('jitters each sample instant within the bound, and the timer stamps the real instant', () => {
    const sim = new ScaleSimulator(
      cupScenario([{ type: 'command', atMs: 0, command: tareAndStartTimer() }], {
        sampleJitterMs: 3,
        clockDriftPpm: 0,
      }),
    );
    const rows = samples(sim.advanceTo(20_000)).filter((r) => r.t > 100);
    const deltas = rows.slice(1).map((r, i) => r.t - rows[i].t);
    expect(Math.min(...deltas)).toBeGreaterThanOrEqual(94);
    expect(Math.max(...deltas)).toBeLessThanOrEqual(106);
    expect(new Set(deltas.map((d) => d.toFixed(3))).size).toBeGreaterThan(50);
    for (const r of rows) expect(r.frame.timerMs).toBe(Math.floor(r.t - 40));
  });

  it('quantises the weight to the resolution', () => {
    const session = simulateSession(espressoScenario({ scale: { resolutionG: 0.1 } }));
    for (const r of samples(session.frames)) {
      expect(Math.round(r.frame.weightG * 10) / 10).toBe(r.frame.weightG);
    }
    // At rest, a 0.1 g step hides 0.015 g of noise almost completely (T1.11's σ floor).
    const [shot] = session.truth.shots;
    const atRest = samples(session.frames)
      .filter((r) => r.t > shot.pumpOnMs - 1500 && r.t < shot.pumpOnMs)
      .map((r) => r.frame.weightG);
    expect(variance(atRest)).toBeLessThan(0.001);
  });
});

describe('commands', () => {
  /** Runs `cupScenario` with commands written at the given times; returns weight rows. */
  function withCommands(
    commands: [atMs: number, bytes: Uint8Array][],
    scale: Partial<ScaleParams> = {},
    script: ScriptEvent[] = [],
  ) {
    const sim = new ScaleSimulator(cupScenario(script, scale));
    const frames: SimFrame[] = [];
    for (const [atMs, bytes] of commands) {
      frames.push(...sim.advanceTo(atMs));
      sim.write(bytes, atMs);
    }
    frames.push(...sim.advanceTo(10_000));
    return { sim, frames, rows: samples(frames), truth: sim.truth() };
  }

  it('07 tares and starts the timer from zero, after the command latency', () => {
    const { rows, truth } = withCommands([[1000, tareAndStartTimer().bytes]]);
    for (const r of rows) {
      if (r.t < 1040) {
        expect(r.frame.weightG).toBe(110);
        expect(r.frame.timerMs).toBe(0);
      } else {
        expect(r.frame.weightG).toBe(0);
        expect(r.frame.timerMs).toBe(Math.floor((r.t - 1040) * 1.0003));
      }
    }
    expect(truth.commands).toEqual([
      {
        sentAtMs: 1000,
        appliedAtMs: 1040,
        hex: '030A0700000E',
        reason: null,
        effect: 'tare-and-start',
      },
    ]);
    expect(truth.tares).toEqual([{ atMs: 1040, source: 'command', offsetG: 110 }]);
    expect(truth.timer).toEqual([{ atMs: 1040, change: 'restart', valueMs: 0 }]);
  });

  it('07 restarts a running timer from zero', () => {
    const { rows } = withCommands([
      [1000, tareAndStartTimer().bytes],
      [5000, tareAndStartTimer().bytes],
    ]);
    const justAfter = rows.find((r) => r.t >= 5040)!;
    expect(justAfter.frame.timerMs).toBeLessThan(110);
  });

  it('01 tares and leaves the timer alone', () => {
    const { rows, truth } = withCommands([[1000, tare().bytes]]);
    expect(rows.filter((r) => r.t >= 1040).every((r) => r.frame.weightG === 0)).toBe(true);
    expect(rows.every((r) => r.frame.timerMs === 0)).toBe(true);
    expect(truth.commands[0].effect).toBe('tare');
  });

  it('04, 05 and 06 start, freeze, resume and reset the timer (D-021)', () => {
    const { rows, truth } = withCommands([
      [1000, startTimer().bytes],
      [3000, stopTimer().bytes],
      [5000, startTimer().bytes],
      [6000, startTimer().bytes],
      [7000, resetTimer().bytes],
    ]);
    const timerAt = (ms: number) => rows.filter((r) => r.t < ms).at(-1)!.frame.timerMs;
    const frozen = Math.floor(2000 * 1.0003);
    expect(timerAt(1040)).toBe(0);
    expect(timerAt(4900)).toBe(frozen);
    expect(timerAt(6500)).toBeGreaterThan(frozen + 1400);
    expect(timerAt(10_000)).toBe(0);
    expect(truth.commands.map((c) => c.effect)).toEqual([
      'timer-start',
      'timer-stop',
      'timer-start',
      'no-op',
      'timer-reset',
    ]);
    expect(truth.timer.map((c) => c.change)).toEqual(['start', 'stop', 'start', 'reset']);
    // The weight never moved: these commands don't tare.
    expect(rows.every((r) => r.frame.weightG === 110)).toBe(true);
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

describe('physical events', () => {
  it('a tare-button press moves the zero and sends nothing', () => {
    const sim = new ScaleSimulator(
      cupScenario([{ type: 'tare-button', atMs: 2000 }], { timerEvents: 'ff12' }),
    );
    const frames = sim.advanceTo(5000);
    expect(frames.every((f) => f.source === 'ff11')).toBe(true);
    for (const r of samples(frames)) expect(r.frame.weightG).toBe(r.t < 2000 ? 110 : 0);
    expect(sim.truth().tares).toEqual([{ atMs: 2000, source: 'button', offsetG: 110 }]);
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

describe('timer events (03 0D, D-021)', () => {
  it("sends started and stopped frames to the chosen characteristic when it's on", () => {
    const sim = new ScaleSimulator(cupScenario([], { timerEvents: 'ff12' }));
    const frames = sim.advanceTo(1000);
    sim.write(tareAndStartTimer().bytes, 1000);
    frames.push(...sim.advanceTo(3000));
    sim.write(stopTimer().bytes, 3000);
    frames.push(...sim.advanceTo(5000));
    const events = frames.filter((f) => f.source === 'ff12');
    expect(events.map((f) => f.truth.kind)).toEqual(['event', 'event']);
    const [started, stopped] = events.map((f) => decodeFrame(f.bytes) as EventFrame);
    // Sent as the command takes effect: after the tare, so the reading is zero.
    expect(started).toMatchObject({ kind: 'event', state: 'started', timerMs: 0, weightG: 0 });
    expect(stopped).toMatchObject({ kind: 'event', state: 'stopped', weightG: 0 });
    expect(stopped.timerMs).toBe(Math.floor(2000 * 1.0003));
    expect(events[0].truth.sampleTMs).toBe(1040);
  });

  it('sends none by default', () => {
    const { frames } = simulateSession(espressoScenario());
    expect(frames.every((f) => f.source === 'ff11')).toBe(true);
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
