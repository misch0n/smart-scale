/**
 * Post-hoc analysis (T1.11–T1.16): pure functions of a raw recording, never of the live
 * pipeline (CLAUDE.md hard rule 3). docs/ARCHITECTURE.md "Analysis pipeline".
 *
 * - `segment`: trusted weights, steps and zero-tracking, the uniform grid, stable stretches and
 *   shot windows with their baselines (T1.11).
 */

export * from './params';
export * from './samples';
export * from './segment';
export * from './shot-windows';
export * from './stability';
export * from './steps';
