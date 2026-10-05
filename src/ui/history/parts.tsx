// Pieces the history boards share, and Home with them: the taste as a coloured word, a row's
// small graph, the A and B marks, loading a screen's shots, and the recordings that couldn't be
// read.

import { useEffect, useState } from 'preact/hooks';
import type { HistoryLoad } from '../../app/history';
import type { AppServices } from '../../app/startup';
import type { Direction } from '../../core/model';
import { TASTE_LABELS } from '../brew/Grades';
import type { Sparkline } from './plot';
import './history.css';

/** The taste: a dot and the word in its colour; a dash when not graded. */
export function Taste({ direction }: { direction: Direction | null }) {
  if (direction === null) {
    return (
      <span class="taste muted" aria-label="Not graded">
        –
      </span>
    );
  }
  return (
    <span class={`taste c-${direction}`}>
      <span class={`dot bg-${direction}`} />
      {TASTE_LABELS[direction]}
    </span>
  );
}

/** A row's small graph (board History): the weight from pump on, and the target dotted. */
export function Spark({ spark }: { spark: Sparkline | null }) {
  const line = { fill: 'none', vectorEffect: 'non-scaling-stroke' } as const;
  return (
    <svg class="spark" viewBox="0 0 1000 500" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 499H1000" style={{ ...line, stroke: 'var(--rule)', strokeWidth: 1 }} />
      {spark?.targetY != null && (
        <path
          d={`M0 ${spark.targetY}H1000`}
          style={{ ...line, stroke: 'var(--tick)', strokeWidth: 1, strokeDasharray: '2 2' }}
        />
      )}
      {spark !== null && (
        <path
          d={spark.weight}
          style={{ ...line, stroke: 'var(--line-a)', strokeWidth: 1.5, strokeLinejoin: 'round' }}
        />
      )}
    </svg>
  );
}

/** Shot A's or B's mark: a filled circle with the letter, in the shot's colour. */
export function PickMark({ which }: { which: 'A' | 'B' | null }) {
  if (which === null) return <span class="pick-mark free" aria-hidden="true" />;
  return (
    <span class={`pick-mark ${which === 'A' ? 'a' : 'b'}`} aria-hidden="true">
      {which}
    </span>
  );
}

export type Loaded<T> =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly value: T }
  | { readonly state: 'failed'; readonly message: string };

/**
 * Loads what a history screen shows, again whenever the recordings change (an ended one has its
 * post-hoc shots then), and when `shots` the shots too, and keeps showing the last value while
 * it does. A shot's own page leaves out the shots: its editor holds the shot, and reloading after
 * each grade would analyse an open recording again.
 */
export function useHistoryLoad<T>(
  services: AppServices,
  load: () => Promise<T>,
  deps: readonly unknown[],
  { shots }: { readonly shots: boolean },
): Loaded<T> {
  const [loaded, setLoaded] = useState<Loaded<T>>({ state: 'loading' });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const again = (): void => setVersion((v) => v + 1);
    const offs = [services.links.onRecordingsChanged(again)];
    if (shots) offs.push(services.history.onChange(again));
    return () => offs.forEach((off) => off());
  }, [services, shots]);
  useEffect(() => {
    let cancelled = false;
    load().then(
      (value) => {
        if (!cancelled) setLoaded({ state: 'ready', value });
      },
      (error: unknown) => {
        if (!cancelled) {
          setLoaded({
            state: 'failed',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // The caller lists what `load` depends on.
  }, [services, version, ...deps]);
  return loaded;
}

/** The recordings that couldn't be analysed, so their shots are missing; nothing without any. */
export function LoadFailures({ failures }: { failures: HistoryLoad['failures'] }) {
  if (failures.length === 0) return null;
  return (
    <div class="card notice caution" role="alert" data-testid="history-failures">
      {failures.length === 1
        ? 'A recording couldn’t be read, so its shots are missing: '
        : `${failures.length} recordings couldn’t be read, so their shots are missing: `}
      {failures[0].error}
    </div>
  );
}
