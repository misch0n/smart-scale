/**
 * The brew's phases (spec v2 "Brew phases"; T2.5, D-079): beans, grind, extraction and milk, in
 * that order. Only the extraction is required; milk is for a recipe with a milk ratio.
 *
 * The capture flow logs the phase flow in the recording as `ui-action`s named `phase`, the way it
 * logs the manual start: which phase, what became of it (`open`, `done`, `skipped`) and why
 * (`container`: a container put on; `user`: a tap; `pump`: the pump started; `shot`: the shot
 * ended). They are what the user and the app did, not measurements, so they belong in raw. The
 * analysis measures the beans, the grounds and the milk inside the phases they mark.
 */

import type { AppEvent } from './events';

export const BREW_PHASES = ['beans', 'grind', 'extraction', 'milk'] as const;
export type BrewPhase = (typeof BREW_PHASES)[number];

/** The phases whose result is a weight the analysis measures: all but the extraction. */
export const MEASURED_PHASES = ['beans', 'grind', 'milk'] as const;
export type MeasuredPhase = (typeof MEASURED_PHASES)[number];

/** The `ui-action` that logs a phase change. */
export const PHASE_ACTION = 'phase';

export const PHASE_CHANGE_STATES = ['open', 'done', 'skipped'] as const;
export type PhaseChangeState = (typeof PHASE_CHANGE_STATES)[number];

export const PHASE_CAUSES = ['container', 'user', 'pump', 'shot'] as const;
export type PhaseCause = (typeof PHASE_CAUSES)[number];

/** A phase change, as logged in a `phase` action's detail. */
export interface PhaseChange {
  readonly phase: BrewPhase;
  readonly state: PhaseChangeState;
  readonly by: PhaseCause;
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

/** The phase change `event` logs, or null when it logs none, or one this build can't read. */
export function phaseChangeOf(event: AppEvent): PhaseChange | null {
  if (event.type !== 'ui-action' || event.data.action !== PHASE_ACTION) return null;
  const detail = event.data.detail;
  if (detail === null || typeof detail !== 'object' || Array.isArray(detail)) return null;
  const { phase, state, by } = detail as { readonly [key: string]: unknown };
  if (!isOneOf(BREW_PHASES, phase) || !isOneOf(PHASE_CHANGE_STATES, state)) return null;
  if (!isOneOf(PHASE_CAUSES, by)) return null;
  return { phase, state, by };
}
