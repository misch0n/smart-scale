import { describe, expect, it } from 'vitest';
import { STREAM_RECORDING_ID } from '../core/live/test-stream';
import {
  createEntity,
  RecordingSequence,
  type AppEvent,
  type Container,
  type ContainerRole,
  type RawFrame,
} from '../core/model';
import { decodeFrame, type DecodedFrame } from '../core/protocol';
import { ScaleSimulator, type Scenario } from '../core/sim';
import { Emitter } from '../transport/emitter';
import { LiveVessel } from './live-vessel';

const NOW = Date.UTC(2026, 9, 5, 7, 0);

function container(name: string, emptyMassG: number, roles: ContainerRole[] = ['cup']): Container {
  return createEntity('containers', { name, emptyMassG, roles, dismissedWarningIds: [] }, NOW);
}

const SCENARIO: Scenario = {
  seed: 3,
  durationMs: 30_000,
  script: [
    { type: 'cup-on', atMs: 1000, massG: 110 },
    { type: 'cup-off', atMs: 10_000 },
    { type: 'cup-on', atMs: 18_000, massG: 41 },
  ],
};

/** The mat (15.5 g) on at 1 s, the cup on it at 8 s, lifted at 16 s (T2.17). */
const MAT: Scenario = {
  seed: 3,
  durationMs: 30_000,
  script: [
    { type: 'mat-on', atMs: 1000, massG: 15.5 },
    { type: 'cup-on', atMs: 8000, massG: 110 },
    { type: 'cup-off', atMs: 16_000 },
  ],
};

/** A recorder's two streams, fed from the simulator up to each time asked. */
function fakeRecorder(scenario: Scenario = SCENARIO) {
  const frames = new Emitter<{ frame: RawFrame; decoded: DecodedFrame }>();
  const events = new Emitter<AppEvent>();
  const simulator = new ScaleSimulator(scenario);
  const sequence = new RecordingSequence(STREAM_RECORDING_ID);
  return {
    recorder: { onFrame: frames.on.bind(frames), onEvent: events.on.bind(events) },
    runTo(ms: number) {
      for (const frame of simulator.advanceTo(ms)) {
        const raw = sequence.frame(frame.tArrival, frame.source, frame.bytes);
        frames.emit({ frame: raw, decoded: decodeFrame(frame.bytes) });
      }
    },
  };
}

describe('LiveVessel', () => {
  it('recognises what is put on, takes a pick until it comes off, and says when', () => {
    const cup = container('Espresso cup', 110);
    const dosing = container('Dosing cup', 41);
    let containers: readonly Container[] = [cup, dosing];
    const feed = fakeRecorder();
    const vessel = new LiveVessel(feed.recorder, () => containers);
    let changes = 0;
    vessel.onChange(() => changes++);

    feed.runTo(800);
    expect(vessel.onScale).toBeNull();
    vessel.pick(cup.id); // nothing on: ignored
    expect(changes).toBe(0);

    feed.runTo(8000);
    expect(vessel.onScale).toMatchObject({
      container: cup,
      picked: null,
      match: { kind: 'known' },
    });
    expect(changes).toBeGreaterThan(0);

    // A pick overrides the match, for this vessel.
    const before = changes;
    vessel.pick(dosing.id);
    expect(changes).toBe(before + 1);
    expect(vessel.onScale).toMatchObject({ container: dosing, picked: dosing });

    // A container removed in Setup no longer counts as picked.
    containers = [cup, { ...dosing, removedAtEpochMs: NOW }];
    expect(vessel.onScale).toMatchObject({ container: cup, picked: null });
    containers = [cup, dosing];

    // Off, and the pick goes with it.
    feed.runTo(16_000);
    expect(vessel.onScale).toBeNull();
    feed.runTo(26_000);
    expect(vessel.onScale).toMatchObject({ container: dosing, picked: null });
  });

  it('reads the containers at every look', () => {
    const feed = fakeRecorder();
    let containers: readonly Container[] = [];
    const vessel = new LiveVessel(feed.recorder, () => containers);
    feed.runTo(8000);
    expect(vessel.onScale?.match).toEqual({ kind: 'unknown' });
    const cup = container('Espresso cup', 110);
    containers = [cup];
    expect(vessel.onScale?.container).toBe(cup);
  });

  it('names the containers within 3 g of the one it matched, unless dismissed or picked', () => {
    const feed = fakeRecorder();
    const cup = container('Espresso cup', 110);
    const tumbler = container('Glass tumbler', 110.6);
    let containers: readonly Container[] = [cup, tumbler];
    const vessel = new LiveVessel(feed.recorder, () => containers);
    feed.runTo(8000);
    expect(vessel.onScale).toMatchObject({ container: cup, near: [tumbler] });
    containers = [{ ...cup, dismissedWarningIds: [tumbler.id] }, tumbler];
    expect(vessel.onScale?.near).toEqual([]);
    containers = [cup, tumbler];
    vessel.pick(tumbler.id);
    expect(vessel.onScale).toMatchObject({ container: tumbler, near: [] });
  });

  it('takes a scale accessory into the platform, and recognises what goes on it (T2.17)', () => {
    const mat = container('Scale mat', 15.5, ['accessory']);
    const cup = container('Espresso cup', 110);
    const feed = fakeRecorder(MAT);
    const vessel = new LiveVessel(feed.recorder, () => [mat, cup]);
    const taken: Container[] = [];
    vessel.onAccessory((accessory) => taken.push(accessory));

    feed.runTo(6000);
    expect(taken).toEqual([mat]);
    expect(vessel.vessel).toBeNull();
    expect(vessel.onScale).toBeNull();

    feed.runTo(14_000);
    expect(vessel.onScale).toMatchObject({ container: cup, vessel: { massG: 110 } });
    expect(vessel.onScale!.contentsG).toBeLessThan(0.2);
    feed.runTo(20_000);
    expect(vessel.onScale).toBeNull();
    expect(taken).toHaveLength(1);
  });

  it('takes it in once learned while it is on, or picked', () => {
    const mat = container('Scale mat', 15.5, ['accessory']);
    const cup = container('Espresso cup', 110);
    let containers: readonly Container[] = [cup];
    const feed = fakeRecorder(MAT);
    const vessel = new LiveVessel(feed.recorder, () => containers);
    feed.runTo(6000);
    // Not known yet: the mat is the vessel on the scale.
    expect(vessel.onScale).toMatchObject({ match: { kind: 'unknown' }, vessel: { massG: 15.5 } });
    containers = [mat, cup];
    // Learned: no vessel from the next frame.
    feed.runTo(6300);
    expect(vessel.onScale).toBeNull();
    expect(vessel.vessel).toBeNull();
    feed.runTo(14_000);
    expect(vessel.onScale?.container).toEqual(cup);

    // Two containers of its mass: the user picks the mat, which goes into the platform.
    const glass = container('Shot glass', 15.5);
    const picked = fakeRecorder(MAT);
    const live = new LiveVessel(picked.recorder, () => [mat, glass, cup]);
    picked.runTo(6000);
    expect(live.onScale?.match.kind).toBe('ambiguous');
    live.pick(mat.id);
    expect(live.onScale).toBeNull();
    picked.runTo(14_000);
    expect(live.onScale?.container).toEqual(cup);
  });
});
