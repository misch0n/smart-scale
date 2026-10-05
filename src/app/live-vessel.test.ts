import { describe, expect, it } from 'vitest';
import { STREAM_RECORDING_ID } from '../core/live/test-stream';
import {
  createEntity,
  RecordingSequence,
  type AppEvent,
  type Container,
  type RawFrame,
} from '../core/model';
import { decodeFrame, type DecodedFrame } from '../core/protocol';
import { ScaleSimulator, type Scenario } from '../core/sim';
import { Emitter } from '../transport/emitter';
import { LiveVessel } from './live-vessel';

const NOW = Date.UTC(2026, 9, 5, 7, 0);

function container(name: string, emptyMassG: number): Container {
  return createEntity(
    'containers',
    { name, emptyMassG, roles: ['cup'], dismissedWarningIds: [] },
    NOW,
  );
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

/** A recorder's two streams, fed from the simulator up to each time asked. */
function fakeRecorder() {
  const frames = new Emitter<{ frame: RawFrame; decoded: DecodedFrame }>();
  const events = new Emitter<AppEvent>();
  const simulator = new ScaleSimulator(SCENARIO);
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
});
