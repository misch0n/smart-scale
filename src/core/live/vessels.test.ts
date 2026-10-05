import { describe, expect, it } from 'vitest';
import { commandEventData, RecordingSequence } from '../model';
import { decodeFrame, tare } from '../protocol';
import { demoScenario, ScaleSimulator, type Scenario, type ScriptEvent } from '../sim';
import { STREAM_RECORDING_ID } from './test-stream';
import { VesselMonitor, type VesselEvent, type VesselState } from './vessels';

interface Run {
  readonly monitor: VesselMonitor;
  /** Each event with when it came, ms. */
  readonly events: readonly (VesselEvent & { readonly atMs: number })[];
  /** The state after the frame at or after each of `probesMs`. */
  readonly probes: ReadonlyMap<number, VesselState>;
}

/**
 * Streams `scenario` through a monitor, the app's tares (logged and sent) at `taresMs`, and
 * notes the state at `probesMs`.
 */
function run(scenario: Scenario, taresMs: readonly number[] = [], probesMs: number[] = []): Run {
  const simulator = new ScaleSimulator(scenario);
  const sequence = new RecordingSequence(STREAM_RECORDING_ID);
  const monitor = new VesselMonitor();
  const events: (VesselEvent & { readonly atMs: number })[] = [];
  const probes = new Map<number, VesselState>();
  const pending = [...probesMs].sort((a, b) => a - b);
  const stops = [...taresMs, scenario.durationMs].sort((a, b) => a - b);
  for (const stop of stops) {
    for (const frame of simulator.advanceTo(stop)) {
      const raw = sequence.frame(frame.tArrival, frame.source, frame.bytes);
      for (const event of monitor.addFrame(raw, decodeFrame(frame.bytes))) {
        events.push({ ...event, atMs: frame.tArrival });
      }
      while (pending.length > 0 && pending[0] <= frame.tArrival) {
        probes.set(pending.shift()!, monitor.state);
      }
    }
    if (stop < scenario.durationMs) {
      simulator.write(tare().bytes, stop);
      monitor.addEvent(sequence.event(stop, 'command-sent', commandEventData(tare(), 'test')));
    }
  }
  return { monitor, events, probes };
}

function scenario(script: readonly ScriptEvent[], durationMs = 30_000): Scenario {
  return { seed: 7, durationMs, script: [...script], scale: { initialSmoothing: true } };
}

/** The events but the settling, and the mass each vessel settled at. */
const summary = (r: Run) =>
  r.events
    .map((e, i) => {
      if (e.type === 'vessel-settled') return null;
      if (e.type === 'vessel-off') return `${e.type} ${e.vessel.massG}`;
      const settled = r.events.slice(i + 1).find((later) => later.type !== 'vessel-settled');
      return `${e.type} ${(settled ?? r.monitor.state).vessel?.massG ?? e.vessel.massG}`;
    })
    .filter((line) => line !== null);

describe('VesselMonitor', () => {
  it('follows the demo session: each cup put on, with its mass, through its shot until lifted', () => {
    const r = run(demoScenario(), [], [55_000]);
    // The scale's tare button at 120 s, with the second cup on, reads as a lift (A7); lifted at
    // 150 s, it adds nothing.
    expect(summary(r)).toEqual([
      'vessel-on 110',
      'vessel-off 110',
      'vessel-on 95',
      'vessel-off 95',
    ]);
    const [on, off, second] = r.events.filter((e) => e.type !== 'vessel-settled');
    expect(on.atMs).toBeGreaterThan(3000);
    // The scale's own smoothing holds it unsettled for a few seconds (D-037).
    expect(on.atMs).toBeLessThan(7000);
    expect(off.atMs).toBeGreaterThan(60_000);
    expect(off.atMs).toBeLessThan(65_000);
    expect(second.atMs).toBeGreaterThan(75_000);
    // Mid-session, the first shot's yield is its contents.
    const mid = r.probes.get(55_000)!;
    expect(mid.vessel?.massG).toBe(110);
    expect(mid.contentsG).toBeGreaterThan(30);
    expect(r.monitor.state.vessel).toBeNull();
  });

  it('keeps the vessel through the app’s tare, and its contents from there', () => {
    const r = run(
      scenario([
        { type: 'cup-on', atMs: 2000, massG: 41 },
        { type: 'cup-off', atMs: 12_000 },
      ]),
      [5000],
      [8000],
    );
    expect(summary(r)).toEqual(['vessel-on 41', 'vessel-off 41']);
    expect(r.probes.get(8000)).toMatchObject({ vessel: { massG: 41 }, stable: true });
    expect(r.probes.get(8000)!.contentsG).toBeLessThan(0.1);
  });

  it('weighs what was put on, contents and all', () => {
    const beans = run(scenario([{ type: 'cup-on', atMs: 2000, massG: 41, contentsG: 18 }]));
    expect(summary(beans)).toEqual(['vessel-on 59']);
  });

  it('sees a lift and the same vessel back', () => {
    const r = run(
      scenario([
        { type: 'cup-on', atMs: 2000, massG: 181.4 },
        { type: 'cup-off', atMs: 8000 },
        { type: 'cup-back', atMs: 14_000 },
      ]),
    );
    expect(summary(r)).toEqual(['vessel-on 181.4', 'vessel-off 181.4', 'vessel-on 181.4']);
  });

  it('takes no vessel lighter than the least a container weighs', () => {
    expect(summary(run(scenario([{ type: 'cup-on', atMs: 2000, massG: 2 }])))).toEqual([]);
    expect(summary(run(scenario([{ type: 'cup-on', atMs: 2000, massG: 3.5 }])))).toEqual([
      'vessel-on 3.5',
    ]);
  });

  it('starts afresh with another recording', () => {
    const r = run(scenario([{ type: 'cup-on', atMs: 2000, massG: 110 }], 10_000));
    expect(r.monitor.state.vessel?.massG).toBe(110);
    const next = new RecordingSequence('01a10000-0000-7000-8000-000000000002');
    r.monitor.addEvent(next.event(0, 'command-sent', commandEventData(tare(), 'test')));
    expect(r.monitor.state).toMatchObject({ vessel: null, contentsG: null });
  });
});
