// The history (board History; spec v2 "App structure and look"): one row per shot, newest
// first, with its day and time, a small graph, the taste and the drink. A row opens the shot.
// Compare is a mode: pick two shots, A then B, and compare them; its bar sits on the tab bar.
// Filter (T3.3, D-085) narrows the list by what the shots recorded, and a filtered list has its
// trend above it; the filter and the trend's axes last while the app runs, so a shot opened from
// the list comes back to it.

import { useState } from 'preact/hooks';
import type { AppServices } from '../../app/startup';
import { isListed, type Id } from '../../core/model';
import { compareHash, shotHash, type Route } from '../route';
import { TabBar } from '../TabBar';
import { applyFilter, filterOptions, isFiltered, NO_FILTER, type HistoryFilter } from './filters';
import { FilterLine, FilterPanel } from './HistoryFilters';
import { useHistoryLoad, LoadFailures, PickMark, Spark, Taste } from './parts';
import { historySections, pickShot, shotCount, type HistoryRow } from './rows';
import { TrendCard } from './TrendCard';
import type { TrendX, TrendY } from './trends';
import './history.css';

/** The filter and the trend's axes, kept while the app runs. */
let kept: {
  filter: HistoryFilter;
  axes: { readonly x: TrendX; readonly y: TrendY };
} = { filter: NO_FILTER, axes: { x: 'grind', y: 'firstDrip' } };

export function HistoryScreen({ services, route }: { services: AppServices; route: Route }) {
  const loaded = useHistoryLoad(services, () => services.history.load(), [], { shots: true });
  const [picking, setPicking] = useState(route.pick !== null);
  const [picks, setPicks] = useState<Id[]>(route.pick === null ? [] : [route.pick]);
  const [filtering, setFiltering] = useState(false);
  const [filter, setFilterState] = useState(kept.filter);
  const [axes, setAxesState] = useState(kept.axes);
  const setFilter = (next: HistoryFilter) => {
    kept = { ...kept, filter: next };
    setFilterState(next);
  };
  const setAxes = (next: typeof axes) => {
    kept = { ...kept, axes: next };
    setAxesState(next);
  };
  const all = loaded.state === 'ready' ? loaded.value.entries : [];
  const careDates = new Map(
    services.entities.value.grinders.filter(isListed).map((g) => [g.id, g.care.lastDoneDate]),
  );
  const entries = applyFilter(all, filter, careDates);
  const options = filterOptions(all);
  // A pick that is no longer listed (discarded elsewhere) drops out.
  const picked = picks.filter((id) => entries.some((entry) => entry.shot.id === id));
  const sections = historySections(entries, Date.now());

  return (
    <>
      <main class={picking ? 'history picking' : 'history'} data-testid="history">
        <div class="history-top">
          <h1 class="ttl">History</h1>
          <span class="history-actions">
            {!picking && all.length > 0 && (
              <button
                type="button"
                class="btn2"
                aria-expanded={filtering}
                onClick={() => setFiltering(!filtering)}
                data-testid="filter"
              >
                Filter
              </button>
            )}
            <button
              type="button"
              class="btn2"
              onClick={() => {
                setPicking(!picking);
                setPicks([]);
              }}
            >
              {picking ? 'Cancel' : 'Compare'}
            </button>
          </span>
        </div>
        {loaded.state !== 'ready' ? null : filtering && !picking ? (
          <FilterPanel
            filter={filter}
            options={options}
            careDates={careDates}
            onChange={setFilter}
            onClose={() => setFiltering(false)}
          />
        ) : (
          <FilterLine
            filter={filter}
            options={options}
            kept={entries.length}
            total={all.length}
            onOpen={() => setFiltering(true)}
            onClear={() => setFilter(NO_FILTER)}
          />
        )}
        {isFiltered(filter) && !picking && entries.length > 0 && (
          <TrendCard entries={entries} x={axes.x} y={axes.y} onAxes={setAxes} mock={route.mock} />
        )}

        {route.problems.map((problem) => (
          <p key={problem} class="card notice warn">
            {problem}
          </p>
        ))}
        {loaded.state === 'failed' && (
          <div class="card notice warn" role="alert">
            The shots couldn't be read: {loaded.message}
          </div>
        )}
        {loaded.state === 'ready' && <LoadFailures failures={loaded.value.failures} />}
        {loaded.state === 'loading' && <p class="muted">Reading the shots…</p>}
        {loaded.state === 'ready' && all.length === 0 && (
          <p class="muted" data-testid="history-empty">
            No shots yet.
          </p>
        )}
        {loaded.state === 'ready' && all.length > 0 && entries.length === 0 && (
          <p class="muted" data-testid="history-none-kept">
            No shot matches the filter.
          </p>
        )}

        {sections.map((section) => (
          <section key={section.title} class="history-section" aria-label={section.title}>
            <div class="history-section-head">
              <h2 class="lbl">{section.title}</h2>
              <span class="muted">
                <span class="num">{section.rows.length}</span>
                {shotCount(section.rows.length).replace(/^\d+/, '')}
              </span>
            </div>
            <div class="card hrows">
              {section.rows.map((row) =>
                picking ? (
                  <PickRow
                    key={row.id}
                    row={row}
                    which={picked[0] === row.id ? 'A' : picked[1] === row.id ? 'B' : null}
                    onPick={() => setPicks(pickShot(picked, row.id))}
                  />
                ) : (
                  <a
                    key={row.id}
                    class="row hrow"
                    href={shotHash(row.id, route.mock)}
                    data-testid="history-row"
                  >
                    <RowBody row={row} />
                    <span class="chev" aria-hidden="true">
                      ›
                    </span>
                  </a>
                ),
              )}
            </div>
          </section>
        ))}

        {picking && (
          <div class="compare-bar">
            {picked.length === 2 ? (
              <a
                class="btn"
                href={compareHash(picked[0], picked[1], route.mock)}
                data-testid="compare-go"
              >
                Compare 2 shots
                <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </a>
            ) : (
              <div class="compare-wait" role="status">
                Pick two shots
              </div>
            )}
          </div>
        )}
      </main>
      <TabBar current="history" mock={route.mock} />
    </>
  );
}

function PickRow({
  row,
  which,
  onPick,
}: {
  row: HistoryRow;
  which: 'A' | 'B' | null;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      class="row hrow pick"
      aria-pressed={which !== null}
      onClick={onPick}
      data-testid="history-pick"
    >
      <PickMark which={which} />
      <RowBody row={row} />
    </button>
  );
}

function RowBody({ row }: { row: HistoryRow }) {
  return (
    <>
      <Spark spark={row.spark} />
      <span class="hrow-main">
        <span class="hrow-day">{row.day}</span>
        <span class="hrow-sub muted">
          <span class="num">{row.time}</span> · {row.drink}
        </span>
      </span>
      <span class="hrow-end">
        <Taste direction={row.taste} />
        {row.channelled && <span class="badge caution badge-small">Channelled</span>}
        {row.unmatched && <span class="badge badge-small">Not found</span>}
      </span>
    </>
  );
}
