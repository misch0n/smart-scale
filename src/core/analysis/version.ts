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
 * - 2 (T1.16, D-058): readings snapped to the scale's grid; anchors from firm stretches, 2 s
 *   together; steps inside a pour kept in the liquid; transients left out; pump_on from the
 *   Tare + start tap without the vibration (Q4); `Step.jumps`, `SegmentWindow.riseEndT`,
 *   `pumpOn.source`.
 * - 3 (T1.16, D-059): the yields from the stable level before the pump; a tare must bring the
 *   reading nearer 0; a vessel's run takes a press either way; w(pump_off) and, for a fast
 *   drain, the tail from the knee (`TailFit.source`); τ's floor 0.05 s; `dropG` 0.2 g,
 *   `riseFitG` 1 g.
 * - 4 (T1.16, D-061): the button's tare measured from before its press, which is a transient;
 *   a run's lead-in found after the run before has settled, in the way its first jump goes.
 * - 5 (T1.16, D-062): a knock at a tare: samples faster than liquid join a run, runs that
 *   touch merge, a logged tare takes a run with a knock in it, and every tare applies from its
 *   own jump.
 * - 6 (T1.16, D-063): the frames between the timer's runs timed on the scale's sample grid.
 * - 7 (T1.16, D-064): a rate fitted from 3 s of timer runs, not 30 s.
 */
export const ANALYSIS_VERSION = 7;
