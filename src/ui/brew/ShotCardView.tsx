// The shot card (board Brew-Finish), the hub after the extraction (D-052): the phases (until the
// others exist, T2.5–T2.11, only the extraction), the results from the analysis with a small
// chart, the grades (taste, channelling, tags) and Save. Nothing is required, and no context
// shows: it is recorded, not shown (D-056).

import { useState } from 'preact/hooks';
import type { BrewFlow, ShotCard } from '../../app/brew-flow';
import { sameTag, type BrewPreferences } from '../../app/brew-settings';
import { DIRECTIONS, type Direction } from '../../core/model';
import { shotRatio, signedTenths, tenths, timeOfDay } from './format';
import { PlusIcon } from './icons';
import { chartPoints, sinceTap } from './LiveView';
import { ShotChart } from './ShotChart';

const TASTE_LABELS: Readonly<Record<Direction, string>> = {
  sour: 'Sour',
  balanced: 'Balanced',
  bitter: 'Bitter',
};

/** Past the target by more than this, g, the difference shows as a warning (Brew-Finish). */
const TARGET_WARNING_G = 1;

export function ShotCardView({
  flow,
  card,
  preferences,
}: {
  flow: BrewFlow;
  card: ShotCard;
  preferences: BrewPreferences;
}) {
  const { shot, display, result } = card;
  const segment = result?.segment ?? null;
  const metrics = segment?.metrics ?? null;
  const at =
    card.recordingStartedAtEpochMs === null
      ? shot.createdAtEpochMs
      : card.recordingStartedAtEpochMs + shot.anchorTMs;
  const targetG =
    shot.doseG === null || shot.targetRatio === null ? null : shot.doseG * shot.targetRatio;

  return (
    <>
      <h1 class="ttl" data-testid="card-title">
        Shot{' '}
        <span class="muted" style={{ fontWeight: 400 }}>
          · {timeOfDay(at)} ·
        </span>{' '}
        {shot.recipeName ?? 'Espresso'}
      </h1>

      {card.refusedFrames && (
        <div class="card notice caution" data-testid="refused-frames">
          Some weights were refused (an unknown unit or sign), so the results may miss them.
        </div>
      )}
      {card.analysisError !== null && (
        <div class="card notice warn" role="alert">
          The shot couldn't be read: {card.analysisError}
        </div>
      )}

      <section class="section" aria-labelledby="f-phases">
        <h2 class="lbl" id="f-phases">
          Phases
        </h2>
        <div class="card">
          <div class="row phase-row" data-testid="extraction-row">
            <span class="lbl">Extraction</span>
            <span>
              {metrics === null ? (
                <span class="muted">
                  {card.analysing ? 'Reading the shot…' : 'Not found in the recording'}
                </span>
              ) : (
                <span>
                  <Grams g={metrics.yieldG} /> <span class="muted">in</span>{' '}
                  <Seconds s={metrics.extractionS} />
                  {result?.match.ratio != null && (
                    <>
                      {' '}
                      <span class="muted">·</span>{' '}
                      <span class="num">{shotRatio(result.match.ratio)}</span>
                    </>
                  )}
                </span>
              )}
              {targetG !== null && (
                <span class="muted phase-sub">
                  target <span class="num">{tenths(targetG)}</span>
                  {metrics?.yieldG != null && (
                    <>
                      {' · '}
                      <span
                        class={metrics.yieldG - targetG > TARGET_WARNING_G ? 'num c-warn' : 'num'}
                      >
                        {signedTenths(metrics.yieldG - targetG)}
                      </span>
                    </>
                  )}
                </span>
              )}
            </span>
          </div>
        </div>
      </section>

      <section class="section" aria-labelledby="f-results">
        <h2 class="lbl" id="f-results">
          Results
        </h2>
        <div class="card results">
          <div class="metrics">
            <Metric
              label="First drip"
              value={metrics?.firstDripS}
              digits={1}
              unit="s"
              id="first-drip"
            />
            <Metric
              label="Extraction"
              value={metrics?.extractionS}
              digits={1}
              unit="s"
              id="extraction"
            />
            <Metric
              label="Avg flow"
              value={metrics?.averageFlowGps}
              digits={2}
              unit="g/s"
              id="flow"
            />
          </div>
          <ShotChart
            variant="small"
            points={chartPoints(display)}
            targetG={null}
            firstDripS={sinceTap(display, display.firstDripMs)}
            pumpOffS={sinceTap(display, display.pumpOffMs)}
          />
        </div>
      </section>

      <Grades flow={flow} card={card} preferences={preferences} />

      <div class="save">
        {card.storeError !== null && (
          <div class="card notice warn" role="alert" data-testid="store-error">
            Not stored yet: {card.storeError}
          </div>
        )}
        <button type="button" class="btn" onClick={() => void flow.save()} data-testid="save">
          Save shot
        </button>
        <p class="muted">Nothing here is required; an ungraded shot is kept.</p>
      </div>
    </>
  );
}

