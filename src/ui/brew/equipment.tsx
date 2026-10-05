// The phases' equipment, in place (T2.6, T2.2; board Brew-Beans; spec v2 "Brew phases": ambient
// context): each a row with what the brew uses, the last used by default, which opens on a tap
// into a grid to pick another. A pick becomes the default (D-074: the last used), and the row
// says what it was. The beans phase has the machine, its basket (the beans' target) and the
// coffee pack; the grind phase's grinder and setting are T2.7's.

import { useState } from 'preact/hooks';
import type { BrewPreferences } from '../../app/brew-settings';
import type { Entities } from '../../app/entities';
import type { CoffeePack, Id } from '../../core/model';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from '../icons';
import { FinishPanel } from '../setup/PacksScreen';
import { daysOffRoast, packGroups, packTitle, todayDate } from '../setup/format';
import { tenths } from './format';

/** A choice in a picker's grid. */
export interface PickerOption {
  /** Null for "none". */
  readonly id: Id | null;
  readonly name: string;
  /** Under the name, in figures: `17.0 g`, `day 12`. */
  readonly detail: string | null;
}

/**
 * A row of the equipment card: its label, what the brew uses (and what it was, once changed
 * here), and on a tap the grid to pick from, with "Your pick becomes the default".
 */
export function PickerRow({
  label,
  value,
  was,
  open,
  onToggle,
  options,
  selected,
  onPick,
  testId,
  children,
}: {
  label: string;
  value: string;
  /** What it was before a pick here: `was LM 17 g · now the default`. */
  was: string | null;
  open: boolean;
  onToggle: () => void;
  options: readonly PickerOption[];
  selected: Id | null;
  onPick: (id: Id | null) => void;
  testId: string;
  /** Under the grid: more to do with the pick. */
  children?: preact.ComponentChildren;
}) {
  return (
    <div class="picker-row">
      <button
        type="button"
        class="picker-toggle"
        aria-expanded={open}
        onClick={onToggle}
        data-testid={testId}
      >
        <span class="lbl">{label}</span>
        <span class="picker-value">
          <span>
            <strong>{value}</strong>
            {was !== null && was !== value && (
              <span class="muted picker-note">was {was} · now the default</span>
            )}
          </span>
          {open ? (
            <ChevronUpIcon size={18} class="muted" />
          ) : (
            <ChevronDownIcon size={18} class="muted" />
          )}
        </span>
      </button>
      {open && (
        <div class="picker-body">
          <div role="group" aria-label={label} class="recipe-grid">
            {options.map((option) => {
              const on = option.id === selected;
              return (
                <button
                  key={option.id ?? 'none'}
                  type="button"
                  class={on ? 'chip on' : 'chip'}
                  aria-pressed={on}
                  onClick={() => onPick(option.id)}
                >
                  <span class="picker-option-name">{option.name}</span>
                  <span class="recipe-ratio">
                    <span>{option.detail ?? ''}</span>
                    {on && <CheckIcon size={14} strokeWidth={2.5} />}
                  </span>
                </button>
              );
            })}
          </div>
          {children}
          <p class="muted picker-hint">Your pick becomes the default</p>
        </div>
      )}
    </div>
  );
}

type BeansRow = 'machine' | 'basket' | 'pack';

/**
 * The beans phase's equipment (board Brew-Beans): the machine, its basket (whose size is the
 * beans' target) and the coffee pack, each the last used. Picking an unopened pack opens it
 * today; the pack in use can be finished here, with the optional "would buy again" (Q5).
 */
