/**
 * The analysis inspection CLI's core (T1.15, D-051): agents can't see the phone, so this turns
 * real and simulated exports into a JSON report and SVG charts they can read. Pure: the shell,
 * `scripts/analyze.mjs` (`npm run analyze`), reads and writes the files. The app never imports
 * it.
 *
 * - `parseAnalyzeArgs`: the command line.
 * - `inspect`: export text → the report (markers, metrics, detector diagnostics, matching,
 *   events, truth) and a chart per recording and per segment.
 * - `simulatedExport`: a simulated session's export, with its truth.
 * - `summarise`: the report as a few lines per segment.
 * - `renderChart`, `segmentChart`, `recordingChart`: the charts, on a small SVG kit (`svg.ts`).
 */

export * from './args';
export * from './chart';
export * from './charts';
export * from './report';
export * from './simulate';
export * from './summary';
export * from './svg';
