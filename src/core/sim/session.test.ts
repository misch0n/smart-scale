import { describe, expect, it } from 'vitest';
import { isId, normaliseAppEvent, normaliseRawFrame, normaliseRecording } from '../model';
import { decodeFrame, tare } from '../protocol';
import {
  demoScenario,
  espressoScenario,
  SIM_DEVICE,
  simulateSession,
  toRawRecording,
} from './session';
import { DEFAULT_SHOT_PARAMS } from './shot';

describe('simulateSession', () => {
  it('returns the frames that arrived by the end, with the parameters in force', () => {
    const scenario = espressoScenario({ scale: { samplePeriodMs: 50 } });
    const session = simulateSession(scenario);
    expect(session.scenario).toBe(scenario);
    expect(session.scale.samplePeriodMs).toBe(50);
    expect(session.link.minLatencyMs).toBe(15);
    expect(session.frames.every((f) => f.tArrival <= scenario.durationMs)).toBe(true);
    expect(session.frames.length).toBeGreaterThan((scenario.durationMs / 50) * 0.95);
  });

  it.each([-1, NaN, Infinity])('rejects a duration of %s', (durationMs) => {
    expect(() => simulateSession({ ...espressoScenario(), durationMs })).toThrow(RangeError);
  });
});

describe('espressoScenario', () => {
  it('scripts cup on, tare-and-start, the shot and cup off', () => {
    const scenario = espressoScenario();
    expect(scenario.script.map((e) => `${e.type}@${e.atMs}`)).toEqual([
      'cup-on@2000',
      'command@5000',
      'shot@7000',
      'cup-off@65000',
    ]);
    expect(scenario.durationMs).toBe(70_000);
  });

  it('can leave the tare to the app and keep the cup on', () => {
    const scenario = espressoScenario({ tareAndStartMs: null, cupOffAfterPumpOffMs: null });
    expect(scenario.script.map((e) => e.type)).toEqual(['cup-on', 'shot']);
    const pumpOff = 7000 + DEFAULT_SHOT_PARAMS.preInfusionMs + DEFAULT_SHOT_PARAMS.extractionMs;
    expect(scenario.durationMs).toBe(pumpOff + 30_000 + 5000);
  });

  it('adds the Tare + start tap the user makes with the pump (Q4)', () => {
    const scenario = espressoScenario({ manualStartMs: 7000 });
    expect(scenario.script.map((e) => `${e.type}@${e.atMs}`)).toEqual([
      'cup-on@2000',
      'command@5000',
      'command@7000',
      'shot@7000',
      'cup-off@65000',
    ]);
    const reasons = toRawRecording(simulateSession(scenario)).events.flatMap((event) =>
      event.type === 'command-sent' ? [event.data.reason] : [],
    );
    expect(reasons).toEqual(['auto-tare', 'manual-start']);
  });

  it('passes shot parameters through to the truth', () => {
    const { truth } = simulateSession(
      espressoScenario({ shot: { yieldG: 45, preInfusionMs: 8000 }, scale: { dropG: 0 } }),
    );
    expect(truth.shots[0].yieldG).toBeCloseTo(45, 9);
    expect(truth.shots[0].preInfusionMs).toBe(8000);
  });
});

describe('demoScenario', () => {
  it('runs: two shots, a stray tare in the second tail, smoothing on, the timer mode', () => {
    const session = simulateSession(demoScenario());
    expect(session.truth.shots).toHaveLength(2);
    const [, second] = session.truth.shots;
    const stray = session.truth.events.find((e) => e.type === 'tare-button')!;
    expect(stray.tMs).toBeGreaterThan(second.pumpOffMs);
    expect(stray.tMs).toBeLessThan(second.settledMs);
    expect(session.scale.initialSmoothing).toBe(true);
    // The app's mode (D-038): FF12 stays quiet.
    expect(session.scale.mode).toBe('timer');
    expect(session.frames.every((f) => f.source === 'ff11')).toBe(true);
  });
});

describe('toRawRecording', () => {
  const session = simulateSession(espressoScenario({ seed: 2 }));
  const raw = toRawRecording(session);

  it('numbers frames and events with one contiguous sequence, in time order', () => {
    const all = [
      ...raw.frames.map((f) => ({ seq: f.seq, tMs: f.tMs })),
      ...raw.events.map((e) => ({ seq: e.seq, tMs: e.tMs })),
    ].sort((a, b) => a.seq - b.seq);
    expect(all.map((r) => r.seq)).toEqual([...all.keys()]);
    for (let i = 1; i < all.length; i++) expect(all[i].tMs).toBeGreaterThanOrEqual(all[i - 1].tMs);
  });

  it('keeps every frame verbatim, stamped with its arrival time', () => {
    expect(raw.frames).toHaveLength(session.frames.length);
    raw.frames.forEach((frame, i) => {
      expect(frame.tMs).toBe(session.frames[i].tArrival);
      expect(frame.source).toBe(session.frames[i].source);
      expect([...frame.bytes]).toEqual([...session.frames[i].bytes]);
      expect(frame.recordingId).toBe(raw.recording.id);
    });
    expect(decodeFrame(raw.frames[0].bytes).kind).toBe('weight');
  });

  it('logs connected, each command sent, and disconnected', () => {
    expect(raw.events.map((e) => e.type)).toEqual(['connected', 'command-sent', 'disconnected']);
    const [connected, sent, disconnected] = raw.events;
    expect(connected).toMatchObject({ tMs: 0, data: { deviceName: SIM_DEVICE.name } });
    expect(sent).toMatchObject({
      tMs: 5000,
      data: { command: 'tareAndStartTimer', param: null, hex: '030A0700000E', reason: 'auto-tare' },
    });
    expect(disconnected).toMatchObject({ tMs: 70_000, data: { reason: 'user' } });
  });

  it('makes records that pass the model normalisers unchanged', () => {
    expect(normaliseRecording(raw.recording)).toEqual(raw.recording);
    for (const frame of raw.frames) expect(normaliseRawFrame(frame)).toEqual(frame);
    for (const event of raw.events) expect(normaliseAppEvent(event)).toEqual(event);
  });

  it('ends the recording, with a deterministic id unless one is given', () => {
    expect(raw.recording).toMatchObject({
      transport: 'mock',
      endReason: 'user',
      endedAtEpochMs: raw.recording.startedAtEpochMs + 70_000,
    });
    expect(isId(raw.recording.id)).toBe(true);
    expect(toRawRecording(session).recording.id).toBe(raw.recording.id);
    const given = toRawRecording(session, { recordingId: raw.recording.id.replace(/.$/, '0') });
    expect(given.recording.id).not.toBe(raw.recording.id);
  });

  it('ends with the device when the scale switched off', () => {
    const off = simulateSession({
      seed: 1,
      durationMs: 10_000,
      script: [
        { type: 'command', atMs: 1000, command: tare() },
        { type: 'power-off', atMs: 3000 },
      ],
    });
    const offRaw = toRawRecording(off);
    expect(offRaw.recording.endReason).toBe('device');
    expect(offRaw.events.at(-1)).toMatchObject({
      tMs: off.truth.linkLostAtMs,
      data: { reason: 'device' },
    });
  });
});
