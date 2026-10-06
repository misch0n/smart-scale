// The history's filter (T3.3, D-085; no board draws it, Q29): a panel of chips, a group per
// thing a shot recorded (the coffee, its days off roast, the grinder and since its last care,
// the tags, the taste), each offering only what some shot has, with its count. Closed, a line
// says what is filtered and how many shots are left, with Clear. Built from the boards' chips
// and cards; T3.5's design pass revisits it.

import type { Id } from '../../core/model';
import { dateLabel, todayDate } from '../setup/format';
import {
  filterSummary,
  isFiltered,
  NO_FILTER,
  type FilterOption,
  type FilterOptions,
  type HistoryFilter,
} from './filters';

export function FilterPanel({
  filter,
  options,
  careDates,
  onChange,
  onClose,
}: {
  filter: HistoryFilter;
  options: FilterOptions;
  /** Each grinder's last care now, for "Since care". */
  careDates: ReadonlyMap<Id, string | null>;
  onChange: (filter: HistoryFilter) => void;
  onClose: () => void;
}) {
  const set = (changes: Partial<HistoryFilter>) => onChange({ ...filter, ...changes });
  const careDate = filter.grinder === null ? null : (careDates.get(filter.grinder) ?? null);
  return (
    <section class="card filters" aria-label="Filter" data-testid="filters">
      <FilterGroup
        label="Coffee"
        options={options.packs}
        on={(id) => filter.pack === id}
        onPick={(id) => set({ pack: filter.pack === id ? null : id })}
      />
      <FilterGroup
        label="Days off roast"
        options={options.roast}
        on={(id) => filter.roast === id}
        onPick={(id) => set({ roast: filter.roast === id ? null : id })}
      />
      <FilterGroup
        label="Grinder"
        options={options.grinders}
        on={(id) => filter.grinder === id}
        onPick={(id) =>
          set(
            filter.grinder === id
              ? { grinder: null, sinceCare: false }
              : { grinder: id, sinceCare: false },
          )
        }
      >
        {careDate !== null && (
          <button
            type="button"
            class={filter.sinceCare ? 'chip on' : 'chip'}
            aria-pressed={filter.sinceCare}
            onClick={() => set({ sinceCare: !filter.sinceCare })}
            data-testid="since-care"
          >
            Since care {dateLabel(careDate, todayDate())}
          </button>
        )}
      </FilterGroup>
      <FilterGroup
        label="Tags"
        options={options.tags}
        on={(id) => filter.tags.some((tag) => tag.toLocaleLowerCase() === id)}
        onPick={(id) => {
          const on = filter.tags.some((tag) => tag.toLocaleLowerCase() === id);
          set({
            tags: on
              ? filter.tags.filter((tag) => tag.toLocaleLowerCase() !== id)
              : [...filter.tags, id],
          });
        }}
      />
      <FilterGroup
        label="Taste"
        options={options.tastes}
        on={(id) => filter.taste === id}
        onPick={(id) => set({ taste: filter.taste === id ? null : id })}
      />
      <div class="filters-actions">
        <button
          type="button"
          class="btn2"
          disabled={!isFiltered(filter)}
          onClick={() => onChange(NO_FILTER)}
        >
          Clear
        </button>
        <button type="button" class="btn2" onClick={onClose} data-testid="filters-done">
          Done
        </button>
      </div>
    </section>
  );
}

function FilterGroup<K>({
  label,
  options,
  on,
  onPick,
  children,
}: {
  label: string;
  options: readonly FilterOption<K>[];
  on: (id: K) => boolean;
  onPick: (id: K) => void;
  children?: preact.ComponentChildren;
}) {
  if (options.length === 0) return null;
  return (
    <div class="filter-group">
      <span class="lbl">{label}</span>
      <div class="filter-chips" role="group" aria-label={label}>
        {options.map((option) => {
          const pressed = on(option.id);
          return (
            <button
              key={String(option.id)}
              type="button"
              class={pressed ? 'chip on' : 'chip'}
              aria-pressed={pressed}
              onClick={() => onPick(option.id)}
            >
              <span class="filter-chip-name">{option.label}</span>
              <span class="num filter-count">{option.count}</span>
            </button>
          );
        })}
        {children}
      </div>
    </div>
  );
}

/** What the closed filter keeps: `Ethiopia Guji · WDT`, `3 of 24 shots`, and Clear. */
export function FilterLine({
  filter,
  options,
  kept,
  total,
  onOpen,
  onClear,
}: {
  filter: HistoryFilter;
  options: FilterOptions;
  kept: number;
  total: number;
  onOpen: () => void;
  onClear: () => void;
}) {
  const summary = filterSummary(filter, options);
  if (summary === null) return null;
  return (
    <div class="card filter-line" data-testid="filter-line">
      <button type="button" class="filter-line-text" onClick={onOpen}>
        <span class="filter-line-summary">{summary}</span>
        <span class="muted">
          <span class="num">{kept}</span> of <span class="num">{total}</span>{' '}
          {total === 1 ? 'shot' : 'shots'}
        </span>
      </button>
      <button type="button" class="link filter-clear" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
