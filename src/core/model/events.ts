/**
 * App events: what the app or the user did, on the same timeline and sequence as the frames.
 * They are raw data, append-only like frames. Analysis reads them too: tare commands for
 * zero-tracking, annotations to check detectors against, manual-start presses for operator
 * latency.
 *
 * Adding an event type: add its data shape to `AppEventDataMap` and its parser to `EVENT_DATA`
 * (the compiler insists on both), then a sample to `completeness.test.ts`. An older build
 * refuses a record with a type it doesn't know, loudly, rather than dropping it (D-018).
 */

import { allWhitelistedCommands, toHex, type CommandName, type ScaleCommand } from '../protocol';
import { CHARACTERISTIC_NAMES, type CharacteristicName } from './frame';
import type { Id } from './ids';
import { DISCONNECT_REASONS, type DisconnectReason } from './recording';
import { field, SchemaError, type Field, type JsonValue, type ObjectSchema } from './schema';

/**
 * The labels of the probe's annotation buttons (T1.8, hardware tests Part C). Analysis compares
 * its detectors against them (T1.16). `note` carries free text. Other labels are allowed.
 */
export const ANNOTATION_LABELS = ['pump-on', 'pump-off', 'cup-on', 'cup-off', 'note'] as const;
export type KnownAnnotationLabel = (typeof ANNOTATION_LABELS)[number];

/** A command the app wrote to the scale, or tried to. */
export interface CommandEventData {
  /** The whitelist name (`src/core/protocol`). */
  readonly command: CommandName;
  /** The buzzer level or auto-off minutes; null for commands without one. */
  readonly param: number | null;
  /** The bytes, as packed upper-case hex like `030A0700000E`. */
  readonly hex: string;
  /** Why it was sent, like `connect` or `manual-start`; null if the caller gave no reason. */
  readonly reason: string | null;
}

export interface CommandFailedEventData extends CommandEventData {
  /** The error message. */
  readonly error: string;
}

/**
 * A characteristic's GATT properties, as the runtime reported them (hardware test A15). Each
 * is null when the runtime didn't report it: shims may leave some out.
 */
export interface CharacteristicProperties {
  readonly broadcast: boolean | null;
  readonly read: boolean | null;
  readonly writeWithoutResponse: boolean | null;
  readonly write: boolean | null;
  readonly notify: boolean | null;
  readonly indicate: boolean | null;
  readonly authenticatedSignedWrites: boolean | null;
  readonly reliableWrite: boolean | null;
  readonly writableAuxiliaries: boolean | null;
}

/** Each event type, and the shape of its `data`. */
export interface AppEventDataMap {
  /** The transport connected. It is the recording's first event. */
  readonly connected: { readonly deviceName: string | null; readonly deviceId: string | null };
  /** The connection ended. It is the recording's last event, unless the app died first. */
  readonly disconnected: { readonly reason: DisconnectReason; readonly message: string | null };
  readonly 'command-sent': CommandEventData;
  readonly 'command-failed': CommandFailedEventData;
  /** A button press or another user action, like `manual-start`. `detail` is any JSON. */
  readonly 'ui-action': { readonly action: string; readonly detail: JsonValue };
  /** A label the user put on the timeline, like `pump-on` (see `ANNOTATION_LABELS`). */
  readonly annotation: { readonly label: string; readonly text: string | null };
  /** A weight frame showed smoothing off after `flowSmoothingOff` (spec parsing rule 5, T1.6). */
  readonly 'smoothing-confirmed': { readonly attempts: number };
  /** Smoothing still read on after every attempt, so the tail fit can't be trusted (T1.6). */
  readonly 'smoothing-not-confirmed': {
    readonly attempts: number;
    /** The smoothing byte of the last weight frame; null if none arrived. */
    readonly smoothingByte: number | null;
  };
  readonly error: {
    readonly message: string;
    /** Where it happened, like `storage` or `transport`. */
    readonly context: string | null;
  };
  readonly 'characteristic-properties': {
    readonly characteristic: CharacteristicName;
    readonly properties: CharacteristicProperties;
  };
}

export type AppEventType = keyof AppEventDataMap;

/** An app event of one type. */
export interface AppEventOf<K extends AppEventType> {
  readonly recordingId: Id;
  /** The recording's sequence number, shared with its frames (`RecordingSequence`). */
  readonly seq: number;
  /** ms since the recording started, on the same clock as the frames' arrival times. */
  readonly tMs: number;
  readonly type: K;
  readonly data: AppEventDataMap[K];
}

/** Any app event: a union discriminated by `type`. */
export type AppEvent = { [K in AppEventType]: AppEventOf<K> }[AppEventType];

