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
import type { ScaleModeState } from '../../app/scale-mode';
import type { SoundCaptureState } from '../../app/sound-capture';
import { SOUND_LAYOUT } from '../../core/sound';
import {
  byte,
  bytes,
  decibels,
  describeEvent,
  describeFrame,
  gapSummary,
  grams,
  hexLines,
  modeStatus,
  properties,
  seconds,
  size,
  soundStatus,
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
    const started = {
      layout: 1,
      measures: null,
      sampleRateHz: 48000,
      fftSize: 4096,
      intervalMs: 50,
      input: 'iPhone Microphone',
      continued: false,
    };
    expect(describeEvent(event('sound-started', started))).toBe(
      'sound levels start: layout 1, every 50 ms (iPhone Microphone)',
    );
    expect(
      describeEvent(event('sound-started', { ...started, input: null, continued: true })),
    ).toBe('sound levels continue: layout 1, every 50 ms');
    expect(describeEvent(event('sound-input', { contextState: 'interrupted', muted: true }))).toBe(
      'sound levels pause: audio interrupted, input muted',
    );
    expect(describeEvent(event('sound-input', { contextState: 'running', muted: false }))).toBe(
      'sound levels resume: audio running',
    );
    expect(describeEvent(event('sound-stopped', { reason: 'ended', message: 'gone' }))).toBe(
      'sound levels stop (ended): gone',
    );
    expect(describeEvent(event('sound-stopped', { reason: 'user', message: null }))).toBe(
      'sound levels stop (user)',
    );
  });

  it('lists the properties a characteristic has, and those not reported', () => {
    expect(properties(NONE)).toBe('none');
    expect(properties({ ...NONE, write: true, notify: true, indicate: null })).toBe(
      'write, notify; not reported: indicate',
    );
  });
});

describe('sound levels', () => {
  const on: SoundCaptureState = {
    status: 'on',
    description: {
      layout: SOUND_LAYOUT,
      sampleRateHz: 48000,
      fftSize: 4096,
      intervalMs: 50,
      input: 'iPhone Microphone',
    },
    input: { contextState: 'running', muted: false },
    levelsDb: null,
    readings: 412,
    problem: null,
  };
  const off: SoundCaptureState = { ...on, status: 'off', description: null, input: null };

  it('shows a level to a tenth of a dB, down to the quietest a frame carries', () => {
    expect(decibels(-42.46)).toBe('-42.5 dB');
    expect(decibels(-127.4)).toBe('-127.4 dB');
    expect(decibels(-127.5)).toBe('≤ -127.5 dB');
    expect(decibels(-Infinity)).toBe('≤ -127.5 dB');
  });

  it('says whether they are on, where they go, and why they are paused or off', () => {
    expect(soundStatus(on, 380)).toBe(
      'On: 412 readings from iPhone Microphone at 48000 Hz. 380 in this recording.',
    );
    expect(soundStatus({ ...on, description: { ...on.description!, input: null } }, null)).toBe(
      'On: 412 readings from the microphone at 48000 Hz. Nothing is recording: they go into the next recording.',
    );
    expect(soundStatus({ ...on, input: { contextState: 'interrupted', muted: true } }, 380)).toBe(
      'Paused: audio interrupted, input muted. 380 in this recording.',
    );
    expect(soundStatus({ ...on, readings: 1 }, 1)).toBe(
      'On: 1 reading from iPhone Microphone at 48000 Hz. 1 in this recording.',
    );
    expect(soundStatus({ ...on, status: 'starting' }, null)).toBe(
      'Starting: allow the microphone if asked.',
    );
    expect(soundStatus(off, null)).toBe('Off.');
    expect(soundStatus({ ...off, problem: 'The microphone input ended' }, 5)).toBe(
      'Off. The microphone input ended',
    );
  });
});

describe('modeStatus (T1.25)', () => {
  const blank: ScaleModeState = {
    verdict: 'unknown',
    evidence: null,
    checking: false,
    checks: 0,
    error: null,
  };
  const check = { command: 'startTimer', reason: 'mode-check', sentTMs: 312 } as const;

  it('says what the check found, and what it rests on', () => {
    expect(modeStatus(blank)).toBe(
      'Not known: the check waits for the timer at 0 and no cup on the scale (0 checks sent).',
    );
    expect(modeStatus({ ...blank, checking: true, checks: 1 })).toBe(
      'Checking: the 04 is out (1 check sent).',
    );
    expect(
      modeStatus({
        ...blank,
        verdict: 'timer',
        evidence: { kind: 'started', tMs: 498.6, ...check },
        checks: 1,
      }),
    ).toBe(
      'Timer mode: the 04 [mode-check] at 0.312 s started the timer 187 ms later (1 check sent).',
    );
    expect(
      modeStatus({
        ...blank,
        verdict: 'not-timer',
        evidence: { kind: 'not-started', tMs: 830, ...check, command: 'tareAndStartTimer' },
        checks: 2,
      }),
    ).toBe(
      "NOT the timer mode: the 07 [mode-check] at 0.312 s didn't start the timer within 500 ms. Switch it on the scale: the app checks again every 5 s while the scale is idle (2 checks sent).",
    );
    expect(
      modeStatus({
        ...blank,
        verdict: 'not-timer',
        evidence: { kind: 'scale-event', tMs: 27_450, state: 'started' },
        checks: 1,
      }),
    ).toBe(
      'NOT the timer mode: the scale sent 03 0D started at 27.450 s, as its automatic mode does. Switch it on the scale (1 check sent).',
    );
  });

  it('says why a check couldn’t tell', () => {
    expect(modeStatus({ ...blank, checks: 1, error: 'GATT write failed' })).toBe(
      "Not known: no check could tell yet; it checks again every 5 s (1 check sent). The last check's command failed: GATT write failed.",
    );
  });
});
