// Home (T1.23; board Main; spec v2 "App structure and look"), the landing page: the scale's
// status, with its live weight and Tare once connected; the last shot with a small graph; and
// the last seven days' count, averages and tastes. The container on the scale (T2.4), the
// maintenance reminder (T2.10) and the scale's mode warning (T1.25) come with their tasks.
//
// The weight is the scale's latest reading, from the link's live shot (display-only, hard rule
// 3). Tare sends the whitelisted `01` through the recorder, which logs it. The figures come from
// the history's entries, from the analysis's cache (D-047, D-070). As the landing page, Home
// gets the link first, so the scale's reconnect starts here (T1.21).

import { useMemo, useState } from 'preact/hooks';
import type { ScaleLink } from '../../app/links';
import type { RecorderState } from '../../app/recorder';
import { connectionView } from '../../app/scale-connector';
import type { AppServices } from '../../app/startup';
import { tare } from '../../core/protocol';
import { tenths } from '../brew/format';
import { CONNECTION_LABEL, ConnectBody } from '../brew/parts';
import { LoadFailures, Taste, useHistoryLoad } from '../history/parts';
import type { Sparkline } from '../history/plot';
import { dayLabel } from '../history/rows';
import { BatteryIcon, ScaleIcon } from '../icons';
import { BackupNotice, RecorderWarnings } from '../notices';
import { linkSpecFor, pageHash, shotHash, type Mock, type Route } from '../route';
import { TabBar } from '../TabBar';
import { useLiveUpdates } from '../use-live-updates';
import { homeSummary, type LastShot, type Week } from './summary';
import './home.css';

/** The reason Home's Tare is logged with, on its `command-sent`. */
const HOME_TARE_REASON = 'home';

export function HomeScreen({ services, route }: { services: AppServices; route: Route }) {
  const link = services.links.get(linkSpecFor(route));
  const { transport, recorder, connector } = link;
  useLiveUpdates(
    (notify) => {
      const offs = [
        transport.onStatus(notify),
        connector.onChange(notify),
        recorder.onChange(notify),
      ];
      return () => offs.forEach((off) => off());
    },
    [link],
    100,
  );
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
        <ScaleCard link={link} state={state} />

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
 * The scale: its name and connection, then its battery, live weight and Tare once connected.
 * Otherwise what the brew screen's card offers: connect, stop waiting, choose, or reload.
 */
function ScaleCard({ link, state }: { link: ScaleLink; state: RecorderState }) {
  const [tareError, setTareError] = useState<string | null>(null);
  const { transport, connector } = link;
  const status = transport.status;
  const view = connectionView(status, connector.state);
  const connected = status.state === 'connected';
  const name = connected ? status.connection.device.name : (connector.state.known?.name ?? null);
  const battery = connected ? (state.stats?.lastWeight?.frame.batteryPct ?? null) : null;
  const readingG = connected ? link.shot.snapshot().readingG : null;

  function sendTare(): void {
    setTareError(null);
    // The recorder logs it: command-sent, or command-failed with the error.
    link.recorder
      .sendCommand(tare(), HOME_TARE_REASON)
      .catch((error: unknown) =>
        setTareError(error instanceof Error ? error.message : String(error)),
      );
  }

  return (
    <section class="card scale" aria-label="Scale" data-testid="scale" data-view={view}>
      <div class="scale-head">
        <ScaleIcon />
        <span class="scale-id">
          <span class="scale-name" data-testid="scale-name">
            {name ?? 'Scale'}
          </span>
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
            <button type="button" class="btn2" onClick={sendTare} data-testid="tare">
              Tare
            </button>
          </div>
          {tareError !== null && (
            <p class="muted scale-error" role="alert">
              The tare didn't reach the scale: {tareError}
            </p>
          )}
        </div>
      ) : (
        <div class="scale-body connect-body">
          <ConnectBody view={view} state={connector.state} connector={connector} />
        </div>
      )}
    </section>
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
