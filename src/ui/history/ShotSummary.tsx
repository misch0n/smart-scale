// The shot in three figures, under its chart (T3.16, D-109; the shot card and a shot's page): in
// the middle and largest the yield, with the ratio under it; on the left the extraction's time,
// with the total (the preinfusion's too) under it; on the right the extraction's average flow.
// The rest (the preinfusion, the weight at pump off, the tail) is in the chart.

import type { ShotMetrics } from '../../core/analysis';
import { shotRatio } from '../brew/format';

export function ShotSummary({
  metrics,
  ratio,
}: {
  metrics: Pick<ShotMetrics, 'extractionS' | 'totalS' | 'yieldG' | 'averageFlowGps'>;
  /** Yield ÷ dose; null without a dose. */
  ratio: number | null;
}) {
  const fixed = (value: number | null, digits: number) =>
    value === null ? '–' : value.toFixed(digits);
  return (
    <div class="shot-summary" data-testid="shot-summary">
      <span class="summary-side">
        <span class="lbl">Extraction</span>
        <span>
          <span class="num summary-value" data-testid="summary-extraction">
            {fixed(metrics.extractionS, 1)}
          </span>
          <span class="unit"> s</span>
        </span>
        <span class="muted summary-sub">
          <span class="num" data-testid="summary-total">
            {fixed(metrics.totalS, 1)}
          </span>{' '}
          s total
        </span>
      </span>
      <span class="summary-main">
        <span class="lbl">Yield</span>
        <span>
          <span class="num summary-yield" data-testid="summary-yield">
            {fixed(metrics.yieldG, 1)}
          </span>
          <span class="unit"> g</span>
        </span>
        <span class="muted summary-sub">
          {/* Without a dose there is no ratio: said, not a lone dash. */}
          <span class={ratio === null ? undefined : 'num'} data-testid="summary-ratio">
            {ratio === null ? 'no dose' : shotRatio(ratio)}
          </span>
        </span>
      </span>
      <span class="summary-side">
        <span class="lbl">Avg flow</span>
        <span>
          <span class="num summary-value" data-testid="summary-flow">
            {fixed(metrics.averageFlowGps, 2)}
          </span>
          <span class="unit"> g/s</span>
        </span>
        <span class="muted summary-sub">in extraction</span>
      </span>
    </div>
  );
}
