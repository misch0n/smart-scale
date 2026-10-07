// Home (T1.23; board Main; spec v2 "App structure and look"), the landing page: the scale's
// status, with its live weight, Tare and the scale's timer button (T2.27) once connected, a
// caution line under them when the
// scale isn't in its timer mode (T1.25), and which container is on it (T2.4): a known one put
// down while Home shows opens the brew on its phase (T2.16); the maintenance due, a row each
// (T2.10); the last shot with a small graph; and the last seven days' count, averages and
// tastes.
//
// The weight is the scale's latest reading, from the link's live shot (display-only, hard rule
// 3). Tare sends the whitelisted `01` through the recorder, which logs it. The figures come from
// the history's entries, from the analysis's cache (D-047, D-070). As the landing page, Home
// gets the link first, so the scale's reconnect starts here (T1.21).

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ScaleLink } from '../../app/links';
import type { RecorderState } from '../../app/recorder';
import { connectionView } from '../../app/scale-connector';
import { SCALE_NAME_MAX, type ScaleNames } from '../../app/scale-names';
import type { AppServices } from '../../app/startup';
import {
  isListed,
  maintenanceItems,
  maintenanceReminders,
  type ContainerRole,
} from '../../core/model';
import { tare } from '../../core/protocol';
import { tenths } from '../brew/format';
import { CONNECTION_LABEL, ConnectBody } from '../brew/parts';
import { LoadFailures, Taste, useHistoryLoad } from '../history/parts';
import type { Sparkline } from '../history/plot';
import { dayLabel } from '../history/rows';
import { BatteryIcon, PutDownIcon, ScaleIcon, VesselIcon, WarningIcon } from '../icons';
import { BackupNotice, MODE_WARNING, RecorderWarnings } from '../notices';
import { linkSpecFor, pageHash, setupHash, shotHash, type Mock, type Route } from '../route';
import { todayDate } from '../setup/format';
import { MaintenanceRow } from '../setup/MaintenanceBlock';
import { TabBar } from '../TabBar';
import { useLiveUpdates } from '../use-live-updates';
import { onScaleAtOpen, opensBrew } from './put-down';
import { TIMER_LABEL, TimerWatch, timerAction, timerCommand } from './timer';
import { homeSummary, type LastShot, type Week } from './summary';
import './home.css';

/** The reason Home's Tare is logged with, on its `command-sent`. */
const HOME_TARE_REASON = 'home';

/** The reason Home's timer button is logged with (T2.27). */
const HOME_TIMER_REASON = 'home-timer';

export function HomeScreen({ services, route }: { services: AppServices; route: Route }) {
  const link = services.links.get(linkSpecFor(route));
  const { transport, recorder, connector, mode, vessel } = link;
  useLiveUpdates(
    (notify) => {
      const offs = [
        transport.onStatus(notify),
        connector.onChange(notify),
        recorder.onChange(notify),
        mode.onChange(notify),
        vessel.onChange(notify),
        services.entities.onChange(notify),
        services.scaleNames.onChange(notify),
      ];
      return () => offs.forEach((off) => off());
    },
    [link],
    100,
  );
  useBrewOnPutDown(link, route.mock);
  const loaded = useHistoryLoad(services, () => services.history.load(), [], { shots: true });
  const today = dayLabel(Date.now());
  // Again at midnight too: the week moves on.
  const summary = useMemo(
    () => (loaded.state === 'ready' ? homeSummary(loaded.value.entries, Date.now()) : null),
    [loaded, today],
  );
  const state = recorder.state;

  return (
    <>
      <main class="home" data-testid="home">
        <div class="home-top">
          <h1 class="ttl">Home</h1>
          <span class="lbl" data-testid="today">
            {today}
          </span>
        </div>
        {route.problems.map((problem) => (
          <p key={problem} class="card notice warn">
            {problem}
          </p>
        ))}
        <RecorderWarnings state={state} />
        <BackupNotice autoExport={services.autoExport} mock={route.mock} />
        <ScaleCard link={link} state={state} names={services.scaleNames} mock={route.mock} />
        <MaintenanceCard services={services} mock={route.mock} />

        {loaded.state === 'loading' && <p class="muted">Reading the shots…</p>}
        {loaded.state === 'failed' && (
          <div class="card notice warn" role="alert">
            The shots couldn't be read: {loaded.message}
          </div>
        )}
        {loaded.state === 'ready' && <LoadFailures failures={loaded.value.failures} />}
        {summary !== null &&
          (summary.last === null ? (
            <div class="card home-empty" data-testid="home-empty">
              <span class="lbl">Last shot</span>
              <span class="muted">No shots yet.</span>
            </div>
          ) : (
            <>
              <LastShotCard last={summary.last} mock={route.mock} />
              <WeekCard week={summary.week} mock={route.mock} />
            </>
          ))}
      </main>
      <TabBar current="home" mock={route.mock} />
    </>
  );
}

