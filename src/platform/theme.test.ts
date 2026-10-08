import { describe, expect, it } from 'vitest';
import { applyTheme, setTheme, storedTheme, THEME_KEY } from './theme';

function memory(): Pick<Storage, 'getItem' | 'setItem'> & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  };
}

/** The root element, as far as the theme touches it. */
function fakeRoot() {
  const attributes = new Map<string, string>();
  return {
    attributes,
    setAttribute: (name: string, value: string) => void attributes.set(name, value),
    removeAttribute: (name: string) => void attributes.delete(name),
  };
}

describe('the theme (T3.11)', () => {
  it("is the system's until one is kept, and reads only a known one", () => {
    const store = memory();
    expect(storedTheme(store)).toBe('system');
    store.values.set(THEME_KEY, 'dark');
    expect(storedTheme(store)).toBe('dark');
    store.values.set(THEME_KEY, 'sepia');
    expect(storedTheme(store)).toBe('system');
    expect(storedTheme(null)).toBe('system');
    const blocked = {
      getItem: (): string | null => {
        throw new Error('blocked');
      },
      setItem: () => {},
    };
    expect(storedTheme(blocked)).toBe('system');
  });

  it('sets data-theme on the root, none for the system, and keeps it', () => {
    const store = memory();
    const root = fakeRoot();
    setTheme('light', store, root);
    expect(root.attributes.get('data-theme')).toBe('light');
    expect(store.values.get(THEME_KEY)).toBe('light');
    applyTheme('system', root);
    expect(root.attributes.has('data-theme')).toBe(false);
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error('full');
      },
    };
    setTheme('dark', full, root);
    expect(root.attributes.get('data-theme')).toBe('dark');
  });
});
