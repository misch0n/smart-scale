/**
 * Post-hoc analysis (T1.11–T1.16): pure functions of a raw recording, never of the live
 * pipeline (CLAUDE.md hard rule 3). docs/ARCHITECTURE.md "Analysis pipeline".
 *
 * - `segment`: trusted weights, steps and zero-tracking, the uniform grid, stable stretches and
 *   shot windows with their baselines (T1.11).
 * - `liquidMarkers`: per shot window, first_drip, w(pump_off), the tail fit (τ, w_final),
 *   settled and cup_removed, given pump_off (T1.12).
 * - `pumpMarkers`: per shot window, pump_on and pump_off, by the variance or the regime change,
 *   given first_drip (T1.13). `fitKnee` is its regime-change model.
 * - `shotMarkers`: first_drip, the pump markers, then the liquid markers with the pump_off found.
 * - `analyzeRaw`: a recording's analysis, every window's markers and metrics, stamped with
 *   `ANALYSIS_VERSION` and its parameters: what the derived cache stores (T1.14).
 *   `parseRecordingAnalysis` checks a cached one.
 * - `matchShots`: the recording's shots matched to its segments, and the post-hoc shots wanted
 *   (D-007, D-047). `analyzeRecording` is both.
 */

export * from './analysis-schema';
export * from './first-drip';
export * from './knee';
export * from './liquid';
export * from './liquid-markers';
export * from './matching';
export * from './metrics';
export * from './params';
export * from './pump-markers';
export * from './recording-analysis';
export * from './samples';
export * from './segment';
export * from './shot-markers';
export * from './shot-windows';
export * from './stability';
export * from './steps';
export * from './tail';
export * from './version';
