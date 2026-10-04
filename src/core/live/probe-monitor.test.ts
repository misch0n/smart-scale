import { describe, expect, it } from 'vitest';
import { RecordingSequence, type AppEvent, type RawFrame } from '../model';
import {
  decodeFrame,
  encodeEventFrame,
  encodeWeightFrame,
  SIGN_NEGATIVE,
  SIGN_POSITIVE,
  toHex,
  type WeightFrameInput,
} from '../protocol';
import { espressoScenario, simulateSession, toRawRecording, type Scenario } from '../sim';
import { ProbeMonitor } from './probe-monitor';

const ID_A = '0192a6b0-0000-7000-8000-000000000001';
const ID_B = '0192a6b0-0000-7000-8000-000000000002';

/** Frames and events made by hand, numbered like the recorder numbers them. */
class Feed {
  readonly sequence: RecordingSequence;
  readonly monitor: ProbeMonitor;

  constructor(monitor: ProbeMonitor, id = ID_A) {
    this.monitor = monitor;
    this.sequence = new RecordingSequence(id);
  }

  weight(tMs: number, input: Partial<WeightFrameInput> = {}): RawFrame {
    return this.bytes(tMs, 'ff11', encodeWeightFrame({ timerMs: 0, weightG: 0, ...input }));
  }

  bytes(tMs: number, source: 'ff11' | 'ff12', bytes: Uint8Array): RawFrame {
    const frame = this.sequence.frame(tMs, source, bytes);
    this.monitor.addFrame(frame, decodeFrame(frame.bytes));
    return frame;
  }

  annotate(tMs: number, label: string): AppEvent {
    const event = this.sequence.event(tMs, 'annotation', { label, text: null }) as AppEvent;
    this.monitor.addEvent(event);
    return event;
  }
}

/** Feeds a simulated session to a monitor, as the recorder's onFrame and onEvent would. */
function replay(scenario: Scenario, monitor = new ProbeMonitor()) {
  const session = simulateSession(scenario);
  const raw = toRawRecording(session);
  const records = [...raw.frames, ...raw.events].sort((a, b) => a.seq - b.seq);
  for (const record of records) {
    if ('bytes' in record) monitor.addFrame(record, decodeFrame(record.bytes));
    else monitor.addEvent(record);
  }
  return { session, raw, monitor, snapshot: monitor.snapshot() };
}