export function BeansEquipment({
  preferences,
  entities,
}: {
  preferences: BrewPreferences;
  entities: Entities;
}) {
  const [open, setOpen] = useState<BeansRow | null>(null);
  const [was, setWas] = useState<Partial<Record<BeansRow, string>>>({});
  const [finishing, setFinishing] = useState(false);
  const { machine, basket, pack } = preferences.value;
  const today = todayDate();
  const toggle = (row: BeansRow) => () => {
    setFinishing(false);
    setOpen(open === row ? null : row);
  };
  const remember = (row: BeansRow, value: string) => {
    if (!(row in was)) setWas({ ...was, [row]: value });
  };

  const machineName = machine?.name ?? 'None';
  const basketName = basket === null ? 'None' : basketLabel(basket.name, basket.sizeG);
  const packName = pack === null ? 'None' : packLabel(pack, today);
  const groups = packGroups(entities.value.packs);

  return (
    <section class="card" aria-label="Equipment" data-testid="beans-equipment">
      <PickerRow
        label="Machine"
        value={machineName}
        was={was.machine ?? null}
        open={open === 'machine'}
        onToggle={toggle('machine')}
        options={entities.listed('machines').map((m) => ({
          id: m.id,
          name: m.name,
          detail: m.pressureBar === null ? null : `${m.pressureBar.toFixed(1)} bar`,
        }))}
        selected={machine?.id ?? null}
        onPick={(id) => {
          if (id === null || id === machine?.id) return;
          remember('machine', machineName);
          preferences.setMachine(id);
          setOpen(null);
        }}
        testId="pick-machine"
      />
      <PickerRow
        label="Basket"
        value={basketName}
        was={was.basket ?? null}
        open={open === 'basket'}
        onToggle={toggle('basket')}
        options={(machine?.baskets ?? []).map((b) => ({
          id: b.id,
          name: b.name ?? 'Basket',
          detail: `${tenths(b.sizeG)} g`,
        }))}
        selected={basket?.id ?? null}
        onPick={(id) => {
          if (id === null || id === basket?.id) return;
          remember('basket', basketName);
          preferences.setBasket(id);
          setOpen(null);
        }}
        testId="pick-basket"
      />
      <PickerRow
        label="Pack"
        value={packName}
        was={was.pack ?? null}
        open={open === 'pack'}
        onToggle={toggle('pack')}
        options={[
          ...groups.open.map((p) => ({ id: p.id, name: packTitle(p), detail: packDay(p, today) })),
          ...groups.unopened.map((p) => ({
            id: p.id,
            name: packTitle(p),
            detail: `unopened · ${packDay(p, today)}`,
          })),
          { id: null, name: 'None', detail: null },
        ]}
        selected={pack?.id ?? null}
        onPick={(id) => {
          if (id === (pack?.id ?? null)) return;
          remember('pack', packName);
          const picked = id === null ? null : entities.get('packs', id);
          // An unopened pack picked for a brew is opened today.
          if (picked !== null && picked.openDate === null) {
            entities.update('packs', picked.id, { openDate: today });
          }
          preferences.setPack(id);
          setOpen(null);
        }}
        testId="pick-pack"
      >
        {pack !== null &&
          (finishing ? (
            <FinishPanel
              pack={pack}
              onFinish={(buyAgain) => {
                entities.update('packs', pack.id, { finishedDate: today, buyAgain });
                setFinishing(false);
              }}
              onCancel={() => setFinishing(false)}
            />
          ) : (
            <button
              type="button"
              class="btn2 picker-action"
              onClick={() => setFinishing(true)}
              data-testid="finish-pack-here"
            >
              Finish {packTitle(pack)}
            </button>
          ))}
      </PickerRow>
    </section>
  );
}

/** A basket as the row shows it: its name, else its size. */
function basketLabel(name: string | null, sizeG: number): string {
  return name ?? `${tenths(sizeG)} g`;
}

/** `day 12`: days off roast. */
function packDay(pack: CoffeePack, today: string): string {
  return `day ${daysOffRoast(pack, today)}`;
}

/** The pack as the row shows it (board Brew-Beans): `Ethiopia Guji · day 12`. */
function packLabel(pack: CoffeePack, today: string): string {
  return `${packTitle(pack)} · ${packDay(pack, today)}`;
}
