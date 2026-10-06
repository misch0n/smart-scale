// The brew flow (T1.18, spec v2 "Brew phases"), in focus mode, without the tab bar: ✕ ends the
// session and goes Home (T1.23), resetting the scale unless the shot card is open (T2.15). The
// phase stepper over the open phase (T2.5): the beans
// (Brew-Beans), the grind (Brew-Grind), the extraction waiting for the Tare + start tap
// (Brew-Ready) and the live view while the shot pours (Brew-Shot); then the shot card
// (Brew-Finish) until it is saved, with the milk (Brew-Milk) when the jug goes down.
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
import { CONNECTION_LABEL, ConnectCard } from './parts';
import { LoadedTasteNudge } from './nudge';
import { BeansView, GrindView, MilkView, PhaseStepper } from './phases';
import { ReadyView } from './ReadyView';
import { ShotCardView } from './ShotCardView';
import './brew.css';

/** Which board shows. */
export type BrewView = 'beans' | 'grind' | 'ready' | 'live' | 'card' | 'milk';

/** A view as the page's title names it, for screen readers. */
const VIEW_TITLE: Readonly<Record<BrewView, string>> = {
  beans: 'beans',
  grind: 'grind',
  ready: 'extraction',
  live: 'the shot',
  card: 'the shot card',
  milk: 'milk',
};

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
        link.vessel.onChange(notify),
        services.entities.onChange(notify),
      ];
      return () => offs.forEach((off) => off());
    },
    [link, flow, preferences],
    100,
  );

  const display = link.shot.snapshot();
  const { card, error } = flow.state;
  const phases = flow.phases;
  const onScale = link.vessel.onScale;
  const pick = (id: string) => link.vessel.pick(id);
  // The scale to connect, in place of the vessel while it isn't connected.
  const connect =
    transport.status.state === 'connected' ? null : (
      <ConnectCard
        view={connectionView(transport.status, connector.state)}
        state={connector.state}
        connector={connector}
      />
    );
  const pouring = display.phase === 'running' || display.phase === 'tail';
  const view: BrewView =
    card !== null
      ? phases.current === 'milk' && phases.status.milk === 'open'
        ? 'milk'
        : 'card'
      : pouring
        ? 'live'
        : phases.current === 'extraction'
          ? 'ready'
          : phases.current;
  const recorderState = recorder.state;

  return (
    <main
      class="brew"
      data-testid="brew"
      data-view={view}
      data-phase={display.phase}
      data-brew-phase={phases.current}
    >
      <TopBar
        link={link}
        state={recorderState}
        home={pageHash('home', route.mock)}
        onEnd={() => flow.end()}
      />
      {/* The card has its title; the phases have the stepper instead (the boards): one for
          screen readers. */}
      {view !== 'card' && <h1 class="sr-only">Brew: {VIEW_TITLE[view]}</h1>}
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
      {view !== 'card' && (
        <PhaseStepper phases={phases} onSelect={(phase) => flow.selectPhase(phase)} />
      )}
      {view === 'card' ? (
        <ShotCardView flow={flow} card={card!} preferences={preferences} />
      ) : view === 'live' ? (
        <LiveView
          display={display}
          recipe={preferences.value.recipe}
          onScale={onScale}
          container={phases.container}
          onPick={pick}
        />
      ) : view === 'beans' ? (
        <BeansView
          flow={flow}
          onScale={onScale}
          preferences={preferences}
          entities={services.entities}
          onPick={pick}
          connect={connect}
          nudge={<LoadedTasteNudge services={services} />}
        />
      ) : view === 'grind' ? (
        <GrindView
          flow={flow}
          onScale={onScale}
          services={services}
          onPick={pick}
          connect={connect}
        />
      ) : view === 'milk' ? (
        <MilkView
          flow={flow}
          card={card}
          onScale={onScale}
          preferences={preferences}
          onPick={pick}
          connect={connect}
        />
      ) : (
        <ReadyView
          link={link}
          flow={flow}
          display={display}
          preferences={preferences}
          onScale={onScale}
          onPick={pick}
        />
      )}
    </main>
  );
}

/** End session, and the scale's status: connected with its battery, or what it waits for. */
function TopBar({
  link,
  state,
  home,
  onEnd,
}: {
  link: ScaleLink;
  state: RecorderState;
  home: string;
  /** ✕ ends the brew as it goes Home. */
  onEnd: () => void;
}) {
  const view = connectionView(link.transport.status, link.connector.state);
  const battery = state.stats?.lastWeight?.frame.batteryPct ?? null;
  return (
    <div class="brew-top">
      <a class="brew-close" href={home} aria-label="End session" onClick={onEnd}>
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
