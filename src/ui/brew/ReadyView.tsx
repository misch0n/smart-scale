// The extraction screen, waiting for the pump (board Brew-Ready): the cup, the recipe as ambient
// context (last used, changeable in place), the target (the dose × the recipe's coffee ratio),
// and the Tare + start tap. Until the microphone (T3.1) the tap is how a shot starts, so the
// screen shows the board's "manual" variant and asks for the tap with the pump (D-048). Until
// the beans and grind phases weigh it (T2.6, T2.7), the dose is set here (D-067).

import { useState } from 'preact/hooks';
import type { BrewFlow } from '../../app/brew-flow';
import { DEFAULT_RECIPES, DOSE, type BrewPreferences } from '../../app/brew-settings';
import type { ScaleLink } from '../../app/links';
import type { ShotDisplay } from '../../core/live';
import { minutesSeconds, recipeLabel, recipeRatio, tenths } from './format';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, MicOffIcon } from './icons';
import { ConnectCard, CupCard, StepButton } from './parts';
import { ShotChart } from './ShotChart';

export function ReadyView({
  link,
  flow,
  display,
  preferences,
}: {
  link: Pick<ScaleLink, 'transport'>;
  flow: BrewFlow;
  display: ShotDisplay;
  preferences: BrewPreferences;
}) {
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [doseOpen, setDoseOpen] = useState(false);
  /** The recipe before the user changed it here: "was Cappuccino · now the default". */
  const [was, setWas] = useState<string | null>(null);
  const status = link.transport.status.state;
  const { recipe, doseG } = preferences.value;
  const targetG = doseG * recipe.coffeeRatio;
  // How long the cup has waited for the pump; not after its shot.
  const waitingMs =
    display.phase === 'ready' && display.cupOnMs !== null && display.tMs !== null
      ? display.tMs - display.cupOnMs
      : null;

  return (
    <>
      {status === 'connected' ? (
        <CupCard display={display} />
      ) : (
        <ConnectCard connecting={status === 'connecting'} onConnect={() => flow.connect()} />
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
              {DEFAULT_RECIPES.map((option) => {
                const on = option.name === recipe.name;
                return (
                  <button
                    key={option.name}
                    type="button"
                    class={on ? 'chip on' : 'chip'}
                    aria-pressed={on}
                    onClick={() => {
                      if (!on) setWas(was ?? recipe.name);
                      preferences.setRecipe(option.name);
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
            <button
              type="button"
              class="dose-toggle num"
              aria-expanded={doseOpen}
              aria-label={`Dose ${tenths(doseG)} g`}
              onClick={() => setDoseOpen(!doseOpen)}
              data-testid="dose"
            >
              {tenths(doseG)}
            </button>{' '}
            g × <span class="num">{Number(recipe.coffeeRatio.toFixed(2))}</span>
          </span>
        </div>
        {doseOpen && (
          <div class="card dose-row">
            <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span class="lbl">Dose</span>
              <span class="muted" style={{ fontSize: '12px' }}>
                Kept as the default
              </span>
            </span>
            <div class="stepper">
              <StepButton
                label="Less"
                onStep={() => preferences.setDoseG(preferences.value.doseG - DOSE.stepG)}
              >
                −
              </StepButton>
              <span class="num" data-testid="dose-value">
                {tenths(doseG)}
              </span>
              <StepButton
                label="More"
                onStep={() => preferences.setDoseG(preferences.value.doseG + DOSE.stepG)}
              >
                +
              </StepButton>
            </div>
          </div>
        )}
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

      {!recipeOpen && !doseOpen && (
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
        >
          Start
        </button>
        <p class="muted">It tares the scale and starts its timer, and never touches the machine.</p>
      </div>
    </>
  );
}
