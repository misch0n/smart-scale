import { describe, expect, it } from 'vitest';
import { commandEventData, RecordingSequence, type AppEvent } from '../model';
import { setBuzzer, tare, tareAndStartTimer } from '../protocol';
import { Rng } from '../sim';
import { DEFAULT_SEGMENTATION_PARAMS } from './params';
import type { WeightSamples } from './samples';
import { zeroTrack } from './steps';

const STEP_S = 0.1;

/** Samples every 0.1 s for `durationS`, rounded to the frames' 0.01 g, with optional noise. */
function samplesOf(
  durationS: number,
  weight: (t: number) => number,
  options: { readonly noiseG?: number; readonly seed?: number } = {},
): WeightSamples {
  const rng = new Rng(options.seed ?? 1);
  const t: number[] = [];
  const weightG: number[] = [];
  for (let k = 0; k * STEP_S < durationS; k++) {
    t.push(k * STEP_S);
    const noise = (options.noiseG ?? 0) * rng.gaussian();
    weightG.push(Math.round((weight(k * STEP_S) + noise) * 100) / 100 + 0); // never −0
  }
  return { seq: t.map((_, k) => k), t, weightG };
}

function events(...list: readonly (readonly [tMs: number, data: Parameters<typeof sent>[2]])[]) {
  const sequence = new RecordingSequence('01923456-789a-7000-8000-000000000001');
  return list.map(([tMs, data]) => sent(sequence, tMs, data));
}

function sent(
  sequence: RecordingSequence,
  tMs: number,
  data: ReturnType<typeof commandEventData> & { readonly failed?: true },
): AppEvent {
  const { failed, ...command } = data;
  return failed
    ? sequence.event(tMs, 'command-failed', { ...command, error: 'GATT error' })
    : sequence.event(tMs, 'command-sent', command);
}

const track = (samples: WeightSamples, log: readonly AppEvent[] = []) =>
  zeroTrack(samples, log, DEFAULT_SEGMENTATION_PARAMS, STEP_S);

/** A vessel settling in or out with the simulator's 100 ms time constant. */
const settling = (fromG: number, toG: number, atS: number) => (t: number) =>
  t < atS ? fromG : toG + (fromG - toG) * Math.exp(-(t - atS) / 0.1);

describe('zeroTrack: tares', () => {
  it('takes off a logged tare at rest, which leaves one level', () => {
    const samples = samplesOf(6, (t) => (t < 3.05 ? 110 : 0));
    const result = track(samples, events([3000, commandEventData(tareAndStartTimer(), null)]));
    expect(result.steps).toHaveLength(1);
    const [step] = result.steps;
    expect(step).toMatchObject({ kind: 'tare', tareSource: 'command', startT: 3, endT: 3.1 });
    expect(step.sizeG).toBeCloseTo(-110, 9);
    expect(step.levelBeforeG).toBeCloseTo(110, 9);
    expect(step.levelAfterG).toBeCloseTo(110, 9);
    for (const value of result.samples.weightG) expect(value).toBeCloseTo(110, 9);
  });

  it('measures a tare during flow net of the flow, so the net weight runs on', () => {
    // 2 g/s throughout; the scale zeroes at 4.04 s, between the samples at 4.0 and 4.1 s.
    const samples = samplesOf(8, (t) => (t < 4.04 ? 2 * t : 2 * (t - 4.04)));
    const result = track(samples);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({ kind: 'tare', tareSource: 'jump', startT: 4 });
    expect(result.steps[0].sizeG).toBeCloseTo(-8.08, 1);
    result.samples.weightG.forEach((value, i) => {
      expect(value).toBeCloseTo(2 * result.samples.t[i], 1);
    });
  });

  it('takes the button for a single jump to 0 with no command, from a negative reading too', () => {
    // A tared cup lifted (−110), then the button zeroes the empty platform.
    const samples = samplesOf(4, (t) => (t < 2.02 ? -110 : 0), { noiseG: 0.015 });
    const result = track(samples);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({ kind: 'tare', tareSource: 'jump' });
    expect(result.steps[0].sizeG).toBeCloseTo(110, 1);
  });

  it('applies a logged tare too small to jump when its step is clear of the noise', () => {
    const samples = samplesOf(6, (t) => (t < 3.05 ? 0.3 : 0), { noiseG: 0.015 });
    const result = track(samples, events([3000, commandEventData(tare(), 'manual')]));
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({ kind: 'tare', tareSource: 'command' });
    expect(result.steps[0].sizeG).toBeCloseTo(-0.3, 1);
    expect(result.samples.weightG.at(-1)! - 0.3).toBeCloseTo(0, 1);
  });

  it('leaves a logged tare that meets a reading already at 0 alone, rather than add noise', () => {
    // The manual start during the pump's vibration, right after the auto-tare: no step.
    for (let seed = 1; seed <= 20; seed++) {
      const samples = samplesOf(6, () => 0, { noiseG: 0.1, seed });
      const result = track(samples, events([3000, commandEventData(tareAndStartTimer(), null)]));
      expect(result.steps).toEqual([]);
      expect(result.samples.weightG).toEqual(samples.weightG);
    }
  });

  it('ignores failed tare commands and commands that are no tare', () => {
    const samples = samplesOf(6, (t) => (t < 3.05 ? 0.3 : 0));
    const result = track(
      samples,
      events(
        [3000, { ...commandEventData(tare(), null), failed: true }],
        [3000, commandEventData(setBuzzer(1), null)],
      ),
    );
    expect(result.steps).toEqual([]);
  });

  it("doesn't apply a logged tare twice when the command went out twice", () => {
    const samples = samplesOf(6, (t) => (t < 3.05 ? 110 : 0));
    const log = events(
      [3000, commandEventData(tareAndStartTimer(), null)],
      [3010, commandEventData(tareAndStartTimer(), null)],
    );
    const result = track(samples, log);
    expect(result.steps.map((step) => step.kind)).toEqual(['tare']);
    expect(result.samples.weightG.at(-1)).toBeCloseTo(110, 9);
  });

  it('copes with a burst of samples that share one time', () => {
    const samples = samplesOf(6, (t) => (t < 3.05 ? 110 : 0));
    // Three frames held up by a stall arrive together at 3.3 s.
    const t = samples.t.map((value, i) => (i >= 31 && i <= 33 ? 3.3 : value));
    const result = track({ ...samples, t }, events([3000, commandEventData(tare(), null)]));
    expect(result.steps.map((step) => step.kind)).toEqual(['tare']);
    for (const value of result.samples.weightG) expect(value).toBeCloseTo(110, 9);
  });
});

