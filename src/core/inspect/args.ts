/**
 * The inspection CLI's command line (T1.15): `npm run analyze -- …`. Pure, so the shell
 * (`scripts/analyze.mjs`) only reads and writes files.
 */

import { resolveAnalysisParams, type AnalysisOverrides } from '../analysis';
import { SIMULATED_SCENARIOS, type SimulatedScenario } from './simulate';

export const ANALYZE_USAGE = `Usage:
  npm run analyze -- <export.json>... [options]
  npm run analyze -- --simulate <espresso|demo> [--seed <n>] [options]

Analyses every recording in the export files and prints the markers, metrics and detector
diagnostics as JSON on stdout.

Options:
  --out <dir>        Also write an SVG per recording and per segment, and report.json, there
                     (with --simulate, the simulated export too)
  --png              Also render each SVG to PNG with Playwright's Chromium (needs --out)
  --summary          Print a few lines per segment instead of the JSON
  --param <stage>.<name>=<value>
                     Change an analysis parameter from its default, for example
                     --param liquid.sgWindowS=0.7. Stages: timeline, segmentation, liquid, pump
                     (src/core/analysis/params.ts). Repeat for more
  --simulate <name>  Analyse a simulated session as well: espresso (one shot) or demo (two)
  --seed <n>         The simulation's seed (default 1)
  -h, --help         Show this
`;

/** The analysis stages whose parameters `--param` can change. */
const STAGES = ['timeline', 'segmentation', 'liquid', 'pump'] as const;
type Stage = (typeof STAGES)[number];

export interface AnalyzeArgs {
  readonly files: readonly string[];
  readonly out: string | null;
  readonly png: boolean;
  /** Print `summarise(report)` rather than the JSON. */
  readonly summary: boolean;
  readonly overrides: AnalysisOverrides;
  readonly simulate: { readonly scenario: SimulatedScenario; readonly seed: number } | null;
  readonly help: boolean;
}

/** A command line the CLI can't run: the message says why. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

/**
 * The CLI's arguments, as `process.argv.slice(2)` gives them. `--name value` and
 * `--name=value` both work; anything after `--` is a file.
 *
 * @throws UsageError for an unknown option, a missing value, an invalid parameter, or nothing
 *   to analyse.
 */
export function parseAnalyzeArgs(argv: readonly string[]): AnalyzeArgs {
  const files: string[] = [];
  const overrides: Partial<Record<Stage, Record<string, number>>> = {};
  let out: string | null = null;
  let png = false;
  let summary = false;
  let scenario: SimulatedScenario | null = null;
  let seed: number | null = null;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      files.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith('-') || arg === '-') {
      files.push(arg);
      continue;
    }
    const equals = arg.indexOf('=');
    const name = equals < 0 ? arg : arg.slice(0, equals);
    const value = (): string => {
      if (equals >= 0) return arg.slice(equals + 1);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new UsageError(`${name} needs a value`);
      }
      i++;
      return next;
    };
    switch (name) {
      case '-h':
      case '--help':
        help = true;
        break;
      case '--out':
        out = value();
        if (out === '') throw new UsageError('--out needs a directory');
        break;
      case '--png':
        png = true;
        break;
      case '--summary':
        summary = true;
        break;
      case '--param':
        addOverride(overrides, value());
        break;
      case '--simulate': {
        const given = value();
        if (!(SIMULATED_SCENARIOS as readonly string[]).includes(given)) {
          throw new UsageError(
            `--simulate takes ${SIMULATED_SCENARIOS.join(' or ')}, not ${JSON.stringify(given)}`,
          );
        }
        scenario = given as SimulatedScenario;
        break;
      }
      case '--seed': {
        const given = value();
        const parsed = Number(given);
        if (given.trim() === '' || !Number.isSafeInteger(parsed)) {
          throw new UsageError(`--seed takes a whole number, not ${JSON.stringify(given)}`);
        }
        seed = parsed;
        break;
      }
      default:
        throw new UsageError(`unknown option ${name}`);
    }
  }

  if (!help) {
    if (files.length === 0 && scenario === null) {
      throw new UsageError('give an export file, or --simulate');
    }
    if (png && out === null) throw new UsageError('--png needs --out');
    if (seed !== null && scenario === null) throw new UsageError('--seed needs --simulate');
    try {
      resolveAnalysisParams(overrides);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      throw new UsageError(`--param: ${error.message}`);
    }
  }
  return {
    files,
    out,
    png,
    summary,
    overrides,
    simulate: scenario === null ? null : { scenario, seed: seed ?? 1 },
    help,
  };
}

/** Adds `stage.name=value` to `overrides`. */
function addOverride(
  overrides: Partial<Record<Stage, Record<string, number>>>,
  text: string,
): void {
  const match = /^([A-Za-z]+)\.([A-Za-z0-9]+)=(.+)$/.exec(text);
  if (!match) {
    throw new UsageError(`--param takes <stage>.<name>=<value>, not ${JSON.stringify(text)}`);
  }
  const [, stage, name, given] = match;
  if (!(STAGES as readonly string[]).includes(stage)) {
    throw new UsageError(`--param: no stage ${stage}; the stages are ${STAGES.join(', ')}`);
  }
  const value = Number(given);
  if (given.trim() === '' || !Number.isFinite(value)) {
    throw new UsageError(`--param: ${stage}.${name} takes a number, not ${JSON.stringify(given)}`);
  }
  overrides[stage as Stage] = { ...overrides[stage as Stage], [name]: value };
}
