/**
 * The live pipeline: causal, display-only processing of the frames as they arrive (spec "Signal
 * processing", live column). Nothing here is stored, and analysis never imports it, nor it
 * analysis (CLAUDE.md hard rule 3; lint enforces both).
 *
 * - `ProbeMonitor`, `TimeWindow`, `RecentValues`: the probe's statistics (T1.8).
 * - `LiveWeight`: each reading made fit to show: the zero across the app's tares, jumps, a
 *   lag-compensated EMA, the flow and stability (T1.17).
 * - `ShotMonitor`: the shot's display state machine on top of it, with the arm-once tare,
 *   remaining-to-target, the graph and "shot done" (T1.17).
 * - `pourProgress`, `yieldTargetG`: a pour towards its target.
 */

export * from './live-weight';
export * from './params';
export * from './pour';
export * from './probe-monitor';
export * from './shot-monitor';
export * from './window-stats';
