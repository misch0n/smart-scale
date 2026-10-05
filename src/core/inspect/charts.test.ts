import { describe, expect, it } from 'vitest';
import { analyzeRaw, type SegmentAnalysis } from '../analysis';
import { createAppEvent, createRawFrame, type AppEvent, type RawFrame } from '../model';
import { median } from '../signal';
import { espressoScenario, Rng, simulateSession, toRawRecording } from '../sim';
import { encodeSoundFrame, SOUND_LAYOUT } from '../sound';
import { renderChart } from './chart';
import {
  commandLabel,
  detrendedVariance,
  eventMarks,
  recordingChart,
  segmentChart,
  segmentSpan,
  VARIANCE_WINDOW_S,
  type ChartInput,
} from './charts';
import { wellFormed } from './test-svg';

/** A simulated espresso shot, analysed: the simulator's default vibration, 0.1 g steps. */
function simulated(seed = 2) {
  const session = simulateSession(espressoScenario({ seed }));
  const raw = toRawRecording(session);
  return { session, raw, run: analyzeRaw(raw) };
}

/** `mic` frames every 50 ms over `toMs`, at levels that rise and fall (seq numbers aside). */
function micFrames(recordingId: string, toMs: number): RawFrame[] {
  const frames: RawFrame[] = [];
  for (let tMs = 25, seq = 1_000_000; tMs < toMs; tMs += 50, seq++) {
    const levels = SOUND_LAYOUT.measures.map((_, i) => -70 + 20 * Math.sin(tMs / 900 + i));
    frames.push(createRawFrame(recordingId, seq, tMs, 'mic', encodeSoundFrame(levels)));
  }
  return frames;
}

function input(overrides: Partial<ChartInput> = {}): ChartInput {
  const { raw, run } = simulated();
  return {
    label: 'simulated.json · recording test',
    frames: raw.frames,
    events: raw.events,
    run,
    truth: [],
    notes: [],
    ...overrides,
  };
}

describe('detrendedVariance', () => {
  it('estimates white noise’s variance about any smooth trend', () => {
    const rng = new Rng(7);
    const sigma = 0.1;
    const values = Array.from(
      { length: 2000 },
      (_, k) => 0.002 * k + 1e-5 * k * k + sigma * rng.gaussian(),
    );
    // The analysis's 0.5 s quadratic smoothing at 10 Hz: 5 samples.
    const smooth = values.map((_, k) => {
      if (k < 2 || k > values.length - 3) return Number.NaN;
      const w = [-3, 12, 17, 12, -3];
      return w.reduce((sum, c, j) => sum + c * values[k - 2 + j], 0) / 35;
    });
    const variance = detrendedVariance(values, smooth, 5, 10);
    const finite = variance.filter(Number.isFinite);
    expect(finite.length).toBeGreaterThan(1900);
    expect(median(finite) / sigma ** 2).toBeGreaterThan(0.85);
    expect(median(finite) / sigma ** 2).toBeLessThan(1.1);
  });

  it('leaves a gap where the window takes in one, and only there', () => {
    const values = Array.from({ length: 50 }, (_, k) => (k === 25 ? Number.NaN : k % 2));
    const variance = detrendedVariance(
      values,
      values.map(() => 0.5),
      5,
      10,
    );
    const missing = variance.flatMap((v, k) => (Number.isNaN(v) ? [k] : []));
    // The ends (half a window each) and the 11 windows that hold sample 25.
    expect(missing).toEqual([
      0, 1, 2, 3, 4, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 45, 46, 47, 48, 49,
    ]);
  });

  it('is all gaps for a series shorter than the smoothing', () => {
    expect(detrendedVariance([1, 2, 3], [1, 2, 3], 5, 10).every(Number.isNaN)).toBe(true);
  });
});