type Data<K extends AppEventType> = AppEventDataMap[K];

const COMMAND_NAMES: readonly CommandName[] = [
  ...new Set(allWhitelistedCommands().map((c) => c.name)),
];

const PACKED_UPPER_HEX = /^(?:[0-9A-F]{2})*$/;

const hexField: Field<string> = (value, path) => {
  const hex = field.string(value, path);
  if (PACKED_UPPER_HEX.test(hex)) return hex;
  throw new SchemaError(path, `expected packed upper-case hex, got ${JSON.stringify(hex)}`);
};

const COMMAND_SCHEMA: ObjectSchema<CommandEventData> = {
  command: field.oneOf(COMMAND_NAMES),
  param: field.nullable(field.integer),
  hex: hexField,
  reason: field.nullable(field.string),
};

const nullableBoolean = field.nullable(field.boolean);

const EVENT_DATA: { readonly [K in AppEventType]: Field<Data<K>> } = {
  connected: field.object<Data<'connected'>>({
    deviceName: field.nullable(field.string),
    deviceId: field.nullable(field.string),
  }),
  disconnected: field.object<Data<'disconnected'>>({
    reason: field.oneOf(DISCONNECT_REASONS),
    message: field.nullable(field.string),
  }),
  'command-sent': field.object(COMMAND_SCHEMA),
  'command-failed': field.object<CommandFailedEventData>({
    ...COMMAND_SCHEMA,
    error: field.string,
  }),
  'ui-action': field.object<Data<'ui-action'>>({ action: field.string, detail: field.json }),
  annotation: field.object<Data<'annotation'>>({
    label: field.string,
    text: field.nullable(field.string),
  }),
  'smoothing-confirmed': field.object<Data<'smoothing-confirmed'>>({
    attempts: field.nonNegativeInteger,
  }),
  'smoothing-not-confirmed': field.object<Data<'smoothing-not-confirmed'>>({
    attempts: field.nonNegativeInteger,
    smoothingByte: field.nullable(field.nonNegativeInteger),
  }),
  error: field.object<Data<'error'>>({
    message: field.string,
    context: field.nullable(field.string),
  }),
  'characteristic-properties': field.object<Data<'characteristic-properties'>>({
    characteristic: field.oneOf(CHARACTERISTIC_NAMES),
    properties: field.object<CharacteristicProperties>({
      broadcast: nullableBoolean,
      read: nullableBoolean,
      writeWithoutResponse: nullableBoolean,
      write: nullableBoolean,
      notify: nullableBoolean,
      indicate: nullableBoolean,
      authenticatedSignedWrites: nullableBoolean,
      reliableWrite: nullableBoolean,
      writableAuxiliaries: nullableBoolean,
    }),
  }),
};

/** Every event type, in declaration order. */
export const APP_EVENT_TYPES = Object.keys(EVENT_DATA) as readonly AppEventType[];

const parseEventBase = field.object<Omit<AppEventOf<AppEventType>, 'data'>>({
  recordingId: field.id,
  seq: field.nonNegativeInteger,
  tMs: field.number,
  type: field.oneOf(APP_EVENT_TYPES),
});

/**
 * A complete `AppEvent` from stored or imported data: missing nullable fields, in `data` too,
 * become `null`, and unknown keys are dropped (D-018).
 *
 * @throws SchemaError when a required field is missing, a value has the wrong type, or the
 *   event type is unknown.
 */
export function normaliseAppEvent(input: unknown, path = 'event'): AppEvent {
  const base = parseEventBase(input, path);
  const record = input as Readonly<Record<string, unknown>>;
  const data = EVENT_DATA[base.type](
    Object.hasOwn(record, 'data') ? record.data : undefined,
    `${path}.data`,
  );
  return { ...base, data } as AppEvent;
}

/**
 * An app event. The recorder makes events through `RecordingSequence.event()`, which assigns
 * `seq`.
 *
 * @throws SchemaError on a malformed input (a programming error, like a NaN time).
 */
export function createAppEvent<K extends AppEventType>(
  recordingId: Id,
  seq: number,
  tMs: number,
  type: K,
  data: AppEventDataMap[K],
): AppEventOf<K> {
  return normaliseAppEvent({ recordingId, seq, tMs, type, data }) as AppEventOf<K>;
}

/** The data of a `command-sent` event. Add `error` to it for a `command-failed` one. */
export function commandEventData(command: ScaleCommand, reason: string | null): CommandEventData {
  return { command: command.name, param: command.param, hex: toHex(command.bytes, ''), reason };
}
