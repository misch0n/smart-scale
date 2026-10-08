// The brew's phases on screen (T2.5; boards Brew-Beans, Brew-Ready, Brew-Shot and Brew-Milk, as
// the user cut them in D-101: no grind phase, no stepper): the vessel on the scale, and the beans
// and milk views, each with the live weight against its target. Display-only (hard rule 3): the
// figures are the live phases' (`flow.phases`); the shot card shows the analysis's. Each phase
// has its equipment in place: the beans the basket and pack (T2.6) and the grinder and its
// setting (T2.7), under the figure (D-103); the milk its ratio (T2.11). The beans have the taste
// nudge after a sour or bitter shot (T2.12).

import type { BrewFlow, ShotCard } from '../../app/brew-flow';
import type { BrewPreferences } from '../../app/brew-settings';
import type { Entities } from '../../app/entities';
import type { VesselOnScale } from '../../app/live-vessel';
import { pourProgress } from '../../core/live';
import type { Container } from '../../core/model';
import { CheckIcon, PutDownIcon, WarningIcon } from '../icons';
import { BeansEquipment, GrindEquipment, MilkEquipment } from './equipment';
import { beansSettled, readout, tenths } from './format';

/** Past a pour's target by more than this, the readout warns, g (spec v2 "Live display"). */
const OVER_MARGIN_G = 1;

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
  /** While the scale isn't connected: its line instead (`ScaleLine`, T3.14). */
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
 * The beans phase (board Brew-Beans, as the user cut it, D-103): the bean cup, the beans against
 * the basket's size, the most important figure, high on the screen; once they settle, the way to
 * the extraction ("Place the coffee cup…", a link for a cup the app doesn't know); then the taste
 * nudge, and the basket, pack and grinder in place at the bottom.
 */
export function BeansView({
  flow,
  onScale,
  stable,
  preferences,
  entities,
  onPick,
  connect,
  nudge,
}: {
  flow: BrewFlow;
  onScale: VesselOnScale | null;
  /** The scale's weight holds still. */
  stable: boolean;
  preferences: BrewPreferences;
  entities: Entities;
  onPick: (id: string) => void;
  connect: preact.ComponentChildren;
  /** The taste nudge (T2.12), under the beans. */
  nudge: preact.ComponentChildren;
}) {
  const phases = flow.phases;
  const settled = beansSettled({ beansG: phases.beansG, vesselOn: onScale !== null, stable });
  return (
    <>
      <VesselCard
        onScale={onScale}
        container={phases.container}
        prompt="Put the bean cup on the scale"
        onPick={onPick}
        connect={connect}
      />
      <PourReadout
        label="Beans"
        valueG={phases.beansG}
        targetG={preferences.value.basket?.sizeG ?? null}
        testId="beans"
      />
      {settled && (
        // The cup opens the extraction by itself; a tap here does it for a cup it doesn't know.
        <button
          type="button"
          class="link phase-next"
          onClick={() => flow.selectPhase('extraction')}
          data-testid="to-extraction"
        >
          <PutDownIcon size={18} />
          Place the coffee cup to start the extraction
        </button>
      )}
      {nudge}
      <BeansEquipment preferences={preferences} entities={entities} />
      {/* The grinder and its setting go with the beans: there is no grind phase (D-101). */}
      <GrindEquipment preferences={preferences} entities={entities} />
    </>
  );
}

/**
 * The milk phase (board Brew-Milk, without its buttons: D-101): the jug (with a warning when
 * another container is within 3 g of it), the milk ratio in place (T2.11), the milk against the
 * espresso's yield × the milk ratio. Lifting the jug with its milk brings back the shot card with
 * its milk row (T2.26); "Not now" skips it.
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
      <p class="muted phase-hint">↑ Lift the jug when the milk is in: it is recorded.</p>
      {/* The milk is optional: a quiet way back to the card (D-101). */}
      <button
        type="button"
        class="link milk-skip"
        onClick={() => flow.endMilk('skipped')}
        data-testid="skip-milk"
      >
        Not now
      </button>
    </>
  );
}

/** What to put down for the extraction, before the cup is on. */
export const CUP_PROMPT = 'Put the cup on the scale';
