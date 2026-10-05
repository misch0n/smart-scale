/**
 * The analysis's version (spec "Layers"; CLAUDE.md hard rule 2): every stored result carries the
 * version that computed it, and the derived cache is keyed by it.
 *
 * **Bump it whenever the outputs change**: an algorithm, a default parameter, the timeline, or
 * the shape of `RecordingAnalysis`. A bump invalidates every cached result, and the analysis
 * runner re-derives them from raw (`reanalyzeAll`). A change that leaves every output identical
 * (a refactor, a comment) needs none.
 *
 * - 1 (T1.14): segmentation (T1.11), liquid markers (T1.12), pump markers (T1.13) and the
 *   metrics, on the parameters of D-034, D-035 and D-036.
 */
export const ANALYSIS_VERSION = 1;
