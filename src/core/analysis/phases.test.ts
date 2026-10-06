import { describe, expect, it } from 'vitest';
import {
  createAppEvent,
  type AppEvent,
  type BrewPhase,
  type MeasuredPhase,
  type PhaseChangeState,
} from '../model';
import { simulateSession, toRawRecording, type Scenario } from '../sim';
import { measurePhases, phasesOfShots, type PhaseMeasurement, type ShotPhaseKeys } from './phases';
import { analyzeRaw } from './recording-analysis';
import type { StableStretch } from './stability';
import type { Step, StepKind } from './steps';

/**
 * A brew in phases: the dosing cup (41 g) and 17.2 g of beans poured into it, lifted to the
 * grinder; back with 16.9 g of grounds; the cup (110 g) and its shot; the jug (181.4 g) and 100 g
 * of milk.
 */
const BREW: Scenario = {
  seed: 5,
  durationMs: 140_000,
  script: [
    { type: 'cup-on', atMs: 1000, massG: 41 },
    { type: 'shot', atMs: 4000, yieldG: 17.2, preInfusionMs: 500, extractionMs: 5000 },
    { type: 'cup-off', atMs: 16_000 },
    { type: 'cup-on', atMs: 40_000, massG: 41, contentsG: 16.9 },
    { type: 'cup-off', atMs: 48_000 },
    { type: 'cup-on', atMs: 52_000, massG: 110 },
    { type: 'shot', atMs: 58_000 },
    { type: 'cup-off', atMs: 100_000 },
    { type: 'cup-on', atMs: 104_000, massG: 181.4 },
    { type: 'shot', atMs: 108_000, yieldG: 100, preInfusionMs: 500, extractionMs: 8000 },
    { type: 'cup-off', atMs: 130_000 },
  ],
};

const raw = toRawRecording(simulateSession(BREW));
let seq = 1_000_000;

/** A phase change logged at `atMs`, as the capture flow logs it. */
function change(
  atMs: number,
  phase: BrewPhase,
  state: PhaseChangeState = 'open',
  by = 'container',
): AppEvent {
  return createAppEvent(raw.recording.id, seq++, atMs, 'ui-action', {
    action: 'phase',
    detail: { phase, state, by },
  });
}

/** The flow as the app logs it: each phase opens as its container is recognised. */
const FLOW = [
  change(4000, 'beans'),
  change(44_000, 'grind'),
  change(56_000, 'extraction'),
  change(58_000, 'extraction', 'open', 'pump'),
  change(108_000, 'milk'),
  change(128_000, 'milk', 'done', 'user'),
];

function analyse(events: readonly AppEvent[]) {
  return analyzeRaw({ frames: raw.frames, events: [...raw.events, ...events] }).analysis;
}

