import { describe, expect, it } from 'vitest';
import { tare } from '../protocol';
import { compileScript, type ScriptEvent } from './script';
import { DEFAULT_SHOT_PARAMS } from './shot';

describe('compileScript', () => {
  it('sorts actions by time, keeping script order at equal times', () => {
    const compiled = compileScript([
      { type: 'tare-button', atMs: 5000 },
      { type: 'cup-on', atMs: 1000, massG: 100 },
      { type: 'command', atMs: 5000, command: tare() },
      { type: 'cup-off', atMs: 9000 },
    ]);
    expect(compiled.actions.map((a) => `${a.type}@${a.atMs}`)).toEqual([
      'cup-on@1000',
      'tare-button@5000',
      'command@5000',
      'cup-off@9000',
    ]);
  });

  it('expands a shot into its markers, with defaults for what it leaves out', () => {
    const compiled = compileScript([{ type: 'shot', atMs: 4000, yieldG: 40 }]);
    const [shot] = compiled.shots;
    expect(shot.params).toEqual({ ...DEFAULT_SHOT_PARAMS, yieldG: 40 });
    const firstDrip = 4000 + DEFAULT_SHOT_PARAMS.preInfusionMs;
    const pumpOff = firstDrip + DEFAULT_SHOT_PARAMS.extractionMs;
    expect(compiled.pumpIntervals).toEqual([[4000, pumpOff]]);
    expect(compiled.events).toEqual([
      { tMs: 4000, type: 'pump-on', shotIndex: 0 },
      { tMs: firstDrip, type: 'first-drip', shotIndex: 0 },
      { tMs: pumpOff, type: 'pump-off', shotIndex: 0 },
    ]);
  });

  it('treats a flush as pump time with no shot', () => {
    const compiled = compileScript([{ type: 'pump', atMs: 1000, durationMs: 3000 }]);
    expect(compiled.shots).toEqual([]);
    expect(compiled.pumpIntervals).toEqual([[1000, 4000]]);
    expect(compiled.events.map((e) => [e.type, e.shotIndex])).toEqual([
      ['pump-on', null],
      ['pump-off', null],
    ]);
  });

  it('collects bumps and the power-off time', () => {
    const compiled = compileScript([
      { type: 'bump', atMs: 2000, durationMs: 300, peakG: 5 },
      { type: 'power-off', atMs: 9000 },
    ]);
    expect(compiled.bumps).toHaveLength(1);
    expect(compiled.powerOffMs).toBe(9000);
    expect(compiled.events.map((e) => e.type)).toEqual(['bump', 'power-off']);
  });

  it('accepts a cup lifted and put back', () => {
    const script: ScriptEvent[] = [
      { type: 'cup-on', atMs: 0, massG: 100 },
      { type: 'cup-off', atMs: 1000 },
      { type: 'cup-back', atMs: 2000 },
      { type: 'cup-off', atMs: 3000 },
      { type: 'cup-on', atMs: 4000, massG: 90, contentsG: 18 },
    ];
    expect(compileScript(script).actions).toHaveLength(5);
  });

  it.each<[string, ScriptEvent[]]>([
    ['a negative time', [{ type: 'tare-button', atMs: -1 }]],
    ['a NaN time', [{ type: 'tare-button', atMs: NaN }]],
    [
      'a second vessel on an occupied platform',
      [
        { type: 'cup-on', atMs: 0, massG: 100 },
        { type: 'cup-on', atMs: 1, massG: 100 },
      ],
    ],
    ['lifting from an empty platform', [{ type: 'cup-off', atMs: 0 }]],
    ['putting back what was never lifted', [{ type: 'cup-back', atMs: 0 }]],
    ['a vessel with no mass', [{ type: 'cup-on', atMs: 0, massG: 0 }]],
    ['negative contents', [{ type: 'cup-on', atMs: 0, massG: 100, contentsG: -1 }]],
    [
      'overlapping pump runs',
      [
        { type: 'shot', atMs: 0 },
        { type: 'pump', atMs: 10_000, durationMs: 1000 },
      ],
    ],
    ['a zero-length flush', [{ type: 'pump', atMs: 0, durationMs: 0 }]],
    ['a bump with no peak', [{ type: 'bump', atMs: 0, durationMs: 100, peakG: NaN }]],
    ['a bad shot', [{ type: 'shot', atMs: 0, yieldG: -1 }]],
    [
      'anything after power-off',
      [
        { type: 'power-off', atMs: 1000 },
        { type: 'tare-button', atMs: 2000 },
      ],
    ],
  ])('rejects %s', (_, script) => {
    expect(() => compileScript(script)).toThrow(RangeError);
  });
});
