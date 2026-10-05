/**
 * When a pour ended, from the readings around its end (T1.17): the live display's pump_off,
 * which it shows as "pump off at 32.0 s" once the flow has fallen away. The analysis finds the
 * real one after the shot, with the drain's own model (T1.13, D-059).
 */

/** A reading of the weight, on the live signal's `grossG` scale. */
export interface PourReading {
  readonly tMs: number;
  readonly grossG: number;
}

/**
 * The knee of a hinge fitted to `readings`: a line rising until the knee, level after it, the
 * least-squares fit among knees at each reading and halfway between readings. Null with fewer
 * than four readings, or when no knee has a pour (a rising line) before it.
 *
 * A drain after the pump bends the level after the knee, so the knee lands a little into the
 * drain: about half its time constant.
 */
export function pourEndMs(readings: readonly PourReading[]): number | null {
  const n = readings.length;
  if (n < 4) return null;
  const t0 = readings[0].tMs;
  const x = readings.map((reading) => (reading.tMs - t0) / 1000);
  const y = readings.map((reading) => reading.grossG);
  let best: { knee: number; sse: number } | null = null;
  // At least two readings on the line, and one on the level.
  for (let i = 1; i <= n - 2; i++) {
    for (const knee of [x[i], (x[i] + x[i + 1]) / 2]) {
      const fit = hinge(x, y, knee);
      if (fit !== null && fit.slope > 0 && (best === null || fit.sse < best.sse)) {
        best = { knee, sse: fit.sse };
      }
    }
  }
  return best === null ? null : t0 + best.knee * 1000;
}

/** y ≈ a + slope × min(x − knee, 0), by least squares; null when x is all past the knee. */
function hinge(
  x: readonly number[],
  y: readonly number[],
  knee: number,
): { slope: number; sse: number } | null {
  const n = x.length;
  const u = x.map((xi) => Math.min(xi - knee, 0));
  const meanU = u.reduce((sum, ui) => sum + ui, 0) / n;
  const meanY = y.reduce((sum, yi) => sum + yi, 0) / n;
  let suu = 0;
  let suy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    suu += (u[i] - meanU) ** 2;
    suy += (u[i] - meanU) * (y[i] - meanY);
    syy += (y[i] - meanY) ** 2;
  }
  if (!(suu > 0)) return null;
  const slope = suy / suu;
  return { slope, sse: syy - slope * suy };
}
