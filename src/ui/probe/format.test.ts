import { describe, expect, it } from 'vitest';
import { RecordingSequence, type AppEvent, type CharacteristicProperties } from '../../core/model';
import {
  decodeFrame,
  encodeEventFrame,
  encodeWeightFrame,
  keepAlive,
  setBuzzer,
  tare,
  toHex,
} from '../../core/protocol';
import {
  byte,
  bytes,
  describeEvent,
  describeFrame,
  gapSummary,
  grams,
  hexLines,
  properties,
  seconds,
  size,
  weightSummary,
} from './format';

const sequence = new RecordingSequence('0192a6b0-0000-7000-8000-000000000001');
const event = (type: AppEvent['type'], data: unknown) =>
  sequence.event(0, type, data as never) as AppEvent;

const NONE: CharacteristicProperties = {
  broadcast: false,
  read: false,
  writeWithoutResponse: false,
  write: false,
  notify: false,
  indicate: false,
  authenticatedSignedWrites: false,
  reliableWrite: false,
  writableAuxiliaries: false,
};

describe('probe formatting', () => {
  it('writes numbers the way the docs do', () => {
    expect(seconds(12_345.6)).toBe('12.346 s');
    expect(grams(-0.03)).toBe('-0.03 g');
    expect(byte(0x2b)).toBe('2B');
    expect(byte(1)).toBe('01');
    expect(bytes([0x2b, 0x2d])).toBe('2B, 2D');
    expect(bytes([])).toBe('none');
    expect(size(1234)).toBe('1.2 kB');
    expect(size(2_500_000)).toBe('2.5 MB');
  });

  it('breaks hex into lines of 10 bytes', () => {
    const frame = toHex(encodeWeightFrame({ timerMs: 0, weightG: 0 }));
    expect(hexLines(frame)).toEqual([frame.slice(0, 29), frame.slice(30)]);
    expect(hexLines('03 0D 0E')).toEqual(['03 0D 0E']);
    expect(hexLines('')).toEqual([]);
  });

  it('summarises gaps and weights', () => {
    expect(gapSummary(null)).toBe('none yet');
    expect(gapSummary({ count: 99, mean: 100.24, sd: 1.61, min: 98, max: 104.5 })).toBe(
      '100.2 ms (min 98, max 104.5, σ 1.6, n 99)',
    );
    expect(weightSummary(null)).toBe('no trusted weights');
    expect(weightSummary({ count: 5, mean: 12.3456, sd: 0.0123, min: 0, max: 0 })).toBe(
      '12.346 g, σ 0.012 g (n 5)',
    );
  });

  it('describes each kind of frame', () => {
    const weight = decodeFrame(encodeWeightFrame({ timerMs: 1234, weightG: 18.5 }));
    expect(describeFrame(weight)).toBe('weight 18.50 g, timer 1234 ms');
    const started = decodeFrame(encodeEventFrame({ stateByte: 1, timerMs: 0, weightG: 0 }));
    expect(describeFrame(started)).toBe('event started, timer 0 ms, 0.00 g');
    const odd = decodeFrame(encodeEventFrame({ stateByte: 9, timerMs: 5, weightG: 1 }));
    expect(describeFrame(odd)).toBe('event state 09, timer 5 ms, 1.00 g');
    expect(describeFrame(decodeFrame(Uint8Array.of(0x03, 0x77, 0x74)))).toBe('unknown type 03 77');
    const bad = encodeWeightFrame({ timerMs: 0, weightG: 0 });
    bad[19] ^= 1;
    expect(describeFrame(decodeFrame(bad))).toBe('invalid: bad checksum');
    expect(describeFrame(decodeFrame(Uint8Array.of(3)))).toBe('invalid: 1 bytes');
  });

  it('describes each kind of event', () => {
    const sent = { command: 'tare', param: null, hex: toHex(tare().bytes, ''), reason: 'probe' };
    expect(describeEvent(event('command-sent', sent))).toBe('sent tare 030A01000008 [probe]');
    const failed = {
      ...sent,
      command: 'keepAlive',
      hex: toHex(keepAlive().bytes, ''),
      reason: null,
    };
    expect(describeEvent(event('command-failed', { ...failed, error: 'not connected' }))).toBe(
      'FAILED to send keepAlive 030A2500002C: not connected',
    );
    expect(
      describeEvent(
        event('command-sent', {
          command: 'setBuzzer',
          param: 0,
          hex: toHex(setBuzzer(0).bytes, ''),
          reason: 'probe',
        }),
      ),
    ).toBe('sent setBuzzer 0 030A0200000B [probe]');
    expect(describeEvent(event('connected', { deviceName: 'BOOKOO_MINI', deviceId: 'x' }))).toBe(
      'connected to BOOKOO_MINI',
    );
    expect(
      describeEvent(
        event('disconnected', { reason: 'error', message: 'Getting service 0FFE: lost' }),
      ),
    ).toBe('disconnected (error): Getting service 0FFE: lost');
    expect(describeEvent(event('disconnected', { reason: 'user', message: null }))).toBe(
      'disconnected (user)',
    );
    expect(describeEvent(event('ui-action', { action: 'page-hidden', detail: null }))).toBe(
      'page-hidden',
    );
    expect(
      describeEvent(
        event('ui-action', { action: 'try-microphone', detail: { outcome: 'denied' } }),
      ),
    ).toBe('try-microphone {"outcome":"denied"}');
    expect(describeEvent(event('annotation', { label: 'note', text: '18 g, grind 12' }))).toBe(
      'annotation note: 18 g, grind 12',
    );
    expect(describeEvent(event('annotation', { label: 'pump-on', text: null }))).toBe(
      'annotation pump-on',
    );
    expect(describeEvent(event('smoothing-confirmed', { attempts: 1 }))).toBe(
      'smoothing off, confirmed (after 1 sent)',
    );
    expect(
      describeEvent(event('smoothing-not-confirmed', { attempts: 2, smoothingByte: null })),
    ).toBe('smoothing NOT confirmed off after 2 sent; byte never seen');
    expect(describeEvent(event('error', { message: 'quota', context: 'storage' }))).toBe(
      'error (storage): quota',
    );
    const props = { ...NONE, notify: true };
    expect(
      describeEvent(
        event('characteristic-properties', { characteristic: 'ff11', properties: props }),
      ),
    ).toBe('FF11: notify');
  });

  it('lists the properties a characteristic has, and those not reported', () => {
    expect(properties(NONE)).toBe('none');
    expect(properties({ ...NONE, write: true, notify: true, indicate: null })).toBe(
      'write, notify; not reported: indicate',
    );
  });
});
