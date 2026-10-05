/**
 * The whole analysis against the simulator's ground truth (T1.14 acceptance): raw frames and
 * events in, metrics out. The agreed targets (D-035, D-036) hold on the scale they were agreed
 * on (`AGREED_SCALE`, D-046); on the scale's real 0.1 g steps the tolerances are D-037's.
 */

import { describe, expect, it } from 'vitest';
import { createIdGenerator, createShot, SchemaError, type RawFrame } from '../model';
import { xorChecksum } from '../protocol';
import { median } from '../signal';
import {
  espressoScenario,
  simulateSession,
  toRawRecording,
  demoScenario,
  type EspressoScenarioOptions,
  type Scenario,
  type ShotTruth,
} from '../sim';
import { parseRecordingAnalysis } from './analysis-schema';
import { resolveAnalysisParams } from './params';
import { analyzeRaw, analyzeRecording, type SegmentAnalysis } from './recording-analysis';
import { AGREED_SCALE, absQuantile, phasedPumpOnMs, seeds } from './test-runs';
import { ANALYSIS_VERSION } from './version';

function analyse(scenario: Scenario, frames?: (frames: RawFrame[]) => RawFrame[]) {
  const session = simulateSession(scenario);
  const raw = toRawRecording(session);
  const input = { frames: frames ? frames([...raw.frames]) : raw.frames, events: raw.events };
  return { session, raw, input, run: analyzeRaw(input) };
}

/** Each metric less the truth (relative for flow and τ); null where the metric is. */
function errors(segment: SegmentAnalysis, truth: ShotTruth) {
  const m = segment.metrics;
  const less = (got: number | null, want: number | null) =>
    got === null || want === null ? null : got - want;
  return {
    firstDripS: less(m.firstDripS, truth.preInfusionMs / 1000),
    extractionS: less(m.extractionS, truth.extractionMs / 1000),
    totalS: less(m.totalS, truth.totalMs / 1000),
    flowRatio: less(m.averageFlowGps && m.averageFlowGps / truth.averageFlowGps, 1),
    pumpOffWeightG: less(m.pumpOffWeightG, truth.weightAtPumpOffG),
    yieldG: less(m.yieldG, truth.yieldG),
    honestYieldG: less(m.honestYieldG, truth.honestYieldG),
    tailMassG: less(m.tailMassG, truth.tailMassG),
    tauRatio: less(m.tauS && m.tauS / (truth.tailTauMs / 1000), 1),
  };
}

type Errors = ReturnType<typeof errors>;

/** One espresso shot per seed, pump_on's phase varied (D-036), and its errors. */
function shots(count: number, options: EspressoScenarioOptions = {}) {
  return seeds(count).map((seed) => {
    const { session, run } = analyse(
      espressoScenario({ seed, pumpOnMs: phasedPumpOnMs(seed), ...options }),
    );
    expect(run.analysis.segments).toHaveLength(1);
    const [segment] = run.analysis.segments;
    return { segment, errors: errors(segment, session.truth.shots[0]) };
  });
}

/** The errors of one metric, where it isn't null. */
const of = (all: readonly { errors: Errors }[], key: keyof Errors) =>
  all.map((shot) => shot.errors[key]).filter((error): error is number => error !== null);

describe('analyzeRaw: one shot on the agreed scale (0.01 g)', () => {
  const agreed = (() => {
    let all: ReturnType<typeof shots> | null = null;
    return () => (all ??= shots(40, { scale: AGREED_SCALE }));
  })();

  it('gives every metric of every shot within the agreed targets of the truth', () => {
    // first_drip within 0.7 s, pump_on within 0.5 s, pump_off within 0.2 s (D-035, D-036), and
    // their differences within the sums. Measured over 60 seeds: first-drip time 0.55 s at
    // worst, extraction 0.64 s, total 0.42 s, flow 3%, w(pump_off) 0.16 g, yield 0.02 g, honest
    // yield 0.03 g, tail mass 0.16 g, τ 6%.
    const all = agreed();
    for (const { segment, errors: e } of all) {
      expect(segment.espresso).toBe(true);
      expect(Math.abs(e.firstDripS!)).toBeLessThan(0.8);
      expect(Math.abs(e.extractionS!)).toBeLessThan(0.9);
      expect(Math.abs(e.totalS!)).toBeLessThan(0.7);
      expect(Math.abs(e.flowRatio!)).toBeLessThan(0.05);
      expect(Math.abs(e.pumpOffWeightG!)).toBeLessThan(0.35);
      expect(Math.abs(e.yieldG!)).toBeLessThan(0.05);
      expect(Math.abs(e.honestYieldG!)).toBeLessThan(0.05);
      expect(Math.abs(e.tailMassG!)).toBeLessThan(0.35);
      expect(Math.abs(e.tauRatio!)).toBeLessThan(0.1);
    }
    expect(absQuantile(of(all, 'firstDripS'), 0.5)).toBeLessThan(0.15);
    expect(absQuantile(of(all, 'extractionS'), 0.5)).toBeLessThan(0.1);
    expect(absQuantile(of(all, 'totalS'), 0.5)).toBeLessThan(0.1);
  });
});

