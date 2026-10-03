import { describe, expect, it } from 'vitest';
import { allWhitelistedCommands, fromHex, tareAndStartTimer } from '../protocol';
import {
  APP_EVENT_TYPES,
  commandEventData,
  createAppEvent,
  normaliseAppEvent,
  type AppEvent,
} from './events';
import { SchemaError } from './schema';

const REC = '01923456-789a-7000-8000-000000000001';

describe('event types', () => {
  it('are the ones the recorder and the probe log (T1.2)', () => {
    expect(APP_EVENT_TYPES).toEqual([
      'connected',
      'disconnected',
      'command-sent',
      'command-failed',
      'ui-action',
      'annotation',
      'smoothing-confirmed',
      'smoothing-not-confirmed',
      'error',
      'characteristic-properties',
    ]);
  });

  it('narrow on `type`', () => {
    const event: AppEvent = createAppEvent(REC, 4, 900, 'annotation', {
      label: 'pump-on',
      text: null,
    });
    // A compile-time check as much as a runtime one: `data.label` exists only on annotations.
    expect(event.type === 'annotation' ? event.data.label : null).toBe('pump-on');
  });
});

describe('createAppEvent', () => {
  it('copies the data, so later changes to the caller object do not reach the log', () => {
    const detail = { dose: 18 };
    const event = createAppEvent(REC, 0, 1, 'ui-action', { action: 'set-dose', detail });
    detail.dose = 19;
    expect(event.data).toEqual({ action: 'set-dose', detail: { dose: 18 } });
  });

  it('refuses a malformed event', () => {
    expect(() =>
      createAppEvent(REC, 0, Infinity, 'error', { message: 'x', context: null }),
    ).toThrow('event.tMs:');
  });
});

describe('normaliseAppEvent', () => {
  it('refuses an unknown type rather than dropping the event', () => {
    const input = { recordingId: REC, seq: 0, tMs: 0, type: 'audio-band', data: {} };
    expect(() => normaliseAppEvent(input, 'events[0]')).toThrow(
      /^events\[0\]\.type: expected one of "connected", .*, got the string "audio-band"$/,
    );
  });

  it('refuses an event without data', () => {
    const input = { recordingId: REC, seq: 0, tMs: 0, type: 'connected' };
    expect(() => normaliseAppEvent(input)).toThrow('event.data: missing (expected an object)');
  });

  it('refuses a JSON-incompatible ui-action detail', () => {
    const input = {
      recordingId: REC,
      seq: 0,
      tMs: 0,
      type: 'ui-action',
      data: { action: 'x', detail: { at: new Date() } },
    };
    expect(() => normaliseAppEvent(input)).toThrow('event.data.detail.at:');
  });
});

describe('command events', () => {
  it('record every whitelisted command as packed hex that decodes to its bytes', () => {
    for (const command of allWhitelistedCommands()) {
      const data = commandEventData(command, 'test');
      const event = createAppEvent(REC, 0, 0, 'command-sent', data);
      expect(event.data).toEqual({
        command: command.name,
        param: command.param,
        hex: data.hex,
        reason: 'test',
      });
      expect(data.hex).toMatch(/^[0-9A-F]{12}$/);
      expect(fromHex(data.hex)).toEqual(command.bytes);
    }
  });

  it('record a failed command with its error', () => {
    const data = { ...commandEventData(tareAndStartTimer(), null), error: 'GATT busy' };
    const event = createAppEvent(REC, 9, 5000.25, 'command-failed', data);
    expect(event.data).toEqual({
      command: 'tareAndStartTimer',
      param: null,
      hex: '030A0700000E',
      reason: null,
      error: 'GATT busy',
    });
  });

  // Hard rule 5: no name outside the whitelist, such as calibration, can even be logged.
  it.each([
    ['an unknown command name', { command: 'calibrate', param: null, hex: '030A0900000A' }],
    ['spaced hex', { command: 'tare', param: null, hex: '03 0A 01 00 00 08' }],
    ['lower-case hex', { command: 'tare', param: null, hex: '030a01000008' }],
    ['an odd number of digits', { command: 'tare', param: null, hex: '030A0100000' }],
  ])('refuses %s', (_, data) => {
    const input = { recordingId: REC, seq: 0, tMs: 0, type: 'command-sent', data };
    expect(() => normaliseAppEvent(input)).toThrow(SchemaError);
  });
});
