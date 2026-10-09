// A shot (board History-Detail): the large chart, its stages coloured, with the target, and three
// figures under it (T3.16, T3.17); the phases against their targets; the grades, saved as they
// change; beside the title "Reference", whose curve the next shots' charts draw (T3.7, T3.8;
// Compare went, T3.6); and at the foot "Delete shot", asked once more (T3.20). The context the
// shot recorded stays internal (D-056): only `?debug` shows it.

import { useEffect, useRef, useState } from 'preact/hooks';
import type { HistoryEntry } from '../../app/history';
import type { ShotEditor } from '../../app/shot-editor';
import type { AppServices } from '../../app/startup';
import { timeOfDay } from '../brew/format';
import { Grades } from '../brew/Grades';
import { pageHash, type Route } from '../route';
import { CheckIcon, PlusIcon } from '../icons';
import { TabBar } from '../TabBar';
import { useLiveUpdates } from '../use-live-updates';
import { useHistoryLoad } from './parts';
import { referenceCurve, shotPlot, ZERO_LABELS } from './plot';
import { dayLabel, drinkOf, targetOf } from './rows';
import { ShotSummary } from './ShotSummary';
import { StagedChart } from './StagedChart';
import { grinderLabel, phaseRows } from './tables';
import './history.css';

export function ShotScreen({ services, route }: { services: AppServices; route: Route }) {
  const shotId = route.shotIds[0];
  const loaded = useHistoryLoad(services, () => services.history.entry(shotId), [shotId], {
    shots: false,
  });
  const editor = useEditor(services, loaded.state === 'ready' ? loaded.value : null);

  return (
    <>
      <main class="history" data-testid="shot">
        <a class="back" href={pageHash('history', route.mock)}>
          ‹ History
        </a>
        {loaded.state === 'loading' && <p class="muted">Reading the shot…</p>}
        {loaded.state === 'failed' && (
          <div class="card notice warn" role="alert">
            The shot couldn't be read: {loaded.message}
          </div>
        )}
        {loaded.state === 'ready' && loaded.value === null && (
          <div class="card notice warn" role="alert" data-testid="shot-missing">
            There is no such shot here. It may be on another device.
          </div>
        )}
        {loaded.state === 'ready' && loaded.value !== null && editor !== null && (
          <ShotDetail entry={loaded.value} editor={editor} services={services} route={route} />
        )}
      </main>
      <TabBar current="history" mock={route.mock} />
    </>
  );
}

/** The shot's editor, made once per shot and kept as the entry reloads, so no edit is lost. */
function useEditor(services: AppServices, entry: HistoryEntry | null): ShotEditor | null {
  const [editor, setEditor] = useState<ShotEditor | null>(null);
  const [, setTick] = useState(0);
  const id = entry?.shot.id ?? null;
  useEffect(() => {
    if (entry === null) return;
    if (editor === null || editor.shot.id !== entry.shot.id) {
      setEditor(services.history.editor(entry.shot));
    }
  }, [id]);
  useEffect(() => editor?.onChange(() => setTick((tick) => tick + 1)), [editor]);
  return editor !== null && editor.shot.id === id ? editor : null;
}

function ShotDetail({
  entry,
  editor,
  services,
  route,
}: {
  entry: HistoryEntry;
  editor: ShotEditor;
  services: AppServices;
  route: Route;
}) {
  const shot = editor.shot;
  const shown = { ...entry, shot };
  const targetG = targetOf(shown);
  const plot = entry.segment === null ? null : shotPlot(entry.segment, targetG);
  // The drink, the pack, and the grinder with its setting (no grind row, T3.8).
  const subtitle = [drinkOf(shown), shot.packName, grinderLabel(shot)]
    .filter((part) => part !== null)
    .join(' · ');

  return (
    <>
      <div class="detail-head">
        <div class="detail-title">
          <h1 class="ttl" data-testid="shot-title">
            {dayLabel(entry.atEpochMs)} · {timeOfDay(entry.atEpochMs)}
          </h1>
          <ReferenceToggle entry={entry} services={services} />
        </div>
        <span class="muted" data-testid="shot-subtitle">
          {subtitle}
        </span>
      </div>

      {shot.discardedAtEpochMs !== null && (
        <div class="card notice caution">This shot was deleted: History doesn't list it.</div>
      )}
      {entry.segment === null && (
        <div class="card notice caution" data-testid="shot-unmatched">
          The analysis found no shot where this one was recorded, so it has no graph and no results.
        </div>
      )}
      {entry.refusedFrames && (
        <div class="card notice caution">
          Some weights were refused (an unknown unit or sign), so the results may miss them.
        </div>
      )}

      {plot !== null && entry.segment !== null && (
        <section class="card chart-card" aria-labelledby="d-chart" data-testid="metrics">
          <h2 class="lbl" id="d-chart">
            Extraction
          </h2>
          {/* The stages coloured, the rest of the figures in the chart (T3.16). */}
          <StagedChart plot={plot} label={chartLabel(entry, plot.zero)} />
          <ShotSummary metrics={entry.segment.metrics} ratio={entry.match.ratio} />
        </section>
      )}

      <section class="card" aria-labelledby="d-phases">
        <div class="phases-head">
          <h2 class="lbl" id="d-phases">
            Phases
          </h2>
        </div>
        {phaseRows(shown).map((row) => (
          <div key={row.id} class="row prow" data-testid={`phase-${row.id}`}>
            <span>
              <span>{row.name}</span>
              {row.sub !== null && <span class="muted prow-sub">{row.sub}</span>}
            </span>
            <span class="prow-value">
              {row.value !== null && (
                <>
                  <span class="num">{row.value}</span>
                  <span class="unit"> g</span>{' '}
                </>
              )}
              {row.after !== null && <span class="muted prow-after">{row.after}</span>}
              {row.value === null && row.after === null && <span class="muted">–</span>}
            </span>
          </div>
        ))}
      </section>

      <Grades
        shot={shot}
        actions={editor}
        tags={services.brew.preferences.value.tags}
        variant="detail"
      />
      {editor.storeError !== null && (
        <div class="card notice warn" role="alert" data-testid="store-error">
          Not stored yet: {editor.storeError}
        </div>
      )}

      {entry.segment !== null && referenceCurve(entry.segment) === null && (
        <p class="muted reference-note" data-testid="reference-unavailable">
          Without a Start tap at the pump, this shot can't be lined up as a reference.
        </p>
      )}

      {shot.discardedAtEpochMs === null && (
        <DeleteShot entry={entry} services={services} route={route} />
      )}

      {route.debug && (
        <details class="card debug" open>
          <summary class="lbl">Snapshot (debug)</summary>
          <pre>
            {JSON.stringify({ shot, segment: entry.segment && debugSegment(entry) }, null, 1)}
          </pre>
        </details>
      )}
    </>
  );
}

