// The shot card (board Brew-Finish), the hub after the extraction (D-052): the phases (until the
// others exist, T2.5–T2.11, only the extraction), the results from the analysis with a small
// chart, the grades (taste, channelling, tags) and Save. Nothing is required, and no context
// shows: it is recorded, not shown (D-056).

import type { BrewFlow, ShotCard } from '../../app/brew-flow';
import type { BrewPreferences } from '../../app/brew-settings';
import { shotRatio, signedTenths, tenths, timeOfDay } from './format';
import { Grades } from './Grades';
import { chartPoints, sinceTap } from './LiveView';
import { ShotChart } from './ShotChart';

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
