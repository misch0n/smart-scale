// Two shots compared (board History-Compare): A and B, their curves overlaid and aligned at pump
// on or at the first drip (a toggle), and the "A Δ B" table: the grind setting, the doses, every
// metric, the drink and the taste. Nothing of the context they share (D-056).

import { useState } from 'preact/hooks';
import type { HistoryEntry } from '../../app/history';
import type { AppServices } from '../../app/startup';
import { timeOfDay } from '../brew/format';
import { pageHash, type Route } from '../route';
import { HistoryChart, LegendLine } from './HistoryChart';
import { useHistoryLoad, PickMark, Taste } from './parts';
import { overlayPlot, ZERO_LABELS, type Zero } from './plot';
import { dayLabel, drinkOf } from './rows';
import { compareTable } from './tables';
import './history.css';

export function CompareScreen({ services, route }: { services: AppServices; route: Route }) {
  const [idA, idB] = route.shotIds;
  const loaded = useHistoryLoad(
    services,
    () => Promise.all([services.history.entry(idA), services.history.entry(idB)]),
    [idA, idB],
    { shots: false },
  );
  const [wanted, setWanted] = useState<Zero>('firstDrip');

  return (
    <main class="history" data-testid="compare">
      <a class="back" href={pageHash('history', route.mock)}>
        ‹ History
      </a>
      <h1 class="ttl">Compare</h1>
      {loaded.state === 'loading' && <p class="muted">Reading the shots…</p>}
      {loaded.state === 'failed' && (
        <div class="card notice warn" role="alert">
          The shots couldn't be read: {loaded.message}
        </div>
      )}
      {loaded.state === 'ready' &&
        (loaded.value[0] === null || loaded.value[1] === null ? (
          <div class="card notice warn" role="alert" data-testid="compare-missing">
            One of the two shots isn't here. It may be on another device.
          </div>
        ) : (
          <Comparison a={loaded.value[0]} b={loaded.value[1]} wanted={wanted} onAlign={setWanted} />
        ))}
    </main>
  );
}

function Comparison({
  a,
  b,
  wanted,
  onAlign,
}: {
  a: HistoryEntry;
  b: HistoryEntry;
  wanted: Zero;
  onAlign: (zero: Zero) => void;
}) {
  const plot = overlayPlot(a.segment, b.segment, wanted);
  const table = compareTable(a, b);
  const missing = (
    [
      ['A', a],
      ['B', b],
    ] as const
  ).flatMap(([name, entry]) => (entry.segment === null ? [name] : []));

  return (
    <>
      <div class="compare-cards">
        <ShotCard entry={a} which="A" />
        <ShotCard entry={b} which="B" />
      </div>

      <section
        class="card chart-card"
        aria-label="Overlay"
        data-testid="overlay"
        data-zero={plot.zero}
      >
        <div class="align">
          <span class="lbl">Align at</span>
          <div class="seg" role="group" aria-label="Align shots at">
            {(['pumpOn', 'firstDrip'] as const).map((zero) => (
              <button
                key={zero}
                type="button"
                class={plot.zero === zero ? 'on' : undefined}
                aria-pressed={plot.zero === zero}
                disabled={!plot.available.includes(zero)}
                onClick={() => onAlign(zero)}
              >
                {zero === 'pumpOn' ? 'Pump on' : 'First drip'}
              </button>
            ))}
          </div>
        </div>
        {missing.length > 0 ? (
          <p class="muted compare-note">
            {missing.join(' and ')} {missing.length === 1 ? 'has' : 'have'} no curve: the analysis
            found no shot where {missing.length === 1 ? 'it was' : 'they were'} recorded.
          </p>
        ) : (
          plot.zero !== wanted && (
            <p class="muted compare-note">
              {[a, b].some((entry) => entry.segment?.markers.pumpOn == null)
                ? 'Without a Tare + start tap there is no pump on: aligned at the first drip.'
                : 'No first drip on one of them: aligned at pump on.'}
            </p>
          )
        )}
        <HistoryChart
          variant="overlay"
          scale={plot.scale}
          zero={plot.zero}
          series={[
            { points: plot.series[1], line: 'b' },
            { points: plot.series[0], line: 'a' },
          ]}
          marks={[{ tS: 0, label: ZERO_LABELS[plot.zero] }]}
          label={`Weight and flow of shots A and B, aligned at ${ZERO_LABELS[plot.zero]}`}
        />
        <div class="legend muted">
          <span>
            <LegendLine dashed={false} colour="var(--sub)" />
            weight
          </span>
          <span>
            <LegendLine dashed colour="var(--sub)" />
            flow
          </span>
          <span class="legend-note">seconds from {ZERO_LABELS[plot.zero]}</span>
        </div>
      </section>

      <section class="card ctable" aria-label="A, difference, B" data-testid="compare-table">
        <div class="ctable-head">
          <span class="muted">Δ = A − B</span>
          <span class="lbl ctable-side">
            <span class="dot" style={{ background: 'var(--line-a)' }} />A
          </span>
          <span class="lbl ctable-delta">Δ</span>
          <span class="lbl ctable-side">
            <span class="dot" style={{ background: 'var(--line-b)' }} />B
          </span>
        </div>
        {table.rows.map((row) => (
          <div key={row.id} class="row ctable-row" data-testid={`compare-${row.id}`}>
            <span class="ctable-name">
              {row.name}
              {row.unit !== '' && <span class="muted ctable-unit"> {row.unit}</span>}
            </span>
            <span class="num ctable-side">{row.a ?? '–'}</span>
            <span class="num ctable-delta">{row.delta ?? '—'}</span>
            <span class="num ctable-side">{row.b ?? '–'}</span>
          </div>
        ))}
        <div class="row ctable-row">
          <span>Drink</span>
          <span class="ctable-side ctable-text">{table.drink.a}</span>
          <span class="muted ctable-delta">—</span>
          <span class="ctable-side ctable-text">{table.drink.b}</span>
        </div>
        <div class="row ctable-row">
          <span>Taste</span>
          <span class="ctable-side">
            <Taste direction={table.taste.a} />
          </span>
          <span class="muted ctable-delta">—</span>
          <span class="ctable-side">
            <Taste direction={table.taste.b} />
          </span>
        </div>
      </section>
    </>
  );
}

function ShotCard({ entry, which }: { entry: HistoryEntry; which: 'A' | 'B' }) {
  return (
    <div class="card compare-card" data-testid={`compare-card-${which}`}>
      <span class="compare-when muted">
        <PickMark which={which} />
        {dayLabel(entry.atEpochMs)} · <span class="num">{timeOfDay(entry.atEpochMs)}</span>
      </span>
      <span class="compare-drink">{drinkOf(entry)}</span>
      <Taste direction={entry.shot.direction} />
    </div>
  );
}
