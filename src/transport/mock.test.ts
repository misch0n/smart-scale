import { describe, expect, it } from 'vitest';
import {
  decodeFrame,
  flowSmoothingOff,
  stopTimer,
  tare,
  tareAndStartTimer,
  type WeightFrame,
} from '../core/protocol';
import { espressoScenario, simulateSession, type Scenario } from '../core/sim';
import { MockTransport, type MockTransportOptions } from './mock';
import { ManualClock, systemScheduler } from './scheduler';
import type { ScaleNotification, TransportStatus } from './types';

/** A scale with a 110 g cup on it from the start, and nothing else happening. */
const CUP: Scenario = {
  seed: 1,
  durationMs: 60_000,
  script: [{ type: 'cup-on', atMs: 0, massG: 110 }],
  scale: { noiseSigmaG: 0, settleTauMs: 0 },
};

function setup(options: MockTransportOptions = {}) {
  const clock = new ManualClock(1000); // not zero, to show virtual time starts at the transport
  const mock = new MockTransport({ scenario: CUP, scheduler: clock, ...options });
  const notifications: ScaleNotification[] = [];
  const statuses: TransportStatus[] = [];
  mock.onNotification((n) => {
    expect(n.tArrival).toBeLessThanOrEqual(mock.now() + 1e-9);
    notifications.push(n);
  });
  mock.onStatus((s) => statuses.push(s));
  return { clock, mock, notifications, statuses };
}

async function connected(options: MockTransportOptions = {}) {
  const env = setup(options);
  const connecting = env.mock.connect();
  env.clock.advance(300);
  await connecting;
  return env;
}

function weights(notifications: readonly ScaleNotification[]) {
  return notifications
    .filter((n) => n.source === 'ff11')
    .map((n) => ({ t: n.tArrival, frame: decodeFrame(n.bytes) as WeightFrame }));
}

