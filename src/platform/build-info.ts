// Replaced at build time by Vite's `define` (vite.config.ts).
declare const __APP_COMMIT__: string;
declare const __APP_BUILD_TIME__: string;

export interface BuildInfo {
  /** Short git commit the bundle was built from, or 'unknown'. */
  commit: string;
  /** ISO timestamp of the build. */
  buildTime: string;
}

export const BUILD_INFO: BuildInfo = {
  commit: __APP_COMMIT__,
  buildTime: __APP_BUILD_TIME__,
};
