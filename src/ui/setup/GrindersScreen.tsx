// The grinders (T2.9; board Setup-Grinders; spec v2 "Grinders"): each with its type, stepless or
// clicks, the step a stepless one's setting moves by (T2.28), and its setting now, which a
// change during a brew updates (T2.3). One is the default: the last used (D-074). The one in use
// opens with its controls; the others show their setting and open with a tap. Each shows its
// care date, open or not (T2.10).

import { useState } from 'preact/hooks';
import type { AppServices } from '../../app/startup';
import {
  GRIND_SETTING_KINDS,
  NO_MAINTENANCE,
  type EntityChanges,
  type Grinder,
  type GrindSettingKind,
} from '../../core/model';
import { PlusIcon } from '../icons';
import { setupHash, type Route } from '../route';
import {
  GRIND_STEP_OPTIONS,
  grindStep,
  SETTING_KIND_LABEL,
  settingLabel,
  steppedSetting,
  todayDate,
} from './format';
import { MaintenanceBlock } from './MaintenanceBlock';
import { SetupPage, Stepper, TextField, useSetupUpdates } from './parts';

export function GrindersScreen({ services, route }: { services: AppServices; route: Route }) {
  useSetupUpdates(services);
  const { entities, brew } = services;
  const grinders = entities.listed('grinders');
  const inUse = brew.preferences.value.grinder?.id ?? null;
  const [open, setOpen] = useState<string | null>(inUse);
  const [adding, setAdding] = useState(false);

  return (
    <SetupPage
      title="Grinders"
      back={{ href: setupHash({ section: 'list' }, route.mock), label: 'Setup' }}
      action={
        <button
          type="button"
          class="btn2"
          onClick={() => setAdding(!adding)}
          aria-expanded={adding}
          data-testid="add-grinder"
        >
          <PlusIcon size={18} />
          Add grinder
        </button>
      }
      mock={route.mock}
      services={services}
      testId="setup-grinders-screen"
    >
      {adding && (
        <NewGrinder
          onAdd={(fields) => {
            const added = entities.add('grinders', {
              ...fields,
              currentSetting: null,
              settingStep: null,
              care: NO_MAINTENANCE,
            });
            setAdding(false);
            setOpen(added.id);
          }}
          onCancel={() => setAdding(false)}
        />
      )}
      {grinders.length === 0 && !adding && <p class="card setup-empty muted">No grinders yet.</p>}
      {grinders.map((grinder) => (
        <GrinderCard
          key={grinder.id}
          services={services}
          grinder={grinder}
          isDefault={grinder.id === inUse}
          open={open === grinder.id}
          onToggle={() => setOpen(open === grinder.id ? null : grinder.id)}
        />
      ))}
    </SetupPage>
  );
}

