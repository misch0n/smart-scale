// The machine (T2.9; board Setup-Machine; spec v2 "Machine"): its name, its pressure (optional,
// an OPV's setting), and its baskets, each with its own id and a size that is the beans target.
// The basket in use is the default: the last used (D-074). Then its maintenance dates, descale
// and backflush (T2.10). It edits the machine in use; the data allows more machines, which no
// board draws yet.

import { useState } from 'preact/hooks';
import type { AppServices } from '../../app/startup';
import { newId, NO_MAINTENANCE, type Basket, type Machine } from '../../core/model';
import { tenths } from '../brew/format';
import { PlusIcon } from '../icons';
import { setupHash, type Route } from '../route';
import { STEPS, stepped, todayDate } from './format';
import { MaintenanceBlock } from './MaintenanceBlock';
import { SetupPage, Stepper, TextField, useSetupUpdates } from './parts';

export function MachineScreen({ services, route }: { services: AppServices; route: Route }) {
  useSetupUpdates(services);
  const { entities, brew } = services;
  const machine = brew.preferences.value.machine;
  const page = (children: preact.ComponentChildren) => (
    <SetupPage
      title="Machine"
      back={{ href: setupHash({ section: 'list' }, route.mock), label: 'Setup' }}
      mock={route.mock}
      services={services}
      testId="setup-machine-screen"
    >
      {children}
    </SetupPage>
  );
  if (machine === null) {
    return page(
      <div class="card setup-empty">
        <span class="muted">No machine yet.</span>
        <button
          type="button"
          class="btn2"
          onClick={() => {
            const added = entities.add('machines', {
              name: 'Machine',
              pressureBar: null,
              baskets: [{ id: newId(), name: null, sizeG: STEPS.basketG.start }],
              descale: NO_MAINTENANCE,
              backflush: NO_MAINTENANCE,
            });
            brew.preferences.setMachine(added.id);
          }}
        >
          Add machine
        </button>
      </div>,
    );
  }
  type Changes = Partial<Pick<Machine, 'name' | 'pressureBar' | 'baskets'>>;
  const update = (changes: Changes | ((current: Machine) => Changes)) =>
    entities.update('machines', machine.id, changes);
  return page(
    <>
      <section class="card" aria-label="Machine">
        <div class="setup-pad">
          <TextField
            id="m-name"
            label="Name"
            value={machine.name}
            onCommit={(name) => update({ name })}
          />
        </div>
        <div class="setup-line">
          <span class="setup-line-text">
            <span class="lbl" id="m-pressure">
              Pressure
            </span>
            <span class="muted setup-small">
              Optional · OPV
              {machine.pressureBar !== null && (
                <>
                  {' · '}
                  <button
                    type="button"
                    class="link setup-inline"
                    onClick={() => update({ pressureBar: null })}
                  >
                    Clear
                  </button>
                </>
              )}
            </span>
          </span>
          <Stepper
            label="pressure"
            value={machine.pressureBar === null ? null : machine.pressureBar.toFixed(1)}
            unit="bar"
            onStep={(steps) =>
              update((m) => ({ pressureBar: stepped(m.pressureBar, steps, STEPS.pressureBar) }))
            }
            testId="pressure"
          />
        </div>
      </section>
      <Baskets
        services={services}
        machine={machine}
        onChange={(change) => update((m) => ({ baskets: change(m.baskets) }))}
      />
      <section class="setup-section" aria-labelledby="m-maint" data-testid="machine-maintenance">
        <h2 class="lbl setup-label" id="m-maint">
          Maintenance
        </h2>
        <div class="card">
          {(['descale', 'backflush'] as const).map((kind) => (
            <MaintenanceBlock
              key={kind}
              id={`m-${kind}`}
              kind={kind}
              maintenance={machine[kind]}
              today={todayDate()}
              onChange={(change) =>
                entities.update('machines', machine.id, (m) => ({
                  [kind]: { ...m[kind], ...change(m[kind]) },
                }))
              }
            />
          ))}
        </div>
        <p class="muted setup-note">Each shot records these dates.</p>
      </section>
    </>,
  );
}

function Baskets({
  services,
  machine,
  onChange,
}: {
  services: AppServices;
  machine: Machine;
  /** Changes the baskets as they are when it applies: two quick taps both count. */
  onChange: (change: (baskets: readonly Basket[]) => readonly Basket[]) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const inUse = services.brew.preferences.value.basket?.id ?? null;
  const change = (id: string, changes: (basket: Basket) => Partial<Basket>) =>
    onChange((baskets) =>
      baskets.map((basket) => (basket.id === id ? { ...basket, ...changes(basket) } : basket)),
    );
  return (
    <section class="setup-section" aria-labelledby="m-baskets">
      <h2 class="lbl setup-label" id="m-baskets">
        Baskets
      </h2>
      <div class="card">
        {machine.baskets.map((basket) => {
          const isOpen = open === basket.id;
          return (
            <div key={basket.id} class="row setup-block" data-testid="basket">
              <button
                type="button"
                class="setup-block-head"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : basket.id)}
              >
                <span class="setup-row-start">
                  <span style={{ fontWeight: 600 }}>{basket.name ?? 'Basket'}</span>
                  {basket.id === inUse && <span class="badge accent">Default</span>}
                </span>
                <span style={{ flex: '0 0 auto' }}>
                  <span class="num">{tenths(basket.sizeG)}</span>
                  <span class="unit" style={{ fontSize: '13px' }}>
                    {' g'}
                  </span>
                </span>
              </button>
              {isOpen && (
                <div class="setup-block-body">
                  <TextField
                    id={`b-name-${basket.id}`}
                    label="Name"
                    value={basket.name ?? ''}
                    placeholder="Basket"
                    onCommit={(name) =>
                      change(basket.id, () => ({ name: name === '' ? null : name }))
                    }
                  />
                  <div class="setup-line setup-line-flat">
                    <span class="lbl">Size</span>
                    <Stepper
                      label="basket size"
                      value={tenths(basket.sizeG)}
                      unit="g"
                      onStep={(steps) =>
                        change(basket.id, (b) => ({
                          sizeG: stepped(b.sizeG, steps, STEPS.basketG),
                        }))
                      }
                    />
                  </div>
                  <div class="setup-actions">
                    {basket.id !== inUse && (
                      <button
                        type="button"
                        class="btn2"
                        onClick={() => {
                          services.brew.preferences.setMachine(machine.id);
                          services.brew.preferences.setBasket(basket.id);
                        }}
                      >
                        Make default
                      </button>
                    )}
                    {machine.baskets.length > 1 && (
                      <button
                        type="button"
                        class="btn2"
                        onClick={() => {
                          setOpen(null);
                          onChange((baskets) => baskets.filter((b) => b.id !== basket.id));
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <button
          type="button"
          class="row link setup-add-row"
          onClick={() => {
            const basket: Basket = { id: newId(), name: null, sizeG: STEPS.basketG.start };
            onChange((baskets) => [...baskets, basket]);
            setOpen(basket.id);
          }}
          data-testid="add-basket"
        >
          <PlusIcon size={18} />
          Add basket
        </button>
      </div>
      <p class="muted setup-note">
        The basket's size is the beans target. Each basket keeps its own id, so two of the same size
        can be told apart later.
      </p>
    </section>
  );
}