function Grades({
  flow,
  card,
  preferences,
}: {
  flow: BrewFlow;
  card: ShotCard;
  preferences: BrewPreferences;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const { shot } = card;
  const tags = shot.tags ?? [];
  // The list's tags, then any of the shot's that the list lacks.
  const names = [
    ...preferences.value.tags.map((tag) => tag.name),
    ...tags.filter((tag) => !preferences.value.tags.some((t) => sameTag(t.name, tag))),
  ];
  const channelled = shot.channelled === true;

  return (
    <section class="section" aria-labelledby="f-grades">
      <h2 class="lbl" id="f-grades">
        Grades
      </h2>
      <div class="card">
        <div class="grade">
          <span class="lbl" id="f-taste">
            Taste
          </span>
          <div role="group" aria-labelledby="f-taste" class="tastes">
            {DIRECTIONS.map((direction) => {
              const on = shot.direction === direction;
              return (
                <button
                  key={direction}
                  type="button"
                  class={`dirbtn d-${direction}${on ? ' on' : ''}`}
                  aria-pressed={on}
                  onClick={() => flow.setTaste(on ? null : direction)}
                >
                  <span class={`dot bg-${direction}`} />
                  {TASTE_LABELS[direction]}
                </button>
              );
            })}
          </div>
        </div>
        <div class="grade-switch">
          <span>
            <span>Channelling</span>
            <span class="muted">Channels or spurts</span>
          </span>
          <button
            type="button"
            class={channelled ? 'toggle on' : 'toggle'}
            aria-pressed={channelled}
            aria-label="Channelling"
            onClick={() => flow.setChannelled(!channelled)}
          />
        </div>
        <div class="grade">
          <span class="lbl" id="f-tags">
            Tags
          </span>
          <div role="group" aria-labelledby="f-tags" class="tags">
            {names.map((name) => {
              const on = tags.some((tag) => sameTag(tag, name));
              return (
                <button
                  key={name}
                  type="button"
                  class={on ? 'chip on' : 'chip'}
                  aria-pressed={on}
                  onClick={() => flow.toggleTag(name)}
                >
                  {name}
                </button>
              );
            })}
            {adding ? (
              <form
                class="tag-add"
                onSubmit={(event) => {
                  event.preventDefault();
                  flow.addTag(text);
                  setText('');
                  setAdding(false);
                }}
              >
                <input
                  class="input"
                  type="text"
                  value={text}
                  placeholder="New tag"
                  aria-label="New tag"
                  maxLength={40}
                  autoFocus
                  onInput={(event) => setText(event.currentTarget.value)}
                />
                <button type="submit" class="btn2" disabled={text.trim() === ''}>
                  Add
                </button>
              </form>
            ) : (
              <button type="button" class="chip add" onClick={() => setAdding(true)}>
                <PlusIcon size={14} />
                Add
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  digits,
  unit,
  id,
}: {
  label: string;
  value: number | null | undefined;
  digits: number;
  unit: string;
  id: string;
}) {
  return (
    <span class="metric">
      <span class="lbl">{label}</span>
      <span>
        <span class="num" data-testid={`result-${id}`}>
          {value == null ? '–' : value.toFixed(digits)}
        </span>
        <span class="unit"> {unit}</span>
      </span>
    </span>
  );
}

function Grams({ g }: { g: number | null }) {
  return (
    <>
      <span class="num">{g === null ? '–' : tenths(g)}</span> <span class="unit">g</span>
    </>
  );
}

function Seconds({ s }: { s: number | null }) {
  return (
    <>
      <span class="num">{s === null ? '–' : s.toFixed(1)}</span> <span class="unit">s</span>
    </>
  );
}
