// The inspection CLI as a process (T1.15): Node loads src/'s TypeScript through
// scripts/typescript.mjs, which no other test exercises. src/core/inspect's own tests cover the
// report and the charts.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const TWO_SHOTS = 'fixtures/real/2026-10-05_two-shots_0a69da56.json';

function analyze(...args) {
  const run = spawnSync(process.execPath, ['scripts/analyze.mjs', ...args], { encoding: 'utf8' });
  return { code: run.status, stdout: run.stdout, stderr: run.stderr };
}

describe('npm run analyze', () => {
  const out = mkdtempSync(join(tmpdir(), 'smart-scale-analyze-'));
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it('prints a real recording’s analysis as JSON', () => {
    const { code, stdout } = analyze(TWO_SHOTS);
    expect(code).toBe(0);
    const report = JSON.parse(stdout);
    expect(report.files[0].source).toBe(TWO_SHOTS);
    expect(report.files[0].recordings[0].analysis.segments).toHaveLength(3);
  });

  it('writes the charts, the report and a simulated export with --out', () => {
    const { code, stdout, stderr } = analyze('--simulate', 'espresso', '--out', out, '--summary');
    expect(code).toBe(0);
    expect(stdout).toContain('true shot 0 (segment 0)');
    expect(stderr).toContain('wrote report.json and 2 charts (SVG)');
    const files = readdirSync(out).sort();
    expect(files.filter((name) => name.endsWith('.svg'))).toHaveLength(2);
    expect(files).toContain('report.json');
    expect(files).toContain('simulated-espresso-seed-1.json');
    // The simulated export reads back like any file.
    const again = analyze(join(out, 'simulated-espresso-seed-1.json'), '--summary');
    expect(again.code).toBe(0);
    expect(again.stdout).toContain('segment 0');
    expect(JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')).analysisVersion).toBe(1);
  });

  it('exits 2 with the usage on a bad command line', () => {
    const { code, stdout, stderr } = analyze(TWO_SHOTS, '--param', 'liquid.nothing=1');
    expect(code).toBe(2);
    expect(stdout).toBe('');
    expect(stderr).toContain('analyze: --param: liquid markers: unknown parameter nothing');
    expect(stderr).toContain('Usage:');
  });

  it('exits 1 naming a file it can’t read', () => {
    const missing = join(out, 'missing.json');
    const { code, stderr } = analyze(missing);
    expect(code).toBe(1);
    expect(stderr).toContain(`analyze: can't read ${missing}`);
    expect(existsSync(missing)).toBe(false);
  });

  it('exits 1 naming a file that isn’t an export', () => {
    const { code, stderr } = analyze('package.json');
    expect(code).toBe(1);
    expect(stderr).toContain("analyze: package.json: The file isn't a smart-scale export");
  });
});
