import { describe, expect, it } from 'vitest';
import { createAppEvent } from './events';
import { phaseChangeOf } from './phases';

const REC = '01a10000-0000-7000-8000-000000000001';

describe('phaseChangeOf', () => {
  const action = (action: string, detail: unknown) =>
    createAppEvent(REC, 0, 1000, 'ui-action', { action, detail: detail as never });

  it('reads a logged phase change', () => {
    expect(
      phaseChangeOf(action('phase', { phase: 'grind', state: 'open', by: 'container' })),
    ).toEqual({ phase: 'grind', state: 'open', by: 'container' });
  });

  it('reads none from other events, or a detail it doesn’t know', () => {
    expect(phaseChangeOf(action('manual-start', null))).toBeNull();
    expect(phaseChangeOf(action('phase', null))).toBeNull();
    expect(phaseChangeOf(action('phase', ['beans']))).toBeNull();
    expect(phaseChangeOf(action('phase', { phase: 'tamp', state: 'open', by: 'user' }))).toBeNull();
    expect(
      phaseChangeOf(action('phase', { phase: 'milk', state: 'poured', by: 'user' })),
    ).toBeNull();
    expect(phaseChangeOf(action('phase', { phase: 'milk', state: 'done', by: 'cat' }))).toBeNull();
  });
});
