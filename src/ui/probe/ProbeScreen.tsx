import { useEffect, useRef, useState } from 'preact/hooks';
import type { ConnectionInfo, LinkSpec, ScaleLink } from '../../app/links';
import type { RecorderState, RecorderWarning } from '../../app/recorder';
import type { AppServices } from '../../app/startup';
import type { LoggedFrame, ProbeSnapshot } from '../../core/live';
import { ANNOTATION_LABELS, shortId, type CharacteristicName } from '../../core/model';
import {
  BUZZER_LEVELS,
  flowSmoothingOff,
  hasTrustedWeight,
  keepAlive,
  resetTimer,
  setBuzzer,
  startTimer,
  stopTimer,
  tare,
  tareAndStartTimer,
  toHex,
  type ScaleCommand,
} from '../../core/protocol';
import { tryMicrophone, type MicrophoneResult } from '../../platform/microphone';
import type { WakeLockStatus } from '../../platform/wake-lock';
import { AutoExportPanel } from '../AutoExportPanel';
import { ExportPanel } from '../ExportPanel';
import { probeHash, type Route } from '../route';
import { useLiveUpdates } from '../use-live-updates';
import { EnvironmentPanel } from './EnvironmentPanel';
import {
  byte,
  bytes,
  describeEvent,
  describeFrame,
  gapSummary,
  grams,
  hexLines,
  properties,
  seconds,
  weightSummary,
} from './format';

// The probe (T1.8, D-012): connect, see and record everything the scale sends, send the
// whitelisted commands, annotate, and export. docs/hardware-tests.md runs on it. Rudimentary
// on purpose until T3.5. Everything shown live is display-only (CLAUDE.md hard rule 3); the
// recording holds the frames themselves.

/** The link a route asks for. */
export function linkSpecFor(route: Route): LinkSpec {
  return route.mock ? { kind: 'mock', speed: route.mock.speed } : { kind: 'web-bluetooth' };
}

export function ProbeScreen({ services, route }: { services: AppServices; route: Route }) {
  const link = services.links.get(linkSpecFor(route));
  const { transport, recorder, monitor } = link;
  const [recordingsVersion, setRecordingsVersion] = useState(0);
  const lastConnection = useRef<ConnectionInfo | null>(null);

  useLiveUpdates(
    (notify) => {
      const offs = [
        transport.onStatus((status) => {
          if (status.state === 'connected') lastConnection.current = status.connection;
          notify();
        }),
        recorder.onChange(notify),
        services.wakeLock.onChange(notify),
      ];
      return () => offs.forEach((off) => off());
    },
    [link, services.wakeLock],
  );
  useEffect(
    () => services.links.onRecordingsChanged(() => setRecordingsVersion((v) => v + 1)),
    [services.links],
  );

  if (transport.status.state === 'connected') lastConnection.current = transport.status.connection;
  const state = recorder.state;
  const snapshot = monitor.snapshot();
  const recording = state.recording !== null;

  return (
    <main>
      <h1>Probe</h1>
      <TransportChoice route={route} />
      {route.problems.map((problem) => (
        <p key={problem} class="box warn">
          {problem}
        </p>
      ))}
      <ConnectionPanel
        link={link}
        services={services}
        connection={lastConnection.current}
        wakeLock={services.wakeLock.status}
      />
      <Warnings state={state} />
      <LivePanel state={state} snapshot={snapshot} />
      <CommandPanel link={link} />
      <AnnotationPanel link={link} recording={recording} />
      <StatusPanel state={state} snapshot={snapshot} />
      <WeightPanel snapshot={snapshot} />
      <FramesPanel snapshot={snapshot} source="ff12" />
      <FramesPanel snapshot={snapshot} source="ff11" />
      <EventsPanel snapshot={snapshot} />
      <MicrophonePanel link={link} />
      <ExportPanel
        storage={services.storage}
        refreshKey={recordingsVersion}
        beforeExport={() => services.links.flush()}
        afterImport={() => services.autoExport.recordingsChanged()}
      />
      <AutoExportPanel autoExport={services.autoExport} />
      <EnvironmentPanel
        persistence={services.persistence}
        recovery={services.recovery}
        recoveryError={services.recoveryError}
      />
    </main>
  );
}