describe('ProbeMonitor', () => {
  it('starts empty', () => {
    const snapshot = new ProbeMonitor().snapshot();
    expect(snapshot.recordingId).toBeNull();
    expect(snapshot.counts).toEqual({ ff11: 0, ff12: 0 });
    expect(snapshot.frames).toEqual({ ff11: [], ff12: [] });
    expect(snapshot.timerGaps).toEqual({ advancing: null, still: 0, backwards: 0 });
    expect(snapshot.arrivalGaps).toBeNull();
    expect(snapshot.longestGap).toBeNull();
    expect(snapshot.weightWindows.map((w) => [w.windowMs, w.summary])).toEqual([
      [500, null],
      [2000, null],
      [10_000, null],
    ]);
    expect(snapshot.smallestWeightStepG).toBeNull();
    expect(snapshot.lastEventFrame).toBeNull();
    expect(snapshot.events).toEqual([]);
  });

  it('keeps the last 20 frames of each characteristic as hex, newest first', () => {
    const feed = new Feed(new ProbeMonitor());
    const frames: RawFrame[] = [];
    for (let i = 0; i < 25; i++) frames.push(feed.weight(i * 100, { timerMs: i * 100 }));
    const ff12 = feed.bytes(2600, 'ff12', Uint8Array.of(0x03, 0x0d, 0x0e));
    const snapshot = feed.monitor.snapshot();
    expect(snapshot.counts).toEqual({ ff11: 25, ff12: 1 });
    expect(snapshot.frames.ff11).toHaveLength(20);
    expect(snapshot.frames.ff11.map((f) => f.seq)).toEqual(
      frames
        .slice(5)
        .map((f) => f.seq)
        .reverse(),
    );
    expect(snapshot.frames.ff11[0].hex).toBe(toHex(frames[24].bytes));
    expect(snapshot.frames.ff11[0].decoded.kind).toBe('weight');
    expect(snapshot.frames.ff12).toEqual([
      { seq: ff12.seq, tMs: 2600, hex: '03 0D 0E', decoded: decodeFrame(ff12.bytes) },
    ]);
  });

  it('measures the timer: advancing gaps, and counts still and backward ones', () => {
    const feed = new Feed(new ProbeMonitor());
    const timers = [0, 0, 0, 100, 198, 302, 400, 0, 100];
    timers.forEach((timerMs, i) => feed.weight(i * 100, { timerMs }));
    // A frame with a bad checksum doesn't count: its timer can't be trusted.
    const bad = encodeWeightFrame({ timerMs: 50_000, weightG: 0 });
    bad[19] ^= 0xff;
    feed.bytes(950, 'ff11', bad);
    feed.weight(1000, { timerMs: 200 });
    const { timerGaps } = feed.monitor.snapshot();
    expect(timerGaps.still).toBe(2);
    expect(timerGaps.backwards).toBe(1);
    // 100, 98, 104, 98, 100 and 100
    expect(timerGaps.advancing!.count).toBe(6);
    expect(timerGaps.advancing!.min).toBe(98);
    expect(timerGaps.advancing!.max).toBe(104);
    expect(timerGaps.advancing!.mean).toBe(100);
  });

  it('measures arrival gaps on FF11, and the longest silence across both characteristics', () => {
    const feed = new Feed(new ProbeMonitor());
    feed.weight(0);
    feed.weight(90);
    feed.weight(200);
    feed.bytes(4200, 'ff12', encodeEventFrame({ stateByte: 1, timerMs: 0, weightG: 0 }));
    feed.weight(4300);
    const snapshot = feed.monitor.snapshot();
    expect(snapshot.arrivalGaps).toMatchObject({ count: 3, min: 90, max: 4100 });
    expect(snapshot.longestGap).toEqual({ ms: 4000, endTMs: 4200 });
  });

  it("gives the weight's mean and σ per window, from trusted weights only", () => {
    const feed = new Feed(new ProbeMonitor());
    // 10 Hz for 12 s: 10.00 g, with 10.02 g every other frame in the last 2 s.
    for (let i = 0; i <= 120; i++) {
      const weightG = i > 100 && i % 2 === 0 ? 10.02 : 10;
      feed.weight(i * 100, { weightG });
    }
    feed.weight(12_050, { weightG: 500, unitByte: 0x02 }); // ounces: refused (D-005)
    feed.weight(12_060, { weightG: 500, weightSignByte: 0x20 }); // unknown sign (D-014)
    const snapshot = feed.monitor.snapshot();
    expect(snapshot.untrustedWeights).toBe(2);
    const [half, two, ten] = snapshot.weightWindows.map((w) => w.summary!);
    expect(half.count).toBe(5); // 11.6 to 12.0 s
    expect(half.mean).toBeCloseTo((3 * 10.02 + 2 * 10) / 5, 9);
    expect(two.count).toBe(20);
    expect(two.mean).toBeCloseTo(10.01, 9);
    expect(two.sd).toBeCloseTo(0.01 * Math.sqrt(20 / 19), 9);
    expect(ten.count).toBe(100);
    expect(ten.max).toBe(10.02);
    expect(snapshot.smallestWeightStepG).toBe(0.02);
  });

  it('finds the smallest weight step, in whole hundredths', () => {
    const feed = new Feed(new ProbeMonitor());
    for (const [i, weightG] of [0.3, 0.6, 0.6, 0.7, 0.69, -0.02].entries()) {
      feed.weight(i * 100, { weightG });
    }
    expect(feed.monitor.snapshot().smallestWeightStepG).toBe(0.01);
  });

  it('lists the unit, sign and smoothing byte values seen (A9, A10, A13)', () => {
    const feed = new Feed(new ProbeMonitor());
    feed.weight(0, { weightG: 1, flowSmoothing: 1 });
    feed.weight(100, { weightG: -1, flowGps: -0.5 });
    feed.weight(200, { weightG: 1, unitByte: 0x02 });
    expect(feed.monitor.snapshot().seen).toEqual({
      unit: [0x01, 0x02],
      weightSign: [SIGN_POSITIVE, SIGN_NEGATIVE],
      flowSign: [SIGN_POSITIVE, SIGN_NEGATIVE],
      smoothing: [0, 1],
    });
  });

  it('keeps the latest 03 0D event frame and the latest 30 events, newest first', () => {
    const feed = new Feed(new ProbeMonitor());
    feed.bytes(100, 'ff12', encodeEventFrame({ stateByte: 1, timerMs: 0, weightG: 0 }));
    feed.bytes(900, 'ff11', encodeEventFrame({ stateByte: 0, timerMs: 800, weightG: 30.5 }));
    const events = Array.from({ length: 32 }, (_, i) => feed.annotate(1000 + i, `label-${i}`));
    const snapshot = feed.monitor.snapshot();
    expect(snapshot.lastEventFrame).toMatchObject({
      tMs: 900,
      frame: { state: 'stopped', timerMs: 800, weightG: 30.5 },
    });
    expect(snapshot.events).toHaveLength(30);
    expect(snapshot.events[0]).toBe(events[31]);
    expect(snapshot.events[29]).toBe(events[2]);
  });

  it('starts afresh for another recording, and on reset', () => {
    const monitor = new ProbeMonitor();
    const a = new Feed(monitor, ID_A);
    a.weight(0, { weightG: 5 });
    a.annotate(10, 'cup-on');
    expect(monitor.snapshot().recordingId).toBe(ID_A);
    const b = new Feed(monitor, ID_B);
    b.annotate(0, 'pump-on');
    let snapshot = monitor.snapshot();
    expect(snapshot.recordingId).toBe(ID_B);
    expect(snapshot.counts.ff11).toBe(0);
    expect(snapshot.events.map((e) => e.type === 'annotation' && e.data.label)).toEqual([
      'pump-on',
    ]);
    monitor.reset();
    snapshot = monitor.snapshot();
    expect(snapshot.recordingId).toBeNull();
    expect(snapshot.events).toEqual([]);
  });

  it('rejects sizes that are not positive integers', () => {
    expect(() => new ProbeMonitor({ frameLogSize: 0 })).toThrow(RangeError);
    expect(() => new ProbeMonitor({ gapCount: 2.5 })).toThrow(RangeError);
    expect(() => new ProbeMonitor({ weightWindowsMs: [-1] })).toThrow(RangeError);
  });
});