function GrinderCard({
  services,
  grinder,
  isDefault,
  open,
  onToggle,
}: {
  services: AppServices;
  grinder: Grinder;
  isDefault: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const update = (
    changes: EntityChanges<'grinders'> | ((current: Grinder) => EntityChanges<'grinders'>),
  ) => services.entities.update('grinders', grinder.id, changes);
  const kind = grinder.settingKind;
  const step = grindStep(grinder);
  return (
    <section class="card" aria-label={`${grinder.brand} ${grinder.model}`} data-testid="grinder">
      <button type="button" class="grinder-head" aria-expanded={open} onClick={onToggle}>
        <span class="muted setup-small">{grinder.brand}</span>
        <span class="grinder-badge">{isDefault && <span class="badge accent">Default</span>}</span>
        <span class="grinder-model">{grinder.model || 'Grinder'}</span>
        {!open && (
          <span class="muted setup-small grinder-summary">
            {SETTING_KIND_LABEL[kind]} · setting{' '}
            <span class="num" style={{ color: 'var(--ink)' }}>
              {settingLabel(kind, grinder.currentSetting)}
            </span>
          </span>
        )}
      </button>
      {open && (
        <>
          <div class="setup-line">
            <span class="lbl" id={`g-type-${grinder.id}`}>
              Type
            </span>
            <div
              class="seg"
              role="group"
              aria-labelledby={`g-type-${grinder.id}`}
              style={{ flex: '0 0 auto', width: '200px' }}
            >
              {GRIND_SETTING_KINDS.map((option) => (
                <button
                  key={option}
                  type="button"
                  class={option === kind ? 'on' : ''}
                  aria-pressed={option === kind}
                  onClick={() => {
                    if (option === kind) return;
                    const setting = grinder.currentSetting;
                    update({
                      settingKind: option,
                      currentSetting:
                        setting === null || option === 'stepless' ? setting : Math.round(setting),
                    });
                  }}
                >
                  {SETTING_KIND_LABEL[option]}
                </button>
              ))}
            </div>
          </div>
          {kind === 'stepless' && (
            <div class="setup-line setup-line-stack">
              <span class="lbl" id={`g-step-${grinder.id}`}>
                Step
              </span>
              <div
                class="seg"
                role="group"
                aria-labelledby={`g-step-${grinder.id}`}
                data-testid="grinder-step"
              >
                {GRIND_STEP_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    class={option === step ? 'on num' : 'num'}
                    aria-pressed={option === step}
                    onClick={() => {
                      if (option !== step) update({ settingStep: option });
                    }}
                  >
                    {String(option)}
                  </button>
                ))}
              </div>
              <span class="muted setup-small">What − and + change the setting by.</span>
            </div>
          )}
          <div class="setup-line setup-line-stack">
            <div class="setup-line-flat">
              <span class="lbl">Setting</span>
              <Stepper
                label="setting"
                value={
                  grinder.currentSetting === null
                    ? null
                    : settingLabel(kind, grinder.currentSetting)
                }
                onStep={(n) => update((g) => ({ currentSetting: steppedSetting(g, n) }))}
                testId="grinder-setting"
              />
            </div>
            <span class="muted setup-small">Changes made during a shot update this.</span>
          </div>
          <div class="setup-line setup-line-stack">
            <TextField
              id={`g-brand-${grinder.id}`}
              label="Brand"
              value={grinder.brand}
              onCommit={(brand) => update({ brand })}
            />
            <TextField
              id={`g-model-${grinder.id}`}
              label="Model"
              value={grinder.model}
              onCommit={(model) => update({ model })}
            />
          </div>
        </>
      )}
      <MaintenanceBlock
        id={`g-care-${grinder.id}`}
        kind="care"
        maintenance={grinder.care}
        today={todayDate()}
        onChange={(change) => update((g) => ({ care: { ...g.care, ...change(g.care) } }))}
      />
      {(open || !isDefault) && (
        <div class="setup-actions setup-pad-actions">
          {!isDefault && (
            <button
              type="button"
              class="btn2"
              onClick={() => services.brew.preferences.setGrinder(grinder.id)}
            >
              Make default
            </button>
          )}
          {open && (
            <button
              type="button"
              class="btn2"
              onClick={() => update({ removedAtEpochMs: Date.now() })}
            >
              Remove
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function NewGrinder({
  onAdd,
  onCancel,
}: {
  onAdd: (fields: {
    readonly brand: string;
    readonly model: string;
    readonly settingKind: GrindSettingKind;
  }) => void;
  onCancel: () => void;
}) {
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [kind, setKind] = useState<GrindSettingKind>('stepless');
  const ready = brand.trim() !== '' || model.trim() !== '';
  return (
    <section class="card setup-form" aria-label="New grinder" data-testid="new-grinder">
      <div class="field">
        <label class="lbl" for="ng-brand">
          Brand
        </label>
        <input
          class="input"
          id="ng-brand"
          type="text"
          value={brand}
          onInput={(event) => setBrand(event.currentTarget.value)}
        />
      </div>
      <div class="field">
        <label class="lbl" for="ng-model">
          Model
        </label>
        <input
          class="input"
          id="ng-model"
          type="text"
          value={model}
          onInput={(event) => setModel(event.currentTarget.value)}
        />
      </div>
      <div class="seg" role="group" aria-label="Type">
        {GRIND_SETTING_KINDS.map((option) => (
          <button
            key={option}
            type="button"
            class={option === kind ? 'on' : ''}
            aria-pressed={option === kind}
            onClick={() => setKind(option)}
          >
            {SETTING_KIND_LABEL[option]}
          </button>
        ))}
      </div>
      <div class="setup-actions">
        <button type="button" class="btn2" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          class="btn2"
          disabled={!ready}
          onClick={() => onAdd({ brand: brand.trim(), model: model.trim(), settingKind: kind })}
        >
          Add
        </button>
      </div>
    </section>
  );
}