describe('analyzeRaw: one shot on the real scale’s 0.1 g steps (D-037)', () => {
  it('gives what real shots will: pump_on late, now and then missing; the yield close', () => {
    // pump_on runs about 0.25 s late at 0.1 g and goes missing in about one shot in twelve
    // (D-037), which the first-drip time and the total take on. Measured over 60 seeds:
    // first-drip time median 0.20 s early, worst 0.91 s; extraction 0.62 s; yield 0.064 g; τ 25%.
    const all = shots(40);
    expect(all.every(({ segment }) => segment.espresso)).toBe(true);
    expect(of(all, 'firstDripS').length).toBeGreaterThanOrEqual(34);
    expect(Math.abs(median(of(all, 'firstDripS')))).toBeLessThan(0.4);
    expect(absQuantile(of(all, 'firstDripS'), 1)).toBeLessThan(1.2);
    expect(of(all, 'extractionS')).toHaveLength(40);
    expect(absQuantile(of(all, 'extractionS'), 1)).toBeLessThan(0.9);
    expect(absQuantile(of(all, 'flowRatio'), 1)).toBeLessThan(0.05);
    expect(of(all, 'yieldG')).toHaveLength(40);
    expect(absQuantile(of(all, 'yieldG'), 1)).toBeLessThan(0.1);
    expect(absQuantile(of(all, 'honestYieldG'), 1)).toBeLessThan(0.1);
    expect(absQuantile(of(all, 'tauRatio'), 1)).toBeLessThan(0.3);
  });

  it('without the pump’s vibration, leaves the first-drip time and total null (Q4)', () => {
    // The regime change finds pump_off, and the draining tail makes the shot look like
    // espresso. Measured over 40 seeds: extraction 0.14 s at worst, yield 0.045 g.
    const all = shots(20, { scale: { vibrationSigmaG: 0 } });
    for (const { segment, errors: e } of all) {
      expect(segment.markers.pumpOn).toBeNull();
      expect(segment.flags).toContain('no-vibration');
      expect(segment.markers.pumpOff?.detector).toBe('regime-change');
      expect(segment.metrics.firstDripS).toBeNull();
      expect(segment.metrics.totalS).toBeNull();
      expect(segment.espresso).toBe(true);
      expect(Math.abs(e.extractionS!)).toBeLessThan(0.25);
      expect(Math.abs(e.yieldG!)).toBeLessThan(0.1);
    }
  });
});