/**
 * A known container put down while Home shows opens the brew, which routes it to its phase (Q31,
 * T2.16; spec v2: "Placing a known container opens its phase"): recognised as it goes on, or
 * picked here. The vessel on the scale as Home opened doesn't, so a brew ended with its cup still
 * on doesn't bounce back.
 */
function useBrewOnPutDown(link: ScaleLink, mock: Mock): void {
  useEffect(() => {
    const atOpen = onScaleAtOpen(link.vessel.onScale);
    return link.vessel.onChange(() => {
      if (opensBrew(link.vessel.onScale, atOpen)) location.assign(pageHash('brew', mock));
    });
  }, [link, mock]);
}

/**
 * The maintenance due (board Main: "Descale · 4 days overdue ›"), a row each, the most overdue
 * first; nothing when none is. A machine's dates name it only when there is more than one.
 */
function MaintenanceCard({ services, mock }: { services: AppServices; mock: Mock }) {
  const { machines, grinders } = services.entities.value;
  const due = maintenanceReminders(maintenanceItems(machines, grinders, todayDate()), {
    soon: false,
  });
  if (due.length === 0) return null;
  const machineCount = machines.filter(isListed).length;
  return (
    <section class="card" aria-label="Maintenance" data-testid="maintenance">
      {due.map((item) => (
        <MaintenanceRow
          key={`${item.owner.id}-${item.kind}`}
          item={item}
          named={item.owner.entity === 'grinders' || machineCount > 1}
          mock={mock}
        />
      ))}
    </section>
  );
}

/**
 * The scale's name (T2.30, D-102): the user's, else the one it advertises. A tap opens a field to
 * rename it; Enter or leaving the field keeps the name, Escape doesn't, and a blank name gives the
 * scale its own back. Kept in the settings for the next sessions (`ScaleNames`).
 */
function ScaleName({ names, advertised }: { names: ScaleNames; advertised: string | null }) {
  const [editing, setEditing] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  /** Escape: the field closes, and its blur as it goes keeps nothing. */
  const cancelled = useRef(false);
  // Into the field as it opens, for the keyboard to come up (autofocus only works on a load).
  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);
  const label = names.label(advertised, 'Scale');
  if (!editing) {
    return (
      <button
        type="button"
        class="scale-name"
        onClick={() => {
          // Here, not in the effect: that can run after a fast Escape, and undo it.
          cancelled.current = false;
          setEditing(true);
        }}
        aria-label={`${label}: rename`}
        data-testid="scale-name"
      >
        {label}
      </button>
    );
  }
  return (
    <input
      ref={field}
      class="input scale-name-input"
      type="text"
      aria-label="Scale name"
      value={names.nameOf(advertised) ?? ''}
      placeholder={advertised ?? 'Scale'}
      maxLength={SCALE_NAME_MAX}
      enterKeyHint="done"
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          cancelled.current = true;
          setEditing(false);
        }
      }}
      onBlur={(event) => {
        if (!cancelled.current) names.rename(advertised, event.currentTarget.value);
        setEditing(false);
      }}
      data-testid="scale-name-input"
    />
  );
}

