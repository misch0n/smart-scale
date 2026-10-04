/**
 * Timebase reconstruction (T1.9, D-006, D-032): a time per weight frame for the analysis, from
 * the scale's timer field where it advances, mapped onto the arrival clock, and from arrival
 * elsewhere. docs/ARCHITECTURE.md "Timebase".
 */

export { leastIntercept, robustSlope, type Point } from './fit';
export * from './timeline';