describe('analyzeRaw: a recording', () => {
  it('stamps the version and every parameter, overrides included', () => {
    const { input, run } = analyse(espressoScenario({ seed: 1 }));
    expect(run.analysis.analysisVersion).toBe(ANALYSIS_VERSION);
    expect(run.analysis.params).toEqual(resolveAnalysisParams());
    const overrides = {
      timeline: { minFitSpanMs: 20_000 },
      segmentation: { minRiseS: 2 },
      liquid: { sgWindowS: 0.7 },
      pump: { vibrationRatio: 6 },
    };
    const changed = analyzeRaw(input, overrides).analysis.params;
    expect(changed).toEqual(resolveAnalysisParams(overrides));
    expect(changed.liquid.sgWindowS).toBe(0.7);
    expect(changed.timeline.minFitSpanMs).toBe(20_000);
    expect(() => analyzeRaw(input, { pump: { vibrationRatio: 0 } })).toThrow(RangeError);
  });

  it('is pure, and its result survives a JSON round trip through the schema unchanged', () => {
    const scenarios = [espressoScenario({ seed: 2 }), demoScenario(3)];
    for (const scenario of scenarios) {
      const { input, run } = analyse(scenario);
      expect(analyzeRaw(input).analysis).toEqual(run.analysis);
      const json: unknown = JSON.parse(JSON.stringify(run.analysis));
      expect(parseRecordingAnalysis(json)).toEqual(run.analysis);
    }
  });

  it('summarises the timeline and keeps the steps', () => {
    const { run } = analyse(espressoScenario({ seed: 1 }));
    const { analysis, timeline } = run;
    expect(analysis.timeline.frames).toBe(timeline.samples.length);
    expect(analysis.timeline.deviceTimedFrames).toBeGreaterThan(0);
    expect(analysis.timeline.intervalMs).toBeCloseTo(100.7, 0);
    expect(analysis.steps.map((step) => step.kind)).toEqual(['cup-placed', 'tare', 'cup-removed']);
    expect(analysis.quantisationG).toBe(0.1);
    expect(analysis.flags).toEqual([]);
    expect(run.markers).toHaveLength(1);
  });

  it('analyses two shots into one cup, each net of the one before', () => {
    const { session, run } = analyse({
      seed: 4,
      durationMs: 140_000,
      script: [
        { type: 'cup-on', atMs: 2000, massG: 110 },
        { type: 'shot', atMs: 8000 },
        { type: 'shot', atMs: 70_000, yieldG: 30 },
        { type: 'cup-off', atMs: 130_000 },
      ],
    });
    const [first, second] = run.analysis.segments;
    const [truthFirst, truthSecond] = session.truth.shots;
    expect(run.analysis.segments).toHaveLength(2);
    expect(first.window.end).toBe('next-shot');
    expect(first.metrics.honestYieldG).toBeNull(); // the cup stayed on for the next shot
    expect(Math.abs(errors(first, truthFirst).yieldG!)).toBeLessThan(0.1);
    expect(second.window.end).toBe('cup-removed');
    expect(Math.abs(errors(second, truthSecond).yieldG!)).toBeLessThan(0.1);
    expect(Math.abs(errors(second, truthSecond).honestYieldG!)).toBeLessThan(0.1);
    expect(Math.abs(errors(second, truthSecond).extractionS!)).toBeLessThan(0.5);
    expect(first.espresso && second.espresso).toBe(true);
  });

  it('analyses the demo: two cups, and a tare-button press in a tail that changes nothing', () => {
    const { session, run } = analyse(demoScenario(1));
    expect(run.analysis.segments).toHaveLength(2);
    expect(run.analysis.steps.filter((step) => step.kind === 'tare')).toHaveLength(1);
    run.analysis.segments.forEach((segment, i) => {
      const e = errors(segment, session.truth.shots[i]);
      expect(Math.abs(e.yieldG!)).toBeLessThan(0.1);
      expect(Math.abs(e.honestYieldG!)).toBeLessThan(0.1);
      expect(Math.abs(e.extractionS!)).toBeLessThan(0.5);
    });
  });

  it('analyses a recording that stops during the shot, as the capture flow will (T1.18)', () => {
    const scenario = espressoScenario({ seed: 2 });
    const cut = (atMs: number) => (frames: RawFrame[]) =>
      frames.filter((frame) => frame.tMs < atMs);
    const [truth] = simulateSession(scenario).truth.shots;

    // Before the pump stops: what the pump-on and first-drip markers give, nothing more.
    const during = analyse(scenario, cut(truth.pumpOffMs - 5000)).run.analysis.segments[0];
    expect(during.window.end).toBe('recording-end');
    expect(during.markers.pumpOff).toBeNull();
    expect(during.flags).toContain('no-pump-off');
    expect(during.metrics.firstDripS).not.toBeNull();
    expect(during.metrics.yieldG).toBeNull();

    // Ten seconds after: the tail has settled, so everything but the honest yield.
    const after = analyse(scenario, cut(truth.pumpOffMs + 10_000)).run.analysis.segments[0];
    expect(after.window.end).toBe('recording-end');
    expect(Math.abs(errors(after, truth).yieldG!)).toBeLessThan(0.1);
    expect(Math.abs(errors(after, truth).extractionS!)).toBeLessThan(0.5);
    expect(after.metrics.honestYieldG).toBeNull();
  });

  it('flags frames refused for their unit byte, on the recording and on the shot (D-005)', () => {
    // Frames from 20 s to 21 s with an unknown unit byte, their checksums made good again.
    const ounces = (frames: RawFrame[]) =>
      frames.map((frame) => {
        if (frame.source !== 'ff11' || frame.tMs < 20_000 || frame.tMs >= 21_000) return frame;
        const bytes = new Uint8Array(frame.bytes);
        bytes[5] = 0x02;
        bytes[bytes.length - 1] = xorChecksum(bytes.subarray(0, bytes.length - 1));
        return { ...frame, bytes };
      });
    const { session, run } = analyse(espressoScenario({ seed: 1, scale: AGREED_SCALE }), ounces);
    const refused = run.analysis.refusedFrames;
    expect(refused).toBeGreaterThanOrEqual(9);
    expect(refused).toBeLessThanOrEqual(11);
    expect(run.analysis.flags).toEqual(['refused-frames']);
    const [segment] = run.analysis.segments;
    expect(segment.refusedFrames).toBe(refused);
    expect(segment.flags).toContain('refused-frames');
    // A second of the extraction is missing, and the yield still reads right.
    expect(Math.abs(errors(segment, session.truth.shots[0]).yieldG!)).toBeLessThan(0.05);
  });

  it('keeps a pour without the pump, such as beans, as a segment that isn’t espresso', () => {
    // No vibration, liquid from the start at a steady rate, and an abrupt stop.
    const { run } = analyse(
      espressoScenario({
        seed: 1,
        scale: { vibrationSigmaG: 0 },
        shot: { preInfusionMs: 1, extractionMs: 12_000, tailTauMs: 30, flowProfile: [[0, 1]] },
      }),
    );
    const [segment] = run.analysis.segments;
    expect(segment.espresso).toBe(false);
    expect(segment.markers.pumpOn).toBeNull();
    expect(segment.tail).toBeNull();
    expect(segment.flags).toEqual(expect.arrayContaining(['no-vibration', 'tail-too-short']));
  });
});

