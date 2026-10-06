// The extraction screen, waiting for the pump (board Brew-Ready): the cup, the recipe as ambient
// context (last used, changeable in place), the target (the dose × the recipe's coffee ratio),
// and the Tare + start tap. Until the microphone (T3.1) the tap is how a shot starts, so the
// screen shows the board's "manual" variant and asks for the tap with the pump (D-048). The
// dose is the phases' (T2.5, D-079): the grounds weighed, else the beans, else the basket's size;
// the dose stepper of T1.18 (D-067) is gone, as its answer (Q10) said it would be.

import { useState } from 'preact/hooks';
import type { BrewFlow, LiveDose } from '../../app/brew-flow';
import type { BrewPreferences } from '../../app/brew-settings';
import type { ScaleLink } from '../../app/links';
import type { VesselOnScale } from '../../app/live-vessel';
import { connectionView } from '../../app/scale-connector';
import type { ShotDisplay } from '../../core/live';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, MicOffIcon } from '../icons';
import { minutesSeconds, recipeLabel, recipeRatio, tenths } from './format';
import { ConnectCard } from './parts';
import { CUP_PROMPT, VesselCard } from './phases';
import { ShotChart } from './ShotChart';

/** Where the dose came from, beside it. */
const DOSE_SOURCE: Readonly<Record<LiveDose['source'], string>> = {
  ground: 'ground',
  beans: 'beans',
  basket: 'basket',
  set: 'set',
};

export function ReadyView({
  link,
  flow,
  display,
  preferences,
  onScale,
  onPick,
}: {
  link: Pick<ScaleLink, 'transport' | 'connector'>;
  flow: BrewFlow;
  display: ShotDisplay;
  preferences: BrewPreferences;
  onScale: VesselOnScale | null;
  onPick: (id: string) => void;
}) {
  const [recipeOpen, setRecipeOpen] = useState(false);
  /** The recipe before the user changed it here: "was Cappuccino · now the default". */
  const [was, setWas] = useState<string | null>(null);
  const status = link.transport.status.state;
  const { recipes, recipe } = preferences.value;
  const dose = flow.dose;
  const targetG = dose.g * recipe.coffeeRatio;
  // How long the cup has waited for the pump; not after its shot.
  const waitingMs =
    display.phase === 'ready' && display.cupOnMs !== null && display.tMs !== null
      ? display.tMs - display.cupOnMs
      : null;

  return (
    <>
      {status === 'connected' ? (
        <VesselCard
          onScale={onScale}
          container={flow.phases.container}
          prompt={CUP_PROMPT}
          onPick={onPick}
        />
      ) : (
        <ConnectCard
          view={connectionView(link.transport.status, link.connector.state)}
          state={link.connector.state}
          connector={link.connector}
        />
      )}

      <section class="card" aria-label="Equipment">
        <button
          type="button"
          class="picker-toggle"
          aria-expanded={recipeOpen}
          onClick={() => setRecipeOpen(!recipeOpen)}
          data-testid="recipe"
        >
          <span class="lbl">Recipe</span>
          <span class="picker-value">
            <span>
              <strong>{recipeLabel(recipe)}</strong>
              {was !== null && was !== recipe.name && (
                <span class="muted picker-note">was {was} · now the default</span>
              )}
            </span>
            {recipeOpen ? (
              <ChevronUpIcon size={18} class="muted" />
            ) : (
              <ChevronDownIcon size={18} class="muted" />
            )}
          </span>
        </button>
        {recipeOpen && (
          <div class="picker-body">
            <div role="group" aria-label="Recipe" class="recipe-grid">
              {recipes.map((option) => {
                const on = option.id === recipe.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    class={on ? 'chip on' : 'chip'}
                    aria-pressed={on}
                    onClick={() => {
                      if (!on) setWas(was ?? recipe.name);
                      preferences.setRecipe(option.id);
                      setRecipeOpen(false);
                    }}
                  >
                    <span>{option.name}</span>
                    <span class="recipe-ratio">
                      <span>
                        {recipeRatio(option.coffeeRatio)}
                        {option.milkRatio === null ? '' : ` + ${recipeRatio(option.milkRatio)}`}
                      </span>
                      {on && <CheckIcon size={14} strokeWidth={2.5} />}
                    </span>
                  </button>
                );
              })}
            </div>
            <p class="muted picker-hint">Your pick becomes the default</p>
          </div>
        )}
      </section>

      <section class="target" aria-label="Target yield">
        <div class="target-head">
          <span class="lbl">Target</span>
          <span class="muted target-formula">
            <span class="num" data-testid="dose">
              {tenths(dose.g)}
            </span>{' '}
            g × <span class="num">{Number(recipe.coffeeRatio.toFixed(2))}</span>
            <span class="target-source" data-testid="dose-source">
              {' · '}
              {DOSE_SOURCE[dose.source]}
            </span>
          </span>
        </div>
        <div class="big">
          <span class="num" data-testid="target">
            {tenths(targetG)}
          </span>
          <span class="unit">g</span>
        </div>
      </section>

      <div class="card waiting">
        <span class="waiting-icon">
          <MicOffIcon />
        </span>
        <span class="waiting-text">
          <span>Pump detection is off</span>
          <span class="muted" style={{ fontSize: '13px' }}>
            Tap Start as you start the pump.
          </span>
        </span>
        {waitingMs !== null && (
          <span class="waiting-time">
            <span class="lbl">Waiting</span>
            <span class="num" data-testid="waiting">
              {minutesSeconds(waitingMs)}
            </span>
          </span>
        )}
      </div>

      {!recipeOpen && (
        <div class="card">
          <ShotChart
            variant="empty"
            points={[]}
            targetG={targetG}
            firstDripS={null}
            pumpOffS={null}
          />
        </div>
      )}

      <div class="start">
        <button
          type="button"
          class="btn"
          disabled={status !== 'connected'}
          onClick={() => flow.start()}
          data-testid="start"
          // Made as the pump starts: no microphone opened then (T2.18, D-037).
          data-no-mic
        >
          Start
        </button>
        <p class="muted">It tares the scale and starts its timer, and never touches the machine.</p>
      </div>
    </>
  );
}
