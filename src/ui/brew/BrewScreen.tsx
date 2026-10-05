// The brew flow (T1.18, spec v2 "Brew phases"), in focus mode: the extraction screen, waiting for
// the Tare + start tap (board Brew-Ready); the live view while the shot pours (Brew-Shot); then
// the shot card (Brew-Finish) until it is saved. Until the other phases exist (T2.5–T2.11), the
// extraction is the only one, so there is no phase stepper.
//
// The live figures come from the link's live shot (display-only, hard rule 3); the card's
// results from the analysis. The flow (src/app/brew-flow.ts) answers the live shot while this
// screen is shown: the cup's tare, "shot done", the stored shot.

import { useEffect } from 'preact/hooks';
import type { ScaleLink } from '../../app/links';
import type { RecorderState, RecorderWarning } from '../../app/recorder';
import type { AppServices } from '../../app/startup';
import { wantAutoExportSettings } from '../AutoExportPanel';
import { autoExportReminder } from '../auto-export-text';
import { linkSpecFor, probeHash, type Route } from '../route';
import { useLiveUpdates } from '../use-live-updates';
import { CloseIcon } from './icons';
import { LiveView } from './LiveView';
import { ReadyView } from './ReadyView';
import { ShotCardView } from './ShotCardView';
import './brew.css';

/** Which board shows. */
export type BrewView = 'ready' | 'live' | 'card';

export function BrewScreen({ services, route }: { services: AppServices; route: Route }) {
  const link = services.links.get(linkSpecFor(route));
  const flow = services.brew.get(link);
  const preferences = services.brew.preferences;
  const { transport, recorder } = link;

  // The flow answers the live shot while the screen is shown.
  useEffect(() => flow.attach(), [flow]);
  useLiveUpdates(
    (notify) => {
      const offs = [
        transport.onStatus(notify),
        recorder.onChange(notify),
        flow.onChange(notify),
        preferences.onChange(notify),
        services.autoExport.onChange(notify),
      ];
      return () => offs.forEach((off) => off());
    },
    [link, flow, preferences, services.autoExport],
    100,
  );

  const display = link.shot.snapshot();
  const { card, error } = flow.state;
  const pouring = display.phase === 'running' || display.phase === 'tail';
  const view: BrewView = card !== null ? 'card' : pouring ? 'live' : 'ready';
  const recorderState = recorder.state;

  return (
    <main class="brew" data-testid="brew" data-view={view} data-phase={display.phase}>
      <TopBar link={link} state={recorderState} home={probeHash(route.mock)} />
      <Notices
        services={services}
        route={route}
        warnings={recorderState.warnings}
        storageError={recorderState.storageError}
        error={error}
        preferencesError={preferences.writeError}
      />
      {view === 'card' ? (
        <ShotCardView flow={flow} card={card!} preferences={preferences} />
      ) : view === 'live' ? (
        <LiveView display={display} recipe={preferences.value.recipe} />
      ) : (
        <ReadyView link={link} flow={flow} display={display} preferences={preferences} />
      )}
    </main>
  );
}

/** End session, and the scale's status: connected with its battery, or not. */
function TopBar({ link, state, home }: { link: ScaleLink; state: RecorderState; home: string }) {
  const status = link.transport.status.state;
  const battery = state.stats?.lastWeight?.frame.batteryPct ?? null;
  return (
    <div class="brew-top">
      <a class="brew-close" href={home} aria-label="End session">
        <CloseIcon />
      </a>
      <span class="badge" style={{ gap: '6px' }} data-testid="scale-status">
        {status === 'connected' ? (
          <>
            <span class="dot bg-balanced" />
            Scale{battery === null ? '' : ` · ${battery}%`}
          </>
        ) : (
          <>
            <span class="dot dot-off" />
            {status === 'connecting' ? 'Connecting…' : 'Not connected'}
          </>
        )}
      </span>
    </div>
  );
}

const WARNING_TEXT: Record<Exclude<RecorderWarning, 'storage-failing'>, string> = {
  'unit-not-grams':
    "The scale isn't weighing in grams, so its weights are refused. Set it to grams.",
  'failing-frames': 'Most of what the scale sends is garbled: the readings may be wrong.',
  'smoothing-not-off':
    "The scale's smoothing isn't confirmed off, so the drain after the pump can't be timed.",
};

function Notices({
  services,
  route,
  warnings,
  storageError,
  error,
  preferencesError,
}: {
  services: AppServices;
  route: Route;
  warnings: readonly RecorderWarning[];
  storageError: string | null;
  error: string | null;
  preferencesError: string | null;
}) {
  const reminder = autoExportReminder(services.autoExport.status, services.autoExport.settings);
  return (
    <>
      {warnings.map((warning) => (
        <div key={warning} class="card notice warn" role="alert" data-testid="warning">
          {warning === 'storage-failing'
            ? `Storing is failing: ${storageError ?? 'unknown error'}. The records wait in memory; closing the page now would lose them.`
            : WARNING_TEXT[warning]}
        </div>
      ))}
      {error !== null && (
        <div class="card notice warn" role="alert" data-testid="brew-error">
          {error}
        </div>
      )}
      {preferencesError !== null && (
        <div class="card notice caution" data-testid="preferences-error">
          Your recipe, dose or tags couldn't be stored: {preferencesError}
        </div>
      )}
      {reminder !== null && (
        <div class="card notice caution" data-testid="backup-reminder">
          <span>{reminder.text}</span>
          <a class="btn2" href={probeHash(route.mock)} onClick={() => wantAutoExportSettings()}>
            {reminder.action}
          </a>
        </div>
      )}
    </>
  );
}
