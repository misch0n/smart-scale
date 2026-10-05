// The recipes (T2.9; board Setup-Recipes; spec v2 "Recipes"): the prefilled list, which the user
// edits and adds to. A recipe belongs to the extraction: its coffee ratio sets the yield target,
// and a milk ratio makes it a milk drink, which brings the milk phase (T2.11). The last used is
// marked; it is what the next brew uses (D-074).

import { useState } from 'preact/hooks';
import type { AppServices } from '../../app/startup';
import type { EntityChanges, Recipe } from '../../core/model';
import { ChevronDownIcon, ChevronUpIcon, PlusIcon } from '../icons';
import { setupHash, type Route } from '../route';
import { editorRatio, recipeRatios, STEPS, stepped } from './format';
import { SetupPage, Stepper, TextField, useSetupUpdates } from './parts';

export function RecipesScreen({ services, route }: { services: AppServices; route: Route }) {
  useSetupUpdates(services);
  const { entities, brew } = services;
  const { recipes, recipe: last } = brew.preferences.value;
  const [open, setOpen] = useState<string | null>(null);

  return (
    <SetupPage
      title="Recipes"
      back={{ href: setupHash({ section: 'list' }, route.mock), label: 'Setup' }}
      action={
        <button
          type="button"
          class="btn2"
          onClick={() => {
            const added = entities.add('recipes', {
              name: 'New recipe',
              coffeeRatio: 2,
              milkRatio: null,
            });
            setOpen(added.id);
          }}
          data-testid="new-recipe"
        >
          <PlusIcon size={18} />
          New recipe
        </button>
      }
      mock={route.mock}
      services={services}
      testId="setup-recipes-screen"
    >
      <div class="card">
        {recipes.map((recipe) => (
          <RecipeRow
            key={recipe.id}
            services={services}
            recipe={recipe}
            last={recipe.id === last.id}
            open={open === recipe.id}
            onToggle={() => setOpen(open === recipe.id ? null : recipe.id)}
          />
        ))}
        {recipes.length === 0 && <p class="muted setup-pad">No recipes: add one.</p>}
      </div>
    </SetupPage>
  );
}

function RecipeRow({
  services,
  recipe,
  last,
  open,
  onToggle,
}: {
  services: AppServices;
  recipe: Recipe;
  last: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const update = (
    changes: EntityChanges<'recipes'> | ((current: Recipe) => EntityChanges<'recipes'>),
  ) => services.entities.update('recipes', recipe.id, changes);
  const milk = recipe.milkRatio !== null;
  return (
    <div class="row setup-block" data-testid="recipe">
      <button
        type="button"
        class="setup-block-head recipe-head"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span class="setup-row-text">
          <span class="setup-row-start">
            <span style={{ fontWeight: 600 }}>{recipe.name || 'Unnamed recipe'}</span>
            {last && <span class="badge accent">Last used</span>}
          </span>
          <span class="num muted" style={{ fontSize: '14px' }}>
            {recipeRatios(recipe)}
          </span>
        </span>
        <span class="setup-row-end">
          {milk && <span class="badge">Milk drink</span>}
          <span class="muted" style={{ display: 'flex' }}>
            {open ? <ChevronUpIcon size={20} /> : <ChevronDownIcon size={20} />}
          </span>
        </span>
      </button>
      {open && (
        <div class="setup-block-body">
          <TextField
            id={`r-name-${recipe.id}`}
            label="Name"
            value={recipe.name}
            onCommit={(name) => {
              if (name !== '') update({ name });
            }}
          />
          <div class="setup-line-flat">
            <span>Coffee ratio</span>
            <Stepper
              label="coffee ratio"
              value={editorRatio(recipe.coffeeRatio)}
              onStep={(n) =>
                update((r) => ({ coffeeRatio: stepped(r.coffeeRatio, n, STEPS.coffeeRatio) }))
              }
              testId="coffee-ratio"
            />
          </div>
          <div class="setup-line-flat" style={{ minHeight: '44px' }}>
            <span class="setup-row-text">
              <span>Milk drink</span>
              <span class="muted setup-small">Brings the milk phase</span>
            </span>
            <button
              type="button"
              class={milk ? 'toggle on' : 'toggle'}
              aria-pressed={milk}
              aria-label="Milk drink"
              onClick={() => update({ milkRatio: milk ? null : STEPS.milkRatio.start })}
            />
          </div>
          {milk && (
            <div class="setup-line-flat">
              <span>Milk ratio</span>
              <Stepper
                label="milk ratio"
                value={recipe.milkRatio === null ? '–' : editorRatio(recipe.milkRatio)}
                onStep={(n) =>
                  update((r) => ({ milkRatio: stepped(r.milkRatio, n, STEPS.milkRatio) }))
                }
              />
            </div>
          )}
          <p class="muted setup-small" style={{ margin: 0 }}>
            The beans target comes from the basket, not the recipe.
          </p>
          <div class="setup-actions">
            {!last && (
              <button
                type="button"
                class="btn2"
                onClick={() => services.brew.preferences.setRecipe(recipe.id)}
              >
                Use next
              </button>
            )}
            <button
              type="button"
              class="btn2"
              onClick={() => update({ removedAtEpochMs: Date.now() })}
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
