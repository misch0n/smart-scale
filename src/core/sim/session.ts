/**
 * Whole simulated sessions: run a scenario in one go, turn it into the records the recorder
 * would store, and build the usual scenarios.
 */

import {
  AUTO_TARE_REASON,
  commandEventData,
  createIdGenerator,
  MANUAL_START,
  createRecording,
  endRecording,
  RecordingSequence,
  type AppEvent,
  type DisconnectReason,
  type Id,
  type RawFrame,
  type Recording,
} from '../model';
import { allWhitelistedCommands, DEVICE_NAME_PREFIX, tareAndStartTimer, toHex } from '../protocol';
import type { LinkParams, ScaleMode, ScaleParams } from './params';
import { Rng } from './random';
import type { ScriptEvent } from './script';
import { DEFAULT_SHOT_PARAMS, type ShotParams } from './shot';
import { ScaleSimulator, type Scenario, type SessionTruth, type SimFrame } from './simulator';

export interface SimulatedSession {
  readonly scenario: Scenario;
  /** The parameters in force, defaults filled in. */
  readonly scale: ScaleParams;
  readonly link: LinkParams;
  /** Every frame that arrived by `durationMs`, in arrival order. */
  readonly frames: readonly SimFrame[];
  readonly truth: SessionTruth;
}

/**
 * Runs a scenario from connect to `durationMs`. Commands come from the script. Deterministic:
 * the same scenario gives the same session.
 *
 * @throws RangeError on an invalid scenario.
 */
export function simulateSession(scenario: Scenario): SimulatedSession {
  if (!Number.isFinite(scenario.durationMs) || scenario.durationMs < 0) {
    throw new RangeError(`simulateSession: durationMs ${scenario.durationMs} is not a duration`);
  }
  const simulator = new ScaleSimulator(scenario);
  const frames = simulator.advanceTo(scenario.durationMs);
  return {
    scenario,
    scale: simulator.scale,
    link: simulator.link,
    frames,
    truth: simulator.truth(),
  };
}

/** The device a simulated recording claims to come from. */
export const SIM_DEVICE = { name: `${DEVICE_NAME_PREFIX} simulator`, id: null } as const;

/** 2026-10-03T00:00:00Z: the default start of a simulated recording. */
const DEFAULT_STARTED_AT_EPOCH_MS = Date.UTC(2026, 9, 3);

export interface RawSession {
  /** Ended at the session's end: `device` if the scale switched off, else `user`. */
  readonly recording: Recording;
  readonly frames: readonly RawFrame[];
  readonly events: readonly AppEvent[];
}

export interface RawSessionOptions {
  /** Default: an id derived from the scenario's seed, so the output is deterministic. */
  readonly recordingId?: Id;
  /** Default 2026-10-03T00:00:00Z. */
  readonly startedAtEpochMs?: number;
}

/**
 * The session as the recorder would store it (T1.6): a recording, its frames with arrival
 * times as `tMs`, and `connected`, `command-sent` and `disconnected` events, all numbered by one
 * `RecordingSequence` in time order. It's a stand-in for analysis tests, not the recorder: it
 * logs no characteristic properties, smoothing checks or UI actions.
 *
 * @throws Error if a command in the session isn't on the whitelist.
 */
export function toRawRecording(
  session: SimulatedSession,
  options: RawSessionOptions = {},
): RawSession {
  const startedAtEpochMs = options.startedAtEpochMs ?? DEFAULT_STARTED_AT_EPOCH_MS;
  const recording = createRecording({
    id: options.recordingId ?? seededId(session.scenario.seed, startedAtEpochMs),
    startedAtEpochMs,
    device: SIM_DEVICE,
    transport: 'mock',
    app: { commit: 'simulator', buildTime: new Date(startedAtEpochMs).toISOString() },
    userAgent: null,
  });
  const { linkLostAtMs } = session.truth;
  const end: { tMs: number; reason: DisconnectReason } =
    linkLostAtMs !== null && linkLostAtMs <= session.scenario.durationMs
      ? { tMs: linkLostAtMs, reason: 'device' }
      : { tMs: session.scenario.durationMs, reason: 'user' };

  const sequence = new RecordingSequence(recording.id);
  const frames: RawFrame[] = [];
  const events: AppEvent[] = [
    sequence.event(0, 'connected', { deviceName: SIM_DEVICE.name, deviceId: SIM_DEVICE.id }),
  ];
  const addFramesBefore = (tMs: number): void => {
    while (frames.length < session.frames.length) {
      const frame = session.frames[frames.length];
      if (frame.tArrival >= tMs) break;
      frames.push(sequence.frame(frame.tArrival, frame.source, frame.bytes));
    }
  };
  for (const command of session.truth.commands) {
    // A command logged at the same ms as a frame goes first, as the recorder logs it on sending.
    addFramesBefore(command.sentAtMs);
    events.push(
      sequence.event(
        command.sentAtMs,
        'command-sent',
        commandEventData(whitelisted(command.hex), command.reason),
      ),
    );
  }
  addFramesBefore(Infinity);
  events.push(sequence.event(end.tMs, 'disconnected', { reason: end.reason, message: null }));
  return {
    recording: endRecording(recording, startedAtEpochMs + end.tMs, end.reason),
    frames,
    events,
  };
}

