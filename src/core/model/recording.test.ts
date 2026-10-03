import { describe, expect, it } from 'vitest';
import { isId } from './ids';
import {
  createRecording,
  endRecording,
  epochMsAt,
  normaliseRecording,
  RECORDING_END_REASONS,
  type NewRecording,
} from './recording';
import { SchemaError } from './schema';

const START = Date.UTC(2026, 9, 3, 7, 30);

const NEW: NewRecording = {
  startedAtEpochMs: START,
  device: { name: 'BOOKOO_MINI', id: 'opaque-id' },
  transport: 'mock',
  app: { commit: 'abc1234', buildTime: '2026-10-03T07:00:00.000Z' },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)',
};

describe('createRecording', () => {
  it('opens a recording with a new id', () => {
    const recording = createRecording(NEW);
    expect(isId(recording.id)).toBe(true);
    expect(recording).toEqual({ id: recording.id, ...NEW, endedAtEpochMs: null, endReason: null });
  });

  it('uses the id it is given', () => {
    const id = '01923456-789a-7000-8000-000000000001';
    expect(createRecording({ ...NEW, id }).id).toBe(id);
  });

  it('keeps a null user agent and device fields', () => {
    const recording = createRecording({
      ...NEW,
      device: { name: null, id: null },
      userAgent: null,
    });
    expect(recording.device).toEqual({ name: null, id: null });
    expect(recording.userAgent).toBeNull();
  });

  it('refuses a malformed input', () => {
    expect(() => createRecording({ ...NEW, startedAtEpochMs: NaN })).toThrow(SchemaError);
  });
});

describe('endRecording', () => {
  it.each(RECORDING_END_REASONS)('ends a recording with reason %s', (reason) => {
    const open = createRecording(NEW);
    const ended = endRecording(open, START + 180_000, reason);
    expect(ended).toEqual({ ...open, endedAtEpochMs: START + 180_000, endReason: reason });
    expect(open.endedAtEpochMs).toBeNull();
  });

  it('refuses to end a recording twice', () => {
    const ended = endRecording(createRecording(NEW), START + 1000, 'device');
    expect(() => endRecording(ended, START + 2000, 'user')).toThrow(/already ended/);
  });
});

describe('normaliseRecording', () => {
  it('refuses an unknown transport or end reason', () => {
    const recording = createRecording(NEW);
    expect(() => normaliseRecording({ ...recording, transport: 'bluefy' })).toThrow(SchemaError);
    expect(() => normaliseRecording({ ...recording, endReason: 'crash' })).toThrow(SchemaError);
  });

  it('names the path of a nested problem', () => {
    const recording = createRecording(NEW);
    expect(() => normaliseRecording({ ...recording, app: { commit: 'abc' } }, 'r[2]')).toThrow(
      'r[2].app.buildTime: missing (expected a string)',
    );
  });
});

describe('epochMsAt', () => {
  it('adds the time on the recording to its start', () => {
    expect(epochMsAt(createRecording(NEW), 1234.5)).toBe(START + 1234.5);
  });
});
