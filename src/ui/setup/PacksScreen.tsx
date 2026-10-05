// The coffee packs (T2.9; board Setup-Packs; spec v2 "Coffee packs"): open, unopened and
// finished. An unopened pack is opened with a tap (today), an open one finished in place with the
// optional "would buy again" (Q5, D-042); each opens its own page. No stock is kept (D-053).

import { useState } from 'preact/hooks';
import type { AppServices } from '../../app/startup';
import type { CoffeePack } from '../../core/model';
import { PlusIcon } from '../icons';
import { setupHash, type Route } from '../route';
import { dateLabel, daysOffRoast, packGroups, packSubtitle, packTitle, todayDate } from './format';
import { SetupPage, useSetupUpdates } from './parts';

export function PacksScreen({ services, route }: { services: AppServices; route: Route }) {
  useSetupUpdates(services);
  const { entities } = services;
  const mock = route.mock;
  const today = todayDate();
  const groups = packGroups(entities.value.packs);
  const [finishing, setFinishing] = useState<string | null>(null);
  const href = (pack: CoffeePack) => setupHash({ section: 'pack', packId: pack.id }, mock);
  const empty =
    groups.open.length === 0 && groups.unopened.length === 0 && groups.finished.length === 0;

  return (
    <SetupPage
      title="Coffee packs"
      back={{ href: setupHash({ section: 'list' }, mock), label: 'Setup' }}
      action={
        <a
          class="btn2"
          href={setupHash({ section: 'pack', packId: null }, mock)}
          data-testid="add-pack"
        >
          <PlusIcon size={18} />
          Add pack
        </a>
      }
      mock={mock}
      services={services}
      testId="setup-packs-screen"
    >
      {empty && <p class="card setup-empty muted">No packs yet. Add the one you're using.</p>}

      {groups.open.length > 0 && (
        <section class="setup-section" aria-labelledby="pks-open">
          <h2 class="lbl setup-label" id="pks-open">
            Open
          </h2>
          {groups.open.map((pack) => (
            <div key={pack.id} class="card" data-testid="pack-open">
              <a class="pack-card" href={href(pack)}>
                <span class="setup-row-top">
                  <span class="setup-row-text">
                    <span class="pack-title">{packTitle(pack)}</span>
                    {packSubtitle(pack) !== null && (
                      <span class="muted setup-small">{packSubtitle(pack)}</span>
                    )}
                  </span>
                  <span class="chev" aria-hidden="true">
                    ›
                  </span>
                </span>
                <span class="pack-dates">
                  <span class="setup-row-text">
                    <span class="lbl">Roasted</span>
                    <span>
                      {dateLabel(pack.roastDate, today)} · day{' '}
                      <span class="num">{daysOffRoast(pack, today)}</span>
                    </span>
                  </span>
                  <span class="setup-row-text">
                    <span class="lbl">Opened</span>
                    <span>{pack.openDate === null ? '–' : dateLabel(pack.openDate, today)}</span>
                  </span>
                </span>
              </a>
              {finishing === pack.id ? (
                <FinishPanel
                  pack={pack}
                  onFinish={(buyAgain) => {
                    entities.update('packs', pack.id, { finishedDate: today, buyAgain });
                    setFinishing(null);
                  }}
                  onCancel={() => setFinishing(null)}
                />
              ) : (
                <div class="pack-foot">
                  <button
                    type="button"
                    class="btn2"
                    onClick={() => setFinishing(pack.id)}
                    data-testid="finish"
                  >
                    Finish
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {groups.unopened.length > 0 && (
        <section class="setup-section" aria-labelledby="pks-new">
          <h2 class="lbl setup-label" id="pks-new">
            Unopened
          </h2>
          {groups.unopened.map((pack) => (
            <div key={pack.id} class="card pack-unopened" data-testid="pack-unopened">
              <a class="setup-row-text pack-link" href={href(pack)}>
                <span class="pack-title">{packTitle(pack)}</span>
                {packSubtitle(pack) !== null && (
                  <span class="muted setup-small">{packSubtitle(pack)}</span>
                )}
                <span class="muted setup-small">
                  Roasted {dateLabel(pack.roastDate, today)} · day {daysOffRoast(pack, today)}
                </span>
              </a>
              <button
                type="button"
                class="btn2"
                style={{ flex: '0 0 auto' }}
                onClick={() => entities.update('packs', pack.id, { openDate: today })}
                data-testid="open-pack"
              >
                Open
              </button>
            </div>
          ))}
        </section>
      )}

      {groups.finished.length > 0 && (
        <section class="setup-section" aria-labelledby="pks-done">
          <h2 class="lbl setup-label" id="pks-done">
            Finished
          </h2>
          <div class="card">
            {groups.finished.map((pack) => (
              <a
                key={pack.id}
                class="row pack-finished"
                href={href(pack)}
                data-testid="pack-finished"
              >
                <span class="setup-row-text">
                  <span style={{ fontWeight: 600 }}>{packTitle(pack)}</span>
                  <span class="muted setup-small">
                    {[packSubtitle(pack), `finished ${dateLabel(pack.finishedDate ?? '', today)}`]
                      .filter((part) => part !== null)
                      .join(' · ')}
                  </span>
                </span>
                <BuyAgain value={pack.buyAgain} />
              </a>
            ))}
          </div>
        </section>
      )}
    </SetupPage>
  );
}

/** "Would buy again", "Wouldn't", or "Not rated". */
export function BuyAgain({ value }: { value: boolean | null }) {
  if (value === null) {
    return (
      <span class="muted setup-small" style={{ flex: '0 0 auto' }}>
        Not rated
      </span>
    );
  }
  return (
    <span class="badge" style={{ flex: '0 0 auto' }}>
      {value ? 'Would buy again' : "Wouldn't buy again"}
    </span>
  );
}

/**
 * Finishing a pack (board Setup-Pack's tweak `finishing`): the optional rating, then Finish pack.
 * Tapping the picked rating clears it.
 */
export function FinishPanel({
  pack,
  onFinish,
  onCancel,
}: {
  pack: CoffeePack;
  onFinish: (buyAgain: boolean | null) => void;
  onCancel: () => void;
}) {
  const [rating, setRating] = useState<boolean | null>(null);
  const choice = (value: boolean, label: string) => (
    <button
      type="button"
      class={rating === value ? 'chip on' : 'chip'}
      aria-pressed={rating === value}
      onClick={() => setRating(rating === value ? null : value)}
      style={{ flex: '1 1 0', justifyContent: 'center', height: '44px' }}
    >
      {label}
    </button>
  );
  return (
    <section
      class="finish-panel"
      aria-label={`Finish ${packTitle(pack)}`}
      data-testid="finish-panel"
    >
      <h2 class="finish-title">Finish {packTitle(pack)}?</h2>
      <div class="field">
        <span style={{ fontWeight: 600 }}>
          Rate this coffee{' '}
          <span class="muted" style={{ fontWeight: 400 }}>
            (optional)
          </span>
        </span>
        <div role="group" aria-label="Rate this coffee" style={{ display: 'flex', gap: '8px' }}>
          {choice(true, 'Would buy again')}
          {choice(false, "Wouldn't")}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          type="button"
          class="btn2"
          style={{ flex: '0 0 auto', height: '56px', padding: '0 20px' }}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn"
          style={{ flex: '1 1 auto', width: 'auto' }}
          onClick={() => onFinish(rating)}
          data-testid="finish-pack"
        >
          Finish pack
        </button>
      </div>
    </section>
  );
}