function TransportChoice({ route }: { route: Route }) {
  return route.mock ? (
    <p class="box">
      Simulated scale (mock transport) at {route.mock.speed}× speed: two demo shots, then idle.{' '}
      <a href={probeHash(null)}>Use the real scale</a>
      {' · '}
      <a href={probeHash({ speed: route.mock.speed === 1 ? 10 : 1 })}>
        {route.mock.speed === 1 ? '10× speed' : 'Real-time speed'}
      </a>
    </p>
  ) : (
    <p class="muted">
      Real scale over Web Bluetooth. <a href={probeHash({ speed: 1 })}>Use the simulator</a>
    </p>
  );
}

function ConnectionPanel({
  link,
  services,
  connection,
  wakeLock,
}: {
  link: ScaleLink;
  services: AppServices;
  connection: ConnectionInfo | null;
  wakeLock: WakeLockStatus;
}) {
  const { transport, recorder } = link;
  const status = transport.status;
  const [error, setError] = useState<string | null>(null);
  // A getter, checked on each render: the runtime may inject getDevices() late (D-022).
  const reconnect = transport.reconnectKnownDevice;

  function open(start: () => Promise<ConnectionInfo>): void {
    // First, with nothing before it: the device chooser needs this tap's user activation.
    const connecting = start();
    // In the same tap: Safari grants the wake lock only during one.
    services.wakeLock.acquire();
    setError(null);
    connecting.catch((reason: unknown) => setError(errorText(reason)));
  }

  function keepScreenOn(): void {
    services.wakeLock.acquire();
    recorder.logUiAction('keep-screen-on');
  }

  const lastMessage = status.state === 'disconnected' ? status.message : null;
  return (
    <section>
      <h2>Connection</h2>
      <p>
        <button
          type="button"
          disabled={status.state !== 'disconnected'}
          onClick={() => open(() => transport.connect())}
        >
          Connect
        </button>
        {reconnect && (
          <button
            type="button"
            disabled={status.state !== 'disconnected'}
            onClick={() => open(reconnect)}
          >
            Reconnect known device
          </button>
        )}
        <button
          type="button"
          disabled={status.state === 'disconnected'}
          onClick={() => void transport.disconnect()}
        >
          Disconnect
        </button>
      </p>
      <p data-testid="connection-state">
        <strong>{status.state}</strong>
        {status.state === 'disconnected' && status.reason !== null && (
          <>
            {' '}
            (last connection ended: {status.reason}
            {lastMessage ? `: ${lastMessage}` : ''})
          </>
        )}
        {status.state === 'connecting' && ' (Disconnect cancels)'}
      </p>
      {error && error !== lastMessage && <p class="box warn">{error}</p>}
      {connection && (
        <table>
          <tbody>
            <tr>
              <td>{status.state === 'connected' ? 'Device' : 'Last device'}</td>
              <td>
                {connection.device.name ?? '(no name)'}{' '}
                <span class="muted">{connection.device.id ?? ''}</span>
              </td>
            </tr>
            <tr>
              <td>Subscribed</td>
              <td>{connection.subscribed.map((c) => c.toUpperCase()).join(', ')}</td>
            </tr>
            <tr>
              <td>FF11 properties</td>
              <td>{properties(connection.properties.ff11)}</td>
            </tr>
            <tr>
              <td>FF12 properties</td>
              <td>{properties(connection.properties.ff12)}</td>
            </tr>
          </tbody>
        </table>
      )}
      <p data-testid="wake-lock">
        Screen wake lock: {wakeLock.state}
        {wakeLock.error && ` (${wakeLock.error})`}
        {status.state === 'connected' && ['failed', 'released', 'off'].includes(wakeLock.state) && (
          <>
            {' '}
            <button type="button" onClick={keepScreenOn}>
              Keep screen on
            </button>
          </>
        )}
      </p>
    </section>
  );
}

const WARNING_TEXT: Record<Exclude<RecorderWarning, 'storage-failing'>, string> = {
  'smoothing-not-off':
    "Smoothing isn't confirmed off, so the tail fit can't be trusted. Try Smoothing off (08).",
  'failing-frames': 'More than half of the last 50 FF11 frames failed to decode.',
  'unit-not-grams': "The scale's unit isn't grams, so its weights are refused. Set it to grams.",
};

