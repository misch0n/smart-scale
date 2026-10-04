/**
 * The timeline against the simulator's ground truth (T1.9 acceptance): each frame carries the
 * moment the scale took its sample. A device-timed frame's `t` should be that moment plus the
 * link's least latency (`minLatencyMs`), give or take the wait for the first connection event,
 * which is one constant per recording that no recording can reveal.
 */

import { describe, expect, it } from 'vitest';
import { stopTimer, tareAndStartTimer } from '../protocol';
import {
  espressoScenario,
  simulateSession,
  toRawRecording,
  type FrameTruth,
  type LinkParams,
  type Scenario,
} from '../sim';
import { buildTimeline, type Timeline, type TimelineSample } from './timeline';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

/** The link settings the acceptance names: the default, and ±50 ms of arrival jitter. */
const LINKS: readonly (readonly [string, Partial<LinkParams>])[] = [
  ['the default link', {}],
  ['±50 ms of exponential jitter', { jitterMeanMs: 25, connectionIntervalMs: 0 }],
  [
    'a 30 ms connection interval, 20 ms jitter and 2% stalls',
    { jitterMeanMs: 20, stallProbability: 0.02 },
  ],
];

function simulate(scenario: Scenario) {
  const session = simulateSession(scenario);
  const raw = toRawRecording(session);
  // toRawRecording keeps the frames in arrival order, as session.frames has them.
  const truth = new Map<number, FrameTruth>(
    raw.frames.map((frame, i) => [frame.seq, session.frames[i].truth]),
  );
  return { session, timeline: buildTimeline(raw.frames), truth };
}

type Simulated = ReturnType<typeof simulate>;

/** Each sample's error, ms: its time less its true sample time and the least latency. */
function error(sim: Simulated, sample: TimelineSample): number {
  const truth = sim.truth.get(sample.seq);
  if (!truth) throw new Error(`no truth for seq ${sample.seq}`);
  return sample.t * 1000 - (truth.sampleTMs + sim.session.link.minLatencyMs);
}

function deviceErrors(sim: Simulated, run?: number): number[] {
  return sim.timeline.samples
    .filter((s) => s.timeSource === 'device' && (run === undefined || s.run === run))
    .map((s) => error(sim, s));
}