/** What the chart shows, said in words. */
function chartLabel(entry: HistoryEntry, zero: 'pumpOn' | 'firstDrip'): string {
  const metrics = entry.segment?.metrics;
  const parts = [`Weight and flow from ${ZERO_LABELS[zero]}`];
  if (metrics?.firstDripS != null) parts.push(`preinfusion ${metrics.firstDripS.toFixed(1)} s`);
  if (metrics?.totalS != null) parts.push(`pump off at ${metrics.totalS.toFixed(1)} s`);
  if (metrics?.yieldG != null) parts.push(`yield ${metrics.yieldG.toFixed(1)} g`);
  return parts.join(', ');
}

/** The segment without its curve, which says nothing read as text. */
function debugSegment(entry: HistoryEntry) {
  const { curve, ...rest } = entry.segment!;
  return { ...rest, curve: `${curve.weightG.length} points` };
}

/**
 * The shot as the reference (T3.7, D-105), beside the title (T3.8): its curve is drawn on the
 * extraction's charts from the next brew on, until another shot is picked or it is cleared. A
 * toggle: on, a tap stops it. A shot without pump_on (no Start tap) can't be lined up with a live
 * shot, so it has none (the page says why, under the grades).
 */
function ReferenceToggle({ entry, services }: { entry: HistoryEntry; services: AppServices }) {
  const preferences = services.brew.preferences;
  useLiveUpdates((notify) => preferences.onChange(notify), [preferences]);
  if (entry.segment === null || entry.shot.discardedAtEpochMs !== null) return null;
  if (referenceCurve(entry.segment) === null) return null;
  const isReference = preferences.value.referenceShotId === entry.shot.id;
  return (
    <button
      type="button"
      class={isReference ? 'chip on reference-toggle' : 'chip reference-toggle'}
      aria-pressed={isReference}
      onClick={() => preferences.setReference(isReference ? null : entry.shot.id)}
      data-testid="reference-toggle"
    >
      {isReference ? <CheckIcon size={14} strokeWidth={2.5} /> : <PlusIcon size={14} />}
      Reference
    </button>
  );
}

/**
 * Deleting the shot (T3.20, D-112): a tap asks, a second deletes. The shot gets its tombstone
 * (D-019): History stops listing it and the page goes back to History; its recording stays, and
 * exports carry it, marked deleted. A shot that was the reference stops being it.
 */
function DeleteShot({
  entry,
  services,
  route,
}: {
  entry: HistoryEntry;
  services: AppServices;
  route: Route;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  // The question opens at the page's foot, under the fixed tab bar: brought up above it.
  const question = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const element = question.current;
    if (!asking || element === null) return;
    const bar = document.querySelector('[data-testid="tabbar"]')?.getBoundingClientRect().top;
    const over = element.getBoundingClientRect().bottom + 16 - (bar ?? window.innerHeight);
    if (over > 0) window.scrollBy({ top: over, behavior: 'smooth' });
  }, [asking]);
  const [error, setError] = useState<string | null>(null);
  const remove = async (): Promise<void> => {
    setBusy(true);
    try {
      await services.history.discard(entry.shot.id);
      const preferences = services.brew.preferences;
      if (preferences.value.referenceShotId === entry.shot.id) preferences.setReference(null);
      location.replace(pageHash('history', route.mock));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setBusy(false);
    }
  };
  if (!asking) {
    return (
      <button
        type="button"
        class="btn2 wide delete-shot"
        onClick={() => setAsking(true)}
        data-testid="delete-shot"
      >
        Delete shot
      </button>
    );
  }
  return (
    <section
      ref={question}
      class="card delete-confirm"
      aria-labelledby="d-delete"
      data-testid="delete-confirm"
    >
      <p id="d-delete">
        Delete this shot? History won't list it any more. Its recording is kept, and exports still
        carry it, marked deleted.
      </p>
      <div class="delete-actions">
        <button
          type="button"
          class="btn2 delete-yes"
          disabled={busy}
          onClick={() => void remove()}
          data-testid="delete-yes"
        >
          Delete
        </button>
        <button type="button" class="btn2" disabled={busy} onClick={() => setAsking(false)}>
          Cancel
        </button>
      </div>
      {error !== null && (
        <p class="c-warn" role="alert">
          Not deleted: {error}
        </p>
      )}
    </section>
  );
}
