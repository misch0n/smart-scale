// One coffee pack (T2.9; board Setup-Pack; spec v2 "Coffee packs"): its age (days off roast, and
// how long it has been open), its fields (the roast date required: the age comes from it), its
// flavours (its own on, other packs' offered), and Finish with the optional "would buy again".
// `#/setup/pack/new` is the same form for a new pack, stored once it has a name and a roast date.

import { useState } from 'preact/hooks';
import type { AppServices } from '../../app/startup';
import { daysBetween, type CoffeePack } from '../../core/model';
import { setupHash, type Route } from '../route';
import { dateLabel, daysOffRoast, packTitle, todayDate } from './format';
import { BuyAgain, FinishPanel } from './PacksScreen';
import { DateField, SetupPage, TextField, useSetupUpdates } from './parts';

/** The fields of a pack the form edits. */
type PackFields = Pick<
  CoffeePack,
  'brand' | 'name' | 'weightG' | 'roastDate' | 'openDate' | 'flavours'
>;
type PackChanges = Partial<PackFields>;

export function PackScreen({
  services,
  route,
  packId,
}: {
  services: AppServices;
  route: Route;
  /** Null: a new pack. */
  packId: string | null;
}) {
  useSetupUpdates(services);
  const { entities } = services;
  const mock = route.mock;
  const back = { href: setupHash({ section: 'packs' }, mock), label: 'Coffee packs' };
  const pack = packId === null ? null : entities.get('packs', packId);
  const [draft, setDraft] = useState<PackFields>({
    brand: null,
    name: '',
    weightG: null,
    roastDate: '',
    openDate: null,
    flavours: [],
  });
  const [finishing, setFinishing] = useState(false);
  const today = todayDate();

  if (packId !== null && (pack === null || pack.removedAtEpochMs !== null)) {
    return (
      <SetupPage
        title="Coffee pack"
        back={back}
        mock={mock}
        services={services}
        testId="setup-pack-screen"
      >
        <p class="card setup-empty muted">There is no such pack.</p>
      </SetupPage>
    );
  }

  const fields: PackFields = pack ?? draft;
  // From the pack as it is when the change applies: two quick taps both count.
  const change = (changes: PackChanges | ((current: PackFields) => PackChanges)) => {
    const of = (current: PackFields) =>
      typeof changes === 'function' ? changes(current) : changes;
    if (pack === null) setDraft((current) => ({ ...current, ...of(current) }));
    else entities.update('packs', pack.id, of);
  };
  const others = [
    ...new Set(
      entities.value.packs
        .filter((other) => other.id !== pack?.id)
        .flatMap((other) => other.flavours),
    ),
  ].filter((flavour) => !fields.flavours.includes(flavour));
  const ready = fields.name.trim() !== '' && /^\d{4}-\d{2}-\d{2}$/.test(fields.roastDate);

  return (
    <SetupPage
      title={pack === null ? 'New pack' : packTitle(pack)}
      back={back}
      mock={mock}
      services={services}
      testId="setup-pack-screen"
    >
      {ready && (
        <div class="card pack-age" data-testid="pack-age">
          <span class="pack-age-day">
            <span>Day</span>
            <span class="num pack-age-num">{daysOffRoast(fields, today)}</span>
            <span>off roast</span>
          </span>
          {fields.openDate !== null && (
            <span class="muted" style={{ fontSize: '14px' }}>
              open <span class="num">{daysBetween(fields.openDate, today)}</span> days
            </span>
          )}
        </div>
      )}

      <section class="setup-section" aria-labelledby="pk-pack">
        <h2 class="lbl setup-label" id="pk-pack">
          Pack
        </h2>
        <div class="card setup-form">
          <TextField
            id="pk-brand"
            label="Brand"
            value={fields.brand ?? ''}
            onCommit={(brand) => change({ brand: brand === '' ? null : brand })}
          />
          <TextField
            id="pk-name"
            live={pack === null}
            label="Name"
            value={fields.name}
            placeholder="Origin · process"
            onCommit={(name) => {
              if (name !== '' || pack === null) change({ name });
            }}
          />
          <div class="setup-grid">
            <TextField
              id="pk-weight"
              label="Weight"
              value={fields.weightG === null ? '' : String(fields.weightG)}
              inputMode="decimal"
              unit="g"
              onCommit={(text) => {
                const grams = Number(text.replace(',', '.'));
                if (text === '') change({ weightG: null });
                else if (Number.isFinite(grams) && grams > 0) change({ weightG: grams });
              }}
            />
          </div>
          <div class="setup-grid">
            <DateField
              id="pk-roast"
              label="Roast date"
              note="required"
              required
              value={fields.roastDate === '' ? null : fields.roastDate}
              onCommit={(date) => {
                if (date !== null) change({ roastDate: date });
              }}
            />
            <DateField
              id="pk-open"
              label="Open date"
              value={fields.openDate}
              onCommit={(openDate) => change({ openDate })}
            />
          </div>
        </div>
      </section>

      <Flavours
        own={fields.flavours}
        others={others}
        onChange={(edit) => change((current) => ({ flavours: edit(current.flavours) }))}
      />

      {pack === null ? (
        <button
          type="button"
          class="btn"
          disabled={!ready}
          onClick={() => {
            const added = entities.add('packs', {
              ...draft,
              name: draft.name.trim(),
              finishedDate: null,
              buyAgain: null,
            });
            // The first pack added is the one in use, until the beans phase picks (T2.2).
            if (services.brew.preferences.value.pack === null) {
              services.brew.preferences.setPack(added.id);
            }
            location.replace(setupHash({ section: 'pack', packId: added.id }, mock));
          }}
          data-testid="save-pack"
        >
          Add pack
        </button>
      ) : pack.finishedDate !== null ? (
        <div class="card pack-finished-card">
          <span>Finished {dateLabel(pack.finishedDate, today)}</span>
          <BuyAgain value={pack.buyAgain} />
          <button
            type="button"
            class="btn2"
            onClick={() =>
              entities.update('packs', pack.id, { finishedDate: null, buyAgain: null })
            }
          >
            Not finished
          </button>
        </div>
      ) : finishing ? (
        <div class="card">
          <FinishPanel
            pack={pack}
            onFinish={(buyAgain) => {
              entities.update('packs', pack.id, { finishedDate: today, buyAgain });
              setFinishing(false);
            }}
            onCancel={() => setFinishing(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          class="btn2"
          style={{ width: '100%' }}
          onClick={() => setFinishing(true)}
          data-testid="finish"
        >
          Finish pack
        </button>
      )}

      {pack !== null && (
        <button
          type="button"
          class="btn2 setup-remove"
          onClick={() => {
            entities.update('packs', pack.id, { removedAtEpochMs: Date.now() });
            location.replace(back.href);
          }}
        >
          Remove pack
        </button>
      )}
    </SetupPage>
  );
}

/** The flavours (board Setup-Pack): the pack's own on, other packs' off, and Add flavour. */
function Flavours({
  own,
  others,
  onChange,
}: {
  own: readonly string[];
  others: readonly string[];
  /** Changes the flavours as they are when it applies. */
  onChange: (edit: (flavours: readonly string[]) => readonly string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const add = (): void => {
    const name = text.trim().replace(/\s+/g, ' ');
    const same = (f: string) => f.toLocaleLowerCase() === name.toLocaleLowerCase();
    if (name !== '' && !own.some(same)) {
      onChange((flavours) => (flavours.some(same) ? flavours : [...flavours, name]));
    }
    setText('');
    setAdding(false);
  };
  return (
    <section class="setup-section" aria-labelledby="pk-fl">
      <h2 class="lbl setup-label" id="pk-fl">
        Flavours
      </h2>
      <div class="card chips" role="group" aria-labelledby="pk-fl">
        {own.map((flavour) => (
          <button
            key={`on-${flavour}`}
            type="button"
            class="chip on"
            aria-pressed="true"
            onClick={() => onChange((flavours) => flavours.filter((f) => f !== flavour))}
          >
            {flavour}
          </button>
        ))}
        {others.map((flavour) => (
          <button
            key={`off-${flavour}`}
            type="button"
            class="chip"
            aria-pressed="false"
            onClick={() =>
              onChange((flavours) =>
                flavours.includes(flavour) ? flavours : [...flavours, flavour],
              )
            }
          >
            {flavour}
          </button>
        ))}
        {adding ? (
          <input
            class="input chip-input"
            type="text"
            aria-label="New flavour"
            value={text}
            autoFocus
            onInput={(event) => setText(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') add();
              if (event.key === 'Escape') setAdding(false);
            }}
            onBlur={add}
          />
        ) : (
          <button type="button" class="chip add" onClick={() => setAdding(true)}>
            + Add flavour
          </button>
        )}
      </div>
    </section>
  );
}
