/**
 * What the shot detail shows as numbers (board History-Detail): the eight metric tiles and the
 * phases against their targets (Compare's "A Δ B" table went with Compare, T3.6). The context a
 * shot records stays internal (D-056); only the grind setting shows, with the grind phase.
 */

import type { HistoryEntry } from '../../app/history';
import { shotDose } from '../../core/analysis';
import type { GrindSetting, Shot } from '../../core/model';
import { recipeRatio, shotRatio, signedTenths, tenths } from '../brew/format';
import { targetOf } from './rows';

/** Past the target by more than this, g, the difference shows as a warning (as on the card). */
export const TARGET_WARNING_G = 1;

/** A note under a tile's number, with an optional signed difference. */
export interface TileNote {
  readonly text: string;
  readonly delta: { readonly text: string; readonly warn: boolean } | null;
}

export interface MetricTile {
  readonly id: string;
  readonly label: string;
  /** The number as shown, or null when the analysis has none. */
  readonly value: string | null;
  readonly unit: string;
  readonly note: TileNote | null;
}

const plain = (text: string): TileNote => ({ text, delta: null });

/** The detail's eight tiles, in the board's order. */
export function metricTiles(entry: HistoryEntry): MetricTile[] {
  const metrics = entry.segment?.metrics ?? null;
  const { shot } = entry;
  const targetG = targetOf(entry);
  const yieldG = metrics?.yieldG ?? null;
  const fixed = (value: number | null | undefined, digits: number) =>
    value == null ? null : value.toFixed(digits);

  let yieldNote: TileNote | null = null;
  if (targetG !== null) {
    const over = yieldG === null ? null : yieldG - targetG;
    yieldNote = {
      text: `target ${tenths(targetG)}`,
      delta: over === null ? null : { text: signedTenths(over), warn: over > TARGET_WARNING_G },
    };
  }
  const totalS = metrics?.totalS ?? null;
  return [
    {
      id: 'first-drip',
      label: 'First drip',
      value: fixed(metrics?.firstDripS, 1),
      unit: 's',
      note: plain('after pump on'),
    },
    {
      id: 'extraction',
      label: 'Extraction',
      value: fixed(metrics?.extractionS, 1),
      unit: 's',
      note: plain('first drip → pump off'),
    },
    {
      id: 'total',
      label: 'Total',
      value: fixed(totalS, 1),
      unit: 's',
      note: plain('pump on → pump off'),
    },
    { id: 'yield', label: 'Yield', value: grams(yieldG), unit: 'g', note: yieldNote },
    {
      id: 'ratio',
      label: 'Ratio',
      value: entry.match.ratio === null ? null : shotRatio(entry.match.ratio),
      unit: '',
      note: shot.targetRatio === null ? null : plain(`target ${recipeRatio(shot.targetRatio)}`),
    },
    {
      id: 'flow',
      label: 'Average flow',
      value: fixed(metrics?.averageFlowGps, 2),
      unit: 'g/s',
      note: plain('during extraction'),
    },
    {
      id: 'pump-off-weight',
      label: 'Weight at pump off',
      value: grams(metrics?.pumpOffWeightG ?? null),
      unit: 'g',
      note: totalS === null ? null : plain(`at ${totalS.toFixed(1)} s`),
    },
    {
      id: 'tail',
      label: 'Tail',
      value: grams(metrics?.tailMassG ?? null),
      unit: 'g',
      note: plain('drips after pump off'),
    },
  ];
}

/** A phase's row: what it measured against its target, or "skipped". */
export interface PhaseRow {
  readonly id: 'beans' | 'extraction' | 'milk';
  readonly name: string;
  /** Under the name: the target. */
  readonly sub: string | null;
  /** The measured weight, g, as shown; null when not measured. */
  readonly value: string | null;
  /** After the value: `of 33.8`, or `skipped` alone. */
  readonly after: string | null;
}

/**
 * The phases the shot went through (spec v2 "Brew phases"), in order: the beans, the extraction,
 * which every shot has, and the milk. A phase the brew didn't offer has no row. No grind row
 * (T3.8): there is no grind phase (D-101); the grinder and its setting are in the page's subtitle.
 */
export function phaseRows(entry: HistoryEntry): PhaseRow[] {
  const { shot } = entry;
  // What the analysis measured in the phases (T2.5), else what an older shot recorded.
  const beansG = entry.phases.beansG ?? shot.beansWeighedG;
  const milkG = entry.phases.milkG ?? shot.milkG;
  const dose = shotDose(shot, entry.phases);
  const rows: PhaseRow[] = [];
  const skipped = (id: PhaseRow['id'], name: string, sub: string | null): PhaseRow => ({
    id,
    name,
    sub,
    value: null,
    after: 'skipped',
  });

  if (shot.beansPhase !== null) {
    const target = shot.basketSizeG;
    const sub = target === null ? null : `target: basket ${tenths(target)} g`;
    rows.push(
      shot.beansPhase === 'skipped'
        ? skipped('beans', 'Beans', sub)
        : {
            id: 'beans',
            name: 'Beans',
            sub,
            value: grams(beansG),
            after: target === null ? null : `of ${tenths(target)}`,
          },
    );
  }

  const targetG = targetOf(entry);
  const yieldG = entry.segment?.metrics.yieldG ?? null;
  rows.push({
    id: 'extraction',
    name: 'Extraction',
    sub:
      dose === null || shot.targetRatio === null
        ? null
        : `target: ${tenths(dose.g)} g × ${Number(shot.targetRatio.toFixed(2))}`,
    value: grams(yieldG),
    after: targetG === null ? null : `of ${tenths(targetG)}`,
  });

  if (shot.milkPhase !== null) {
    const milkTarget = yieldG === null || shot.milkRatio === null ? null : yieldG * shot.milkRatio;
    const sub =
      yieldG === null || shot.milkRatio === null
        ? null
        : `target: ${tenths(yieldG)} g × ${Number(shot.milkRatio.toFixed(2))}`;
    rows.push(
      shot.milkPhase === 'skipped'
        ? skipped('milk', 'Milk', sub)
        : {
            id: 'milk',
            name: 'Milk',
            sub,
            value: milkG === null ? null : String(Math.round(milkG)),
            after: milkTarget === null ? null : `of ${Math.round(milkTarget)}`,
          },
    );
  }
  return rows;
}

/** The grinder and its setting: `ORO Mignon · 6.2`; null without a setting. */
export function grinderLabel(shot: Shot): string | null {
  if (shot.grindSetting === null) return null;
  const setting = settingText(shot.grindSetting);
  return shot.grinderName === null ? setting : `${shot.grinderName} · ${setting}`;
}

function settingText(setting: GrindSetting): string {
  return setting.kind === 'clicks' ? `${setting.value} clicks` : String(setting.value);
}

function grams(value: number | null): string | null {
  return value === null ? null : tenths(value);
}