/**
 * The scale: its name and connection, then its battery, live weight and Tare once connected,
 * with the mode warning under them (T1.25: no board has it, so it is a caution line like board
 * Brew-Milk's), and the container on it (T2.4). Otherwise what the brew screen's card offers:
 * connect, stop waiting, choose, or reload.
 */
function ScaleCard({
  link,
  state,
  names,
  mock,
}: {
  link: ScaleLink;
  state: RecorderState;
  names: ScaleNames;
  mock: Mock;
}) {
  const [tareError, setTareError] = useState<string | null>(null);
  const watch = useMemo(() => new TimerWatch(), [link]);
  const { transport, connector } = link;
  const status = transport.status;
  const view = connectionView(status, connector.state);
  const connected = status.state === 'connected';
  const advertised = connected
    ? status.connection.device.name
    : (connector.state.known?.name ?? null);
  const battery = connected ? (state.stats?.lastWeight?.frame.batteryPct ?? null) : null;
  const readingG = connected ? link.shot.snapshot().readingG : null;
  const lastWeight = connected ? (state.stats?.lastWeight ?? null) : null;
  if (lastWeight !== null) watch.observe(lastWeight.tMs, lastWeight.frame.timerMs);
  const action = timerAction(watch.timerMs ?? 0, watch.running);

  function send(command: ReturnType<typeof tare>, reason: string): void {
    setTareError(null);
    // The recorder logs it: command-sent, or command-failed with the error.
    link.recorder
      .sendCommand(command, reason)
      .catch((error: unknown) =>
        setTareError(error instanceof Error ? error.message : String(error)),
      );
  }

  return (
    <section class="card scale" aria-label="Scale" data-testid="scale" data-view={view}>
      <div class="scale-head">
        <ScaleIcon />
        <span class="scale-id">
          <ScaleName names={names} advertised={advertised} />
          <span class="muted scale-state" data-testid="scale-state">
            <span class={connected ? 'dot dot-ok' : 'dot dot-off'} />
            {CONNECTION_LABEL[view]}
          </span>
        </span>
        {battery !== null && (
          <span
            class="muted scale-battery"
            role="img"
            aria-label={`Battery ${battery} %`}
            data-testid="battery"
          >
            <BatteryIcon pct={battery} />
            <span class="num">{battery}</span> %
          </span>
        )}
      </div>
      {connected ? (
        <div class="scale-body">
          <div class="scale-weight">
            <span class="scale-reading">
              <span class="num" data-testid="weight">
                {readingG === null ? '–' : tenths(readingG)}
              </span>
              {readingG !== null && <span class="unit"> g</span>}
            </span>
            <span class="scale-buttons">
              <button
                type="button"
                class="btn2"
                onClick={() => send(timerCommand(action), HOME_TIMER_REASON)}
                data-testid="timer"
                data-action={action}
              >
                {TIMER_LABEL[action]}
              </button>
              <button
                type="button"
                class="btn2"
                onClick={() => send(tare(), HOME_TARE_REASON)}
                data-testid="tare"
              >
                Tare
              </button>
            </span>
          </div>
          {tareError !== null && (
            <p class="muted scale-error" role="alert">
              The command didn't reach the scale: {tareError}
            </p>
          )}
        </div>
      ) : (
        <div class="scale-body connect-body">
          <ConnectBody view={view} state={connector.state} connector={connector} />
        </div>
      )}
      {connected && link.mode.state.verdict === 'not-timer' && (
        <p class="scale-caution c-caution" role="status" data-testid="mode-warning">
          <WarningIcon size={16} />
          <span>{MODE_WARNING}</span>
        </p>
      )}
      {connected && <ContainerRow link={link} mock={mock} />}
    </section>
  );
}