describe('segmentSpan', () => {
  const [segment] = simulated().run.analysis.segments;
  const at = (overrides: Partial<SegmentAnalysis['markers']>, windowEnd?: number) => ({
    ...segment,
    window: { ...segment.window, endT: windowEnd ?? segment.window.endT },
    markers: { ...segment.markers, ...overrides },
  });

  it('starts 5 s before the shot: the baseline’s end, pump_on, first_drip or a tap', () => {
    const { pumpOn } = segment.markers;
    expect(segmentSpan(segment)[0]).toBeCloseTo(
      Math.min(segment.window.baseline.endT, pumpOn!.t) - 5,
      9,
    );
    const tap = pumpOn!.t - 8;
    expect(segmentSpan(segment, [tap])[0]).toBeCloseTo(tap - 5, 9);
  });

  it('ends 8 s after it settles, or at the cup’s removal if that comes within 15 s', () => {
    const settledT = segment.markers.settled!.t;
    // The simulated cup comes off 30 s after pump_off: the chart stops after the settling.
    expect(segmentSpan(segment)[1]).toBeCloseTo(settledT + 8, 9);
    expect(segmentSpan(at({}, settledT + 12))[1]).toBeCloseTo(settledT + 13, 9);
  });

  it('shows at least 10 s', () => {
    const t = segment.window.baseline.endT;
    const short = at({ pumpOn: null, firstDrip: null, pumpOff: null, settled: null }, t + 1);
    const [from, to] = segmentSpan(short);
    expect(to - from).toBeGreaterThanOrEqual(10);
  });
});

describe('commandLabel and eventMarks', () => {
  it('names a command by its sub-command byte, as the docs do', () => {
    expect(commandLabel({ command: 'tareAndStartTimer', hex: '030A0700000E', param: null })).toBe(
      '07 tare + start',
    );
    expect(commandLabel({ command: 'setBuzzer', hex: '030A02000308', param: 3 })).toBe(
      '02 buzzer 3',
    );
  });

  it('marks commands, annotations and UI actions, and skips the bookkeeping', () => {
    const id = '019a1b2c-3d4e-7000-8000-0000000000a1';
    const events: AppEvent[] = [
      createAppEvent(id, 0, 1, 'connected', { deviceName: 'BOOKOO_SC', deviceId: null }),
      createAppEvent(id, 1, 2, 'smoothing-confirmed', { attempts: 1 }),
      createAppEvent(id, 2, 1500, 'annotation', { label: 'pump-on', text: null }),
      createAppEvent(id, 3, 1600, 'annotation', { label: 'note', text: 'channelled' }),
      createAppEvent(id, 4, 2500, 'ui-action', { action: 'manual-start', detail: null }),
    ];
    const marks = eventMarks(events);
    expect(marks.map((mark) => [mark.t, mark.label, mark.style])).toEqual([
      [1.5, '"pump-on"', 'dashed'],
      [1.6, '"channelled"', 'dashed'],
      [2.5, 'manual-start', 'dotted'],
    ]);
    expect(marks[1].title).toBe('note: channelled at 1.60 s');
  });
});

