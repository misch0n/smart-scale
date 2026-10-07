// The reference shot (T3.7, D-105): a shot picked in History whose curve the extraction's charts
// draw under the live one, from the Start tap as it was from its pump_on, until another is picked
// or it is cleared. Display only: nothing of it reaches the shot's record or the analysis.

import { useEffect, useState } from 'preact/hooks';
import type { HistoryEntry } from '../../app/history';
import type { AppServices } from '../../app/startup';
import type { Id } from '../../core/model';
import { referenceCurve } from '../history/plot';
import { weekdayLabel } from '../history/rows';
import { CloseIcon } from '../icons';
import type { ChartPoint } from './chart';
import { seconds, tenths, timeOfDay } from './format';

export interface Reference {
  readonly shotId: Id;
  /** From its pump_on, s. */
  readonly points: readonly ChartPoint[];
  /** `Mon 06:12 · 36.1 g in 27.4 s`: short, to sit under a chart. */
  readonly label: string;
}

/** The reference from its history entry; null for one deleted, or without pump_on. */
export function referenceOf(entry: HistoryEntry | null): Reference | null {
  if (entry === null || entry.shot.discardedAtEpochMs !== null || entry.segment === null) {
    return null;
  }
  const points = referenceCurve(entry.segment);
  if (points === null) return null;
  const { yieldG, totalS } = entry.segment.metrics;
  const when = `${weekdayLabel(entry.atEpochMs)} ${timeOfDay(entry.atEpochMs)}`;
  const figures =
    yieldG === null
      ? null
      : totalS === null
        ? `${tenths(yieldG)} g`
        : `${tenths(yieldG)} g in ${seconds(totalS * 1000)} s`;
  return {
    shotId: entry.shot.id,
    points,
    label: figures === null ? when : `${when} · ${figures}`,
  };
}

/** The reference the brew settings name, loaded once per shot; null while none, or loading. */
export function useReference(services: AppServices, shotId: Id | null): Reference | null {
  const [loaded, setLoaded] = useState<Reference | null>(null);
  useEffect(() => {
    if (shotId === null) return;
    let current = true;
    services.history.entry(shotId).then(
      (entry) => {
        if (current) setLoaded(referenceOf(entry));
      },
      // A reference that can't be read is none: the brew goes on without it.
      () => {
        if (current) setLoaded(null);
      },
    );
    return () => {
      current = false;
    };
  }, [services, shotId]);
  return shotId !== null && loaded?.shotId === shotId ? loaded : null;
}

/**
 * What the charts' second curve is (the extraction screen, the shot card): the reference's day,
 * time, yield and time, and on the extraction screen an ✕ that clears it.
 */
export function ReferenceLine({
  reference,
  onClear,
}: {
  reference: Reference;
  onClear?: () => void;
}) {
  return (
    <p class="muted reference-line" data-testid="reference">
      <svg viewBox="0 0 20 6" aria-hidden="true">
        <path d="M0 3H20" style={{ stroke: 'var(--line-b)', strokeWidth: 2.5 }} />
      </svg>
      <span class="reference-text">
        Reference · <span class="num">{reference.label}</span>
      </span>
      {onClear !== undefined && (
        <button
          type="button"
          class="reference-clear"
          aria-label="Stop drawing the reference"
          onClick={onClear}
          data-testid="reference-clear"
        >
          <CloseIcon size={16} />
        </button>
      )}
    </p>
  );
}
