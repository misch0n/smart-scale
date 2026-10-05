// Pieces the brew boards share: the cup on the scale, the scale to connect, and the stepper.

import { useEffect, useRef } from 'preact/hooks';
import type {
  ConnectionView,
  ScaleConnector,
  ScaleConnectorState,
} from '../../app/scale-connector';
import type { ShotDisplay } from '../../core/live';
import { tenths } from './format';
import { CheckIcon } from './icons';

/**
 * The vessel on the scale. Until containers exist (T2.4), any vessel of 20 g or more is the cup
 * (D-065), named by what it weighed as it went on.
 */
export function CupCard({ display }: { display: ShotDisplay }) {
  if (display.phase === 'idle') {
    return (
      <div class="card cup" data-testid="cup">
        <span class="muted">Put the cup on the scale</span>
        {display.readingG !== null && (
          <span class="muted">
            <span class="num">{tenths(display.readingG)}</span> g
          </span>
        )}
      </div>
    );
  }
  return (
    <div class="card cup" data-testid="cup">
      <span>
        <span class="cup-name">Cup</span>
        {display.cupG !== null && (
          <span class="muted">
            {' · '}
            <span class="num">{tenths(display.cupG)}</span> g
          </span>
        )}
      </span>
      <span class="badge" style={{ gap: '5px' }}>
        <CheckIcon size={12} strokeWidth={3} />
        on the scale
      </span>
    </div>
  );
}

/** The scale's state line, on its card and in the top bar. */
export const CONNECTION_LABEL: Readonly<Record<ConnectionView, string>> = {
  connected: 'Connected',
  connecting: 'Connecting…',
  waiting: 'Waiting for the scale…',
  checking: 'Looking for Bluetooth…',
  unavailable: 'No Bluetooth',
  disconnected: 'Not connected',
};

/**
 * The scale isn't connected: Home's card (board Main). It connects with one tap, and by itself
 * where it can (T1.21). While it waits for the scale, Stop ends that and Choose scale opens the
 * device chooser instead. Without Web Bluetooth, it says how to get it back.
 */
export function ConnectCard({
  view,
  state,
  connector,
}: {
  view: ConnectionView;
  state: ScaleConnectorState;
  connector: Pick<ScaleConnector, 'connect' | 'choose' | 'disconnect'>;
}) {
  return (
    <section class="card connect" aria-label="Scale" data-testid="connect" data-view={view}>
      <span class="connect-head">
        <span style={{ fontWeight: 600 }}>Scale</span>
        <span class="muted connect-state">
          <span class="dot dot-off" />
          {CONNECTION_LABEL[view]}
        </span>
      </span>
      {view === 'waiting' ? (
        <>
          <span class="muted connect-text">Turn the scale on: it connects by itself.</span>
          <span class="connect-actions">
            <button type="button" class="btn2" onClick={() => connector.disconnect()}>
              Stop
            </button>
            <button type="button" class="btn2" onClick={() => connector.choose()}>
              Choose scale
            </button>
          </span>
        </>
      ) : view === 'unavailable' ? (
        <>
          <span class="muted connect-text">
            This browser has no Web Bluetooth. With beacio, allow it on this site (Always Allow on
            This Website), then reload.
          </span>
          <button type="button" class="btn" onClick={() => location.reload()}>
            Reload
          </button>
        </>
      ) : (
        <>
          <span class="muted connect-text">
            {state.forgotten
              ? 'The browser no longer knows the scale: choose it once more.'
              : 'Turn the scale on, then connect.'}
          </span>
          {view === 'disconnected' && state.error !== null && !state.forgotten && (
            <span class="muted connect-error" data-testid="connect-error">
              {state.error}
            </span>
          )}
          <button
            type="button"
            class="btn"
            disabled={view !== 'disconnected'}
            onClick={() => connector.connect()}
          >
            Connect scale
          </button>
        </>
      )}
    </section>
  );
}

/**
 * A stepper's button: a tap steps once, and holding it steps again and again, as a phone's
 * steppers do.
 */
export function StepButton({
  label,
  onStep,
  children,
}: {
  label: string;
  onStep: () => void;
  children: preact.ComponentChildren;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeated = useRef(false);
  const step = useRef(onStep);
  step.current = onStep;

  const stop = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  const hold = (): void => {
    stop();
    repeated.current = false;
    const next = (delayMs: number): void => {
      timer.current = setTimeout(() => {
        repeated.current = true;
        step.current();
        next(80);
      }, delayMs);
    };
    next(450);
  };

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={hold}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={() => {
        // A hold has stepped already; a tap, or a key, steps once.
        if (!repeated.current) step.current();
        repeated.current = false;
      }}
    >
      {children}
    </button>
  );
}
