// The brew's phases on screen (T2.5; boards Brew-Beans, Brew-Grind, Brew-Ready, Brew-Shot and
// Brew-Milk): the phase stepper, the vessel on the scale, and the beans, grind and milk views,
// each with the live weight against its target. Display-only (hard rule 3): the figures are the
// live phases' (`flow.phases`); the shot card shows the analysis's. Each phase has its equipment
// in place: the machine, basket and pack (T2.6), the grinder and its setting (T2.7), the milk
// ratio (T2.11). The beans and the grind have the taste nudge after a sour or bitter shot (T2.12).

import type { BrewFlow, ShotCard } from '../../app/brew-flow';
import type { BrewPreferences } from '../../app/brew-settings';
import type { Entities } from '../../app/entities';
import type { HistoryEntry } from '../../app/history';
import type { VesselOnScale } from '../../app/live-vessel';
import { pourProgress, type PhaseRouterState } from '../../core/live';
import { BREW_PHASES, type BrewPhase, type Container } from '../../core/model';
import { CheckIcon, PutDownIcon, WarningIcon } from '../icons';
import type { AppServices } from '../../app/startup';
import { useHistoryLoad } from '../history/parts';
import { BeansEquipment, GrindEquipment, MilkEquipment } from './equipment';
import { readout, recentRetentions, tenths } from './format';
import { TasteNudgeCard } from './nudge';

const PHASE_LABEL: Readonly<Record<BrewPhase, string>> = {
  beans: 'Beans',
  grind: 'Grind',
  extraction: 'Extraction',
  milk: 'Milk',
};

/** Past a pour's target by more than this, the readout warns, g (spec v2 "Live display"). */
const OVER_MARGIN_G = 1;

/**
 * The phase stepper (every brew board): a tab per phase, the open one underlined, the done ones
 * ticked. A tap opens a phase; the milk is for a recipe with a milk ratio. Not during the shot.
 */
export function PhaseStepper({
  phases,
  onSelect,
}: {
  phases: PhaseRouterState;
  onSelect: (phase: BrewPhase) => void;
}) {
  return (
    <nav class="phase-stepper" aria-label="Brew phases" data-testid="phase-stepper">
      {BREW_PHASES.map((phase) => {
        const status = phases.status[phase];
        const current = phase === phases.current;
        const offered = phase !== 'milk' || phases.milkOffered;
        return (
          <button
            key={phase}
            type="button"
            class={current ? 'phase-tab on' : 'phase-tab'}
            aria-current={current ? 'step' : undefined}
            aria-label={
              status === 'done'
                ? `${PHASE_LABEL[phase]}, done`
                : status === 'skipped'
                  ? `${PHASE_LABEL[phase]}, skipped`
                  : undefined
            }
            disabled={!offered || phases.pouring}
            onClick={() => onSelect(phase)}
            data-testid={`step-${phase}`}
            data-status={status}
          >
            <span class="lbl phase-tab-label">
              {status === 'done' && <CheckIcon size={14} strokeWidth={2.5} />}
              {PHASE_LABEL[phase]}
            </span>
            {phase === 'milk' && <span class="phase-tab-note">for milk drinks</span>}
          </button>
        );
      })}
    </nav>
  );
}

/**
 * The vessel on the scale (every brew board): the container and what it weighed, recognised, or
 * picked; which of two it is; or what to put down. `container` is the phase's, when it knows the
 * vessel better than the match: the bean cup back with its grounds.
 */
