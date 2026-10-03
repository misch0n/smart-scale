import { describe, expect, it } from 'vitest';
import { hasValidChecksum } from './checksum';
import * as commands from './commands';
import {
  allWhitelistedCommands,
  flowSmoothingOff,
  isWhitelistedCommand,
  keepAlive,
  resetTimer,
  setAutoOff,
  setBuzzer,
  startTimer,
  stopTimer,
  tare,
  tareAndStartTimer,
  type ScaleCommand,
} from './commands';
import { toHex } from './hex';

const CALIBRATION = 0x09;
const SHUTDOWN = 0x15;

describe('command bytes', () => {
  // Golden values: the spec's command table and docs/protocol-notes.md "Verified command bytes".
  it.each<[string, () => ScaleCommand, string]>([
    ['tare', tare, '03 0A 01 00 00 08'],
    ['buzzer mute', () => setBuzzer(0), '03 0A 02 00 00 0B'],
    ['buzzer level 5', () => setBuzzer(5), '03 0A 02 00 05 0E'],
    ['auto-off 5 min', () => setAutoOff(5), '03 0A 03 00 05 0F'],
    ['auto-off 30 min', () => setAutoOff(30), '03 0A 03 00 1E 14'],
    ['start timer', startTimer, '03 0A 04 00 00 0D'],
    ['stop timer', stopTimer, '03 0A 05 00 00 0C'],
    ['reset timer', resetTimer, '03 0A 06 00 00 0F'],
    ['tare and start timer', tareAndStartTimer, '03 0A 07 00 00 0E'],
    ['flow smoothing off', flowSmoothingOff, '03 0A 08 00 00 01'],
    ['keep-alive', keepAlive, '03 0A 25 00 00 2C'],
  ])('%s is %s', (_, make, hex) => {
    expect(toHex(make().bytes)).toBe(hex);
  });

  it('records the parameter, or null when there is none', () => {
    expect(setBuzzer(3).param).toBe(3);
    expect(setAutoOff(12).param).toBe(12);
    expect(tare().param).toBeNull();
  });

  it('flags keep-alive, and only keep-alive, as unverified', () => {
    const unverified = allWhitelistedCommands().filter((c) => c.unverified);
    expect(unverified.map((c) => c.name)).toEqual(['keepAlive']);
  });
});

describe('parameter range checks', () => {
  it.each([-1, 6, 2.5, NaN, Infinity])('setBuzzer(%s) throws', (level) => {
    expect(() => setBuzzer(level)).toThrow(RangeError);
  });

  it.each([4, 31, 0, -5, 37, 10.5, NaN])('setAutoOff(%s) throws', (minutes) => {
    expect(() => setAutoOff(minutes)).toThrow(RangeError);
  });

  // A parameter is payload (frame index 4), never a sub-command, so 9 and 21 (0x15) minutes
  // are ordinary auto-off values.
  it('puts parameters in the payload byte only', () => {
    expect(toHex(setAutoOff(9).bytes)).toBe('03 0A 03 00 09 03');
    expect(toHex(setAutoOff(21).bytes)).toBe('03 0A 03 00 15 1F');
  });
});

