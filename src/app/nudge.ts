/**
 * The taste nudge's dismissal (T2.12, D-084): the shot whose nudge the user dismissed. It is
 * kept on this device (`storage.local`, not exported: a screen's state, not a setting), so the
 * nudge stays away until another shot brings one. Which nudge shows is `tasteNudge`, a pure
 * function of the shots (`src/core/model/nudge.ts`).
 */

import type { Id } from '../core/model';
import type { LocalRepository } from '../storage';
import { Emitter, type Unsubscribe } from '../transport/emitter';

/** Where the dismissed nudge's shot id is kept. */
export const NUDGE_DISMISSED_KEY = 'nudge.dismissedShotId';

export class NudgeDismissal {
  readonly #local: Pick<LocalRepository, 'get' | 'set'>;
  readonly #changes = new Emitter<void>();
  #shotId: Id | null;

  private constructor(local: Pick<LocalRepository, 'get' | 'set'>, shotId: Id | null) {
    this.#local = local;
    this.#shotId = shotId;
  }

  /** Reads the dismissal; one that can't be read is none. */
  static async load(local: Pick<LocalRepository, 'get' | 'set'>): Promise<NudgeDismissal> {
    const stored = await local.get(NUDGE_DISMISSED_KEY).catch(() => undefined);
    return new NudgeDismissal(local, typeof stored === 'string' ? stored : null);
  }

  /** The shot whose nudge was dismissed; null when none was. */
  get shotId(): Id | null {
    return this.#shotId;
  }

  /**
   * Dismisses the nudge of `shotId`: at once, and stored behind it. When storing fails, it stays
   * dismissed until the app restarts.
   */
  dismiss(shotId: Id): Promise<void> {
    if (shotId === this.#shotId) return Promise.resolve();
    this.#shotId = shotId;
    this.#changes.emit();
    return this.#local.set(NUDGE_DISMISSED_KEY, shotId).catch(() => {
      // Dismissed for this session: a nudge is no record worth an error.
    });
  }

  onChange(listener: () => void): Unsubscribe {
    return this.#changes.on(listener);
  }
}
