/**
 * The live pipeline: causal, display-only processing of the frames as they arrive (spec "Signal
 * processing", live column). Nothing here is stored, and analysis never imports it (CLAUDE.md
 * hard rule 3; lint enforces it). T1.8 adds the probe's statistics; T1.17 adds the shot
 * display pipeline.
 */

export * from './probe-monitor';
export * from './window-stats';