describe('zeroTrack: other steps', () => {
  it('finds a vessel put on as it settles in', () => {
    const result = track(samplesOf(5, settling(0, 110, 1.02)));
    expect(result.steps).toHaveLength(1);
    const [step] = result.steps;
    expect(step).toMatchObject({ kind: 'cup-placed', tareSource: null, startT: 1 });
    expect(step.sizeG).toBeCloseTo(110, 0);
    expect(step.levelBeforeG).toBeCloseTo(0, 9);
    expect(step.levelAfterG).toBeCloseTo(110, 0);
    // The level after is read once the vessel has settled.
    expect(step.endT).toBeGreaterThanOrEqual(step.startT + 0.3);
  });

  it("tells a vessel lifted off a scale that wasn't tared from a tare: it settles out", () => {
    const samples = samplesOf(6, settling(110, 0, 3.02));
    const result = track(samples);
    expect(result.steps.map((step) => step.kind)).toEqual(['cup-removed']);
    expect(result.steps[0].sizeG).toBeCloseTo(-110, 0);
    expect(result.samples.weightG).toEqual(samples.weightG); // nothing to add back
  });

  it('starts a lift at the sample it had already moved, too little for a jump', () => {
    // Lifted 0.5 ms before the sample at 3 s, which reads 0.75 g light: no jump at 10 Hz
    // (1.5 g), but far outside the noise. The level before must leave it out (D-035).
    const samples = samplesOf(6, settling(150, 0, 2.9995), { noiseG: 0.015 });
    expect(samples.weightG[30]).toBeLessThan(149.4);
    expect(samples.weightG[30]).toBeGreaterThan(148.6);
    const [lift] = track(samples).steps;
    expect(lift.kind).toBe('cup-removed');
    expect(lift.startT).toBeCloseTo(2.9, 9);
    expect(lift.levelBeforeG).toBeCloseTo(150, 1);
    // A lift right after a sample moves nothing early.
    const [clean] = track(samplesOf(6, settling(150, 0, 2.95), { noiseG: 0.015 })).steps;
    expect(clean.startT).toBeCloseTo(2.9, 9);
    expect(clean.levelBeforeG).toBeCloseTo(150, 1);
  });

  it('calls a step too small for a vessel something else, and ignores a knock', () => {
    const knock = (t: number) => (t >= 2 && t < 2.3 ? 10 * Math.sin((Math.PI * (t - 2)) / 0.3) : 0);
    const spoon = (t: number) => (t < 4 ? 0 : t < 4.1 ? 2.5 : 5);
    const result = track(samplesOf(7, (t) => 110 + knock(t) + spoon(t)));
    expect(result.steps.map((step) => step.kind)).toEqual(['other']);
    expect(result.steps[0].sizeG).toBeCloseTo(5, 1);
  });

  it('corrects a tare from the sample after its jump, whatever the readings after that', () => {
    // Quantised readings: one quantum on the first sample after the tare, then exactly 0. That
    // sample counts into the transition, which ends after it, but the tare's correction starts
    // at the sample after its jump (D-062): from the end, it would leave that one at the old
    // zero, a spike of the tare's size.
    const weight = (t: number) => (t < 3.05 ? 148 : t < 3.15 ? 0.1 : 0);
    for (const log of [[], events([3000, commandEventData(tareAndStartTimer(), null)])]) {
      const result = track(samplesOf(8, weight), log);
      expect(result.steps.map((step) => step.kind)).toEqual(['tare']);
      expect(result.steps[0].endT).toBeCloseTo(3.2, 9);
      // One level throughout, give or take the blip in the tare's fitted size: no spike.
      for (const value of result.samples.weightG) expect(Math.abs(value - 148)).toBeLessThan(0.15);
    }
  });

  it('ignores a knock that falls back by less than a jump at a time (T1.13)', () => {
    // Up 2.6 g in one jump, then back down in two moves of 1.2 and 1.4 g, under the 1.5 g that
    // makes a jump at 10 Hz. The sample still up at 1.4 g belongs to the knock, not the level.
    const knock = (t: number) => (t >= 2.95 && t < 3.05 ? 2.6 : t >= 3.05 && t < 3.15 ? 1.4 : 0);
    const result = track(samplesOf(7, (t) => 110 + knock(t), { noiseG: 0.015 }));
    expect(result.steps).toEqual([]);
  });

  it('measures a vessel still settling by less than a jump from the level it settles to', () => {
    // A spoon of 2 g: the first sample after it reads 1.6 g, the rest 2 g.
    const spoon = (t: number) => (t < 2.95 ? 0 : t < 3.05 ? 1.6 : 2);
    const [step] = track(samplesOf(6, (t) => 110 + spoon(t), { noiseG: 0.015 })).steps;
    expect(step.kind).toBe('other');
    expect(step.endT).toBeCloseTo(3.1, 9);
    expect(step.sizeG).toBeCloseTo(2, 1);
    expect(step.levelAfterG).toBeCloseTo(112, 1);
  });

  it('keeps a knock as a transient, and counts each step’s jumps', () => {
    const knock = (t: number) => (t >= 2 && t < 2.3 ? 10 * Math.sin((Math.PI * (t - 2)) / 0.3) : 0);
    const spoon = (t: number) => (t < 4 ? 0 : 5);
    const result = track(samplesOf(7, (t) => settling(0, 110, 0.5)(t) + knock(t) + spoon(t)));
    expect(result.steps.map((step) => step.kind)).toEqual(['cup-placed', 'other']);
    // The cup settles in over several jumps; the spoon is one.
    expect(result.steps.map((step) => step.jumps > 1)).toEqual([true, false]);
    // From the last sample before it to the first clean one after: its two jumps, up and down,
    // count as settling, as a vessel's do (`settleS`).
    expect(result.transients).toHaveLength(1);
    const [transient] = result.transients;
    expect([transient.startT, transient.jumps]).toEqual([2, 2]);
    expect(transient.endT).toBeCloseTo(2.6, 9);
  });

  it('takes a push that lingers at its deepest for one transient, not a cup lifted and put back', () => {
    // −60 g over 1.5 s, half a sine: at its deepest the readings move by less than a jump for
    // two samples, which splits it into two runs of jumps, each the size of a vessel.
    const push = (t: number) => (t >= 3 && t < 4.5 ? -60 * Math.sin((Math.PI * (t - 3)) / 1.5) : 0);
    const result = track(samplesOf(8, (t) => 110 + push(t), { noiseG: 0.015 }));
    expect(result.steps).toEqual([]);
    expect(result.transients).toHaveLength(1);
    expect(result.transients[0].startT).toBeLessThan(3.2);
    expect(result.transients[0].endT).toBeGreaterThan(4.3);
    // A cup lifted and put back on a second later is no transient: two vessel steps.
    const lifted = (t: number) => (t < 4.2 ? settling(110, 0, 3)(t) : settling(0, 110, 4.2)(t));
    const kinds = track(samplesOf(8, lifted)).steps.map((step) => step.kind);
    expect(kinds).toEqual(['cup-removed', 'cup-placed']);
  });

  it('lists steps in time order, levels on the zero-tracked series', () => {
    // A cup goes on, the app tares it, the cup comes off again.
    const weight = (t: number) =>
      t < 4.04 ? settling(0, 110, 1.02)(t) : t < 7.02 ? 0 : settling(0, -110, 7.02)(t);
    const result = track(
      samplesOf(10, weight),
      events([4000, commandEventData(tareAndStartTimer(), null)]),
    );
    expect(result.steps.map((step) => step.kind)).toEqual(['cup-placed', 'tare', 'cup-removed']);
    const removed = result.steps[2];
    expect(removed.levelBeforeG).toBeCloseTo(110, 1);
    expect(removed.levelAfterG).toBeCloseTo(0, 0);
  });
});
