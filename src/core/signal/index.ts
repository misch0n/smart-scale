/**
 * Generic signal processing for the analysis (T1.10, D-033): pure functions over plain arrays
 * that know nothing about scales or shots. docs/ARCHITECTURE.md "Signal toolkit".
 *
 * - `resampleLinear`: uneven samples onto a uniform grid.
 * - `savitzkyGolay`, `savitzkyGolayCoefficients`: local polynomial smoothing and derivatives.
 * - `rollingMean`, `rollingVariance`, `rollingRange`: O(n) statistics of every window.
 * - `cusum`: one-sided CUSUM, with the alarm and the retrospective change point.
 * - `fitLine`: an ordinary or weighted least-squares line, with residuals.
 * - `mean`, `median`, `quantile`, `mad`: descriptive statistics.
 * - `stepAcrossGap`, `rollingStep`: differences of means across a gap.
 */

export * from './cusum';
export * from './line-fit';
export * from './resample';
export * from './rolling';
export * from './savitzky-golay';
export * from './stats';
export * from './step';
