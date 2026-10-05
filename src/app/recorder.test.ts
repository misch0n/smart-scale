import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SchemaError,
  type AppEvent,
  type AppEventOf,
  type AppEventType,
  type CharacteristicName,
  type DisconnectReason,
  type RawFrame,
} from '../core/model';
import {
  decodeFrame,
  encodeWeightFrame,
  flowSmoothingOff,
  tare,
  tareAndStartTimer,
  toHex,
  type ScaleCommand,
  type WeightFrameInput,
} from '../core/protocol';
import { espressoScenario, type Scenario } from '../core/sim';
import { decodeSoundFrame, encodeSoundFrame, SOUND_LAYOUT } from '../core/sound';
import { freshIndexedDB } from '../storage/fake-idb';
import { openStorage, StorageError, type AppStorage, type RawRecording } from '../storage';
import { Emitter } from '../transport/emitter';
import { FakeBluetooth } from '../transport/fake-web-bluetooth';
import { MockTransport } from '../transport/mock';
import { ManualClock } from '../transport/scheduler';
import {
  TransportError,
  type ConnectionInfo,
  type ScaleNotification,
  type ScaleTransport,
  type TransportStatus,
} from '../transport/types';
import { WebBluetoothTransport } from '../transport/web-bluetooth';
import { FakeLocks } from './fake-locks';
import type { PageLifecycle } from './page-lifecycle';
import {
  FINISH_RETRY_MS,
  Recorder,
  SMOOTHING_REASONS,
  SMOOTHING_TIMEOUT_MS,
  type RecordedFrame,
  type RecorderOptions,
  type RecorderState,
  type RecorderStorage,
} from './recorder';
import { recordingLockName } from './recording-locks';

const APP = { commit: 'abc1234', buildTime: '2026-10-03T07:00:00.000Z' };
const EPOCH = Date.UTC(2026, 9, 3, 7, 30);
const USER_AGENT = 'Mozilla/5.0 (iPhone) test';

/** A cup on the scale and nothing happening: weight frames at about 10 Hz. */
const IDLE: Scenario = {
  seed: 7,
  durationMs: 600_000,
  script: [{ type: 'cup-on', atMs: 0, massG: 110 }],
  scale: { noiseSigmaG: 0, settleTauMs: 0 },
  link: { stallProbability: 0 },
};

/** IDLE with the scale's smoothing on, as `flowSmoothingOff` would find it. */
const SMOOTHING_ON: Scenario = { ...IDLE, scale: { ...IDLE.scale, initialSmoothing: true } };

let storage: AppStorage;

beforeEach(async () => {
  freshIndexedDB();
  storage = await openStorage({ framesPerChunk: 64 });
});

afterEach(() => {
  storage.close();
});

/** Lets promise chains run, and fake-indexeddb, which runs on real timers. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Moves the clock on by `ms` in steps, letting promises settle after each, as time passes. */
async function run(clock: ManualClock, ms: number, stepMs = 50): Promise<void> {
  const end = clock.now() + ms;
  while (clock.now() < end) {
    clock.advanceTo(Math.min(end, clock.now() + stepMs));
    await settle();
  }
}

class FakePage implements PageLifecycle {
  readonly #hidden = new Emitter<void>();

  onHidden(listener: () => void) {
    return this.#hidden.on(listener);
  }

  hide(): void {
    this.#hidden.emit();
  }
}

function makeEnv<T extends ScaleTransport>(
  clock: ManualClock,
  transport: T,
  options: Partial<RecorderOptions> = {},
) {
  const locks = new FakeLocks();
  const page = new FakePage();
  const recorder = new Recorder({
    transport,
    storage,
    app: APP,
    userAgent: USER_AGENT,
    epochNow: () => EPOCH + clock.now(),
    timers: clock,
    locks,
    page,
    ...options,
  });
  // Added after the recorder's listeners, so they see what the recorder has already done.
  const notifications: ScaleNotification[] = [];
  const connectedAt: number[] = [];
  transport.onNotification((notification) => notifications.push(notification));
  transport.onStatus((status) => {
    if (status.state === 'connected') connectedAt.push(transport.now());
  });
  return { clock, transport, recorder, locks, page, notifications, connectedAt };
}

/** A recorder on a MockTransport, replaying `scenario` on a ManualClock. */
function mockEnv(
  scenario: Scenario = IDLE,
  options: Partial<RecorderOptions> = {},
  wrap?: (mock: MockTransport) => ScaleTransport,
) {
  const clock = new ManualClock(5000);
  const mock = new MockTransport({ scenario, scheduler: clock });
  return { mock, ...makeEnv(clock, wrap ? wrap(mock) : mock, options) };
}

async function connect(env: { clock: ManualClock; transport: ScaleTransport }) {
  const connecting = env.transport.connect();
  await run(env.clock, 300);
  return connecting;
}

/** The id of the recording in progress. */
function recordingId(env: { recorder: Recorder }): string {
  const recording = env.recorder.state.recording;
  if (!recording) throw new Error('no recording in progress');
  return recording.id;
}

async function readRaw(id: string): Promise<RawRecording> {
  const raw = await storage.raw.read(id);
  if (!raw) throw new Error(`recording ${id} isn't stored`);
  return raw;
}

/** Frames and events in one list, in seq order. */
function timeline(raw: { frames: readonly RawFrame[]; events: readonly AppEvent[] }) {
  return [...raw.frames, ...raw.events].sort((a, b) => a.seq - b.seq);
}

function eventsOf<K extends AppEventType>(
  raw: { events: readonly AppEvent[] },
  type: K,
): AppEventOf<K>[] {
  return raw.events.filter((event) => event.type === type) as AppEventOf<K>[];
}

