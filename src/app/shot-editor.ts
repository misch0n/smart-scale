/**
 * A stored shot's grades, edited from the history's shot detail (T1.19): the taste, the
 * channelling and the tags, the same fields the shot card edits (D-067). A change applies to the
 * shot here at once and is stored behind it, in order, so a later tap never lands before an
 * earlier one; each stored change goes out with automatic export (T1.20). A failed write leaves
 * the change in place here and reports it (`storeError`); the next one tries again.
 */

import { updateShot, type Direction, type Shot, type ShotMetadata } from '../core/model';
import type { ShotRepository } from '../storage';
import { Emitter, type Unsubscribe } from '../transport/emitter';
import { toggledTag, type BrewTag } from './brew-settings';

export interface ShotEditorOptions {
  readonly shots: Pick<ShotRepository, 'update'>;
  /** The tag list, for the tags' order (`BrewPreferences.value.tags`). */
  readonly tags: () => readonly BrewTag[];
  /** Called once a change is stored: automatic export uploads the file again (T1.20). */
  readonly onShotsChanged?: () => void;
  /** The wall clock, for the shot's `updatedAtEpochMs`. Default `Date.now`. */
  readonly epochNow?: () => number;
}

export class ShotEditor {
  readonly #options: ShotEditorOptions;
  readonly #epochNow: () => number;
  readonly #changes = new Emitter<void>();
  #shot: Shot;
  #storeError: string | null = null;
  #writing: Promise<unknown> = Promise.resolve();

  constructor(shot: Shot, options: ShotEditorOptions) {
    this.#shot = shot;
    this.#options = options;
    this.#epochNow = options.epochNow ?? (() => Date.now());
  }

  /** The shot with every change made here, stored or not. */
  get shot(): Shot {
    return this.#shot;
  }

  /** Why the latest write failed, or null. */
  get storeError(): string | null {
    return this.#storeError;
  }

  onChange(listener: () => void): Unsubscribe {
    return this.#changes.on(listener);
  }

  /** The taste, or null to clear it. */
  setTaste(direction: Direction | null): Promise<boolean> {
    return this.#change({ direction });
  }

  setChannelled(channelled: boolean): Promise<boolean> {
    return this.#change({ channelled });
  }

  /** Turns a tag on or off. */
  toggleTag(name: string): Promise<boolean> {
    return this.#change({ tags: toggledTag(this.#options.tags(), this.#shot.tags ?? [], name) });
  }

  /** Resolves once every change made so far is stored or has failed. */
  whenStored(): Promise<void> {
    return this.#writing.then(() => {});
  }

  #change(changes: Partial<ShotMetadata>): Promise<boolean> {
    const now = this.#epochNow();
    this.#shot = updateShot(this.#shot, changes, now);
    this.#changes.emit();
    const id = this.#shot.id;
    const done = this.#writing
      .then(() => this.#options.shots.update(id, changes, now))
      .then(
        () => {
          this.#options.onShotsChanged?.();
          this.#setStoreError(null);
          return true;
        },
        (error: unknown) => {
          this.#setStoreError(error instanceof Error ? error.message : String(error));
          return false;
        },
      );
    this.#writing = done;
    return done;
  }

  #setStoreError(error: string | null): void {
    if (error === this.#storeError) return;
    this.#storeError = error;
    this.#changes.emit();
  }
}
