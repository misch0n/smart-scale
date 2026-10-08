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
 * - 8 (T1.19, D-070): each segment's curve, its liquid and flow on a coarse grid, for the
 *   history's charts (`SegmentAnalysis.curve`). The markers and metrics are unchanged.
 * - 9 (T2.5, D-079): the logged beans, grind and milk phases and what each held
 *   (`RecordingAnalysis.phases`). The segments are unchanged.
 * - 10 (T2.11, D-082): a phase's vessel read until it is lifted, past the phase's own done; a
 *   rise while it stays on is what went into it; a vessel still on as the next phase opens is
 *   that phase's, not this one's put back. The segments are unchanged.
 * - 11 (T1.26, D-087): the coarse regime change starts at most 5 s before the flow is last at
 *   80% of its high, so a shot that gushes at its first drip, dips and climbs again gets its
 *   pump_off where the flow stops.
 * - 12 (T2.21, D-097): a grind opened on the very placement the beans were weighed in (not lifted
 *   since) weighs only what that vessel comes back with after a lift: the beans in it are no
 *   grounds. A phase's done logged as a container opens the next phase is ended by that open, so
 *   the cup back with its grounds is the grind's: the beans no longer read the grounds. The
 *   segments are unchanged.
 * - 13 (T2.24, D-100): the grind's vessel is the beans' one with up to a dose in it, whatever
 *   the beans weighed, put back as often as it is; put back empty, the last grounds stand.
 * - 14 (T2.25, D-101): no grounds: a shot's phases are its beans and milk, and its dose the beans
 *   (else the dose set, else the basket). The grind spans of old recordings are measured still,
 *   but given to no shot.
 * - 15 (T2.34, D-107): beans under 5 g are no dose: the shot's dose is then the dose set, else
 *   the basket.
 * - 16 (T3.19, D-111): a segment's curve is 0 g and 0 g/s before its first drip: no dip below
 *   the tare as the pump starts, no flow before the first drop. The markers and metrics are
 *   unchanged.
 */
export const ANALYSIS_VERSION = 16;