describe('ProbeMonitor on simulated sessions (ground truth)', () => {
  it('shows the sampling interval, the timer start on FF12 and the 0.01 g resolution', () => {
    const { session, raw, snapshot } = replay(
      espressoScenario({ scale: { timerEvents: 'ff12' }, link: { stallProbability: 0 } }),
    );
    const ff12 = raw.frames.filter((f) => f.source === 'ff12');
    expect(snapshot.counts).toEqual({ ff11: raw.frames.length - ff12.length, ff12: ff12.length });
    expect(ff12.length).toBeGreaterThan(0);
    expect(snapshot.frames.ff12[0].hex).toBe(toHex(ff12[ff12.length - 1].bytes));
    // The timer ran from the tare-and-start to the end: every recent gap is one sample.
    const period = session.scale.samplePeriodMs;
    expect(snapshot.timerGaps.still).toBe(0);
    expect(snapshot.timerGaps.backwards).toBe(0);
    expect(snapshot.timerGaps.advancing!.mean).toBeCloseTo(period, -0.5);
    expect(snapshot.arrivalGaps!.mean).toBeCloseTo(period, -0.5);
    expect(snapshot.smallestWeightStepG).toBe(session.scale.resolutionG);
    expect(snapshot.lastEventFrame?.frame.state).toBe('started');
    expect(snapshot.seen.smoothing).toEqual([0]);
    expect(snapshot.events[0].type).toBe('disconnected');
  });

  it('measures the noise floor on a still platform (A11)', () => {
    const noiseSigmaG = 0.05;
    const { snapshot } = replay({
      seed: 4,
      durationMs: 30_000,
      script: [{ type: 'cup-on', atMs: 0, massG: 110 }],
      scale: { noiseSigmaG, settleTauMs: 0 },
    });
    const ten = snapshot.weightWindows[2].summary!;
    expect(ten.count).toBeGreaterThan(90);
    expect(ten.mean).toBeCloseTo(110, 1);
    expect(ten.sd).toBeGreaterThan(noiseSigmaG * 0.8);
    expect(ten.sd).toBeLessThan(noiseSigmaG * 1.2);
  });

  it('shows pump vibration as a larger σ while the pump runs and nothing drips (A2)', () => {
    const vibrationSigmaG = 0.2;
    const sdAt = (stopMs: number) => {
      const scenario: Scenario = {
        seed: 5,
        durationMs: stopMs,
        // pump_on at 10 s; the shot's liquid lands from 10 s + 7 s of pre-infusion.
        script: [
          { type: 'cup-on', atMs: 0, massG: 110 },
          { type: 'shot', atMs: 10_000, preInfusionMs: 7000 },
        ],
        scale: { noiseSigmaG: 0.015, vibrationSigmaG, settleTauMs: 0 },
      };
      return replay(scenario).snapshot.weightWindows[1].summary!.sd;
    };
    const before = sdAt(9_900);
    const during = sdAt(16_000);
    expect(before).toBeLessThan(0.05);
    expect(during).toBeGreaterThan(vibrationSigmaG * 0.6);
  });
});
