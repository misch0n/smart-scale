// The brew flow (T1.18, spec v2 "Brew phases"), in focus mode, without the tab bar: ✕ ends the
// session and goes Home (T1.23). The extraction screen, waiting for the Tare + start tap (board
// Brew-Ready); the live view while the shot pours (Brew-Shot); then the shot card (Brew-Finish)
// until it is saved. Until the other phases exist (T2.5–T2.11), the extraction is the only one,
// so there is no phase stepper.
//
// The live figures come from the link's live shot (display-only, hard rule 3); the card's
// results from the analysis. The flow (src/app/brew-flow.ts) answers the live shot while this
// screen is shown: the cup's tare, "shot done", the stored shot.

import { useEffect } from 'preact/hooks';
import type { ScaleLink } from '../../app/links';
import type { RecorderState } from '../../app/recorder';
import { connectionView } from '../../app/scale-connector';
import type { AppServices } from '../../app/startup';
import { CloseIcon } from '../icons';
import { BackupNotice, RecorderWarnings, ScaleModeNotice } from '../notices';
import { linkSpecFor, pageHash, type Route } from '../route';
import { useLiveUpdates } from '../use-live-updates';
import { LiveView } from './LiveView';
import { CONNECTION_LABEL } from './parts';
import { ReadyView } from './ReadyView';
import { ShotCardView } from './ShotCardView';
import './brew.css';

/** Which board shows. */
export type BrewView = 'ready' | 'live' | 'card';

export function BrewScreen({ services, route }: { services: AppServices; route: Route }) {
  const link = services.links.get(linkSpecFor(route));
  const flow = services.brew.get(link);
  const preferences = services.brew.preferences;
  const { transport, recorder, connector } = link;

  // The flow answers the live shot while the screen is shown.
  useEffect(() => flow.attach(), [flow]);
  useLiveUpdates(
    (notify) => {
      const offs = [
        transport.onStatus(notify),
        connector.onChange(notify),
        recorder.onChange(notify),
        flow.onChange(notify),
        preferences.onChange(notify),
      ];
      return () => offs.forEach((off) => off());
    },
    [link, flow, preferences],
    100,
  );

  const display = link.shot.snapshot();
  const { card, error } = flow.state;
  const pouring = display.phase === 'running' || display.phase === 'tail';
  const view: BrewView = card !== null ? 'card' : pouring ? 'live' : 'ready';
  const recorderState = recorder.state;

  return (
    <main class="brew" data-testid="brew" data-view={view} data-phase={display.phase}>
      <TopBar link={link} state={recorderState} home={pageHash('home', route.mock)} />
      <RecorderWarnings state={recorderState} />
      {error !== null && (
        <div class="card notice warn" role="alert" data-testid="brew-error">
          {error}
        </div>
      )}
      {preferences.writeError !== null && (
        <div class="card notice caution" data-testid="preferences-error">
          Your recipe, dose or tags couldn't be stored: {preferences.writeError}
        </div>
      )}
      <ScaleModeNotice mode={link.mode} />
      <BackupNotice autoExport={services.autoExport} mock={route.mock} />
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

/** End session, and the scale's status: connected with its battery, or what it waits for. */
function TopBar({ link, state, home }: { link: ScaleLink; state: RecorderState; home: string }) {
  const view = connectionView(link.transport.status, link.connector.state);
  const battery = state.stats?.lastWeight?.frame.batteryPct ?? null;
  return (
    <div class="brew-top">
      <a class="brew-close" href={home} aria-label="End session">
        <CloseIcon />
      </a>
      <span class="badge" style={{ gap: '6px' }} data-testid="scale-status">
        {view === 'connected' ? (
          <>
            <span class="dot bg-balanced" />
            Scale{battery === null ? '' : ` · ${battery}%`}
          </>
        ) : (
          <>
            <span class="dot dot-off" />
            {CONNECTION_LABEL[view]}
          </>
        )}
      </span>
    </div>
  );
}
