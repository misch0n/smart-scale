/**
 * The scale's own name (T2.30, D-102): what the user calls a scale, set with a tap on Home. It is
 * a setting (`kv`, so a full export carries it and a restore brings it back), keyed by the name
 * the scale advertises (`BOOKOO_SC …`), which is the same in every browser and on every device,
 * unlike the browser's id for it. Only the screens use it: a recording keeps the advertised name
 * (raw, hard rule 1), and the probe shows that.
 */

import type { JsonValue } from '../core/model';
import { Emitter, type Unsubscribe } from '../transport/emitter';
import type { SettingsStore } from './brew-settings';

/** Where the names are kept in `kv`: `{ "<advertised name>": "<the user's name>" }`. */
export const SCALE_NAMES_KEY = 'scale.names';

/** The longest name kept, in characters: a name, not a note. */
export const SCALE_NAME_MAX = 40;

/** The key of a scale with no advertised name. */
const NO_NAME = '';

export class ScaleNames {
  readonly #store: SettingsStore;
  readonly #changes = new Emitter<void>();
  #names: Readonly<Record<string, string>>;
  #writeError: string | null = null;
  /** Writes in order: a later change never lands before an earlier one. */
  #writing: Promise<void> = Promise.resolve();

  private constructor(store: SettingsStore, names: Readonly<Record<string, string>>) {
    this.#store = store;
    this.#names = names;
  }

  /** Loads the names. A store that can't be read, or a malformed value, gives none. */
  static async load(store: SettingsStore): Promise<ScaleNames> {
    return new ScaleNames(store, await readNames(store));
  }

  /** The user's name for the scale that advertises `advertised`; null when none is set. */
  nameOf(advertised: string | null): string | null {
    return this.#names[advertised ?? NO_NAME] ?? null;
  }

  /** What the screens call the scale: the user's name, else its own, else `fallback`. */
  label(advertised: string | null, fallback: string): string {
    return this.nameOf(advertised) ?? advertised ?? fallback;
  }

  /**
   * Names the scale, at once and stored behind it. A blank name, or the scale's own, clears the
   * user's: the scale goes back to its own name.
   */
  rename(advertised: string | null, name: string): void {
    const key = advertised ?? NO_NAME;
    const trimmed = name.trim().slice(0, SCALE_NAME_MAX);
    const names: Record<string, string> = { ...this.#names };
    if (trimmed === '' || trimmed === advertised) delete names[key];
    else names[key] = trimmed;
    if (names[key] === this.#names[key]) return;
    this.#names = names;
    this.#changes.emit();
    const value: JsonValue = { ...names };
    this.#writing = this.#writing.then(() =>
      this.#store.set(SCALE_NAMES_KEY, value).then(
        () => {
          this.#writeError = null;
        },
        (error: unknown) => {
          // Named for this session: the name is a convenience, not a record.
          this.#writeError = error instanceof Error ? error.message : String(error);
          this.#changes.emit();
        },
      ),
    );
  }

  /** Why the last write failed, or null. */
  get writeError(): string | null {
    return this.#writeError;
  }

  /** Reads the names again: after an import. */
  async reload(): Promise<void> {
    await this.#writing;
    this.#names = await readNames(this.#store);
    this.#changes.emit();
  }

  /** Resolves once every change so far is stored, or has failed. */
  whenStored(): Promise<void> {
    return this.#writing;
  }

  onChange(listener: () => void): Unsubscribe {
    return this.#changes.on(listener);
  }
}

async function readNames(store: SettingsStore): Promise<Readonly<Record<string, string>>> {
  const stored = await store.get(SCALE_NAMES_KEY).catch(() => undefined);
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {};
  const names: Record<string, string> = {};
  for (const [key, value] of Object.entries(stored)) {
    if (typeof value === 'string' && value.trim() !== '') names[key] = value;
  }
  return names;
}
