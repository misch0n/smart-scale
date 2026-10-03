/**
 * A deterministic simulator of a BOOKOO scale session over BLE, with ground truth (T1.3). It's
 * the test bed for the analysis and live pipelines until real recordings exist (D-013), and it
 * drives `MockTransport`. The model and its assumptions: docs/ARCHITECTURE.md "Simulator" and
 * D-021; every parameter is documented in `params.ts` and `shot.ts`.
 */

export * from './link';
export * from './params';
export * from './random';
export * from './script';
export * from './session';
export * from './shot';
export * from './simulator';
export * from './weighing-platform';
