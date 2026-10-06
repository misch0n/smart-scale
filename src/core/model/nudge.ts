/**
 * The taste nudge (spec v2 "Nudge, and learning later"; T2.12, D-084): when the last shot with
 * the brew's machine, grinder and coffee pack was graded sour or bitter, the beans and grind
 * phases say which way to grind. It repeats the user's own taste, so it needs no model: a pure
 * function of the shots' metadata.
 */

import type { Id } from './ids';
import type { Shot } from './shot';

/** What the next brew uses, by id; null for none. */
export interface NudgeContext {
  readonly machineId: Id | null;
  readonly grinderId: Id | null;
  readonly packId: Id | null;
}

export interface TasteNudge {
  /** The shot it repeats. */
  readonly shotId: Id;
  readonly taste: 'sour' | 'bitter';
  /** Which way to grind for a more balanced cup: finer after sour, coarser after bitter. */
  readonly grind: 'finer' | 'coarser';
}

/**
 * The nudge for a brew with `context`, from `shots` newest first: the newest shot with the same
 * machine, grinder and pack (none matching none), when it was graded sour or bitter. Null after a
 * balanced or ungraded one, or without one.
 */
export function tasteNudge(
  shots: readonly Pick<Shot, 'id' | 'direction' | 'machineId' | 'grinderId' | 'packId'>[],
  context: NudgeContext,
): TasteNudge | null {
  const last = shots.find(
    (shot) =>
      shot.machineId === context.machineId &&
      shot.grinderId === context.grinderId &&
      shot.packId === context.packId,
  );
  switch (last?.direction) {
    case 'sour':
      return { shotId: last.id, taste: 'sour', grind: 'finer' };
    case 'bitter':
      return { shotId: last.id, taste: 'bitter', grind: 'coarser' };
    default:
      return null;
  }
}