function Warnings({ state }: { state: RecorderState }) {
  if (state.warnings.length === 0) return null;
  return (
    <ul class="box warn" data-testid="warnings">
      {state.warnings.map((warning) => (
        <li key={warning}>
          {warning === 'storage-failing'
            ? `Storing is failing: ${state.storageError ?? 'unknown error'}. The records wait in memory; closing the page now would lose them.`
            : WARNING_TEXT[warning]}
        </li>
      ))}
    </ul>
  );
}

function LivePanel({ state, snapshot }: { state: RecorderState; snapshot: ProbeSnapshot }) {
  const weight = state.stats?.lastWeight?.frame ?? null;
  const event = snapshot.lastEventFrame;
  return (
    <section>
      <h2>Scale</h2>
      {weight === null ? (
        <p>{state.recording === null ? 'Not connected.' : 'No weight frame yet.'}</p>
      ) : (
        <>
          <p class="weight" data-testid="weight">
            {grams(weight.weightG)}
            {!hasTrustedWeight(weight) && ' (refused: unknown unit or sign)'}
          </p>
          <table>
            <tbody>
              <tr>
                <td>Timer (bytes 3–5)</td>
                <td data-testid="timer">{weight.timerMs} ms</td>
              </tr>
              <tr>
                <td>Weight bytes</td>
                <td>
                  sign {byte(weight.weightSignByte)}, value {weight.weightRaw} (× 0.01 g), unit{' '}
                  {byte(weight.unitByte)}
                  {weight.unitOk ? ' (grams)' : ' (NOT grams)'}
                </td>
              </tr>
              <tr>
                <td>Scale's flow</td>
                <td>
                  {weight.flowGps.toFixed(2)} g/s (sign {byte(weight.flowSignByte)}); recorded, not
                  used
                </td>
              </tr>
              <tr>
                <td>Battery</td>
                <td>{weight.batteryPct}%</td>
              </tr>
              <tr>
                <td>Standby (bytes 15–16)</td>
                <td>
                  {weight.standbyMin} min (raw {weight.standbyRaw})
                </td>
              </tr>
              <tr>
                <td>Buzzer, smoothing, reserved</td>
                <td>
                  {byte(weight.buzzerGear)}, {byte(weight.flowSmoothing)}, {byte(weight.reserved)}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}
      {event && (
        <p data-testid="event-frame">
          Last 03 0D event frame, at {seconds(event.tMs)}: {describeFrame(event.frame)}.
        </p>
      )}
    </section>
  );
}

const COMMANDS: readonly { readonly label: string; readonly make: () => ScaleCommand }[] = [
  { label: 'Tare', make: tare },
  { label: 'Start timer', make: startTimer },
  { label: 'Stop timer', make: stopTimer },
  { label: 'Reset timer', make: resetTimer },
  { label: 'Tare + start', make: tareAndStartTimer },
  { label: 'Smoothing off', make: flowSmoothingOff },
  { label: 'Keep-alive', make: keepAlive },
];

function CommandPanel({ link }: { link: ScaleLink }) {
  const [buzzer, setBuzzerLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const connected = link.transport.status.state === 'connected';

  function send(command: ScaleCommand): void {
    setError(null);
    // The recorder logs it: command-sent, or command-failed with the error.
    link.recorder
      .sendCommand(command, 'probe')
      .catch((reason: unknown) => setError(`${command.name}: ${errorText(reason)}`));
  }

  const levels: number[] = [];
  for (let level = BUZZER_LEVELS.min; level <= BUZZER_LEVELS.max; level++) levels.push(level);
  return (
    <section>
      <h2>Commands</h2>
      <p>
        {COMMANDS.map(({ label, make }) => {
          const command = make();
          return (
            <button
              key={label}
              type="button"
              disabled={!connected}
              onClick={() => send(make())}
              title={toHex(command.bytes)}
            >
              {label}
              {command.unverified && ' (unverified)'}{' '}
              <span class="mono">{toHex(command.bytes)}</span>
            </button>
          );
        })}
      </p>
      <p>
        <label>
          Buzzer level{' '}
          <select
            value={buzzer}
            onChange={(event) => setBuzzerLevel(Number(event.currentTarget.value))}
          >
            {levels.map((level) => (
              <option key={level} value={level}>
                {level === 0 ? '0 (mute)' : level}
              </option>
            ))}
          </select>
        </label>{' '}
        <button type="button" disabled={!connected} onClick={() => send(setBuzzer(buzzer))}>
          Set buzzer <span class="mono">{toHex(setBuzzer(buzzer).bytes)}</span>
        </button>
      </p>
      {error && <p class="box warn">{error}</p>}
    </section>
  );
}

const ANNOTATION_BUTTONS = ANNOTATION_LABELS.filter((label) => label !== 'note');

function AnnotationPanel({ link, recording }: { link: ScaleLink; recording: boolean }) {
  const [note, setNote] = useState('');
  return (
    <section>
      <h2>Annotate</h2>
      <p>
        {ANNOTATION_BUTTONS.map((label) => (
          <button
            key={label}
            type="button"
            disabled={!recording}
            onClick={() => link.recorder.annotate(label)}
          >
            {label.replace('-', ' ')}
          </button>
        ))}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const text = note.trim();
          if (text !== '' && link.recorder.annotate('note', text)) setNote('');
        }}
      >
        <input
          type="text"
          value={note}
          placeholder="Note: dose, grind setting…"
          aria-label="Note"
          onInput={(event) => setNote(event.currentTarget.value)}
        />{' '}
        <button type="submit" disabled={!recording || note.trim() === ''}>
          Add note
        </button>
      </form>
    </section>
  );
}