describe('measurePhases', () => {
  it('measures the beans, the grounds the dosing cup came back with, and the milk', () => {
    const { phases } = analyse(FLOW);
    expect(phases.map(({ phase }) => phase)).toEqual(['beans', 'grind', 'milk']);
    const [beans, grind, milk] = phases;
    expect(beans.vesselG).toBeCloseTo(41, 0);
    // Not the grounds: the cup back with them is still on as the grind opens, so it is the
    // grind's.
    expect(beans.resultG).toBeCloseTo(17.2, 1);
    // Its vessel is the beans' one, so what it carried is the grounds.
    expect(grind.vesselG).toBe(beans.vesselG);
    expect(grind.resultG).toBeCloseTo(16.9, 0);
    expect(milk.vesselG).toBeCloseTo(181.4, 0);
    expect(milk.resultG).toBeCloseTo(100, 0);
    expect(milk.endT).toBeCloseTo(128, 3);
    expect(beans.endT).toBeCloseTo(44, 3);
  });

  it('measures nothing without the log, or for a phase with nothing put on', () => {
    expect(analyse([]).phases).toEqual([]);
    const { phases } = analyse([change(20_000, 'beans', 'open', 'user'), change(30_000, 'grind')]);
    expect(phases.map(({ resultG }) => resultG)).toEqual([null, null]);
  });

  it('counts a grind cup put on empty from where it was put on', () => {
    const { segmentation } = analyzeRaw({ frames: raw.frames, events: raw.events });
    // A grind phase opened by hand on the cup (put on at 52 s): a vessel of its own, put on
    // empty, and the shot poured into it counts as grounds would.
    const [grind] = measurePhases(segmentation, [change(53_000, 'grind', 'open', 'user')], 100);
    expect(grind.vesselG).toBeCloseTo(110, 0);
    expect(grind.resultG).toBeCloseTo(38, 0);
  });

  it('reads the jug until it is lifted when Done is tapped as the milk still pours', () => {
    const early = FLOW.map((event) =>
      event === FLOW.at(-1) ? change(112_000, 'milk', 'done', 'user') : event,
    );
    const milk = analyse(early).phases.at(-1);
    expect(milk).toMatchObject({ phase: 'milk', endT: 112 });
    expect(milk?.resultG).toBeCloseTo(100, 0);
  });

  it('takes a pour fast enough to look like a vessel put on for what went into the jug', () => {
    // The jug (181.4 g) at 10 s, 200 g of milk poured in at once at 20 s, lifted at 40 s.
    const levels = {
      steps: [
        step('cup-placed', 10, 0, 181.4),
        step('cup-placed', 20, 181.4, 381.4),
        step('cup-removed', 40, 381.4, 0),
      ],
      stretches: [stretch(11, 19, 181.4), stretch(21, 39, 381.4), stretch(41, 50, 0)],
    };
    const [milk] = measurePhases(
      levels,
      [change(13_000, 'milk'), change(35_000, 'milk', 'done', 'user')],
      50,
    );
    expect(milk).toMatchObject({ vesselG: 181.4, resultG: 200 });
  });

  it('keeps the phase going through a re-open, and ends it at a skip', () => {
    const { phases } = analyse([
      change(4000, 'beans'),
      change(6000, 'beans', 'open', 'user'),
      change(30_000, 'beans', 'skipped', 'user'),
    ]);
    expect(phases).toHaveLength(1);
    expect(phases[0]).toMatchObject({ startT: 4, endT: 30 });
  });
});

describe('phasesOfShots', () => {
  const ID_A = '01a10000-0000-7000-8000-00000000000a';
  const ID_B = '01a10000-0000-7000-8000-00000000000b';
  const measured = (phase: MeasuredPhase, startT: number, resultG: number): PhaseMeasurement => ({
    phase,
    startT,
    endT: startT + 10,
    vesselG: 41,
    resultG,
  });
  // A brew ended by its ✕ weighed beans and grounds; the next weighed beans only, and its shot
  // then a jug of milk; the shot after it, none.
  const phases = [
    measured('beans', 10, 17.2),
    measured('grind', 40, 16.9),
    measured('beans', 100, 18),
    measured('milk', 220, 120),
  ];
  const shot = (
    id: string,
    anchorTMs: number,
    states: Partial<Pick<ShotPhaseKeys, 'beansPhase' | 'grindPhase' | 'milkPhase'>> = {},
  ): ShotPhaseKeys => ({
    id,
    anchorTMs,
    beansPhase: null,
    grindPhase: null,
    milkPhase: null,
    ...states,
  });

  it('gives each shot the last beans and grind before it, and the milk after it', () => {
    const results = phasesOfShots(phases, [shot(ID_A, 200_000), shot(ID_B, 300_000)]);
    expect(results.get(ID_A)).toEqual({ beansG: 18, groundG: 16.9, milkG: 120 });
    expect(results.get(ID_B)).toEqual({ beansG: null, groundG: null, milkG: null });
  });

  it('gives a shot nothing for a phase its brew skipped (T2.15)', () => {
    const results = phasesOfShots(phases, [
      shot(ID_A, 200_000, { beansPhase: 'done', grindPhase: 'skipped', milkPhase: 'skipped' }),
    ]);
    // The grounds were the ended brew's; the milk was skipped.
    expect(results.get(ID_A)).toEqual({ beansG: 18, groundG: null, milkG: null });
  });
});

/** A step from `levelBeforeG` to `levelAfterG` at `t`, s. */
function step(kind: StepKind, t: number, levelBeforeG: number, levelAfterG: number): Step {
  return {
    kind,
    tareSource: null,
    startT: t,
    endT: t + 0.5,
    sizeG: levelAfterG - levelBeforeG,
    levelBeforeG,
    levelAfterG,
    jumps: 1,
  };
}

/** A stable stretch at `levelG` from `startT` to `endT`, s. */
function stretch(startT: number, endT: number, levelG: number): StableStretch {
  return {
    startIndex: startT * 10,
    endIndex: endT * 10,
    startT,
    endT,
    levelG,
    sigmaG: 0.02,
    sampleCount: (endT - startT) * 10,
  };
}
