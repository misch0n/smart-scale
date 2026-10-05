import { describe, expect, it } from 'vitest';
import { AUTO_TARE_REASON } from '../model';
import { isWhitelistedCommand } from '../protocol';
import { PUMP_LAPSED_REASON, scaleCommandsFor, SHOT_DONE_REASON } from './scale-commands';
import type { ShotMonitorEvent } from './shot-monitor';

/** The commands for `event`, as `name:reason`. */
function sent(event: ShotMonitorEvent): string[] {
  return scaleCommandsFor(event).map(({ command, reason }) => `${command.name}:${reason}`);
}

describe('scaleCommandsFor (D-066)', () => {
  it('tares the cup plainly, after stopping and zeroing the timer for the tap', () => {
    expect(sent({ type: 'tare', tMs: 0 })).toEqual([
      `stopTimer:${AUTO_TARE_REASON}`,
      `resetTimer:${AUTO_TARE_REASON}`,
      `tare:${AUTO_TARE_REASON}`,
    ]);
  });

  it('stops the timer at "shot done", and puts it back after a lapsed tap', () => {
    expect(sent({ type: 'shot-done', tMs: 0, reason: 'settled' })).toEqual([
      `stopTimer:${SHOT_DONE_REASON}`,
    ]);
    expect(sent({ type: 'shot-done', tMs: 0, reason: 'cup-removed' })).toEqual([
      `stopTimer:${SHOT_DONE_REASON}`,
    ]);
    expect(sent({ type: 'pump-lapsed', tMs: 0 })).toEqual([
      `stopTimer:${PUMP_LAPSED_REASON}`,
      `resetTimer:${PUMP_LAPSED_REASON}`,
    ]);
  });

  it('sends nothing for the events that only say what changed', () => {
    for (const type of [
      'cup-on',
      'pump-on',
      'first-drip',
      'pump-off',
      'cup-off',
      'cup-back',
    ] as const) {
      expect(scaleCommandsFor({ type, tMs: 0 })).toEqual([]);
    }
  });

  it('sends only whitelisted commands, never 07: the tap is the capture flow’s', () => {
    const all = (['tare', 'shot-done', 'pump-lapsed'] as const).flatMap((type) =>
      scaleCommandsFor(
        type === 'shot-done' ? { type, tMs: 0, reason: 'settled' } : { type, tMs: 0 },
      ),
    );
    expect(all.every(({ command }) => isWhitelistedCommand(command))).toBe(true);
    expect(all.some(({ command }) => command.name === 'tareAndStartTimer')).toBe(false);
  });
});
