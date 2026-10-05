// Pieces the brew boards share: the cup on the scale, the scale to connect, and the stepper.

import { useEffect, useRef } from 'preact/hooks';
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

/** The scale isn't connected: Home's card (board Main), with the one-tap connect. */
export function ConnectCard({
  connecting,
  onConnect,
}: {
  connecting: boolean;
  onConnect: () => void;
}) {
  return (
    <section class="card connect" aria-label="Scale" data-testid="connect">
      <span class="connect-head">
        <span style={{ fontWeight: 600 }}>Scale</span>
        <span class="muted connect-state">
          <span class="dot dot-off" />
          {connecting ? 'Connecting…' : 'Not connected'}
        </span>
      </span>
      <span class="muted" style={{ fontSize: '14px' }}>
        Turn the scale on, then connect.
      </span>
      <button type="button" class="btn" disabled={connecting} onClick={onConnect}>
        Connect scale
      </button>
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
