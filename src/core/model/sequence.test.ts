import { describe, expect, it } from 'vitest';
import { RecordingSequence } from './sequence';

const REC = '01923456-789a-7000-8000-000000000001';

describe('RecordingSequence', () => {
  it('numbers frames and events from one counter, in the order they are made', () => {
    const seq = new RecordingSequence(REC);
    const records = [
      seq.event(0, 'connected', { deviceName: 'BOOKOO_MINI', deviceId: null }),
      seq.frame(95.5, 'ff11', new Uint8Array([3, 11])),
      seq.event(101, 'annotation', { label: 'cup-on', text: null }),
      seq.frame(190.25, 'ff11', new Uint8Array([3, 11])),
      seq.frame(191, 'ff12', new Uint8Array([3, 13])),
    ];
    expect(records.map((r) => r.seq)).toEqual([0, 1, 2, 3, 4]);
    expect(records.every((r) => r.recordingId === REC)).toBe(true);
    expect(seq.used).toBe(5);
  });

  it('uses no number for a record that fails to construct, so gaps mean lost records', () => {
    const seq = new RecordingSequence(REC);
    seq.frame(0, 'ff11', new Uint8Array(1));
    expect(() => seq.frame(NaN, 'ff11', new Uint8Array(1))).toThrow();
    expect(() => seq.event(1, 'error', { message: 'x', context: 7 as unknown as null })).toThrow();
    expect(seq.frame(2, 'ff11', new Uint8Array(1)).seq).toBe(1);
  });

  it('copies frame bytes', () => {
    const bytes = new Uint8Array([3, 11]);
    const frame = new RecordingSequence(REC).frame(0, 'ff11', bytes);
    bytes[1] = 0;
    expect(frame.bytes).toEqual(new Uint8Array([3, 11]));
  });

  it('needs a valid recording id', () => {
    expect(() => new RecordingSequence('recording-1')).toThrow(TypeError);
  });
});
