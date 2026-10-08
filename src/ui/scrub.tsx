// Reading a chart at a moment (T3.10, D-107): a finger held on the plot shows a line and what the
// curves read there, and follows the finger as it slides; letting go hides it. A hold, not a
// touch: a finger that moves first is scrolling the page, which goes on. While it reads, the page
// doesn't scroll. With a mouse, a press does it at once.

import { useEffect, useRef, useState } from 'preact/hooks';
import type { ChartPoint } from './brew/chart';
import './scrub.css';

/** How long a finger holds still before the chart reads, ms. */
export const HOLD_MS = 300;
/** A finger that moves this far before the hold is scrolling, px. */
const MOVE_PX = 8;

/**
 * Where across the plot the finger is, 0 at its left edge to 1 at its right, while it reads;
 * null otherwise. `ref` goes on the plot's element.
 */
export function useScrub<T extends HTMLElement>(): {
  readonly ref: { current: T | null };
  readonly at: number | null;
} {
  const ref = useRef<T | null>(null);
  const [at, setAt] = useState<number | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let reading = false;
    let start: { x: number; y: number } | null = null;
    const share = (clientX: number): number => {
      const box = element.getBoundingClientRect();
      return box.width <= 0 ? 0 : Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    };
    const stop = (): void => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      reading = false;
      start = null;
      setAt(null);
    };
    const onTouchStart = (event: TouchEvent): void => {
      if (event.touches.length !== 1) return stop();
      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY };
      timer = setTimeout(() => {
        timer = null;
        reading = true;
        if (start !== null) setAt(share(start.x));
      }, HOLD_MS);
    };
    const onTouchMove = (event: TouchEvent): void => {
      const touch = event.touches[0];
      if (reading) {
        // Reading: the finger moves the line, not the page.
        event.preventDefault();
        setAt(share(touch.clientX));
      } else if (
        start !== null &&
        Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > MOVE_PX
      ) {
        stop();
      }
    };
    const onMouseDown = (event: MouseEvent): void => {
      if (event.button !== 0) return;
      reading = true;
      setAt(share(event.clientX));
    };
    const onMouseMove = (event: MouseEvent): void => {
      if (reading) setAt(share(event.clientX));
    };
    const onMouseUp = (): void => {
      if (reading) stop();
    };
    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: false });
    element.addEventListener('touchend', stop);
    element.addEventListener('touchcancel', stop);
    element.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      stop();
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', stop);
      element.removeEventListener('touchcancel', stop);
      element.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);
  return { ref, at };
}

/** A curve's line in the reading: its name, and its weight and flow at the moment. */
export interface ScrubLine {
  readonly name: string;
  readonly point: ChartPoint | null;
  /** The line's colour, as a CSS value. */
  readonly colour: string;
}

/**
 * The line at the moment, and the box of what the curves read there (`chart-scrub`): the time,
 * then each curve's weight and flow. The box sits on the line's other side past the middle.
 */
export function ScrubReadout({
  at,
  tS,
  lines,
}: {
  /** 0–1 across the plot. */
  at: number;
  /** The moment, s from the chart's zero. */
  tS: number;
  lines: readonly ScrubLine[];
}) {
  const left = `${Math.round(at * 1000) / 10}%`;
  return (
    <>
      <span class="scrub-line" style={{ left }} aria-hidden="true" />
      <span
        class={at > 0.5 ? 'scrub-box scrub-box-left' : 'scrub-box'}
        style={{ left }}
        role="status"
        data-testid="chart-scrub"
      >
        <span class="num scrub-time">{tS.toFixed(1)} s</span>
        {lines.map((line) => (
          <span key={line.name} class="scrub-row">
            <span class="scrub-swatch" style={{ background: line.colour }} />
            <span class="num">
              {line.point === null
                ? '–'
                : `${line.point.g.toFixed(1)} g · ${line.point.flowGps === null ? '–' : line.point.flowGps.toFixed(1)} g/s`}
            </span>
          </span>
        ))}
      </span>
    </>
  );
}
