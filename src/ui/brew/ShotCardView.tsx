// The shot card (board Brew-Finish), the hub after the extraction (D-052): the phases (T2.5:
// the beans, the grind, the extraction and the milk, each as the analysis weighed it, or
// skipped; the milk waiting for the jug), the results from the analysis with a small chart, the
// grades (taste, channelling, tags) and Save. Nothing is required, and no context shows: it is
// recorded, not shown (D-056).

import type { BrewFlow, ShotCard } from '../../app/brew-flow';
import type { BrewPreferences } from '../../app/brew-settings';
import type { PhaseState } from '../../core/model';
import { CheckIcon } from '../icons';
import { shotRatio, signedTenths, tenths, timeOfDay } from './format';
import { Grades } from './Grades';
import { chartPoints, sinceTap } from './LiveView';
import { ShotChart } from './ShotChart';

/** Past the target by more than this, g, the difference shows as a warning (Brew-Finish). */
const TARGET_WARNING_G = 1;

/** Beans within this of the basket's size are on target: the tick (Brew-Finish), g. */
const BEANS_TICK_G = 0.5;

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
  const phases = result?.phases ?? null;
  // The dose the analysis gives (the grounds, else the beans, else the basket), else the live
  // target's until the first analysis.
  const dose = result?.dose ?? null;
  const targetG =
    dose !== null && shot.targetRatio !== null ? dose.g * shot.targetRatio : display.targetG;
  const beansG = phases?.beansG ?? null;
  const groundG = phases?.groundG ?? null;
  const basketG = shot.basketSizeG;
  const yieldG = metrics?.yieldG ?? null;
  const milkTargetG = yieldG === null || shot.milkRatio === null ? null : yieldG * shot.milkRatio;

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
          {shot.beansPhase !== null && (
            <PhaseRow
              id="beans"
              label="Beans"
              state={shot.beansPhase}
              valueG={beansG}
              analysing={card.analysing}
            >
              {basketG !== null && (
                <>
                  {' '}
                  <span class="muted">of</span> <span class="num">{tenths(basketG)}</span>
                  {beansG !== null && Math.abs(beansG - basketG) <= BEANS_TICK_G && (
                    <span class="c-ok phase-tick">
                      <CheckIcon size={16} strokeWidth={2.5} />
                    </span>
                  )}
                </>
              )}
            </PhaseRow>
          )}
          {shot.grindPhase !== null && (
            <PhaseRow
              id="grind"
              label="Grind"
              state={shot.grindPhase}
              valueG={groundG}
              analysing={card.analysing}
            >
              {beansG !== null && groundG !== null && (
                <span class="muted">
                  {' · retention '}
                  <span class="num" style={{ color: 'var(--ink)' }}>
                    {tenths(beansG - groundG)}
                  </span>{' '}
                  g
                </span>
              )}
            </PhaseRow>
          )}
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
          {shot.milkRatio !== null &&
            (shot.milkPhase === null ? (
              <div class="row phase-row" data-testid="milk-row" data-state="pending">
                <span class="lbl">Milk</span>
                <span>
                  <span class="milk-pending">Put the jug down to add the milk</span>
                  <span>
                    <span class="muted">or</span>{' '}
                    <button
                      type="button"
                      class="link-button"
                      onClick={() => flow.endMilk('skipped')}
                      data-testid="milk-skip"
                    >
                      Skip
                    </button>
                  </span>
                </span>
              </div>
            ) : (
              <PhaseRow
                id="milk"
                label="Milk"
                state={shot.milkPhase}
                valueG={phases?.milkG ?? null}
                analysing={card.analysing}
                whole
              >
                {milkTargetG !== null && (
                  <>
                    {' '}
                    <span class="muted">of</span> <span class="num">{Math.round(milkTargetG)}</span>
                  </>
                )}
              </PhaseRow>
            ))}
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

      <Grades
        shot={shot}
        actions={flow}
        tags={preferences.value.tags}
        variant="card"
        onAddTag={(text) => flow.addTag(text)}
      />

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

/**
 * A phase's row on the card: what the analysis weighed, then what follows it (`of 17.0`, the
 * retention), or Skipped. Until the analysis has it: reading, or not measured.
 */
function PhaseRow({
  id,
  label,
  state,
  valueG,
  analysing,
  whole = false,
  children,
}: {
  id: 'beans' | 'grind' | 'milk';
  label: string;
  state: PhaseState;
  valueG: number | null;
  analysing: boolean;
  /** Whole grams, as the milk shows. */
  whole?: boolean;
  children?: preact.ComponentChildren;
}) {
  return (
    <div class="row phase-row" data-testid={`${id}-row`} data-state={state}>
      <span class="lbl">{label}</span>
      <span>
        {state === 'skipped' ? (
          <span class="muted">Skipped</span>
        ) : valueG === null ? (
          <span class="muted">{analysing ? 'Reading…' : 'Not measured'}</span>
        ) : (
          <span>
            <span class="num" data-testid={`${id}-value`}>
              {whole ? Math.round(valueG) : tenths(valueG)}
            </span>
            <span class="unit"> g</span>
            {children}
          </span>
        )}
      </span>
    </div>
  );
}
