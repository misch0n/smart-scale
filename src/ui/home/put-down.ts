// Which container put down opens the brew from Home (T2.16, Q31): a known one, recognised as it
// goes on or picked on Home, but not the vessel already on the scale as Home opened, so a brew
// ended with its cup still on doesn't bounce back.

import type { VesselOnScale } from '../../app/live-vessel';
import type { Id } from '../../core/model';

/** The vessel on the scale as Home opened, and the container picked for it. */
export interface OnScaleAtOpen {
  readonly onMs: number | null;
  readonly pickedId: Id | null;
}

export function onScaleAtOpen(onScale: VesselOnScale | null): OnScaleAtOpen {
  return { onMs: onScale?.vessel.onMs ?? null, pickedId: onScale?.picked?.id ?? null };
}

/** Whether `onScale` is a known container put down, or picked, since Home opened (`atOpen`). */
export function opensBrew(onScale: VesselOnScale | null, atOpen: OnScaleAtOpen): boolean {
  if (onScale === null || onScale.container === null) return false;
  const putDown = onScale.vessel.onMs !== atOpen.onMs;
  const picked = onScale.picked !== null && onScale.picked.id !== atOpen.pickedId;
  return putDown || picked;
}
