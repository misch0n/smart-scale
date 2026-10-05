import { describe, expect, it } from 'vitest';
import { ANALYZE_USAGE, parseAnalyzeArgs, UsageError } from './args';

const usageError = (argv: string[]) => {
  try {
    parseAnalyzeArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) return error.message;
    throw error;
  }
  throw new Error(`no UsageError for ${argv.join(' ')}`);
};

describe('parseAnalyzeArgs', () => {
  it('takes export files, and nothing else by default', () => {
    expect(parseAnalyzeArgs(['a.json', 'b.json'])).toEqual({
      files: ['a.json', 'b.json'],
      out: null,
      png: false,
      summary: false,
      overrides: {},
      simulate: null,
      help: false,
    });
  });

  it('takes options as --name value or --name=value, before or after the files', () => {
    const args = parseAnalyzeArgs(['--out', 'charts', 'a.json', '--png', '--summary']);
    expect(args).toMatchObject({ files: ['a.json'], out: 'charts', png: true, summary: true });
    expect(parseAnalyzeArgs(['a.json', '--out=charts']).out).toBe('charts');
  });

  it('takes everything after -- as a file', () => {
    expect(parseAnalyzeArgs(['--', '--odd-name.json']).files).toEqual(['--odd-name.json']);
  });

  it('collects --param overrides by stage, the last one of a name winning', () => {
    const args = parseAnalyzeArgs([
      'a.json',
      '--param',
      'liquid.sgWindowS=0.7',
      '--param=pump.vibrationRatio=4',
      '--param',
      'liquid.dropG=0',
      '--param',
      'liquid.sgWindowS=0.9',
    ]);
    expect(args.overrides).toEqual({
      liquid: { sgWindowS: 0.9, dropG: 0 },
      pump: { vibrationRatio: 4 },
    });
  });

  it('refuses a parameter the analysis doesn’t have, or a value out of its range', () => {
    expect(usageError(['a.json', '--param', 'liquid.sgWindow=0.7'])).toBe(
      '--param: liquid markers: unknown parameter sgWindow',
    );
    expect(usageError(['a.json', '--param', 'liquid.sgWindowS=0'])).toMatch(
      /^--param: liquid markers: sgWindowS 0 is not a finite number above 0/,
    );
    expect(usageError(['a.json', '--param', 'shots.minRiseG=1'])).toBe(
      '--param: no stage shots; the stages are timeline, segmentation, liquid, pump',
    );
    expect(usageError(['a.json', '--param', 'liquid.sgWindowS=half'])).toBe(
      '--param: liquid.sgWindowS takes a number, not "half"',
    );
    expect(usageError(['a.json', '--param', 'sgWindowS=0.7'])).toBe(
      '--param takes <stage>.<name>=<value>, not "sgWindowS=0.7"',
    );
  });

  it('simulates espresso or demo, with a seed', () => {
    expect(parseAnalyzeArgs(['--simulate', 'espresso']).simulate).toEqual({
      scenario: 'espresso',
      seed: 1,
    });
    expect(parseAnalyzeArgs(['--simulate', 'demo', '--seed', '7']).simulate).toEqual({
      scenario: 'demo',
      seed: 7,
    });
    expect(usageError(['--simulate', 'latte'])).toBe(
      '--simulate takes espresso or demo, not "latte"',
    );
    expect(usageError(['--simulate', 'demo', '--seed', '1.5'])).toBe(
      '--seed takes a whole number, not "1.5"',
    );
    expect(usageError(['a.json', '--seed', '2'])).toBe('--seed needs --simulate');
  });

  it('refuses what it can’t run', () => {
    expect(usageError([])).toBe('give an export file, or --simulate');
    expect(usageError(['a.json', '--png'])).toBe('--png needs --out');
    expect(usageError(['a.json', '--out'])).toBe('--out needs a value');
    expect(usageError(['a.json', '--out', '--png'])).toBe('--out needs a value');
    expect(usageError(['a.json', '--verbose'])).toBe('unknown option --verbose');
  });

  it('shows the usage on --help, with or without anything to analyse', () => {
    expect(parseAnalyzeArgs(['--help']).help).toBe(true);
    expect(parseAnalyzeArgs(['-h', '--png']).help).toBe(true);
    expect(ANALYZE_USAGE).toContain('npm run analyze -- <export.json>...');
  });
});
