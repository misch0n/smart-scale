import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

/*
 * Lint proves the live pipeline and the analysis apart (T1.17; CLAUDE.md hard rule 3, D-010):
 * the repository's own ESLint config, run on files that would cross the line. Type-aware rules
 * are off here, so the files needn't exist; the import rules don't need types.
 */

const eslint = new ESLint({
  cwd: new URL('../../../', import.meta.url).pathname,
  overrideConfig: [{ files: ['**/*.ts'], ...tseslint.configs.disableTypeChecked }],
});

/** The rules `code` breaks, as if it were the file at `path`. */
async function broken(path: string, code: string): Promise<(string | null)[]> {
  const [result] = await eslint.lintText(code, { filePath: path });
  return result.messages.map((message) => message.ruleId);
}

describe('the live pipeline’s boundaries', () => {
  it('keeps analysis from importing it', async () => {
    for (const from of ['../live', '../live/shot-monitor', '../live/live-weight']) {
      expect(await broken('src/core/analysis/crossing.ts', `export * from '${from}';\n`)).toEqual([
        'no-restricted-imports',
      ]);
    }
  });

  it('keeps it from importing analysis', async () => {
    for (const from of ['../analysis', '../analysis/stability']) {
      expect(await broken('src/core/live/crossing.ts', `export * from '${from}';\n`)).toEqual([
        'no-restricted-imports',
      ]);
    }
  });

  it('lets it import what it is built on', async () => {
    const code =
      "export * from '../model';\nexport * from '../protocol';\nexport * from '../signal';\n";
    expect(await broken('src/core/live/crossing.ts', code)).toEqual([]);
  });
});