export function VesselCard({
  onScale,
  container,
  prompt,
  note,
  onPick,
  connect = null,
}: {
  onScale: VesselOnScale | null;
  container: Container | null;
  /** What to put down when nothing is on: `Put the cup on the scale`. */
  prompt: string;
  /** Under it, once recognised: how. */
  note?: string | null;
  onPick: (id: string) => void;
  /** While the scale isn't connected: its card instead (`ConnectCard`). */
  connect?: preact.ComponentChildren;
}) {
  if (connect !== null && connect !== undefined && connect !== false) return <>{connect}</>;
  if (onScale === null) {
    return (
      <div class="card vessel" data-testid="vessel" data-state="none">
        <span class="muted vessel-prompt">
          <PutDownIcon size={18} />
          {prompt}
        </span>
      </div>
    );
  }
  const known = onScale.container ?? container;
  const mass = (
    <span class="muted">
      {' · '}
      <span class="num">{tenths(onScale.vessel.massG)}</span> g
    </span>
  );
  if (known !== null) {
    return (
      <div class="card" data-testid="vessel" data-state="known">
        <div class="vessel">
          <span>
            <span class="vessel-name" data-testid="vessel-name">
              {known.name}
            </span>
            {mass}
          </span>
          <span class="badge" style={{ gap: '5px' }}>
            <CheckIcon size={12} strokeWidth={3} />
            {onScale.picked !== null ? 'picked' : 'recognised'}
          </span>
        </div>
        {note != null && <p class="muted vessel-note">{note}</p>}
        {onScale.container !== null && onScale.near.length > 0 && (
          <div class="vessel-near" data-testid="vessel-near">
            <span class="c-caution vessel-near-text">
              <WarningIcon size={16} />
              <span>
                Close to {onScale.near[0].name} (
                <span class="num">{tenths(onScale.near[0].emptyMassG)}</span> g)
              </span>
            </span>
            <button
              type="button"
              class="link vessel-near-pick"
              onClick={() => onPick(onScale.near[0].id)}
              data-testid="not-this"
            >
              Not the {onScale.container.roles.includes('milk') ? 'jug' : 'cup'}?
            </button>
          </div>
        )}
      </div>
    );
  }
  if (onScale.match.kind === 'ambiguous') {
    return (
      <div class="card vessel-pick" data-testid="vessel" data-state="ambiguous">
        <span>
          <span class="vessel-name">Which container?</span>
          {mass}
        </span>
        <span class="vessel-picks" role="group" aria-label="Which container is it?">
          {onScale.match.candidates.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              class="chip"
              onClick={() => onPick(candidate.id)}
            >
              {candidate.name}
            </button>
          ))}
        </span>
      </div>
    );
  }
  return (
    <div class="card vessel" data-testid="vessel" data-state="unknown">
      <span>
        <span class="vessel-name">On the scale</span>
        {mass}
      </span>
      <span class="badge">not a known container</span>
    </div>
  );
}

/**
 * A pour's live weight against its target (boards Brew-Beans and Brew-Milk): the big figure,
 * the bar and what is left, "Target reached" once there, the warning past the margin.
 */