/** The largest distance from the errors' median: the error, but for one constant offset. */
function spreadAroundMedian(errors: readonly number[]): number {
  const median = medianOf(errors);
  return Math.max(...errors.map((error) => Math.abs(error - median)));
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const isNonDecreasing = (timeline: Timeline): boolean =>
  timeline.samples.every((s, i) => i === 0 || s.t >= timeline.samples[i - 1].t);

describe('with the timer running', () => {
  it.each(LINKS)('times each frame within 5 ms of its sample, with %s', (_, link) => {
    for (const seed of SEEDS) {
      const sim = simulate(espressoScenario({ seed, link }));
      const errors = deviceErrors(sim);
      expect(errors.length).toBeGreaterThan(600); // the timer runs about 65 s at 10 Hz
      expect(spreadAroundMedian(errors)).toBeLessThan(5);
      expect(isNonDecreasing(sim.timeline)).toBe(true);
    }
  });

  it('is within 5 ms outright on the default link, the least latency aside', () => {
    for (const seed of SEEDS) {
      const errors = deviceErrors(simulate(espressoScenario({ seed })));
      expect(Math.max(...errors.map(Math.abs))).toBeLessThan(5);
    }
  });

  it("measures the scale clock's drift, and the link's jitter", () => {
    for (const seed of SEEDS) {
      const { timeline } = simulate(espressoScenario({ seed }));
      expect(timeline.runs).toHaveLength(1);
      expect(timeline.rateSource).toBe('fitted');
      expect(Math.abs((timeline.driftPpm ?? 0) - 300)).toBeLessThan(100);
      // The default link: a 15 ms floor, then up to 30 ms to the connection event, 8 ms mean.
      expect(timeline.jitter?.medianMs).toBeGreaterThan(5);
      expect(timeline.jitter?.medianMs).toBeLessThan(35);
      expect(timeline.nominalInterval?.source).toBe('device');
      expect(timeline.nominalInterval?.ms).toBeCloseTo(100 / 1.0003, 1);
    }
  });

  it('times by the timer every frame sampled while it ran', () => {
    const sim = simulate(espressoScenario({ seed: 3 }));
    const [started] = sim.session.truth.timer;
    const sampledWhileRunning = sim.timeline.samples.filter(
      (s) => (sim.truth.get(s.seq)?.sampleTMs ?? 0) > started.atMs,
    );
    const timed = sampledWhileRunning.filter((s) => s.timeSource === 'device');
    // All of them: the recording ends with the timer still running, so even the last counts.
    expect(timed.length).toBe(sampledWhileRunning.length);
  });
});

describe('without the timer', () => {
  it('uses arrival time when the timer never starts', () => {
    const sim = simulate(espressoScenario({ seed: 4, tareAndStartMs: null }));
    const { timeline } = sim;
    expect(timeline.runs).toEqual([]);
    expect(timeline.arrivalCorrectionMs).toBe(0);
    expect(timeline.samples.length).toBeGreaterThan(600);
    for (const sample of timeline.samples) {
      expect(sample.timeSource).toBe('arrival');
      expect(sample.t).toBe(sample.arrivalT);
    }
    expect(timeline.nominalInterval?.source).toBe('arrival');
  });

  it('falls back to arrival time once the timer stops, frozen at a non-zero value', () => {
    const scenario: Scenario = {
      seed: 5,
      durationMs: 60_000,
      script: [
        { type: 'cup-on', atMs: 1000, massG: 110 },
        { type: 'command', atMs: 5000, command: tareAndStartTimer() },
        { type: 'command', atMs: 40_000, command: stopTimer() },
      ],
    };
    const sim = simulate(scenario);
    const stopped = sim.session.truth.timer.find((change) => change.change === 'stop');
    expect(stopped?.valueMs).toBeGreaterThan(0);
    for (const sample of sim.timeline.samples) {
      const sampledMs = sim.truth.get(sample.seq)?.sampleTMs ?? 0;
      if (sampledMs > (stopped?.atMs ?? 0)) expect(sample.timeSource).toBe('arrival');
    }
    expect(sim.timeline.runs).toHaveLength(1);
    // The first frozen frame carries the moment the timer stopped, not its sample: left out.
    expect(sim.timeline.runs[0].endTimerMs).toBeLessThan(stopped?.valueMs ?? 0);
    expect(isNonDecreasing(sim.timeline)).toBe(true);
  });
});

describe('a restarted timer', () => {
  it('stitches two runs onto one time axis', () => {
    for (const seed of SEEDS) {
      const sim = simulate(espressoScenario({ seed }));
      const restarted = simulate({
        ...espressoScenario({ seed }),
        script: [
          ...espressoScenario({ seed }).script,
          { type: 'command', atMs: 40_000, command: tareAndStartTimer() },
        ],
      });
      expect(sim.timeline.runs).toHaveLength(1);
      const { timeline } = restarted;
      expect(timeline.runs).toHaveLength(2);
      expect(timeline.runs[1].startTimerMs).toBeLessThan(200);
      // Each run is as good as one alone. Each run's offset touches its own fastest frame, so
      // the two can sit a few ms apart: a seam far finer than the 100 ms between samples.
      for (const run of [0, 1])
        expect(spreadAroundMedian(deviceErrors(restarted, run))).toBeLessThan(5);
      const seam = medianOf(deviceErrors(restarted, 1)) - medianOf(deviceErrors(restarted, 0));
      expect(Math.abs(seam)).toBeLessThan(10);
      expect(isNonDecreasing(timeline)).toBe(true);
    }
  });

  it('shares the rate with a run too short to fit alone', () => {
    const base = espressoScenario({ seed: 6 });
    const sim = simulate({
      ...base,
      durationMs: 70_000,
      script: [
        ...base.script.filter((event) => event.type !== 'cup-off'),
        { type: 'command', atMs: 50_000, command: tareAndStartTimer() },
        { type: 'command', atMs: 58_000, command: stopTimer() },
      ],
    });
    const [long, short] = sim.timeline.runs;
    expect(sim.timeline.rateSource).toBe('fitted');
    expect(long.ownDriftPpm).not.toBeNull();
    expect(short.ownDriftPpm).toBeNull();
    expect(short.rate).toBe(long.rate);
    expect(spreadAroundMedian(deviceErrors(sim, 1))).toBeLessThan(5);
  });
});
