// Pieces the brew boards share: the scale's state words (its line is `ScaleLine`, T3.14), and
// the stepper. The vessel on the scale is `VesselCard` (phases.tsx, T2.5).

import { useEffect, useRef } from 'preact/hooks';
import type { ConnectionView } from '../../app/scale-connector';
import './brew.css';

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