export interface EspressoScenarioOptions {
  /** Default 1. */
  readonly seed?: number;
  /** The empty cup, g. Default 110. */
  readonly cupG?: number;
  /** When the cup goes on, ms. Default 2000. */
  readonly cupOnMs?: number;
  /**
   * When the app sends tare-and-start (`07`), ms, or null for no command. Default 3 s after the
   * cup goes on.
   */
  readonly tareAndStartMs?: number | null;
  /** `pump_on`, ms. Default 2 s after the tare, or 5 s after the cup without one. */
  readonly pumpOnMs?: number;
  /**
   * When the user taps Tare + start with the pump, ms: a `07` the app logs as `manual-start`,
   * the shot's pump_on until the microphone (Q4, D-048). Null, the default, for no tap.
   */
  readonly manualStartMs?: number | null;
  /** Shot parameters; the rest come from `DEFAULT_SHOT_PARAMS`. */
  readonly shot?: Partial<ShotParams>;
  /**
   * From `pump_off` to lifting the cup, ms, or null to leave it on. Default 30 000: hardware
   * test C3 waits at least 30 s.
   */
  readonly cupOffAfterPumpOffMs?: number | null;
  /** Idle time after the last event, ms. Default 5000. */
  readonly trailingMs?: number;
  readonly scale?: Partial<ScaleParams>;
  readonly link?: Partial<LinkParams>;
}

/**
 * One espresso shot, the way the spec's workflow runs it: cup on, the app's tare-and-start,
 * the shot, a wait, cup off. Everything can be moved or left out through the options.
 */
export function espressoScenario(options: EspressoScenarioOptions = {}): Scenario {
  const cupOnMs = options.cupOnMs ?? 2000;
  const tareAndStartMs =
    options.tareAndStartMs === undefined ? cupOnMs + 3000 : options.tareAndStartMs;
  const pumpOnMs = options.pumpOnMs ?? (tareAndStartMs ?? cupOnMs + 3000) + 2000;
  const preInfusionMs = options.shot?.preInfusionMs ?? DEFAULT_SHOT_PARAMS.preInfusionMs;
  const extractionMs = options.shot?.extractionMs ?? DEFAULT_SHOT_PARAMS.extractionMs;
  const pumpOffMs = pumpOnMs + preInfusionMs + extractionMs;
  const cupOffAfter =
    options.cupOffAfterPumpOffMs === undefined ? 30_000 : options.cupOffAfterPumpOffMs;

  const script: ScriptEvent[] = [{ type: 'cup-on', atMs: cupOnMs, massG: options.cupG ?? 110 }];
  if (tareAndStartMs !== null) {
    script.push({
      type: 'command',
      atMs: tareAndStartMs,
      command: tareAndStartTimer(),
      reason: AUTO_TARE_REASON,
    });
  }
  if (options.manualStartMs !== undefined && options.manualStartMs !== null) {
    script.push({
      type: 'command',
      atMs: options.manualStartMs,
      command: tareAndStartTimer(),
      reason: MANUAL_START,
    });
  }
  script.push({ type: 'shot', atMs: pumpOnMs, ...options.shot });
  const lastMs = cupOffAfter === null ? pumpOffMs + 30_000 : pumpOffMs + cupOffAfter;
  if (cupOffAfter !== null) script.push({ type: 'cup-off', atMs: lastMs });

  return {
    seed: options.seed ?? 1,
    durationMs: lastMs + (options.trailingMs ?? 5000),
    script,
    scale: options.scale,
    link: options.link,
  };
}

/**
 * A session for the mock transport in the UI (T1.8's `#/probe?mock`): two shots a minute apart
 * into fresh cups, then an idle scale. Smoothing starts on, so the recorder has to turn it off.
 * The scale is in its timer mode by default, the app's (D-038), so FF12 stays quiet, as it did
 * in session 1 outside the automatic mode; `mode` leaves it in another, for the mode check's
 * warning (T1.25, `&mode=` on the mock's routes). The app sends every command itself.
 */
export function demoScenario(seed = 1, mode: ScaleMode = 'timer'): Scenario {
  const second = { yieldG: 36, preInfusionMs: 7500, extractionMs: 25_000, tailTauMs: 1800 };
  return {
    seed,
    durationMs: 160_000,
    script: [
      { type: 'cup-on', atMs: 3000, massG: 110 },
      { type: 'shot', atMs: 10_000 },
      { type: 'cup-off', atMs: 60_000 },
      { type: 'cup-on', atMs: 75_000, massG: 95 },
      { type: 'shot', atMs: 82_000, ...second },
      { type: 'tare-button', atMs: 120_000 },
      { type: 'cup-off', atMs: 150_000 },
    ],
    scale: { initialSmoothing: true, mode },
  };
}

function whitelisted(hex: string): ReturnType<typeof allWhitelistedCommands>[number] {
  const command = allWhitelistedCommands().find((c) => toHex(c.bytes, '') === hex);
  if (!command) throw new Error(`toRawRecording: ${hex} is not a whitelisted command`);
  return command;
}

/** A UUIDv7 made from the scenario's seed and start time, so it's the same on every run. */
function seededId(seed: number, epochMs: number): Id {
  const rng = new Rng(seed).fork('recording-id');
  return createIdGenerator({
    now: () => epochMs,
    fillRandom: (bytes) => {
      for (let i = 0; i < bytes.length; i++) bytes[i] = rng.int(256);
    },
  })();
}
