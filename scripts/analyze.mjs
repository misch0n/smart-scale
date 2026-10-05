// The analysis inspection CLI (T1.15, D-051): every recording in the export files analysed as
// the app does it, printed as JSON, with an SVG chart per recording and per segment. Agents
// can't see the phone, so this is how they look at real recordings.
//
//   npm run analyze -- fixtures/real/2026-10-05_two-shots_0a69da56.json --out /tmp/shots --png
//   npm run analyze -- --simulate espresso --seed 2 --summary
//
// `npm run analyze -- --help` lists the options. The work is src/core/inspect (pure, with
// tests); this file only reads and writes. PNGs need Playwright and Chromium, which the agent
// environment has (scripts/playwright.mjs).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromiumPath, findPlaywright } from './playwright.mjs';
import { registerTypeScript } from './typescript.mjs';

registerTypeScript();
const inspection = await import('../src/core/inspect/index.ts');

function fail(message, code = 1) {
  console.error(`analyze: ${message}`);
  process.exit(code);
}

let args;
try {
  args = inspection.parseAnalyzeArgs(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof inspection.UsageError)) throw error;
  console.error(`analyze: ${error.message}\n\n${inspection.ANALYZE_USAGE}`);
  process.exit(2);
}
if (args.help) {
  process.stdout.write(inspection.ANALYZE_USAGE);
  process.exit(0);
}

const playwright = args.png ? findPlaywright() : null;
if (args.png && !playwright) {
  fail('--png needs Playwright: set PLAYWRIGHT_MODULE, or install it globally', 2);
}

const inputs = args.files.map((file) => {
  try {
    return { source: file, text: readFileSync(file, 'utf8') };
  } catch (error) {
    return fail(`can't read ${file}: ${error.message}`);
  }
});
const simulated = args.simulate
  ? inspection.simulatedExport(args.simulate.scenario, args.simulate.seed)
  : null;
if (simulated) inputs.push(simulated);

let result;
try {
  result = inspection.inspect(inputs, { overrides: args.overrides, charts: args.out !== null });
} catch (error) {
  if (error?.name !== 'ExportFormatError') throw error;
  fail(error.message);
}
const json = inspection.reportJson(result.report);

if (args.out !== null) {
  const out = resolve(args.out);
  mkdirSync(out, { recursive: true });
  if (simulated) writeFileSync(join(out, simulated.fileName), simulated.text);
  for (const chart of result.charts) writeFileSync(join(out, chart.name), chart.svg);
  writeFileSync(join(out, 'report.json'), json);
  if (playwright) await renderPngs(playwright, out, result.charts);
  const kinds = playwright ? 'SVG and PNG' : 'SVG';
  console.error(
    `analyze: wrote report.json and ${result.charts.length} charts (${kinds}) to ${out}` +
      (simulated ? `, with the simulated export ${simulated.fileName}` : ''),
  );
}
process.stdout.write(args.summary ? inspection.summarise(result.report) : json);

/** Renders each chart's SVG, already written to `dir`, to a PNG beside it. */
async function renderPngs({ chromium }, dir, charts) {
  const browser = await chromium.launch({ executablePath: chromiumPath() });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1.5 });
    for (const chart of charts) {
      await page.goto(pathToFileURL(join(dir, chart.name)).href);
      await page
        .locator('svg')
        .first()
        .screenshot({ path: join(dir, chart.name.replace(/\.svg$/, '.png')) });
    }
  } finally {
    await browser.close();
  }
}
