/**
 * A recording: one BLE connection, from connect to disconnect (raw layer). Its frames and app
 * events are stored apart from it and point back to it by `recordingId`.
 */

import { newId, type Id } from './ids';
import { field, type ObjectSchema } from './schema';

/** The `ScaleTransport` that captured a recording (T1.3, T1.4). */
export const TRANSPORT_KINDS = ['web-bluetooth', 'mock'] as const;
export type TransportKind = (typeof TRANSPORT_KINDS)[number];

/**
 * Why a connection ended:
 * - `user`: the app disconnected, because the user asked it to;
 * - `device`: the link dropped (scale switched off, out of range, the OS);
 * - `error`: the app hit an error and closed the connection.
 */
export const DISCONNECT_REASONS = ['user', 'device', 'error'] as const;
export type DisconnectReason = (typeof DISCONNECT_REASONS)[number];

/**
 * A disconnect reason, or `unclean`: the app stopped without ending the recording (the tab was
 * closed or crashed). The recorder sets `unclean` at the next startup (T1.6).
 */
export const RECORDING_END_REASONS = [...DISCONNECT_REASONS, 'unclean'] as const;
export type RecordingEndReason = (typeof RECORDING_END_REASONS)[number];

/** What the browser reported about the scale. */
export interface DeviceInfo {
  /** The advertised name, as the browser reported it. */
  readonly name: string | null;
  /** The browser's opaque, per-origin device id (Web Bluetooth `BluetoothDevice.id`). */
  readonly id: string | null;
}

/** The build that captured a recording: `src/platform/build-info.ts`, passed in by the app. */
export interface AppInfo {
  readonly commit: string;
  readonly buildTime: string;
}

export interface Recording {
  readonly id: Id;
  /** Wall clock when the recording started, the origin of its frames' and events' `tMs`. */
  readonly startedAtEpochMs: number;
  /** null while the recording is open. */
  readonly endedAtEpochMs: number | null;
  /** null while the recording is open. */
  readonly endReason: RecordingEndReason | null;
  readonly device: DeviceInfo;
  readonly transport: TransportKind;
  readonly app: AppInfo;
  /**
   * `navigator.userAgent`, passed in by the app (core can't read `navigator`). It tells which
   * runtime captured the data, beacio or Bluefy (D-016), whose notification timing may differ.
   */
  readonly userAgent: string | null;
}

const RECORDING_SCHEMA: ObjectSchema<Recording> = {
  id: field.id,
  startedAtEpochMs: field.number,
  endedAtEpochMs: field.nullable(field.number),
  endReason: field.nullable(field.oneOf(RECORDING_END_REASONS)),
  device: field.object<DeviceInfo>({
    name: field.nullable(field.string),
    id: field.nullable(field.string),
  }),
  transport: field.oneOf(TRANSPORT_KINDS),
  app: field.object<AppInfo>({ commit: field.string, buildTime: field.string }),
  userAgent: field.nullable(field.string),
};

const parseRecording = field.object(RECORDING_SCHEMA);

/**
 * A complete `Recording` from stored or imported data: missing nullable fields become `null`
 * and unknown keys are dropped (D-018).
 *
 * @throws SchemaError when a required field is missing or a value has the wrong type.
 */
export function normaliseRecording(input: unknown, path = 'recording'): Recording {
  return parseRecording(input, path);
}

export interface NewRecording {
  /** Default: a new id. */
  readonly id?: Id;
  readonly startedAtEpochMs: number;
  readonly device: DeviceInfo;
  readonly transport: TransportKind;
  readonly app: AppInfo;
  readonly userAgent: string | null;
}

/** An open recording. @throws SchemaError on a malformed input. */
export function createRecording(input: NewRecording): Recording {
  return normaliseRecording({
    ...input,
    id: input.id ?? newId(),
    endedAtEpochMs: null,
    endReason: null,
  });
}

/**
 * The recording, ended. A recording ends once: ending it again is a bug in the caller.
 *
 * @throws Error if it has already ended.
 */
export function endRecording(
  recording: Recording,
  endedAtEpochMs: number,
  endReason: RecordingEndReason,
): Recording {
  if (recording.endedAtEpochMs !== null || recording.endReason !== null) {
    throw new Error(`endRecording: recording ${recording.id} has already ended`);
  }
  return normaliseRecording({ ...recording, endedAtEpochMs, endReason });
}

/**
 * Converts a time on a recording's timeline (`tMs`) to wall-clock epoch ms, for display. It
 * assumes the wall clock didn't jump during the recording.
 */
export function epochMsAt(recording: Recording, tMs: number): number {
  return recording.startedAtEpochMs + tMs;
}