describe('analyzeRecording', () => {
  const newId = createIdGenerator({ now: () => Date.UTC(2026, 9, 5) });

  it('matches the shots and asks for post-hoc shots where none claims an espresso', () => {
    const { session, input } = analyse(demoScenario(1));
    const [firstTruth] = session.truth.shots;
    const recordingId = newId();
    // A live shot, "done" five seconds after the first shot's pump stopped.
    const live = createShot(
      { recordingId, anchorTMs: firstTruth.pumpOffMs + 5000, source: 'live', doseG: 18 },
      0,
    );
    const { analysis, matching } = analyzeRecording(input, [live]);
    expect(matching.claims).toEqual([live.id, null]);
    expect(matching.shots[0].ratio).toBeCloseTo(analysis.segments[0].metrics.yieldG! / 18, 12);
    // The second shot gets one, anchored at its start: pump_on, else first_drip.
    const second = analysis.segments[1];
    const start = second.markers.pumpOn?.t ?? second.markers.firstDrip!.t;
    expect(matching.postHoc).toEqual([{ segment: 1, anchorTMs: Math.round(start * 1000) }]);
  });
});

describe('parseRecordingAnalysis', () => {
  const { analysis } = analyse(espressoScenario({ seed: 1 })).run;
  const json = () => JSON.parse(JSON.stringify(analysis)) as Record<string, unknown>;

  it('refuses a malformed result, naming where', () => {
    const broken = json() as { segments: { espresso: unknown }[] };
    broken.segments[0].espresso = 'yes';
    expect(() => parseRecordingAnalysis(broken)).toThrow(SchemaError);
    expect(() => parseRecordingAnalysis(broken)).toThrow('analysis.segments[0].espresso');
    const badFlag = json() as { flags: string[] };
    badFlag.flags = ['made-up'];
    expect(() => parseRecordingAnalysis(badFlag)).toThrow('analysis.flags[0]');
    const noParams = json();
    delete noParams.params;
    expect(() => parseRecordingAnalysis(noParams)).toThrow('analysis.params');
    expect(() => parseRecordingAnalysis(null)).toThrow(SchemaError);
  });

  it('fills a missing nullable field with null and drops unknown keys (D-018)', () => {
    const older = json() as { segments: { metrics: Record<string, unknown> }[]; extra?: number };
    delete older.segments[0].metrics.tauS;
    older.extra = 1;
    const parsed = parseRecordingAnalysis(older);
    expect(parsed.segments[0].metrics.tauS).toBeNull();
    expect('extra' in parsed).toBe(false);
  });
});