// CLAUDE.md hard rule 5 and D-008: calibration (09) and shutdown (15) must be unrepresentable.
describe('the whitelist', () => {
  const all = allWhitelistedCommands();

  it('has every allowed parameter value: 1 + 6 + 26 + 6 commands', () => {
    expect(all).toHaveLength(39);
    expect(new Set(all.map((c) => toHex(c.bytes))).size).toBe(all.length);
  });

  it('is exactly the documented sub-commands', () => {
    const subs = [...new Set(all.map((c) => c.bytes[2]))].sort((a, b) => a - b);
    expect(subs).toEqual([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x25]);
  });

  it('can never produce calibration or shutdown', () => {
    for (const cmd of all) {
      expect(cmd.bytes[2]).not.toBe(CALIBRATION);
      expect(cmd.bytes[2]).not.toBe(SHUTDOWN);
    }
  });

  it('only produces well-formed command frames', () => {
    for (const cmd of all) {
      expect(cmd.bytes).toHaveLength(6);
      expect([cmd.bytes[0], cmd.bytes[1], cmd.bytes[3]]).toEqual([0x03, 0x0a, 0x00]);
      expect(hasValidChecksum(cmd.bytes)).toBe(true);
    }
  });

  it('cannot be widened through a parameter: every input either throws or stays listed', () => {
    const listed = new Set(all.map((c) => toHex(c.bytes)));
    const inputs = [
      ...Array.from({ length: 600 }, (_, i) => i - 300),
      CALIBRATION + 0.5,
      -0,
      NaN,
      Infinity,
      -Infinity,
      Number.MAX_SAFE_INTEGER,
    ];
    for (const make of [setBuzzer, setAutoOff]) {
      for (const input of inputs) {
        let cmd: ScaleCommand;
        try {
          cmd = make(input);
        } catch {
          continue;
        }
        expect(listed.has(toHex(cmd.bytes))).toBe(true);
      }
    }
  });

  // There must be no generic "encode sub-command N" function (D-008). If this fails because you
  // added an export, make sure it can't produce arbitrary bytes, then update the list.
  it('exports named constructors only', () => {
    expect(Object.keys(commands).sort()).toEqual([
      'AUTO_OFF_MINUTES',
      'BUZZER_LEVELS',
      'allWhitelistedCommands',
      'flowSmoothingOff',
      'isWhitelistedCommand',
      'keepAlive',
      'resetTimer',
      'setAutoOff',
      'setBuzzer',
      'startTimer',
      'stopTimer',
      'tare',
      'tareAndStartTimer',
    ]);
  });
});

describe('isWhitelistedCommand', () => {
  it('accepts every whitelisted command', () => {
    for (const cmd of allWhitelistedCommands()) expect(isWhitelistedCommand(cmd)).toBe(true);
  });

  it('gives each call its own bytes, so mutating one command cannot change another', () => {
    const first = tare();
    first.bytes[2] = CALIBRATION;
    expect(toHex(tare().bytes)).toBe('03 0A 01 00 00 08');
    expect(isWhitelistedCommand(first)).toBe(false);
  });

  it('rejects mutated bytes, even with a fixed-up checksum', () => {
    const cmd = tare();
    cmd.bytes[2] = SHUTDOWN;
    cmd.bytes[5] = 0x1c;
    expect(hasValidChecksum(cmd.bytes)).toBe(true);
    expect(isWhitelistedCommand(cmd)).toBe(false);
  });

  it('rejects hand-made objects that do not match the whitelist', () => {
    const calibration = Uint8Array.of(0x03, 0x0a, CALIBRATION, 0x00, 0x00, 0x00);
    const forged = [
      { name: 'tare', param: null, bytes: calibration, unverified: false },
      { name: 'calibrate', param: null, bytes: calibration, unverified: false },
      { name: 'setBuzzer', param: 9, bytes: tare().bytes, unverified: false },
      { name: 'tare', param: 1, bytes: tare().bytes, unverified: false },
      { name: 'tare', param: null, bytes: [3, 10, 1, 0, 0, 8], unverified: false },
      { name: 'tare', param: null, bytes: Uint8Array.of(3, 10, 1, 0, 0, 8, 0), unverified: false },
      { name: 'keepAlive', param: null, bytes: keepAlive().bytes, unverified: false },
      { name: 'toString', param: null, bytes: tare().bytes, unverified: false },
      null,
      undefined,
      'tare',
      tare().bytes,
    ];
    for (const value of forged) expect(isWhitelistedCommand(value)).toBe(false);
  });

  it('accepts an equal copy, since it only checks the content', () => {
    const copy = { ...setBuzzer(2), bytes: setBuzzer(2).bytes.slice() };
    expect(isWhitelistedCommand(copy)).toBe(true);
  });
});
