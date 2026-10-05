import { describe, expect, it } from 'vitest';
import { commandEventData, RecordingSequence, type AppEvent } from '../model';
import { tare, tareAndStartTimer } from '../protocol';
import { manualStartTimes } from './manual-start';

const sequence = new RecordingSequence('01923456-789a-7000-8000-000000000001');
const command = (tMs: number, reason: string | null, sent = tareAndStartTimer()): AppEvent =>
  sequence.event(tMs, 'command-sent', commandEventData(sent, reason));
const tap = (tMs: number): AppEvent =>
  sequence.event(tMs, 'ui-action', { action: 'manual-start', detail: null });

describe('manualStartTimes', () => {
  it('takes the probe’s Tare + start and the capture flow’s tap, in order, in seconds', () => {
    expect(manualStartTimes([command(264_730, 'probe'), tap(551_082)])).toEqual([264.73, 551.082]);
  });

  it('leaves out the auto-tare’s 07 and other commands', () => {
    const events = [
      command(5000, 'auto-tare'),
      command(6000, 'probe', tare()),
      command(9000, null),
    ];
    expect(manualStartTimes(events)).toEqual([9]);
  });

  it('counts a tap and the 07 it sends as one start, at the tap', () => {
    // The capture flow logs the tap, then the command once the scale has the write (T1.18).
    const events = [tap(10_000), command(10_040, 'manual-start'), tap(30_000), tap(31_200)];
    expect(manualStartTimes(events)).toEqual([10, 30, 31.2]);
  });

  it('finds none in a recording without them', () => {
    expect(manualStartTimes([])).toEqual([]);
  });
});