/** The mock, with `send` going through `intercept` first: a promise it returns stands in. */
function intercepting(
  mock: MockTransport,
  intercept: (command: ScaleCommand) => Promise<void> | null,
): ScaleTransport {
  return {
    kind: mock.kind,
    available: true,
    get status() {
      return mock.status;
    },
    now: () => mock.now(),
    connect: () => mock.connect(),
    disconnect: () => mock.disconnect(),
    send: (command) => intercept(command) ?? mock.send(command),
    onNotification: (listener) => mock.onNotification(listener),
    onStatus: (listener) => mock.onStatus(listener),
  };
}

/** Pretends to write the first `times` `flowSmoothingOff` commands: the scale never gets them. */
function ignoringSmoothingOff(times: number) {
  let left = times;
  return (mock: MockTransport) =>
    intercepting(mock, (command) => {
      if (command.name !== 'flowSmoothingOff' || left === 0) return null;
      left--;
      return Promise.resolve();
    });
}

const SMOOTHING_OFF_HEX = toHex(flowSmoothingOff().bytes, '');

const CONNECTION: ConnectionInfo = {
  device: { name: 'BOOKOO_SC', id: 'hand' },
  properties: {
    ff11: {
      broadcast: false,
      read: false,
      writeWithoutResponse: false,
      write: false,
      notify: true,
      indicate: false,
      authenticatedSignedWrites: false,
      reliableWrite: false,
      writableAuxiliaries: false,
    },
    ff12: {
      broadcast: null,
      read: null,
      writeWithoutResponse: true,
      write: true,
      notify: false,
      indicate: null,
      authenticatedSignedWrites: null,
      reliableWrite: null,
      writableAuxiliaries: null,
    },
  },
  subscribed: ['ff11'],
};

/** A transport the test drives by hand. A command succeeds at once unless `onSend` says not. */
class HandTransport implements ScaleTransport {
  readonly kind = 'mock';
  readonly available = true;
  status: TransportStatus = { state: 'disconnected', reason: null, message: null };
  nowMs = 0;
  readonly sent: ScaleCommand[] = [];
  onSend: (command: ScaleCommand) => Promise<void> = () => Promise.resolve();
  readonly #statuses = new Emitter<TransportStatus>();
  readonly #notifications = new Emitter<ScaleNotification>();

  now(): number {
    return this.nowMs;
  }

  connect(): Promise<ConnectionInfo> {
    return Promise.reject(new Error('HandTransport: call connected()'));
  }

  disconnect(): Promise<void> {
    this.disconnected('user');
    return Promise.resolve();
  }

  send(command: ScaleCommand): Promise<void> {
    if (this.status.state !== 'connected') {
      return Promise.reject(new TransportError('not-connected', 'The scale is not connected'));
    }
    this.sent.push(command);
    return this.onSend(command);
  }

  onNotification(listener: (notification: ScaleNotification) => void) {
    return this.#notifications.on(listener);
  }

  onStatus(listener: (status: TransportStatus) => void) {
    return this.#statuses.on(listener);
  }

  connected(connection: ConnectionInfo = CONNECTION): void {
    this.#set({ state: 'connected', connection });
  }

  disconnected(reason: DisconnectReason | null, message: string | null = null): void {
    this.#set({ state: 'disconnected', reason, message });
  }

  notify(bytes: Uint8Array, source: CharacteristicName = 'ff11', tArrival = this.nowMs): void {
    this.#notifications.emit({ source, bytes: new Uint8Array(bytes), tArrival });
  }

  #set(status: TransportStatus): void {
    this.status = status;
    this.#statuses.emit(status);
  }
}

function handEnv(options: Partial<RecorderOptions> = {}) {
  const clock = new ManualClock(0);
  const hand = new HandTransport();
  return makeEnv(clock, hand, options);
}

function weightFrame(input: Partial<WeightFrameInput> = {}): Uint8Array<ArrayBuffer> {
  return encodeWeightFrame({ timerMs: 0, weightG: 18.5, ...input });
}

