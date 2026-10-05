// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Architecture boundaries from docs/ARCHITECTURE.md (D-010). Agents start with cleared context,
// so the linter holds the spec's structural rules for them.
//
// Flat config *replaces* a rule's options when a later block matches the same file; it does not
// merge them. That is why the analysis and live blocks repeat the core patterns.
const coreImportBans = [
  {
    group: ['preact', 'preact/*', '@preact/*'],
    message: 'src/core is framework-free; UI code belongs in src/ui (docs/ARCHITECTURE.md).',
  },
  {
    group: [
      '**/ui',
      '**/ui/**',
      '**/transport',
      '**/transport/**',
      '**/storage',
      '**/storage/**',
      '**/app',
      '**/app/**',
      '**/platform',
      '**/platform/**',
    ],
    message:
      'src/core must not depend on outer layers; inject what it needs from src/app (docs/ARCHITECTURE.md).',
  },
];

const liveImportBan = {
  group: ['**/live', '**/live/**'],
  message:
    'Analysis must never depend on the live pipeline (spec "Signal processing"; CLAUDE.md hard rule 3).',
};

const analysisImportBan = {
  group: ['**/analysis', '**/analysis/**'],
  message:
    'The live pipeline shares nothing with analysis; what both read belongs in src/core/model or src/core/signal (CLAUDE.md hard rule 3).',
};

const bluetoothMessage =
  'Only src/transport/web-bluetooth.ts may touch navigator.bluetooth; use the ScaleTransport interface (CLAUDE.md hard rule 4).';

const coreGlobalBans = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'indexedDB',
].map((name) => ({
  name,
  message: 'src/core is pure: pass platform access in from src/app (docs/ARCHITECTURE.md).',
}));

export default defineConfig([
  globalIgnores(['dist/', 'coverage/', 'node_modules/', 'design/']),
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'navigator', property: 'bluetooth', message: bluetoothMessage },
      ],
      // Also `window.navigator.bluetooth`, `globalThis.navigator.bluetooth` and the like.
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='bluetooth'][object.property.name='navigator']",
          message: bluetoothMessage,
        },
      ],
    },
  },
  {
    files: ['src/transport/web-bluetooth.ts'],
    rules: { 'no-restricted-properties': 'off', 'no-restricted-syntax': 'off' },
  },
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: coreImportBans }],
      'no-restricted-globals': ['error', ...coreGlobalBans],
    },
  },
  {
    files: ['src/core/analysis/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [...coreImportBans, liveImportBan] }],
    },
  },
  {
    files: ['src/core/live/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [...coreImportBans, analysisImportBan] }],
    },
  },
  {
    files: ['*.config.{js,ts}', 'scripts/**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    // The smoke test's callbacks run in the page, where `document` exists.
    files: ['scripts/e2e-*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
]);