function StatusPanel({ state, snapshot }: { state: RecorderState; snapshot: ProbeSnapshot }) {
  const stats = state.stats;
  const recording = state.recording;
  const { timerGaps } = snapshot;
  return (
    <section>
      <h2>Recording</h2>
      <table data-testid="status">
        <tbody>
          <tr>
            <td>Recording</td>
            <td>
              {recording ? (
                <>
                  <code>{shortId(recording.id)}</code>, started{' '}
                  {new Date(recording.startedAtEpochMs).toLocaleTimeString()}{' '}
                  <span class="muted">{recording.id}</span>
                </>
              ) : (
                'none (not connected)'
              )}
            </td>
          </tr>
          <tr>
            <td>Frames</td>
            <td data-testid="frames">
              {stats
                ? `${stats.frames} (FF11 ${snapshot.counts.ff11}, FF12 ${snapshot.counts.ff12}), ${stats.framesPerSecond.toFixed(1)}/s`
                : '–'}
            </td>
          </tr>
          <tr>
            <td>Timer gaps (A1)</td>
            <td>
              {gapSummary(timerGaps.advancing)}; still {timerGaps.still}, back {timerGaps.backwards}{' '}
              (last 100 weight frames)
            </td>
          </tr>
          <tr>
            <td>FF11 arrival gaps</td>
            <td>{gapSummary(snapshot.arrivalGaps)}</td>
          </tr>
          <tr>
            <td>Longest silence (B4)</td>
            <td>
              {snapshot.longestGap
                ? `${snapshot.longestGap.ms.toFixed(0)} ms, ending at ${seconds(snapshot.longestGap.endTMs)}`
                : '–'}
            </td>
          </tr>
          <tr>
            <td>Failed frames (A16)</td>
            <td data-testid="failures">
              {stats
                ? `${stats.failedFrames} in all; ${stats.recentFailures} of the last 50${stats.failureAlarm ? ': ALARM' : ''}`
                : '–'}
            </td>
          </tr>
          <tr>
            <td>Unit byte (A9)</td>
            <td>
              {stats?.lastWeight
                ? `${byte(stats.lastWeight.frame.unitByte)} (${stats.unitOk ? 'grams' : 'NOT grams'})`
                : '–'}
              ; seen {bytes(snapshot.seen.unit)}
            </td>
          </tr>
          <tr>
            <td>Smoothing (A13)</td>
            <td data-testid="smoothing">
              {stats
                ? `${stats.smoothing.status}, ${stats.smoothing.attempts} sent, byte ${
                    stats.smoothing.byte === null ? '–' : byte(stats.smoothing.byte)
                  }`
                : '–'}
              ; seen {bytes(snapshot.seen.smoothing)}
            </td>
          </tr>
          <tr>
            <td>Stored</td>
            <td data-testid="stored">
              {state.unsaved === 0 && state.finishing === 0
                ? 'everything'
                : `all but ${state.unsaved} records (written about once a second)${state.finishing > 0 ? `; ${state.finishing} recordings still finishing` : ''}`}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function WeightPanel({ snapshot }: { snapshot: ProbeSnapshot }) {
  return (
    <section>
      <h2>Weight statistics</h2>
      <table data-testid="weight-stats">
        <tbody>
          {snapshot.weightWindows.map((window) => (
            <tr key={window.windowMs}>
              <td>Last {window.windowMs / 1000} s</td>
              <td>{weightSummary(window.summary)}</td>
            </tr>
          ))}
          <tr>
            <td>Smallest step (A11)</td>
            <td>
              {snapshot.smallestWeightStepG === null ? '–' : grams(snapshot.smallestWeightStepG)}
            </td>
          </tr>
          <tr>
            <td>Sign bytes seen (A10)</td>
            <td>
              weight {bytes(snapshot.seen.weightSign)}; flow {bytes(snapshot.seen.flowSign)}
            </td>
          </tr>
          {snapshot.untrustedWeights > 0 && (
            <tr>
              <td>Refused weights</td>
              <td>{snapshot.untrustedWeights} (unit or sign byte not recognised)</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function FramesPanel({
  snapshot,
  source,
}: {
  snapshot: ProbeSnapshot;
  source: CharacteristicName;
}) {
  const frames = snapshot.frames[source];
  const ff12 = source === 'ff12';
  return (
    <section
      class={ff12 && frames.length > 0 ? 'ff12' : undefined}
      data-testid={`frames-${source}`}
    >
      <h2>
        {source.toUpperCase()} frames: {snapshot.counts[source]}
        {ff12 && ' (anything here is news: A7)'}
      </h2>
      {frames.length === 0 ? (
        <p>None yet.</p>
      ) : (
        <div class="scroll">
          <table>
            <tbody>
              {frames.map((frame) => (
                <FrameRow
                  key={frame.seq}
                  frame={frame}
                  highlight={ff12 || frame.decoded.kind !== 'weight'}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FrameRow({ frame, highlight }: { frame: LoggedFrame; highlight: boolean }) {
  return (
    <tr class={highlight ? 'ff12' : undefined}>
      <td class="mono">{seconds(frame.tMs)}</td>
      <td>
        {describeFrame(frame.decoded)}
        {hexLines(frame.hex).map((line, i) => (
          <div key={i} class="mono hex">
            {line}
          </div>
        ))}
      </td>
    </tr>
  );
}

function EventsPanel({ snapshot }: { snapshot: ProbeSnapshot }) {
  return (
    <section>
      <h2>Events</h2>
      {snapshot.events.length === 0 ? (
        <p>None yet.</p>
      ) : (
        <table data-testid="events">
          <tbody>
            {snapshot.events.map((event) => (
              <tr key={event.seq}>
                <td class="mono">{seconds(event.tMs)}</td>
                <td>{describeEvent(event)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function MicrophonePanel({ link }: { link: ScaleLink }) {
  const [result, setResult] = useState<{ result: MicrophoneResult; logged: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  function tryIt(): void {
    // Straight from the tap: the permission prompt needs its user activation.
    const trying = tryMicrophone();
    setBusy(true);
    void trying.then((outcome) => {
      const event = link.recorder.logUiAction('try-microphone', {
        outcome: outcome.outcome,
        error: outcome.error,
        tracks: [...outcome.tracks],
      });
      setResult({ result: outcome, logged: event !== null });
      setBusy(false);
    });
  }

  return (
    <section>
      <h2>Microphone (B8)</h2>
      <p>
        <button type="button" disabled={busy} onClick={tryIt}>
          Try microphone
        </button>{' '}
        <span class="muted">Asks for permission, then stops at once. Nothing is recorded.</span>
      </p>
      {result && (
        <p data-testid="microphone">
          {result.result.outcome}
          {result.result.error && `: ${result.result.error}`}
          {result.result.tracks.length > 0 && ` (${result.result.tracks.join(', ')})`}
          {result.logged ? '. Logged on the recording.' : '. Not logged: nothing is recording.'}
        </p>
      )}
    </section>
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
