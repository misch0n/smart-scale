// The brew's phases on screen (T2.5; boards Brew-Beans, Brew-Grind, Brew-Ready, Brew-Shot and
// Brew-Milk): the phase stepper, the vessel on the scale, and the beans, grind and milk views,
// each with the live weight against its target. Display-only (hard rule 3): the figures are the
// live phases' (`flow.phases`); the shot card shows the analysis's. The beans phase has its
// equipment in place (the machine, basket and pack, T2.6); the grinder and its setting, and the
// milk ratio, come with T2.7 and T2.11.

import type { BrewFlow, ShotCard } from '../../app/brew-flow';
import type { BrewPreferences } from '../../app/brew-settings';
import type { Entities } from '../../app/entities';
import type { VesselOnScale } from '../../app/live-vessel';
import { pourProgress, type PhaseRouterState } from '../../core/live';
import { BREW_PHASES, type BrewPhase, type Container } from '../../core/model';
import { CheckIcon, PutDownIcon, WarningIcon } from '../icons';
import { BeansEquipment } from './equipment';
import { readout, tenths } from './format';

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
}: {
  label: string;
  valueG: number | null;
  targetG: number | null;
  testId: string;
}) {
  const g = valueG ?? 0;
  const r =
    targetG === null || targetG <= 0 ? null : readout(pourProgress(g, targetG, OVER_MARGIN_G));
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
            target <span class="num">{tenths(targetG)}</span> g
          </span>
        )}
      </div>
      <div class="big big-live">
        <span class="num" data-testid={testId}>
          {tenths(g)}
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
                <span class="num">{r.big}</span> g to go
              </>
            ) : r.state === 'reached' ? (
              <span class="c-ok">Target reached</span>
            ) : (
              <span class="c-warn">
                <WarningIcon size={16} /> <span class="num">{r.big}</span> g over target
              </span>
            )}
          </div>
        </>
      )}
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
}: {
  flow: BrewFlow;
  onScale: VesselOnScale | null;
  preferences: BrewPreferences;
  entities: Entities;
  onPick: (id: string) => void;
  connect: preact.ComponentChildren;
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
  onPick,
  connect,
}: {
  flow: BrewFlow;
  onScale: VesselOnScale | null;
  onPick: (id: string) => void;
  connect: preact.ComponentChildren;
}) {
  const { groundG, container } = flow.phases;
  // Beans weighed: none when the beans phase was skipped or held nothing.
  const beansG = (flow.phases.beansG ?? 0) > 0 ? flow.phases.beansG : null;
  const carriedBack = onScale !== null && onScale.container === null && container !== null;
  const retention = groundG === null || beansG === null ? null : beansG - groundG;
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
      {retention !== null && (
        <div class="card retention">
          <span class="lbl">Retention</span>
          <span>
            <span class="num" data-testid="retention">
              {tenths(retention)}
            </span>
            <span class="unit"> g</span>
          </span>
        </div>
      )}
      <p class="muted phase-hint">↓ Put the cup down to start the extraction.</p>
    </>
  );
}

/**
 * The milk phase (board Brew-Milk): the jug, the milk against the espresso's yield × the
 * recipe's milk ratio, Skip milk and Done. Done brings back the shot card with its milk row.
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
      <PourReadout label="Milk" valueG={phases.milkG} targetG={targetG} testId="milk" />
      {targetG !== null && yieldG !== null && ratio !== null && (
        <p class="muted phase-hint" style={{ textAlign: 'left' }}>
          Target = <span class="num">{tenths(yieldG)}</span> g espresso ×{' '}
          <span class="num">{Number(ratio.toFixed(2))}</span>
        </p>
      )}
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