describe('segmentChart', () => {
  it('stacks the liquid, the flow and the detrended variance, with every marker labelled', () => {
    const chart = segmentChart(input(), 0);
    expect(chart.panels.map((panel) => panel.title)).toEqual([
      'liquid, g',
      'flow, g/s',
      'detrended variance, g² (log)',
    ]);
    const labels = chart.marks.flatMap((mark) => (mark.label === null ? [] : [mark.label]));
    for (const name of ['pump_on', 'first_drip', 'pump_off', 'settled']) {
      expect(labels.some((label) => label.startsWith(`${name} `))).toBe(true);
    }
    // The cup comes off 30 s after pump_off, beyond the chart; its mark is there all the same.
    expect(labels.some((label) => label.startsWith('cup_removed '))).toBe(true);
    expect(labels).toContain('07 tare + start');
    expect(wellFormed(renderChart(chart))).toBe(true);
  });

  it('draws the tail fit after pump_off, and the pump detectors’ noise levels', () => {
    const { run } = simulated();
    const chart = segmentChart(input({ run }), 0);
    const [liquid, flow, variance] = chart.panels;
    const tail = run.analysis.segments[0].tail!;
    const drain = liquid.series.find((series) => series.label.startsWith('tail fit'))!;
    expect(drain.t[0]).toBeCloseTo(run.analysis.segments[0].markers.pumpOff!.t, 9);
    expect(drain.values.at(-1)!).toBeCloseTo(tail.finalWeightG, 1);
    expect(flow.series.some((series) => series.label.startsWith('tail fit'))).toBe(true);
    const vibration = run.markers[0].pump.vibration!;
    expect(variance.levels.map((level) => level.value)).toContain(vibration.pumpVarG2);
  });

  it('reads the pump’s vibration at the detectors’ level in the pre-infusion', () => {
    const { run } = simulated();
    const [, , variance] = segmentChart(input({ run }), 0).panels;
    const { pumpOn, firstDrip } = run.analysis.segments[0].markers;
    const series = variance.series[0];
    const pre = series.values.filter(
      (v, k) =>
        Number.isFinite(v) &&
        series.t[k] > pumpOn!.t + VARIANCE_WINDOW_S &&
        series.t[k] < firstDrip!.t - VARIANCE_WINDOW_S,
    );
    const ratio = median(pre) / run.markers[0].pump.vibration!.pumpVarG2;
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(2);
  });

  it('draws the simulator’s truth dotted, and widens the span to its pump_on', () => {
    const { session, run } = simulated();
    const shot = session.truth.shots[0];
    const truth = [
      {
        index: 0,
        pumpOnT: shot.pumpOnMs / 1000 - 9,
        firstDripT: shot.firstDripMs / 1000,
        pumpOffT: shot.pumpOffMs / 1000,
        settledT: shot.settledMs / 1000,
        cupRemovedT: null,
      },
    ];
    const chart = segmentChart(input({ run, truth }), 0);
    const dotted = chart.marks.filter((mark) => mark.style === 'dotted' && mark.label === null);
    expect(dotted.map((mark) => mark.title)).toEqual([
      `shot 0: true pump_on ${truth[0].pumpOnT.toFixed(2)}`,
      `shot 0: true first_drip ${truth[0].firstDripT.toFixed(2)}`,
      `shot 0: true pump_off ${truth[0].pumpOffT.toFixed(2)}`,
      `shot 0: true settled ${truth[0].settledT.toFixed(2)}`,
    ]);
    expect(chart.span[0]).toBeCloseTo(truth[0].pumpOnT - 5, 9);
  });

  it('adds the sound levels when the recording has them', () => {
    const { raw, run } = simulated();
    const frames = [...raw.frames, ...micFrames(raw.recording.id, 60_000)];
    const chart = segmentChart(input({ run, frames }), 0);
    const sound = chart.panels[3];
    expect(sound.title).toBe('sound, dB');
    expect(sound.series.map((series) => series.label)).toEqual([
      'all',
      '50 Hz harmonics',
      '60 Hz harmonics',
    ]);
    expect(Math.min(...sound.series[0].t)).toBeGreaterThanOrEqual(chart.span[0]);
    expect(Math.max(...sound.series[0].t)).toBeLessThanOrEqual(chart.span[1]);
    expect(wellFormed(renderChart(chart))).toBe(true);
  });
});

describe('recordingChart', () => {
  it('shows the whole recording, its windows, its steps and its events', () => {
    const { raw, run } = simulated();
    const chart = recordingChart(input({ run, frames: raw.frames, events: raw.events }));
    expect(chart.span[0]).toBe(0);
    expect(chart.span[1]).toBeCloseTo(raw.events.at(-1)!.tMs / 1000, 9);
    const [weight] = chart.panels;
    expect(weight.bands.map((band) => band.label)).toEqual(['#0 espresso']);
    expect(weight.glyphs).toHaveLength(run.analysis.steps.length);
    expect(weight.series.map((series) => series.label)).toEqual([
      'as the scale sent it',
      'zero-tracked',
    ]);
    // The markers unlabelled, the events labelled.
    expect(
      chart.marks.filter((mark) => mark.style === 'solid' && mark.label === null),
    ).toHaveLength(5);
    expect(chart.marks.map((mark) => mark.label)).toContain('07 tare + start');
    expect(wellFormed(renderChart(chart))).toBe(true);
  });
});
