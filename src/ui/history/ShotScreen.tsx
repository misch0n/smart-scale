// A shot (board History-Detail): the large chart with pump on, the first drip, pump off and the
// target; every metric; the phases against their targets; the grades, saved as they change; and
// beside the title "Reference", whose curve the next shots' charts draw (T3.7, T3.8; Compare
// went, T3.6). The context the shot recorded stays internal (D-056): only `?debug` shows it.

import { useEffect, useState } from 'preact/hooks';
import type { HistoryEntry } from '../../app/history';
import type { ShotEditor } from '../../app/shot-editor';
import type { AppServices } from '../../app/startup';
import { timeOfDay } from '../brew/format';
import { Grades } from '../brew/Grades';
import { pageHash, type Route } from '../route';
import { CheckIcon, PlusIcon } from '../icons';
import { TabBar } from '../TabBar';
import { useLiveUpdates } from '../use-live-updates';
import { HistoryChart, LegendLine } from './HistoryChart';
import { useHistoryLoad } from './parts';
import { referenceCurve, shotPlot, ZERO_LABELS, type ChartMark } from './plot';
import { dayLabel, drinkOf, targetOf } from './rows';
import { grinderLabel, metricTiles, phaseRows, type MetricTile } from './tables';
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
  const marks: ChartMark[] =
    plot === null
      ? []
      : [
          { tS: plot.markers.pumpOnS, label: ZERO_LABELS.pumpOn },
          { tS: plot.markers.firstDripS, label: ZERO_LABELS.firstDrip },
          { tS: plot.markers.pumpOffS, label: 'pump off' },
        ].flatMap((mark) => (mark.tS === null ? [] : [{ tS: mark.tS, label: mark.label }]));
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

      {plot !== null && (
        <section class="card chart-card" aria-labelledby="d-chart">
          <div class="chart-card-head">
            <h2 class="lbl" id="d-chart">
              Extraction
            </h2>
            <span class="legend muted">
              <span>
                <LegendLine dashed={false} colour="var(--line-a)" />
                weight g
              </span>
              <span>
                <LegendLine dashed colour="var(--sub)" />
                flow g/s
              </span>
            </span>
          </div>
          <HistoryChart
            scale={plot.scale}
            zero={plot.zero}
            series={[{ points: plot.points }]}
            marks={marks}
            targetG={targetG}
            label={chartLabel(entry, plot.zero)}
          />
        </section>
      )}

      <section class="card tiles2" aria-label="Metrics" data-testid="metrics">
        {metricTiles(shown).map((tile) => (
          <Tile key={tile.id} tile={tile} />
        ))}
      </section>

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

function Tile({ tile }: { tile: MetricTile }) {
  return (
    <div class="tile2">
      <span class="lbl">{tile.label}</span>
      <span class="tile2-value">
        <span class="num" data-testid={`metric-${tile.id}`}>
          {tile.value ?? '–'}
        </span>
        {tile.unit !== '' && <span class="unit"> {tile.unit}</span>}
      </span>
      {tile.note !== null && (
        <span class="muted tile2-note">
          {tile.note.text}
          {tile.note.delta !== null && (
            <>
              {' · '}
              <span class={tile.note.delta.warn ? 'num c-warn' : 'num'}>
                {tile.note.delta.text}
              </span>
            </>
          )}
        </span>
      )}
    </div>
  );
}

/** What the chart shows, said in words. */
function chartLabel(entry: HistoryEntry, zero: 'pumpOn' | 'firstDrip'): string {
  const metrics = entry.segment?.metrics;
  const parts = [`Weight and flow from ${ZERO_LABELS[zero]}`];
  if (metrics?.firstDripS != null) parts.push(`first drip at ${metrics.firstDripS.toFixed(1)} s`);
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
