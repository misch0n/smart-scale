/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

// Short commit id baked into the build. The UI shows it, so you can tell which deploy Bluefy has
// loaded, and recordings will carry it so data can be traced back to the code that captured it.
function gitCommit(): string {
  const fromCi = process.env.GITHUB_SHA;
  if (fromCi) return fromCi.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  // Relative asset paths: one build works under the GitHub Pages project path (/smart-scale/),
  // on a custom domain, in `vite preview` and in a future Capacitor shell. The UI routes on the
  // URL hash for the same reason (D-009).
  base: './',
  plugins: [preact()],
  define: {
    __APP_COMMIT__: JSON.stringify(gitCommit()),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