/** The phase a container opens, by its roles (T2.5): what the brew screen goes to. */
function opensPhase(roles: readonly ContainerRole[]): string {
  if (roles.includes('milk')) return 'Milk';
  if (roles.includes('cup')) return 'Extraction';
  if (roles.includes('bean')) return 'Beans';
  return 'Grind';
}

/**
 * The container on the scale (board Main; T2.4): put one down, or the one recognised, which
 * opens the brew on its phase (T2.5). When two could be it, the user picks one; one the app
 * doesn't know can be learned in Setup. Neither of those is drawn on a board.
 */
function ContainerRow({ link, mock }: { link: ScaleLink; mock: Mock }) {
  const onScale = link.vessel.onScale;
  if (onScale === null) {
    return (
      <div class="scale-container" data-testid="container-row" data-state="none">
        <PutDownIcon class="muted" />
        <span class="scale-container-text">
          <span>Put a container down</span>
          <span class="muted scale-container-note">A known container opens its phase</span>
        </span>
      </div>
    );
  }
  const { container, match, vessel } = onScale;
  if (container !== null) {
    return (
      <a
        class="scale-container"
        href={pageHash('brew', mock)}
        data-testid="container-row"
        data-state="known"
      >
        <VesselIcon class="c-accent" />
        <span class="scale-container-text">
          <span class="scale-container-name" data-testid="container-name">
            {container.name}
          </span>
          <span class="muted scale-container-note">
            {onScale.picked === null ? 'Recognised' : 'Picked'} · opens{' '}
            {opensPhase(container.roles)}
          </span>
        </span>
        <span class="chev" aria-hidden="true">
          ›
        </span>
      </a>
    );
  }
  if (match.kind === 'ambiguous') {
    return (
      <div class="scale-container" data-testid="container-row" data-state="ambiguous">
        <VesselIcon class="muted" />
        <span class="scale-container-text">
          <span>
            Which container is it?{' '}
            <span class="muted">
              <span class="num">{tenths(vessel.massG)}</span> g
            </span>
          </span>
          <span class="scale-container-picks" role="group" aria-label="Which container is it?">
            {match.candidates.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                class="chip"
                onClick={() => link.vessel.pick(candidate.id)}
              >
                {candidate.name}
              </button>
            ))}
          </span>
        </span>
      </div>
    );
  }
  return (
    <a
      class="scale-container"
      href={setupHash({ section: 'containers' }, mock)}
      data-testid="container-row"
      data-state="unknown"
    >
      <VesselIcon class="muted" />
      <span class="scale-container-text">
        <span>
          Not a known container ·{' '}
          <span class="num" data-testid="container-mass">
            {tenths(vessel.massG)}
          </span>{' '}
          g
        </span>
        <span class="muted scale-container-note">Learn it in Setup</span>
      </span>
      <span class="chev" aria-hidden="true">
        ›
      </span>
    </a>
  );
}

/** The last shot (board Main): when, the drink and its taste, a small graph and three figures. */
function LastShotCard({ last, mock }: { last: LastShot; mock: Mock }) {
  return (
    <a class="card last-shot" href={shotHash(last.id, mock)} data-testid="last-shot">
      <span class="last-shot-line">
        <span class="lbl">Last shot</span>
        <span class="muted last-shot-when" data-testid="last-shot-when">
          {last.day} <span class="num">{last.time}</span>
        </span>
      </span>
      <span class="last-shot-line last-shot-drink">
        <span class="last-shot-name">{last.drink}</span>
        <Taste direction={last.taste} />
      </span>
      <HomeSpark spark={last.spark} />
      <span class="figures">
        <Figure label="Yield" value={last.yieldG} unit="g" testId="last-yield" />
        <Figure label="Ratio" value={last.ratio} unit="" testId="last-ratio" />
        <Figure label="First drip" value={last.firstDripS} unit="s" testId="last-first-drip" />
      </span>
    </a>
  );
}

