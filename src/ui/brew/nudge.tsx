// The taste nudge (T2.12; board Brew-Beans; spec v2 "Nudge, and learning later"): when the last
// shot with this brew's machine, grinder and coffee pack was graded sour or bitter, the beans and
// grind phases say which way to grind, under that shot's day, time and grind setting. The ✕
// dismisses it until another shot brings one (D-084). It repeats the user's own taste: which
// shot, and which way, is `tasteNudge` (pure).

import type { HistoryEntry } from '../../app/history';
import type { AppServices } from '../../app/startup';
import { tasteNudge } from '../../core/model';
import { useHistoryLoad } from '../history/parts';
import { weekdayLabel } from '../history/rows';
import { CloseIcon } from '../icons';
import { settingLabel } from '../setup/format';
import { useLiveUpdates } from '../use-live-updates';
import { grinderWord, timeOfDay } from './format';

/** The nudge from the history, loaded here: for a view that doesn't load it otherwise. */
export function LoadedTasteNudge({ services }: { services: AppServices }) {
  const loaded = useHistoryLoad(services, () => services.history.load(), [], { shots: true });
  return (
    <TasteNudgeCard
      services={services}
      entries={loaded.state === 'ready' ? loaded.value.entries : null}
    />
  );
}

/** The nudge from `entries` (newest first); nothing while they load, or without a nudge. */
export function TasteNudgeCard({
  services,
  entries,
}: {
  services: AppServices;
  entries: readonly HistoryEntry[] | null;
}) {
  useLiveUpdates((notify) => services.nudge.onChange(notify), [services]);
  if (entries === null) return null;
  const { machine, grinder, pack } = services.brew.preferences.value;
  const nudge = tasteNudge(
    entries.map((entry) => entry.shot),
    { machineId: machine?.id ?? null, grinderId: grinder?.id ?? null, packId: pack?.id ?? null },
  );
  if (nudge === null || nudge.shotId === services.nudge.shotId) return null;
  const entry = entries.find((e) => e.shot.id === nudge.shotId);
  if (entry === undefined) return null;
  const setting = entry.shot.grindSetting;
  return (
    <section class="card nudge" aria-label="Taste nudge" data-testid="nudge">
      <div class="nudge-head">
        <span class={`dot bg-${nudge.taste}`} />
        <span class="muted nudge-meta">
          {weekdayLabel(entry.atEpochMs)} {timeOfDay(entry.atEpochMs)}
          {grinder !== null && setting !== null && (
            <>
              {' · '}
              {grinderWord(grinder)}{' '}
              <span class="num">{settingLabel(setting.kind, setting.value)}</span>
            </>
          )}
        </span>
        <button
          type="button"
          class="nudge-dismiss"
          aria-label="Dismiss"
          onClick={() => void services.nudge.dismiss(nudge.shotId)}
          data-testid="nudge-dismiss"
        >
          <CloseIcon size={18} />
        </button>
      </div>
      <p class="nudge-text" data-testid="nudge-text">
        Last time it was {nudge.taste}: grind a little {nudge.grind} for a more balanced cup.
      </p>
    </section>
  );
}
