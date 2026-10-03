/**
 * The command whitelist (D-008): the only bytes the app ever writes to the scale.
 *
 * Commands are 6 bytes, `03 0A <sub> <d1> <d2> <xor>`. Each whitelisted command has its own
 * constructor, and on purpose there is no "encode sub-command N" export: the sub-command space
 * holds calibration (`0x09`), shutdown (`0x15`) and firmware commands, which must never be sent
 * (CLAUDE.md hard rule 5). Adding a command means adding a named entry below, with the user's
 * approval if it isn't in the Mini doc.
 *
 * Left out deliberately: smoothing *on* (its payload byte has moved between doc revisions and
 * the spec wants it off), and the Ultra-only `0x0B` and `0x0D` (unverified on the Mini).
 */

import { xorChecksum } from './checksum';
import { COMMAND_FRAME_LENGTH, FRAME_TYPE, PRODUCT_BYTE } from './frames';

export const BUZZER_LEVELS = { min: 0, max: 5 } as const;
export const AUTO_OFF_MINUTES = { min: 5, max: 30 } as const;

interface CommandSpec {
  /** Sub-command byte, frame index 2. */
  readonly sub: number;
  /** Allowed integer parameter values, written to frame index 4; null when there is none. */
  readonly param: { readonly min: number; readonly max: number } | null;
  /** Only the Ultra doc lists it, so it's unconfirmed on the Mini. */
  readonly unverified: boolean;
}

const WHITELIST = {
  tare: { sub: 0x01, param: null, unverified: false },
  /** Level 0 mutes. */
  setBuzzer: { sub: 0x02, param: BUZZER_LEVELS, unverified: false },
  setAutoOff: { sub: 0x03, param: AUTO_OFF_MINUTES, unverified: false },
  startTimer: { sub: 0x04, param: null, unverified: false },
  stopTimer: { sub: 0x05, param: null, unverified: false },
  resetTimer: { sub: 0x06, param: null, unverified: false },
  tareAndStartTimer: { sub: 0x07, param: null, unverified: false },
  flowSmoothingOff: { sub: 0x08, param: null, unverified: false },
  /** Resets the auto-off countdown. Ultra doc only; hardware test A6. */
  keepAlive: { sub: 0x25, param: null, unverified: true },
} as const satisfies Record<string, CommandSpec>;

export type CommandName = keyof typeof WHITELIST;

declare const whitelisted: unique symbol;

/**
 * A command from the whitelist. The brand means only this module can create one, so a
 * transport's `send(cmd: ScaleCommand)` can't be handed raw bytes. The brand is compile-time
 * only and `bytes` is a mutable array, so transports also call `isWhitelistedCommand()` right
 * before writing.
 */
export interface ScaleCommand {
  readonly name: CommandName;
  /** The buzzer level or auto-off minutes; null for commands without a parameter. */
  readonly param: number | null;
  /** The 6 bytes to write to FF12: a new array on every constructor call. */
  readonly bytes: Uint8Array<ArrayBuffer>;
  /** Only the Ultra doc lists this command; the probe labels it unverified. */
  readonly unverified: boolean;
  readonly [whitelisted]: true;
}

export function tare(): ScaleCommand {
  return build('tare', null);
}

/** Buzzer volume, 0 (mute) to 5. */
export function setBuzzer(level: number): ScaleCommand {
  return build('setBuzzer', level);
}

/** Auto-off after 5 to 30 minutes. */
export function setAutoOff(minutes: number): ScaleCommand {
  return build('setAutoOff', minutes);
}

export function startTimer(): ScaleCommand {
  return build('startTimer', null);
}

export function stopTimer(): ScaleCommand {
  return build('stopTimer', null);
}

export function resetTimer(): ScaleCommand {
  return build('resetTimer', null);
}

/** `07`: tare and start the timer in one command (spec "Tare arming", "Manual start"). */
export function tareAndStartTimer(): ScaleCommand {
  return build('tareAndStartTimer', null);
}

/** Sent at connect (spec parsing rule 5). The recorder confirms it in frame byte 17. */
export function flowSmoothingOff(): ScaleCommand {
  return build('flowSmoothingOff', null);
}

/** Unverified on the Mini (hardware test A6). */
export function keepAlive(): ScaleCommand {
  return build('keepAlive', null);
}

/** Every command the whitelist can produce: each name with each allowed parameter value. */
export function allWhitelistedCommands(): ScaleCommand[] {
  const all: ScaleCommand[] = [];
  for (const name of commandNames()) {
    const { param } = WHITELIST[name] as CommandSpec;
    if (param === null) all.push(build(name, null));
    else for (let p = param.min; p <= param.max; p++) all.push(build(name, p));
  }
  return all;
}

/**
 * True only for a command this module built, unchanged since. It rebuilds the command from its
 * name and parameter and compares the bytes, so a mutated `bytes` array or a hand-made object
 * is rejected. Transports call it right before every write.
 */
export function isWhitelistedCommand(value: unknown): value is ScaleCommand {
  if (typeof value !== 'object' || value === null) return false;
  const { name, param, bytes, unverified } = value as Record<string, unknown>;
  if (typeof name !== 'string' || !Object.hasOwn(WHITELIST, name)) return false;
  if (param !== null && typeof param !== 'number') return false;
  if (!(bytes instanceof Uint8Array)) return false;
  let expected: ScaleCommand;
  try {
    expected = build(name as CommandName, param);
  } catch {
    return false;
  }
  return (
    unverified === expected.unverified &&
    bytes.length === expected.bytes.length &&
    expected.bytes.every((byte, i) => bytes[i] === byte)
  );
}

function commandNames(): CommandName[] {
  return Object.keys(WHITELIST) as CommandName[];
}

function build(name: CommandName, param: number | null): ScaleCommand {
  const spec: CommandSpec = WHITELIST[name];
  if (spec.param === null) {
    if (param !== null) throw new RangeError(`${name} takes no parameter, got ${param}`);
  } else if (
    param === null ||
    !Number.isInteger(param) ||
    param < spec.param.min ||
    param > spec.param.max
  ) {
    throw new RangeError(
      `${name} needs an integer in ${spec.param.min}–${spec.param.max}, got ${param}`,
    );
  }
  const bytes = new Uint8Array(COMMAND_FRAME_LENGTH);
  bytes[0] = PRODUCT_BYTE;
  bytes[1] = FRAME_TYPE.command;
  bytes[2] = spec.sub;
  bytes[3] = 0x00;
  bytes[4] = param ?? 0x00;
  bytes[5] = xorChecksum(bytes.subarray(0, 5));
  return { name, param, bytes, unverified: spec.unverified } as ScaleCommand;
}