/** The last shot's graph (board Main): the weight from pump on, and the target dashed. */
function HomeSpark({ spark }: { spark: Sparkline | null }) {
  const line = { fill: 'none', vectorEffect: 'non-scaling-stroke' } as const;
  return (
    <svg class="home-spark" viewBox="0 0 1000 500" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 499H1000" style={{ ...line, stroke: 'var(--rule)', strokeWidth: 1 }} />
      {spark?.targetY != null && (
        <path
          d={`M0 ${spark.targetY}H1000`}
          style={{ ...line, stroke: 'var(--mark)', strokeWidth: 1, strokeDasharray: '4 4' }}
        />
      )}
      {spark !== null && (
        <path
          d={spark.weight}
          style={{ ...line, stroke: 'var(--line-a)', strokeWidth: 2, strokeLinejoin: 'round' }}
        />
      )}
    </svg>
  );
}

/** A figure with its label above it; a dash when the analysis has none. */
function Figure({
  label,
  value,
  unit,
  testId,
}: {
  label: string;
  value: string | null;
  unit: string;
  testId: string;
}) {
  return (
    <span class="figure">
      <span class="lbl">{label}</span>
      <span class="num" data-testid={testId}>
        {value ?? '–'}
      </span>
      {value !== null && unit !== '' && <span class="unit"> {unit}</span>}
    </span>
  );
}

/** The last seven days (board Main): the count, three averages, the tastes and channelling. */
function WeekCard({ week, mock }: { week: Week; mock: Mock }) {
  const { tastes } = week;
  const tasteText = `${tastes.sour} sour, ${tastes.balanced} balanced, ${tastes.bitter} bitter`;
  return (
    <section class="card week" aria-label="Last 7 days" data-testid="week">
      <div class="week-head">
        <h2 class="lbl">Last 7 days</h2>
        <a class="link" href={pageHash('history', mock)}>
          History ›
        </a>
      </div>
      <div class="week-grid">
        <WeekTile label="Shots" value={String(week.shots)} unit="" testId="week-shots" />
        <WeekTile label="Average ratio" value={week.ratio} unit="" testId="week-ratio" />
        <WeekTile
          label="Average first drip"
          value={week.firstDripS}
          unit="s"
          testId="week-first-drip"
        />
        <WeekTile
          label="Average extraction"
          value={week.extractionS}
          unit="s"
          testId="week-extraction"
        />
      </div>
      {(week.graded > 0 || week.channelled > 0) && (
        <div class="week-taste" data-testid="week-taste">
          <span class="lbl">Taste</span>
          {week.graded > 0 && (
            <div class="taste-bar" role="img" aria-label={`Taste: ${tasteText}`}>
              {(['sour', 'balanced', 'bitter'] as const).map(
                (direction) =>
                  tastes[direction] > 0 && (
                    <span
                      key={direction}
                      class={`bg-${direction}`}
                      style={{ flex: `${tastes[direction]} 1 0` }}
                    />
                  ),
              )}
            </div>
          )}
          <div class="taste-legend">
            {week.graded > 0 && (
              <>
                <span class="c-sour">{tastes.sour} sour</span>
                <span class="c-balanced">{tastes.balanced} balanced</span>
                <span class="c-bitter">{tastes.bitter} bitter</span>
              </>
            )}
            {week.channelled > 0 && (
              <span class="muted taste-channelled">{week.channelled} channelled</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function WeekTile({
  label,
  value,
  unit,
  testId,
}: {
  label: string;
  value: string | null;
  unit: string;
  testId: string;
}) {
  return (
    <div>
      <span class="lbl">{label}</span>
      <span class="week-value">
        <span class="num" data-testid={testId}>
          {value ?? '–'}
        </span>
        {value !== null && unit !== '' && <span class="unit"> {unit}</span>}
      </span>
    </div>
  );
}
