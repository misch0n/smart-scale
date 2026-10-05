// Lets a script import the app's TypeScript from src/ as it is (T1.15, D-051). Node strips the
// types itself (from Node 22.18; src/ uses only erasable syntax, `erasableSyntaxOnly` in
// tsconfig.app.json), and the hook below resolves the imports Vite allows and Node doesn't:
// './samples' for './samples.ts', and '../model' for '../model/index.ts'.
//
// Call registerTypeScript() before the first dynamic import of a .ts file. A static import is
// resolved before any code runs, so it can't go through the hook.

import { statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

const RELATIVE = /^\.{1,2}\//;
const HAS_EXTENSION = /\.[cm]?[jt]sx?$|\.json$/;

function isFile(url) {
  try {
    return statSync(fileURLToPath(url)).isFile();
  } catch {
    return false;
  }
}

let registered = false;

/** Lets later dynamic imports load src/'s .ts files. Exits with a message on too old a Node. */
export function registerTypeScript() {
  if (registered) return;
  if (!process.features.typescript || typeof registerHooks !== 'function') {
    console.error(
      `This script runs the app's TypeScript with Node's own type stripping, which needs ` +
        `Node 22.18 or later; this is Node ${process.version}.`,
    );
    process.exit(2);
  }
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const parent = context.parentURL;
      if (
        parent?.startsWith('file:') &&
        parent.endsWith('.ts') &&
        RELATIVE.test(specifier) &&
        !HAS_EXTENSION.test(specifier)
      ) {
        for (const suffix of ['.ts', '/index.ts']) {
          const url = new URL(specifier + suffix, parent);
          if (isFile(url)) return nextResolve(url.href, context);
        }
      }
      return nextResolve(specifier, context);
    },
  });
  registered = true;
}