function PourReadout({
  label,
  valueG,
  targetG,
  testId,
  whole = false,
  note,
}: {
  label: string;
  valueG: number | null;
  targetG: number | null;
  testId: string;
  /** In whole grams, as the milk shows (board Brew-Milk). */
  whole?: boolean;
  /** Under the readout, with it: how the target came about. */
  note?: preact.ComponentChildren;
}) {
  const g = valueG ?? 0;
  const progress =
    targetG === null || targetG <= 0 ? null : pourProgress(g, targetG, OVER_MARGIN_G);
  const r = progress === null ? null : readout(progress);
  const grams = whole ? (x: number) => String(Math.round(Math.abs(x))) : tenths;
  // What is left, or over: the readout's, in whole grams for the milk.
  const left = r === null || progress === null ? '' : whole ? grams(progress.remainingG) : r.big;
  return (
    <section
      class={`readout phase-readout ${r?.state ?? ''}`}
      aria-label={`${label} weight`}
      data-state={r?.state ?? 'none'}
    >
      <div class="readout-head">
        <span class="lbl">{label}</span>
        {targetG !== null && (
          <span class="muted">
            target <span class="num">{grams(targetG)}</span> g
          </span>
        )}
      </div>
      <div class="big big-live">
        <span class="num" data-testid={testId}>
          {grams(g)}
        </span>
        <span class="unit">g</span>
      </div>
      {r !== null && (
        <>
          <div class="readout-bar">
            <span
              class="bar"
              role="progressbar"
              aria-label={`${label} towards the target`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={r.barPct}
            >
              <span style={{ width: `${r.barPct}%` }} />
            </span>
            {r.state === 'over' && <span class="over-block bg-warn" />}
            <span class={r.state === 'over' ? 'num c-warn' : 'num muted'}>{r.percent}</span>
          </div>
          <div class="phase-left">
            {r.state === 'pouring' ? (
              <>
                <span class="num">{left}</span> g to go
              </>
            ) : r.state === 'reached' ? (
              <span class="c-ok">Target reached</span>
            ) : (
              <span class="c-warn">
                <WarningIcon size={16} /> <span class="num">{whole ? `+${left}` : left}</span> g
                over target
              </span>
            )}
          </div>
        </>
      )}
      {note}
    </section>
  );
}

/**
 * The beans phase (board Brew-Beans): the bean cup, the machine, basket and pack in place, and
 * the beans against the basket's size.
 */
export function BeansView({
  flow,
  onScale,
  preferences,
  entities,
  onPick,
  connect,
  nudge,
}: {
  flow: BrewFlow;
  onScale: VesselOnScale | null;
  preferences: BrewPreferences;
  entities: Entities;
  onPick: (id: string) => void;
  connect: preact.ComponentChildren;
  /** The taste nudge (T2.12), under the beans. */
  nudge: preact.ComponentChildren;
}) {
  const phases = flow.phases;
  return (
    <>
      <VesselCard
        onScale={onScale}
        container={phases.container}
        prompt="Put the bean cup on the scale"
        onPick={onPick}
        connect={connect}
      />
      <BeansEquipment preferences={preferences} entities={entities} />
      <PourReadout
        label="Beans"
        valueG={phases.beansG}
        targetG={preferences.value.basket?.sizeG ?? null}
        testId="beans"
      />
      {nudge}
      <p class="muted phase-hint">↑ Lift to pour some back: the phase stays open.</p>
    </>
  );
}

/**
 * The grind phase (board Brew-Grind): the cup back with its grounds, the ground dose from the
 * beans, and the retention, the difference of two readings, in tenths (D-037).
 */
export function GrindView({
  flow,
  onScale,
  services,
  onPick,
  connect,
}: {
  flow: BrewFlow;
  onScale: VesselOnScale | null;
  services: AppServices;
  onPick: (id: string) => void;
  connect: preact.ComponentChildren;
}) {
  const preferences = services.brew.preferences;
  const { groundG, container } = flow.phases;
  // Beans weighed: none when the beans phase was skipped or held nothing.
  const beansG = (flow.phases.beansG ?? 0) > 0 ? flow.phases.beansG : null;
  const carriedBack = onScale !== null && onScale.container === null && container !== null;
  const retention = groundG === null || beansG === null ? null : beansG - groundG;
  // The shots, for the grinder's last retentions and the taste nudge.
  const loaded = useHistoryLoad(services, () => services.history.load(), [], { shots: true });
  const entries = loaded.state === 'ready' ? loaded.value.entries : null;
  return (
    <>
      <VesselCard
        onScale={onScale}
        container={container}
        prompt="Put the cup with the grounds on the scale"
        note={
          carriedBack ? "Recognised: the cup came back at the beans' weight minus retention." : null
        }
        onPick={onPick}
        connect={connect}
      />
      <GrindEquipment preferences={preferences} entities={services.entities} />
      <section class="readout phase-readout" aria-label="Ground weight">
        <div class="readout-head">
          <span class="lbl">Ground</span>
          {beansG !== null && (
            <span class="muted">
              from <span class="num">{tenths(beansG)}</span> g beans
            </span>
          )}
        </div>
        <div class="big big-live">
          <span class="num" data-testid="ground">
            {tenths(groundG ?? 0)}
          </span>
          <span class="unit">g</span>
        </div>
      </section>
      <RetentionCard
        retention={retention}
        entries={entries}
        grinderId={preferences.value.grinder?.id ?? null}
      />
      <TasteNudgeCard services={services} entries={entries} />
      <p class="muted phase-hint">↓ Put the cup down to start the extraction.</p>
    </>
  );
}

/**
 * The milk phase (board Brew-Milk): the jug (with a warning when another container is within
 * 3 g of it), the milk ratio in place (T2.11), the milk against the espresso's yield × the milk
 * ratio, Skip milk and Done. Done brings back the shot card with its milk row.
 */
export function MilkView({
  flow,
  card,
  onScale,
  preferences,
  onPick,
  connect,
}: {
  flow: BrewFlow;
  card: ShotCard | null;
  onScale: VesselOnScale | null;
  preferences: BrewPreferences;
  onPick: (id: string) => void;
  connect: preact.ComponentChildren;
}) {
  const phases = flow.phases;
  const ratio = card?.shot.milkRatio ?? preferences.value.recipe.milkRatio;
  const yieldG = card?.result?.segment?.metrics.yieldG ?? card?.display.netG ?? null;
  const targetG = yieldG === null || ratio === null ? null : yieldG * ratio;
  return (
    <>
      <VesselCard
        onScale={onScale}
        container={phases.container}
        prompt="Put the milk jug on the scale"
        onPick={onPick}
        connect={connect}
      />
      <MilkEquipment flow={flow} recipeId={card?.shot.recipeId ?? preferences.value.recipe.id} />
      <PourReadout
        label="Milk"
        valueG={phases.milkG}
        targetG={targetG}
        testId="milk"
        whole
        note={
          targetG !== null &&
          yieldG !== null &&
          ratio !== null && (
            <p class="muted readout-note milk-target-note">
              Target = <span class="num">{tenths(yieldG)}</span> g espresso ×{' '}
              <span class="num">{Number(ratio.toFixed(2))}</span>
            </p>
          )
        }
      />
      <div class="milk-actions">
        <button
          type="button"
          class="btn2"
          onClick={() => flow.endMilk('skipped')}
          data-testid="skip-milk"
        >
          Skip milk
        </button>
        <button
          type="button"
          class="btn"
          onClick={() => flow.endMilk('done')}
          data-testid="milk-done"
        >
          Done
        </button>
      </div>
    </>
  );
}

/** What to put down for the extraction, before the cup is on. */
export const CUP_PROMPT = 'Put the cup on the scale';

/**
 * The retention (board Brew-Grind): this brew's, and the grinder's last five from the shots the
 * analysis weighed, since retention is trended over shots rather than read off one (D-037).
 * Nothing while there is neither.
 */
function RetentionCard({
  retention,
  entries,
  grinderId,
}: {
  retention: number | null;
  /** The shots, newest first; null while they load. */
  entries: readonly HistoryEntry[] | null;
  grinderId: string | null;
}) {
  const last = entries === null ? [] : recentRetentions(entries, grinderId);
  if (retention === null && last.length === 0) return null;
  return (
    <div class="card">
      {retention !== null && (
        <div class="retention">
          <span class="lbl">Retention</span>
          <span>
            <span class="num" data-testid="retention">
              {tenths(retention)}
            </span>
            <span class="unit"> g</span>
          </span>
        </div>
      )}
      {last.length > 0 && (
        <div class="retention retention-last" data-testid="retentions">
          <span>Last {last.length}</span>
          <span>
            {last.map((g, i) => (
              <span key={i} class="num muted retention-value">
                {tenths(g)}
              </span>
            ))}
            <span class="unit"> g</span>
          </span>
        </div>
      )}
    </div>
  );
}