describe('Recorder', () => {
  describe('starting a recording', () => {
    it('starts one on connected, stored at once, with the connection logged first', async () => {
      const env = mockEnv();
      expect(env.recorder.state.recording).toBeNull();
      expect(env.recorder.state.stats).toBeNull();
      const info = await connect(env);

      const recording = env.recorder.state.recording;
      expect(recording).toEqual({
        id: expect.any(String) as string,
        startedAtEpochMs: EPOCH + 5300,
        endedAtEpochMs: null,
        endReason: null,
        device: info.device,
        transport: 'mock',
        app: APP,
        userAgent: USER_AGENT,
      });
      // Stored without waiting for a batch: the clock doesn't move here.
      await vi.waitFor(async () => {
        expect(await storage.recordings.get(recordingId(env))).toEqual(recording);
      });

      await env.recorder.flush();
      const raw = await readRaw(recordingId(env));
      expect(raw.events.slice(0, 4).map((e) => [e.seq, e.tMs, e.type, e.data])).toEqual([
        [0, 0, 'connected', { deviceName: info.device.name, deviceId: info.device.id }],
        [
          1,
          0,
          'characteristic-properties',
          { characteristic: 'ff11', properties: info.properties.ff11 },
        ],
        [
          2,
          0,
          'characteristic-properties',
          { characteristic: 'ff12', properties: info.properties.ff12 },
        ],
        [
          3,
          0,
          'command-sent',
          { command: 'flowSmoothingOff', param: null, hex: SMOOTHING_OFF_HEX, reason: 'connect' },
        ],
      ]);
    });

    it('holds the recording lock from connected until the recording has ended', async () => {
      const env = mockEnv();
      let heldAtConnected: boolean | null = null;
      env.transport.onStatus((status) => {
        if (status.state === 'connected') {
          heldAtConnected = env.locks.isHeld(recordingLockName(recordingId(env)));
        }
      });
      await connect(env);
      const id = recordingId(env);
      // Taken synchronously, before the recording's first write can show it to another tab.
      expect(heldAtConnected).toBe(true);
      await run(env.clock, 1000);
      expect(env.locks.isHeld(recordingLockName(id))).toBe(true);
      await env.transport.disconnect();
      expect(env.locks.isHeld(recordingLockName(id))).toBe(true); // still finishing
      await env.recorder.whenIdle();
      expect(env.locks.isHeld(recordingLockName(id))).toBe(false);
    });

    it('refuses a transport that is already connected', async () => {
      const clock = new ManualClock(0);
      const mock = new MockTransport({ scenario: IDLE, scheduler: clock });
      const connecting = mock.connect();
      clock.advance(300);
      await connecting;
      expect(
        () => new Recorder({ transport: mock, storage, app: APP, userAgent: null, timers: clock }),
      ).toThrow(/already connected/);
    });

    it('starts a new recording on each connection', async () => {
      const env = mockEnv();
      await connect(env);
      const first = recordingId(env);
      await run(env.clock, 1000);
      await env.transport.disconnect();
      expect(env.recorder.state.recording).toBeNull();
      await connect(env);
      const second = recordingId(env);
      expect(second).not.toBe(first);
      await run(env.clock, 1000);
      await env.transport.disconnect();
      await env.recorder.whenIdle();
      const recordings = await storage.recordings.list();
      expect(recordings.map((r) => [r.id, r.endReason])).toEqual([
        [first, 'user'],
        [second, 'user'],
      ]);
      expect(eventsOf(await readRaw(second), 'connected')).toHaveLength(1);
    });
  });

  describe('frames', () => {
    it('stores every notification verbatim, corrupt and cut-short ones too', async () => {
      const scenario = espressoScenario({
        link: { corruptProbability: 0.05, truncateProbability: 0.03, dropProbability: 0.01 },
      });
      const env = mockEnv(scenario);
      await connect(env);
      await run(env.clock, scenario.durationMs, 250);
      const id = recordingId(env);
      await env.transport.disconnect();
      await env.recorder.whenIdle();

      const raw = await readRaw(id);
      const start = env.connectedAt[0];
      expect(env.notifications.length).toBeGreaterThan(500);
      expect(raw.frames).toHaveLength(env.notifications.length);
      expect(raw.frames.map((f) => [f.tMs, f.source, toHex(f.bytes, '')])).toEqual(
        env.notifications.map((n) => [n.tArrival - start, n.source, toHex(n.bytes, '')]),
      );
      const failures = raw.frames
        .map((f) => decodeFrame(f.bytes))
        .flatMap((d) => (d.kind === 'invalid' ? [d.reason] : []));
      expect(failures.length).toBeGreaterThan(20);
      expect(failures).toContain('checksum');
      expect(failures).toContain('length');
      expect(raw.recording.endReason).toBe('user');
    });

    it('puts frames and events on one timeline: seq from 0 with no gaps, in arrival order', async () => {
      const env = mockEnv(espressoScenario({ tareAndStartMs: null }));
      await connect(env);
      await run(env.clock, 2000);
      env.recorder.logUiAction('manual-start', { source: 'button' });
      const sending = env.recorder.sendCommand(tareAndStartTimer(), 'manual-start');
      await settle();
      await sending;
      await run(env.clock, 1000);
      env.recorder.annotate('pump-on');
      await run(env.clock, 1500);
      env.recorder.annotate('note', '18 g in, grind 2.4');
      await run(env.clock, 500);
      const id = recordingId(env);
      await env.transport.disconnect();
      await env.recorder.whenIdle();

      const raw = await readRaw(id);
      const records = timeline(raw);
      expect(records.map((r) => r.seq)).toEqual(records.map((_, i) => i));
      for (let i = 1; i < records.length; i++) {
        expect(records[i].tMs).toBeGreaterThanOrEqual(records[i - 1].tMs);
      }
      expect(raw.events.map((e) => e.type)).toEqual([
        'connected',
        'characteristic-properties',
        'characteristic-properties',
        'command-sent',
        'smoothing-confirmed',
        'ui-action',
        'command-sent',
        'annotation',
        'annotation',
        'disconnected',
      ]);
      expect(records.at(-1)).toBe(raw.events.at(-1));
      const [, manualStart] = eventsOf(raw, 'command-sent');
      const [uiAction] = eventsOf(raw, 'ui-action');
      expect(uiAction.data).toEqual({ action: 'manual-start', detail: { source: 'button' } });
      expect(manualStart.data).toMatchObject({
        command: 'tareAndStartTimer',
        reason: 'manual-start',
      });
      expect(manualStart.tMs).toBe(uiAction.tMs);
      expect(eventsOf(raw, 'annotation').map((e) => e.data)).toEqual([
        { label: 'pump-on', text: null },
        { label: 'note', text: '18 g in, grind 2.4' },
      ]);
    });

    it('passes every frame on with its decoding, and every event', async () => {
      const env = mockEnv();
      const frames: RecordedFrame[] = [];
      const events: AppEvent[] = [];
      env.recorder.onFrame((frame) => frames.push(frame));
      env.recorder.onEvent((event) => events.push(event));
      await connect(env);
      await run(env.clock, 3000);
      const id = recordingId(env);
      await env.transport.disconnect();
      await env.recorder.whenIdle();

      const raw = await readRaw(id);
      expect(frames.map((f) => f.frame)).toEqual(raw.frames);
      expect(frames.map((f) => f.decoded)).toEqual(raw.frames.map((f) => decodeFrame(f.bytes)));
      expect(events).toEqual(raw.events);
    });
  });

  describe('smoothing', () => {
    it('confirms smoothing off on the first weight frame that shows it', async () => {
      const env = mockEnv(SMOOTHING_ON);
      await connect(env);
      expect(env.recorder.state.stats?.smoothing).toEqual({
        status: 'checking',
        attempts: 1,
        byte: null,
      });
      await run(env.clock, 1000);
      expect(env.recorder.state.stats?.smoothing).toEqual({
        status: 'confirmed',
        attempts: 1,
        byte: 0,
      });
      expect(env.recorder.state.warnings).toEqual([]);
      expect(env.mock.simulator.truth().commands).toMatchObject([
        { hex: SMOOTHING_OFF_HEX, effect: 'smoothing-off' },
      ]);

      await env.recorder.flush();
      const raw = await readRaw(recordingId(env));
      const records = timeline(raw);
      const confirmed = records.findIndex((r) => 'type' in r && r.type === 'smoothing-confirmed');
      const weights = records
        .slice(0, confirmed)
        .filter((r): r is RawFrame => 'bytes' in r)
        .map((f) => decodeFrame(f.bytes));
      // Frames showed smoothing on until the command took effect; the last one showed it off.
      expect(weights.length).toBeGreaterThan(0);
      expect(weights.slice(0, -1).every((d) => d.kind === 'weight' && d.flowSmoothing === 1)).toBe(
        true,
      );
      expect(weights.at(-1)).toMatchObject({ kind: 'weight', flowSmoothing: 0 });
      const event = records[confirmed] as AppEventOf<'smoothing-confirmed'>;
      expect(event.data).toEqual({ attempts: 1 });
      expect(event.tMs).toBe(records[confirmed - 1].tMs); // stamped with the frame that showed it
    });

    it('confirms at once when smoothing is already off', async () => {
      const env = mockEnv(IDLE);
      await connect(env);
      await run(env.clock, 500);
      await env.recorder.flush();
      const raw = await readRaw(recordingId(env));
      expect(eventsOf(raw, 'smoothing-confirmed').map((e) => e.data)).toEqual([{ attempts: 1 }]);
      expect(raw.frames[0].seq).toBe(eventsOf(raw, 'smoothing-confirmed')[0].seq - 1);
    });

    it('retries once when no weight frame shows smoothing off within 2 s', async () => {
      const env = mockEnv(SMOOTHING_ON, {}, ignoringSmoothingOff(1));
      await connect(env);
      await run(env.clock, SMOOTHING_TIMEOUT_MS - 50);
      expect(env.recorder.state.stats?.smoothing).toEqual({
        status: 'checking',
        attempts: 1,
        byte: 1,
      });
      expect(env.mock.simulator.truth().commands).toEqual([]);

      await run(env.clock, 1000);
      expect(env.mock.simulator.truth().commands).toMatchObject([
        { sentAtMs: SMOOTHING_TIMEOUT_MS, hex: SMOOTHING_OFF_HEX, effect: 'smoothing-off' },
      ]);
      expect(env.recorder.state.stats?.smoothing).toEqual({
        status: 'confirmed',
        attempts: 2,
        byte: 0,
      });

      await env.recorder.flush();
      const raw = await readRaw(recordingId(env));
      expect(eventsOf(raw, 'command-sent').map((e) => [e.tMs, e.data.reason])).toEqual([
        [0, SMOOTHING_REASONS.first],
        [SMOOTHING_TIMEOUT_MS, SMOOTHING_REASONS.retry],
      ]);
      expect(eventsOf(raw, 'smoothing-confirmed').map((e) => e.data)).toEqual([{ attempts: 2 }]);
      expect(eventsOf(raw, 'smoothing-not-confirmed')).toEqual([]);
    });

    it('logs smoothing-not-confirmed after the retry, warns, and sends nothing more', async () => {
      const env = mockEnv(SMOOTHING_ON, {}, ignoringSmoothingOff(2));
      await connect(env);
      await run(env.clock, 2 * SMOOTHING_TIMEOUT_MS + 500);
      expect(env.recorder.state.stats?.smoothing).toEqual({
        status: 'not-confirmed',
        attempts: 2,
        byte: 1,
      });
      expect(env.recorder.state.warnings).toEqual(['smoothing-not-off']);
      await run(env.clock, 10_000);

      await env.recorder.flush();
      const raw = await readRaw(recordingId(env));
      expect(eventsOf(raw, 'command-sent')).toHaveLength(2);
      expect(eventsOf(raw, 'smoothing-not-confirmed').map((e) => [e.tMs, e.data])).toEqual([
        [2 * SMOOTHING_TIMEOUT_MS, { attempts: 2, smoothingByte: 1 }],
      ]);
    });

    it('logs a late confirmation when smoothing goes off after all', async () => {
      const env = mockEnv(SMOOTHING_ON, {}, ignoringSmoothingOff(2));
      await connect(env);
      await run(env.clock, 2 * SMOOTHING_TIMEOUT_MS + 500);
      await env.recorder.sendCommand(flowSmoothingOff(), 'probe');
      await run(env.clock, 500);
      expect(env.recorder.state.stats?.smoothing).toEqual({
        status: 'confirmed',
        attempts: 2,
        byte: 0,
      });
      expect(env.recorder.state.warnings).toEqual([]);
      await env.recorder.flush();
      const raw = await readRaw(recordingId(env));
      expect(raw.events.slice(-3).map((e) => [e.type, e.data])).toEqual([
        ['smoothing-not-confirmed', { attempts: 2, smoothingByte: 1 }],
        [
          'command-sent',
          { command: 'flowSmoothingOff', param: null, hex: SMOOTHING_OFF_HEX, reason: 'probe' },
        ],
        ['smoothing-confirmed', { attempts: 2 }],
      ]);
    });

    it('counts a failed write as an attempt, and retries after it', async () => {
      let failures = 1;
      const env = mockEnv(SMOOTHING_ON, {}, (mock) =>
        intercepting(mock, (command) =>
          command.name === 'flowSmoothingOff' && failures-- > 0
            ? Promise.reject(new TransportError('write-failed', 'GATT operation failed.'))
            : null,
        ),
      );
      await connect(env);
      await run(env.clock, SMOOTHING_TIMEOUT_MS + 500);
      expect(env.recorder.state.stats?.smoothing.status).toBe('confirmed');
      await env.recorder.flush();
      const raw = await readRaw(recordingId(env));
      expect(raw.events.slice(3).map((e) => [e.tMs, e.type, e.data])).toEqual([
        [
          0,
          'command-failed',
          {
            command: 'flowSmoothingOff',
            param: null,
            hex: SMOOTHING_OFF_HEX,
            reason: SMOOTHING_REASONS.first,
            error: 'GATT operation failed.',
          },
        ],
        [
          SMOOTHING_TIMEOUT_MS,
          'command-sent',
          {
            command: 'flowSmoothingOff',
            param: null,
            hex: SMOOTHING_OFF_HEX,
            reason: SMOOTHING_REASONS.retry,
          },
        ],
        [expect.any(Number), 'smoothing-confirmed', { attempts: 2 }],
      ]);
    });

    it('reports no smoothing byte when no weight frame arrives at all', async () => {
      const env = mockEnv({ ...SMOOTHING_ON, link: { dropProbability: 1 } });
      await connect(env);
      await run(env.clock, 2 * SMOOTHING_TIMEOUT_MS + 500);
      expect(env.recorder.state.stats).toMatchObject({
        frames: 0,
        framesPerSecond: 0,
        lastWeight: null,
        unitOk: null,
        smoothing: { status: 'not-confirmed', attempts: 2, byte: null },
      });
      await env.recorder.flush();
      const raw = await readRaw(recordingId(env));
      expect(eventsOf(raw, 'smoothing-not-confirmed').map((e) => e.data)).toEqual([
        { attempts: 2, smoothingByte: null },
      ]);
    });

    it('waits for the write before it starts the 2 s', () => {
      const env = handEnv();
      let write: () => void = () => {};
      env.transport.onSend = () => new Promise<void>((resolve) => (write = resolve));
      env.transport.connected();
      env.clock.advance(5000);
      expect(env.transport.sent).toHaveLength(1);
      write();
      return settle().then(() => {
        env.clock.advance(SMOOTHING_TIMEOUT_MS - 1);
        expect(env.transport.sent).toHaveLength(1);
        env.clock.advance(1);
        expect(env.transport.sent.map((c) => c.name)).toEqual([
          'flowSmoothingOff',
          'flowSmoothingOff',
        ]);
      });
    });

    it('warns when smoothing reads on again after it was confirmed', async () => {
      const env = handEnv();
      env.transport.connected();
      env.transport.notify(weightFrame({ flowSmoothing: 0 }));
      expect(env.recorder.state.warnings).toEqual([]);
      env.transport.notify(weightFrame({ flowSmoothing: 1 }));
      expect(env.recorder.state.stats?.smoothing).toEqual({
        status: 'confirmed',
        attempts: 1,
        byte: 1,
      });
      expect(env.recorder.state.warnings).toEqual(['smoothing-not-off']);
      env.transport.notify(weightFrame({ flowSmoothing: 0 }));
      expect(env.recorder.state.warnings).toEqual([]);
      await env.recorder.flush();
      const raw = await readRaw(recordingId(env));
      expect(eventsOf(raw, 'smoothing-confirmed')).toHaveLength(1);
    });

    it('ignores the smoothing byte of a frame that fails its checksum', () => {
      const env = handEnv();
      env.transport.connected();
      const corrupt = weightFrame({ flowSmoothing: 0 });
      corrupt[19] ^= 0xff;
      env.transport.notify(corrupt);
      expect(env.recorder.state.stats?.smoothing).toEqual({
        status: 'checking',
        attempts: 1,
        byte: null,
      });
    });
  });

  describe('commands and app events', () => {
    it('logs a command when it is written', async () => {
      const env = mockEnv();
      await connect(env);
      await run(env.clock, 1000);
      const start = env.connectedAt[0];
      const first = env.recorder.sendCommand(tare(), 'probe');
      const second = env.recorder.sendCommand(tareAndStartTimer());
      await settle();
      await first;
      await run(env.clock, 200);
      await second;
      await env.recorder.flush();

      const raw = await readRaw(recordingId(env));
      const [, tareEvent, startEvent] = eventsOf(raw, 'command-sent');
      // The mock writes at once when idle, then 100 ms apart.
      expect(tareEvent.tMs).toBe(env.mock.now() - start - 200);
      expect(startEvent.tMs).toBe(tareEvent.tMs + 100);
      expect(tareEvent.data).toEqual({
        command: 'tare',
        param: null,
        hex: toHex(tare().bytes, ''),
        reason: 'probe',
      });
      expect(startEvent.data.reason).toBeNull();
      expect(env.mock.simulator.truth().commands.map((c) => c.effect)).toEqual([
        'smoothing-off',
        'tare',
        'tare-and-start',
      ]);
    });

    it('logs a refused command as failed, with the bytes it was given', async () => {
      const env = mockEnv();
      await connect(env);
      await run(env.clock, 200); // past the write spacing after the smoothing command
      const command = tare();
      command.bytes[2] = 0x09; // calibration: the whitelist check must refuse it
      await expect(env.recorder.sendCommand(command, 'test')).rejects.toMatchObject({
        code: 'refused',
      });
      await env.recorder.flush();
      const raw = await readRaw(recordingId(env));
      const [failed] = eventsOf(raw, 'command-failed');
      expect(failed.data).toMatchObject({ command: 'tare', hex: '030A09000008', reason: 'test' });
      expect(failed.data.error).toMatch(/Refused/);
      expect(env.mock.simulator.truth().commands.map((c) => c.hex)).toEqual([SMOOTHING_OFF_HEX]);
    });

    it('logs nothing once the recording has ended before the write settles', async () => {
      const env = handEnv();
      env.transport.connected();
      await settle();
      let write: () => void = () => {};
      env.transport.onSend = () => new Promise<void>((resolve) => (write = resolve));
      const sending = env.recorder.sendCommand(tare(), 'late');
      const id = recordingId(env);
      env.transport.disconnected('device', 'gone');
      write();
      await sending;
      await env.recorder.whenIdle();
      const raw = await readRaw(id);
      expect(raw.events.at(-1)?.type).toBe('disconnected');
      expect(eventsOf(raw, 'command-sent').map((e) => e.data.command)).toEqual([
        'flowSmoothingOff',
      ]);
    });

    it('refuses commands and logs nothing when not recording', async () => {
      const env = mockEnv();
      await expect(env.recorder.sendCommand(tare(), 'probe')).rejects.toMatchObject({
        code: 'not-connected',
      });
      expect(env.recorder.logUiAction('connect-pressed')).toBeNull();
      expect(env.recorder.annotate('note', 'before connecting')).toBeNull();
      expect(await storage.recordings.list()).toEqual([]);
    });

    it('records sound levels as mic frames on the same timeline, apart from the scale (T1.24)', async () => {
      const levels = SOUND_LAYOUT.measures.map((_, i) => -20 - i);
      const started = {
        layout: SOUND_LAYOUT.id,
        measures: null,
        sampleRateHz: 48000,
        fftSize: 4096,
        intervalMs: 50,
        input: null,
        continued: false,
      };
      const env = mockEnv();
      expect(env.recorder.recordSound(encodeSoundFrame(levels))).toBeNull();
      expect(env.recorder.logSoundStarted(started)).toBeNull();
      await connect(env);
      await run(env.clock, 500);
      const seen: RecordedFrame[] = [];
      env.recorder.onFrame((frame) => seen.push(frame));
      expect(env.recorder.logSoundStarted(started)).not.toBeNull();
      const first = env.recorder.recordSound(encodeSoundFrame(levels))!;
      expect(first.source).toBe('mic');
      expect(first.tMs).toBeCloseTo(env.transport.now() - env.connectedAt[0], 9);
      await run(env.clock, 300);
      env.recorder.recordSound(encodeSoundFrame(levels));
      env.recorder.logSoundStopped({ reason: 'user', message: null });
      expect(env.recorder.state.stats!.soundFrames).toBe(2);
      // onFrame carries the scale's frames only.
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.every(({ frame }) => frame.source !== 'mic')).toBe(true);
      const id = recordingId(env);
      await env.transport.disconnect();
      await env.recorder.whenIdle();

      const raw = await readRaw(id);
      const records = timeline(raw);
      expect(records.map((r) => r.seq)).toEqual(records.map((_, i) => i));
      const mic = raw.frames.filter((frame) => frame.source === 'mic');
      expect(mic).toHaveLength(2);
      expect(decodeSoundFrame(mic[0].bytes)!.levelsDb).toEqual(levels);
      expect(eventsOf(raw, 'sound-started').map((event) => event.data)).toEqual([started]);
      expect(eventsOf(raw, 'sound-stopped').map((event) => event.data)).toEqual([
        { reason: 'user', message: null },
      ]);
    });

    it('returns the events it logs, stamped now', async () => {
      const env = handEnv();
      env.transport.nowMs = 1000;
      env.transport.connected();
      env.transport.nowMs = 1250.5;
      const action = env.recorder.logUiAction('tare-pressed', { at: 'scale' });
      const note = env.recorder.annotate('cup-on');
      expect(action).toMatchObject({
        tMs: 250.5,
        type: 'ui-action',
        data: { action: 'tare-pressed', detail: { at: 'scale' } },
      });
      expect(note).toMatchObject({ tMs: 250.5, type: 'annotation', data: { label: 'cup-on' } });
      expect(note!.seq).toBe(action!.seq + 1);
      expect(() => env.recorder.logUiAction('bad', { n: Number.NaN })).toThrow(SchemaError);
      await env.recorder.flush();
    });
  });

  describe('ending a recording', () => {
    it('ends it with the reason and at the time of the disconnect, after storing everything', async () => {
      const env = mockEnv();
      await connect(env);
      await run(env.clock, 2500);
      const id = recordingId(env);
      await env.transport.disconnect();
      expect(env.recorder.state).toMatchObject({ recording: null, stats: null, finishing: 1 });
      await env.recorder.whenIdle();
      expect(env.recorder.state).toMatchObject({ unsaved: 0, finishing: 0, warnings: [] });

      const raw = await readRaw(id);
      const last = raw.events.at(-1) as AppEventOf<'disconnected'>;
      expect(last.type).toBe('disconnected');
      expect(last.data).toEqual({ reason: 'user', message: null });
      expect(last.tMs).toBe(2500);
      expect(timeline(raw).at(-1)).toBe(last);
      expect(raw.recording).toMatchObject({
        endReason: 'user',
        endedAtEpochMs: raw.recording.startedAtEpochMs + 2500,
      });
    });

    it('ends it as device when the scale goes away', async () => {
      const scenario: Scenario = {
        ...IDLE,
        script: [...IDLE.script, { type: 'power-off', atMs: 3000 }],
        scale: { ...IDLE.scale, supervisionTimeoutMs: 2000 },
      };
      const env = mockEnv(scenario);
      await connect(env);
      const id = recordingId(env);
      await run(env.clock, 6000);
      expect(env.recorder.state.recording).toBeNull();
      await env.recorder.whenIdle();
      const raw = await readRaw(id);
      expect(raw.events.at(-1)).toMatchObject({
        tMs: 5000,
        type: 'disconnected',
        data: { reason: 'device', message: 'The scale stopped responding' },
      });
      expect(raw.recording.endReason).toBe('device');
    });

    it('ends it as error when Web Bluetooth fails after reporting connected', async () => {
      const clock = new ManualClock(1000);
      const fake = new FakeBluetooth({ clock });
      fake.steps.failNext('startNotifications ff11', new Error('no CCCD'));
      const env = makeEnv(clock, new WebBluetoothTransport({ bluetooth: fake, scheduler: clock }));
      const ids: string[] = [];
      env.transport.onStatus((status) => {
        if (status.state === 'connected') ids.push(recordingId(env));
      });
      await expect(env.transport.connect()).rejects.toMatchObject({ code: 'connect-failed' });
      await env.recorder.whenIdle();

      // connect() failed, yet a recording was made, and ended with the reason.
      expect(ids).toHaveLength(1);
      const raw = await readRaw(ids[0]);
      expect(raw.recording.endReason).toBe('error');
      expect(raw.recording.transport).toBe('web-bluetooth');
      expect(raw.events.map((e) => e.type)).toEqual([
        'connected',
        'characteristic-properties',
        'characteristic-properties',
        'disconnected',
      ]);
      expect(raw.events.at(-1)?.data).toEqual({
        reason: 'error',
        message: 'Starting notifications on FF11: no CCCD',
      });
      expect(env.locks.isHeld(recordingLockName(ids[0]))).toBe(false);
    });

    it('ends a recording once, however often the transport reports disconnected', async () => {
      const env = handEnv();
      env.transport.connected();
      const id = recordingId(env);
      env.transport.disconnected('device', 'gone');
      env.transport.disconnected('device', 'gone again');
      env.transport.disconnected(null);
      await env.recorder.whenIdle();
      const raw = await readRaw(id);
      expect(eventsOf(raw, 'disconnected').map((e) => e.data.message)).toEqual(['gone']);
      expect(raw.recording.endReason).toBe('device');
    });

    it('ends as error when the transport gives no reason', async () => {
      const env = handEnv();
      env.transport.connected();
      const id = recordingId(env);
      env.transport.disconnected(null);
      await env.recorder.whenIdle();
      const raw = await readRaw(id);
      expect(raw.recording.endReason).toBe('error');
      expect(raw.events.at(-1)?.data).toEqual({ reason: 'error', message: null });
    });

    it('ends the open recording if the transport reports connected again', async () => {
      const env = handEnv();
      env.transport.connected();
      const first = recordingId(env);
      env.transport.connected();
      const second = recordingId(env);
      expect(second).not.toBe(first);
      env.transport.disconnected('user');
      await env.recorder.whenIdle();
      expect((await readRaw(first)).events.at(-1)?.data).toEqual({
        reason: 'error',
        message: 'The transport reported connected again',
      });
      expect((await readRaw(second)).recording.endReason).toBe('user');
    });

    it('drops notifications outside a recording', async () => {
      const env = handEnv();
      env.transport.notify(weightFrame());
      env.transport.connected();
      const id = recordingId(env);
      env.transport.notify(weightFrame());
      env.transport.disconnected('user');
      env.transport.notify(weightFrame());
      await env.recorder.whenIdle();
      expect((await readRaw(id)).frames).toHaveLength(1);
    });
  });

  describe('storage failures', () => {
    /** Storage whose next appends, or ends, fail. */
    function flaky() {
      const control = { appends: 0, ends: 0 };
      const recorderStorage: RecorderStorage = {
        recordings: {
          create: (recording) => storage.recordings.create(recording),
          end: (id, at, reason) =>
            control.ends-- > 0
              ? Promise.reject(
                  new StorageError('failed', `Ending recording ${id}: UnknownError: Lost`),
                )
              : storage.recordings.end(id, at, reason),
        },
        raw: {
          append: (id, batch) =>
            control.appends-- > 0
              ? Promise.reject(new StorageError('quota', 'Appending: QuotaExceededError'))
              : storage.raw.append(id, batch),
        },
      };
      return { control, recorderStorage };
    }

    it('keeps every record through failing writes, logs one error per run, and warns', async () => {
      const { control, recorderStorage } = flaky();
      const env = mockEnv(IDLE, { storage: recorderStorage });
      await connect(env);
      await run(env.clock, 1500);
      control.appends = 3;
      await run(env.clock, 1500);
      expect(env.recorder.state.storageError).toBe('Appending: QuotaExceededError');
      expect(env.recorder.state.warnings).toEqual(['storage-failing']);
      expect(env.recorder.state.unsaved).toBeGreaterThan(10);
      await run(env.clock, 3000);
      expect(env.recorder.state.storageError).toBeNull();
      expect(env.recorder.state.warnings).toEqual([]);
      control.appends = 1;
      await run(env.clock, 3000);
      const id = recordingId(env);
      await env.transport.disconnect();
      await env.recorder.whenIdle();

      const raw = await readRaw(id);
      expect(raw.frames).toHaveLength(env.notifications.length);
      expect(timeline(raw).map((r) => r.seq)).toEqual(timeline(raw).map((_, i) => i));
      expect(eventsOf(raw, 'error').map((e) => e.data)).toEqual([
        { message: 'Appending: QuotaExceededError', context: 'storage' },
        { message: 'Appending: QuotaExceededError', context: 'storage' },
      ]);
      expect(raw.recording.endReason).toBe('user');
    });

    it('ends a recording only once everything is stored, retrying the end too', async () => {
      const { control, recorderStorage } = flaky();
      const env = mockEnv(IDLE, { storage: recorderStorage });
      await connect(env);
      await run(env.clock, 1000);
      const id = recordingId(env);
      control.appends = 2;
      control.ends = 2;
      await env.transport.disconnect();
      await run(env.clock, FINISH_RETRY_MS);
      expect((await storage.recordings.get(id))?.endReason).toBeNull();
      expect(env.recorder.state).toMatchObject({ finishing: 1, warnings: ['storage-failing'] });

      await run(env.clock, 5 * FINISH_RETRY_MS);
      await env.recorder.whenIdle();
      expect(env.recorder.state).toMatchObject({
        finishing: 0,
        unsaved: 0,
        storageError: null,
        warnings: [],
      });
      const raw = await readRaw(id);
      expect(raw.frames).toHaveLength(env.notifications.length);
      expect(raw.events.at(-1)?.type).toBe('disconnected');
      expect(raw.recording.endReason).toBe('user');
      // Once ended, no `error` event can follow `disconnected`: the failures after it aren't on
      // the timeline.
      expect(eventsOf(raw, 'error')).toEqual([]);
      expect(env.locks.isHeld(recordingLockName(id))).toBe(false);
    });

    it('shows a failing end as a storage error while it retries', async () => {
      const { control, recorderStorage } = flaky();
      const env = mockEnv(IDLE, { storage: recorderStorage });
      await connect(env);
      await run(env.clock, 500);
      const id = recordingId(env);
      control.ends = 1;
      await env.transport.disconnect();
      // The retry waits for the clock, which only the test moves.
      await vi.waitFor(() => {
        expect(env.recorder.state.storageError).toBe(`Ending recording ${id}: UnknownError: Lost`);
      });
      expect(env.recorder.state.warnings).toEqual(['storage-failing']);
      await run(env.clock, FINISH_RETRY_MS);
      await env.recorder.whenIdle();
      expect(env.recorder.state.storageError).toBeNull();
      expect((await storage.recordings.get(id))?.endReason).toBe('user');
    });
  });

  it('stores what it holds when the page is hidden', async () => {
    const env = mockEnv(IDLE, { writer: { maxDelayMs: 600_000, maxRecords: 100_000 } });
    await connect(env);
    await run(env.clock, 3000);
    const id = recordingId(env);
    expect((await readRaw(id)).frames).toEqual([]);
    env.page.hide();
    await vi.waitFor(async () => {
      expect((await readRaw(id)).frames).toHaveLength(env.notifications.length);
    });
    expect(env.notifications.length).toBeGreaterThan(20);
  });

  describe('live stats', () => {
    it('counts frames and their rate, and keeps the latest weight frame', async () => {
      const env = mockEnv();
      await connect(env);
      await run(env.clock, 5000);
      const stats = env.recorder.state.stats!;
      expect(stats.frames).toBe(env.notifications.length);
      expect(stats.framesPerSecond).toBeGreaterThanOrEqual(9);
      expect(stats.framesPerSecond).toBeLessThanOrEqual(11);
      const last = env.notifications.at(-1)!;
      expect(stats.lastWeight).toEqual({
        tMs: last.tArrival - env.connectedAt[0],
        frame: decodeFrame(last.bytes),
      });
      expect(stats.lastWeight?.frame.weightG).toBe(110);
      expect(stats).toMatchObject({
        failedFrames: 0,
        recentFailures: 0,
        failureAlarm: false,
        unitOk: true,
      });
    });

    it('lets frames/s fall to 0 when frames stop but the link stays up', async () => {
      const scenario: Scenario = {
        ...IDLE,
        script: [...IDLE.script, { type: 'power-off', atMs: 3000 }],
        scale: { ...IDLE.scale, supervisionTimeoutMs: 60_000 },
      };
      const env = mockEnv(scenario);
      const states: RecorderState[] = [];
      env.recorder.onChange((state) => states.push(state));
      await connect(env);
      await run(env.clock, 3000);
      expect(env.recorder.state.stats?.framesPerSecond).toBeGreaterThan(8);
      await run(env.clock, 500); // frames still in flight at power-off arrive
      const frames = env.notifications.length;
      states.length = 0;
      await run(env.clock, 2500);
      expect(env.notifications).toHaveLength(frames);
      // Only the tick reports this: no frame arrived to trigger a change.
      expect(states.at(-1)?.stats?.framesPerSecond).toBe(0);
      expect(states.length).toBeGreaterThanOrEqual(2);
    });

    it('raises the alarm when most frames fail to decode', async () => {
      const env = mockEnv({ ...IDLE, link: { corruptProbability: 0.9 } });
      await connect(env);
      await run(env.clock, 1000);
      // About 9 failures in 10 frames: under half of the 50-frame window, however bad the rate.
      expect(env.recorder.state.stats?.failureAlarm).toBe(false);
      await run(env.clock, 6000);
      const stats = env.recorder.state.stats!;
      expect(stats.failureAlarm).toBe(true);
      expect(stats.recentFailures).toBeGreaterThan(25);
      expect(stats.failedFrames).toBeGreaterThan(stats.recentFailures);
      expect(env.recorder.state.warnings).toContain('failing-frames');
      await env.recorder.flush();
      expect((await readRaw(recordingId(env))).frames).toHaveLength(env.notifications.length);
    });

    it("warns when the weight isn't in grams", async () => {
      const env = mockEnv({ ...IDLE, scale: { ...IDLE.scale, unitByte: 0x02 } });
      await connect(env);
      await run(env.clock, 500);
      expect(env.recorder.state.stats).toMatchObject({
        unitOk: false,
        lastWeight: { frame: { unitByte: 0x02 } },
      });
      expect(env.recorder.state.warnings).toEqual(['unit-not-grams']);
    });

    it('counts only FF11 frames towards the alarm: FF12 may carry anything', () => {
      const env = handEnv();
      env.transport.connected();
      for (let i = 0; i < 60; i++) env.transport.notify(new Uint8Array([0x03, 0x0d, i]), 'ff12');
      expect(env.recorder.state.stats).toMatchObject({
        frames: 60,
        failedFrames: 0,
        recentFailures: 0,
        failureAlarm: false,
      });
      expect(env.recorder.state.warnings).toEqual([]);
    });

    it("keeps raw bytes safe from a listener that changes the ones it's given", async () => {
      const env = handEnv();
      env.recorder.onFrame(({ frame }) => frame.bytes.fill(0));
      env.transport.connected();
      const bytes = weightFrame();
      env.transport.notify(bytes);
      await env.recorder.flush();
      const [stored] = (await readRaw(recordingId(env))).frames;
      expect(toHex(stored.bytes, '')).toBe(toHex(bytes, ''));
    });

    it('records a notification it can’t stamp as an error event, leaving no gap in seq', async () => {
      const env = handEnv();
      env.transport.connected();
      const id = recordingId(env);
      env.transport.notify(weightFrame(), 'ff11', Number.NaN);
      env.transport.notify(weightFrame(), 'ff11', 10);
      env.transport.disconnected('user');
      await env.recorder.whenIdle();
      const raw = await readRaw(id);
      expect(eventsOf(raw, 'error').map((e) => e.data.context)).toEqual(['recorder']);
      expect(eventsOf(raw, 'error')[0].data.message).toMatch(
        /ff11 notification couldn't be recorded/,
      );
      expect(raw.frames.map((f) => f.tMs)).toEqual([10]);
      expect(timeline(raw).map((r) => r.seq)).toEqual(timeline(raw).map((_, i) => i));
    });
  });
});
