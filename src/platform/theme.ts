/**
 * The theme (T3.11, D-108): light, dark, or the system's, picked in Setup. It belongs to this
 * device, so it is kept in `localStorage` (read before the first render, so no screen flashes
 * the other theme), not in the settings an export carries. It sets `data-theme` on the root
 * element, which `theme.css` reads; the system's choice is no attribute at all.
 */

export const THEMES = ['light', 'system', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/** Where the theme is kept. */
export const THEME_KEY = 'smart-scale.theme';

type KeyValue = Pick<Storage, 'getItem' | 'setItem'>;

function storage(): KeyValue | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // storage blocked: the system's theme, not kept
  }
}

/** The theme kept on this device; the system's when none is, or it can't be read. */
export function storedTheme(store: KeyValue | null = storage()): Theme {
  try {
    const value = store?.getItem(THEME_KEY);
    return (THEMES as readonly (string | null | undefined)[]).includes(value)
      ? (value as Theme)
      : 'system';
  } catch {
    return 'system';
  }
}

/** Shows `theme`: the root's `data-theme`, none for the system's. */
type Root = Pick<HTMLElement, 'setAttribute' | 'removeAttribute'>;

export function applyTheme(theme: Theme, root: Root = document.documentElement): void {
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

/** Shows `theme` and keeps it; a store that fails keeps it for this session only. */
export function setTheme(
  theme: Theme,
  store: KeyValue | null = storage(),
  root: Root = document.documentElement,
): void {
  applyTheme(theme, root);
  try {
    store?.setItem(THEME_KEY, theme);
  } catch {
    // Shown, not kept: the theme is a convenience.
  }
}