describe('MockTransport', () => {
  it('is a mock transport, always available, disconnected until asked', () => {
    const { mock } = setup();
    expect(mock.kind).toBe('mock');
    expect(mock.available).toBe(true);
    expect(mock.status).toEqual({ state: 'disconnected', reason: null, message: null });
  });

  it('connects after the connect delay and reports what the recorder logs', async () => {
    const { clock, mock, statuses, notifications } = setup();
    const connecting = mock.connect();
    expect(mock.status.state).toBe('connecting');
    clock.advance(299);
    expect(mock.status.state).toBe('connecting');
    clock.advance(1);
    const info = await connecting;
    expect(statuses.map((s) => s.state)).toEqual(['connecting', 'connected']);
    expect(info.device.name).toMatch(/^BOOKOO/);
    expect(info.properties.ff11.notify).toBe(true);
    expect(info.properties.ff12).toMatchObject({ write: true, notify: true });
    expect(info.subscribed).toEqual(['ff11', 'ff12']);
    expect(mock.status).toEqual({ state: 'connected', connection: info });
    expect(notifications).toEqual([]);
  });

  it('reconnects to its known device like connect(), since it has no chooser', async () => {
    const { clock, mock, statuses } = setup();
    const reconnecting = mock.reconnectKnownDevice();
    clock.advance(300);
    const info = await reconnecting;
    expect(info.device.name).toMatch(/^BOOKOO/);
    expect(statuses.map((s) => s.state)).toEqual(['connecting', 'connected']);
    await expect(mock.reconnectKnownDevice()).rejects.toMatchObject({ code: 'busy' });
  });

  it('delivers frames that decode, in order, stamped on its own clock', async () => {
    const { clock, mock, notifications } = await connected();
    clock.advance(5000);
    expect(notifications.length).toBeGreaterThan(45);
    for (const n of notifications) {
      expect(decodeFrame(n.bytes)).toMatchObject({ kind: 'weight', unitOk: true, weightG: 110 });
    }
    const times = notifications.map((n) => n.tArrival);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(mock.now()).toBe(5300); // virtual time since the transport was made
    expect(times[0]).toBeGreaterThan(300); // the session started at connect
  });

  it('delivers exactly what simulateSession produces for the same scenario', async () => {
    const scenario = espressoScenario({ seed: 9, tareAndStartMs: null });
    const { clock, notifications } = await connected({ scenario });
    clock.advance(scenario.durationMs);
    const expected = simulateSession(scenario).frames;
    expect(notifications.map((n) => [...n.bytes])).toEqual(expected.map((f) => [...f.bytes]));
    // Session time 0 is the connect, 300 virtual ms in.
    notifications.forEach((n, i) => expect(n.tArrival - 300).toBeCloseTo(expected[i].tArrival, 9));
  });

  it('runs faster than real time at a higher speed, with true-to-life timestamps', async () => {
    const clock = new ManualClock();
    const mock = new MockTransport({ scenario: CUP, scheduler: clock, speed: 10 });
    const got: ScaleNotification[] = [];
    mock.onNotification((n) => got.push(n));
    const connecting = mock.connect();
    clock.advance(30); // 300 virtual ms
    await connecting;
    clock.advance(1000); // 10 virtual seconds
    expect(mock.now()).toBe(10_300);
    expect(got.length).toBeGreaterThan(95);
    const deltas = got.slice(1).map((n, i) => n.tArrival - got[i].tArrival);
    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    expect(mean).toBeGreaterThan(95); // ms of virtual time per 10 Hz frame
    expect(mean).toBeLessThan(105);
  });

  describe('commands', () => {
    it('07 tares and starts the timer', async () => {
      const { clock, mock, notifications } = await connected();
      clock.advance(1000);
      await mock.send(tareAndStartTimer());
      clock.advance(3000);
      const rows = weights(notifications);
      const before = rows.filter((r) => r.t < 1300);
      // The scale gets it 40 ms on. It tares once its next frame is out, and starts a frame
      // later.
      const after = rows.filter((r) => r.t > 1300 + 40 + 300);
      expect(before.every((r) => r.frame.weightG === 110 && r.frame.timerMs === 0)).toBe(true);
      expect(after.every((r) => r.frame.weightG === 0)).toBe(true);
      expect(after.at(-1)!.frame.timerMs).toBeGreaterThan(2500);
      expect(mock.simulator.truth().commands).toMatchObject([
        { sentAtMs: 1000, effect: 'tare-and-start' },
      ]);
    });

    it('08 turns smoothing off', async () => {
      const { clock, mock, notifications } = await connected({
        scenario: { ...CUP, scale: { ...CUP.scale, initialSmoothing: true } },
      });
      clock.advance(500);
      expect(weights(notifications).at(-1)!.frame.flowSmoothing).toBe(1);
      await mock.send(flowSmoothingOff());
      clock.advance(500);
      expect(weights(notifications).at(-1)!.frame.flowSmoothing).toBe(0);
    });

    it('01 tares', async () => {
      const { clock, mock, notifications } = await connected();
      clock.advance(1000);
      await mock.send(tare());
      clock.advance(1000);
      const last = weights(notifications).at(-1)!.frame;
      expect(last.weightG).toBe(0);
      expect(last.timerMs).toBe(0);
    });

    it('writes one command at a time, spaced by the write spacing', async () => {
      const { clock, mock } = await connected({ writeSpacingMs: 100 });
      const sent = [mock.send(tare()), mock.send(tareAndStartTimer()), mock.send(stopTimer())];
      clock.advance(1000);
      await Promise.all(sent);
      const times = mock.simulator.truth().commands.map((c) => c.sentAtMs);
      expect(times).toEqual([0, 100, 200]);
    });

    it('refuses a command changed after it was made, and the scale never sees it (D-015)', async () => {
      const { clock, mock } = await connected();
      const queuedFirst = mock.send(tare());
      const tampered = tare();
      const refused = mock.send(tampered);
      tampered.bytes[2] = 0x15; // shutdown
      clock.advance(1000);
      await queuedFirst;
      await expect(refused).rejects.toMatchObject({ code: 'refused' });
      expect(mock.simulator.truth().commands.map((c) => c.hex)).toEqual(['030A01000008']);
    });

    it('rejects a command when not connected', async () => {
      const { mock } = setup();
      await expect(mock.send(tare())).rejects.toMatchObject({ code: 'not-connected' });
      expect(mock.simulator.truth().commands).toEqual([]);
    });
  });

  describe('disconnecting', () => {
    it('stops the frames, rejects queued commands and reports the user', async () => {
      const { clock, mock, notifications, statuses } = await connected();
      clock.advance(1000);
      const first = mock.send(tare());
      const queued = mock.send(tare());
      await mock.disconnect();
      const count = notifications.length;
      clock.advance(5000);
      expect(notifications.length).toBe(count);
      await first;
      await expect(queued).rejects.toMatchObject({ code: 'disconnected' });
      expect(statuses.at(-1)).toEqual({ state: 'disconnected', reason: 'user', message: null });
      await mock.disconnect(); // a no-op now
      expect(statuses.filter((s) => s.state === 'disconnected')).toHaveLength(1);
    });

    it('never carries a command queued on one connection into the next', async () => {
      const { clock, mock } = await connected({ writeSpacingMs: 1000 });
      const first = mock.send(tare());
      const stale = mock.send(tareAndStartTimer());
      await mock.disconnect();
      await expect(stale).rejects.toMatchObject({ code: 'disconnected' });
      const reconnecting = mock.connect();
      clock.advance(300);
      await reconnecting;
      clock.advance(5000);
      await first;
      expect(mock.simulator.truth().commands.map((c) => c.hex)).toEqual(['030A01000008']);
    });

    it('cancels a connection in progress', async () => {
      const { clock, mock, statuses } = setup();
      const connecting = mock.connect();
      await mock.disconnect();
      await expect(connecting).rejects.toMatchObject({ code: 'connect-failed' });
      clock.advance(1000);
      expect(statuses.map((s) => s.state)).toEqual(['connecting', 'disconnected']);
    });

    it('refuses to connect twice', async () => {
      const { mock } = await connected();
      await expect(mock.connect()).rejects.toMatchObject({ code: 'busy' });
    });

    it('stops at once when a listener disconnects mid-delivery', async () => {
      const { clock, mock } = await connected();
      let after = 0;
      mock.onNotification(() => {
        if (mock.status.state === 'connected') void mock.disconnect();
        else after++;
      });
      clock.advance(5000);
      expect(after).toBe(0);
      expect(mock.status.state).toBe('disconnected');
    });

    it('reconnects into the same world, which kept going meanwhile', async () => {
      const { clock, mock, notifications } = await connected();
      clock.advance(1000);
      await mock.send(tare());
      clock.advance(1000);
      await mock.disconnect();
      clock.advance(10_000);
      const reconnecting = mock.connect();
      clock.advance(300);
      await reconnecting;
      const firstAfter = notifications.length;
      clock.advance(1000);
      const resumed = notifications.slice(firstAfter);
      expect(resumed.length).toBeGreaterThan(5);
      // Still tared, and nothing from the time away was delivered.
      expect(weights(resumed).every((r) => r.frame.weightG === 0)).toBe(true);
      expect(resumed[0].tArrival).toBeGreaterThan(300 + 2000 + 10_000);
    });
  });

  describe('when the scale switches off', () => {
    const scenario: Scenario = {
      ...CUP,
      script: [...CUP.script, { type: 'power-off', atMs: 3000 }],
    };

    it('reports the device after the supervision timeout', async () => {
      const { clock, mock, statuses, notifications } = await connected({ scenario });
      // Frames sampled before the power-off still arrive; then nothing until the timeout.
      clock.advance(4000);
      expect(mock.status.state).toBe('connected');
      const count = notifications.length;
      clock.advance(1000);
      expect(mock.status).toEqual({
        state: 'disconnected',
        reason: 'device',
        message: 'The scale stopped responding',
      });
      expect(notifications.length).toBe(count);
      expect(statuses.map((s) => s.state)).toEqual(['connecting', 'connected', 'disconnected']);
    });

    it("can't connect again", async () => {
      const { clock, mock } = await connected({ scenario });
      clock.advance(10_000);
      const again = mock.connect();
      clock.advance(300);
      await expect(again).rejects.toMatchObject({ code: 'connect-failed' });
      expect(mock.status).toMatchObject({ state: 'disconnected', reason: 'error' });
    });
  });

  describe('FF12', () => {
    // The automatic mode tares the cup, and a touch at 1 s starts its run, which it announces
    // on FF12 (D-037).
    const scenario: Scenario = {
      ...CUP,
      script: [...CUP.script, { type: 'bump', atMs: 1000, durationMs: 300, peakG: 3 }],
      scale: { ...CUP.scale, mode: 'automatic' },
    };

    it('delivers the automatic mode’s timer events on FF12 when it can notify', async () => {
      const { clock, notifications } = await connected({ scenario });
      clock.advance(2000);
      const ff12 = notifications.filter((n) => n.source === 'ff12');
      expect(ff12).toHaveLength(1);
      expect(decodeFrame(ff12[0].bytes)).toMatchObject({ kind: 'event', state: 'started' });
    });

    it("delivers nothing from FF12 when it can't notify", async () => {
      const { clock, mock, notifications } = await connected({ scenario, ff12Notify: false });
      expect(mock.status).toMatchObject({ connection: { subscribed: ['ff11'] } });
      clock.advance(2000);
      expect(mock.simulator.truth().timer.map((change) => change.change)).toEqual(['start']);
      expect(notifications.every((n) => n.source === 'ff11')).toBe(true);
    });
  });

  it('runs on real timers too', async () => {
    const mock = new MockTransport({ scenario: CUP, scheduler: systemScheduler, speed: 50 });
    const got: ScaleNotification[] = [];
    mock.onNotification((n) => got.push(n));
    await mock.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await mock.disconnect();
    expect(got.length).toBeGreaterThan(10);
    expect(decodeFrame(got[0].bytes).kind).toBe('weight');
  });
});
