/**
 * What the shot detail and Compare show as numbers (boards History-Detail and History-Compare):
 * the eight metric tiles, the phases against their targets, and the "A Δ B" table. The context
 * a shot records stays internal (D-056); only the grind setting shows, with the grind phase.
 */

import type { HistoryEntry } from '../../app/history';
import { shotDose } from '../../core/analysis';
import type { Direction, GrindSetting, Shot } from '../../core/model';
import { recipeRatio, shotRatio, signedTenths, tenths } from '../brew/format';
import { drinkOf, targetOf } from './rows';

/** Past the target by more than this, g, the difference shows as a warning (as on the card). */
export const TARGET_WARNING_G = 1;

/** The minus sign: it lines up with the plus in tabular figures. */
const MINUS = '−';

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
  readonly id: 'beans' | 'grind' | 'extraction' | 'milk';
  readonly name: string;
  /** Under the name: the target, or the grinder and its setting. */
  readonly sub: string | null;
  /** The measured weight, g, as shown; null when not measured. */
  readonly value: string | null;
  /** After the value: `of 33.8`, `· retention 0.3 g`, or `skipped` alone. */
  readonly after: string | null;
}

/**
 * The phases the shot went through (spec v2 "Brew phases"), in order: the beans, the grind (or
 * just the grind setting, which the shot records without the phase, D-053), the extraction,
 * which every shot has, and the milk. A phase the brew didn't offer has no row.
 */
export function phaseRows(entry: HistoryEntry): PhaseRow[] {
  const { shot } = entry;
  // What the analysis measured in the phases (T2.5), else what an older shot recorded.
  const beansG = entry.phases.beansG ?? shot.beansWeighedG;
  const groundG = entry.phases.groundG ?? shot.groundG;
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

  const grinder = grinderLabel(shot);
  if (shot.grindPhase !== null || grinder !== null) {
    const retention = beansG === null || groundG === null ? null : beansG - groundG;
    rows.push(
      shot.grindPhase === 'skipped'
        ? skipped('grind', 'Grind', grinder)
        : {
            id: 'grind',
            name: 'Grind',
            sub: grinder,
            value: grams(groundG),
            after: retention === null ? null : `· retention ${tenths(retention)} g`,
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

/** A row of the "A Δ B" table. */
export interface CompareRow {
  readonly id: string;
  readonly name: string;
  readonly unit: string;
  readonly a: string | null;
  /** A − B, signed, or null where the two can't be subtracted. */
  readonly delta: string | null;
  readonly b: string | null;
}

/** The taste row's sides: the direction, or null when not graded. */
export interface CompareTaste {
  readonly a: Direction | null;
  readonly b: Direction | null;
}

export interface CompareTable {
  /** The grind setting, the doses and every metric: rows with a value on either side. */
  readonly rows: readonly CompareRow[];
  readonly drink: { readonly a: string; readonly b: string };
  readonly taste: CompareTaste;
}

/** Δ in the value's own digits, with its sign: `+2.2`, `−0.05`, `±0.0`. */
export function signedFixed(value: number, digits: number): string {
  const scale = 10 ** digits;
  const rounded = Math.round(value * scale) / scale;
  if (rounded === 0) return `±${(0).toFixed(digits)}`;
  return (rounded > 0 ? '+' : MINUS) + Math.abs(rounded).toFixed(digits);
}

/** The "A Δ B" table (board History-Compare), Δ = A − B. */
export function compareTable(a: HistoryEntry, b: HistoryEntry): CompareTable {
  const rows: CompareRow[] = [];
  const numeric = (
    id: string,
    name: string,
    unit: string,
    digits: number,
    of: (entry: HistoryEntry) => number | null | undefined,
    format: (value: number) => string = (value) => value.toFixed(digits),
  ) => {
    const valueA = of(a) ?? null;
    const valueB = of(b) ?? null;
    if (valueA === null && valueB === null) return;
    rows.push({
      id,
      name,
      unit,
      a: valueA === null ? null : format(valueA),
      delta: valueA === null || valueB === null ? null : signedFixed(valueA - valueB, digits),
      b: valueB === null ? null : format(valueB),
    });
  };

  const grind = compareGrind(a.shot, b.shot);
  if (grind !== null) rows.push(grind);
  numeric('beans', 'Beans', 'g', 1, (entry) => entry.shot.beansWeighedG);
  numeric('ground', 'Ground', 'g', 1, (entry) => entry.shot.groundG);
  numeric('dose', 'Dose', 'g', 1, (entry) => shotDose(entry.shot, entry.phases)?.g ?? null);
  const metric = (entry: HistoryEntry) => entry.segment?.metrics;
  numeric('first-drip', 'First drip', 's', 1, (entry) => metric(entry)?.firstDripS);
  numeric('extraction', 'Extraction', 's', 1, (entry) => metric(entry)?.extractionS);
  numeric('total', 'Total', 's', 1, (entry) => metric(entry)?.totalS);
  numeric('yield', 'Yield', 'g', 1, (entry) => metric(entry)?.yieldG);
  numeric('ratio', 'Ratio', '', 2, (entry) => entry.match.ratio, shotRatio);
  numeric('flow', 'Average flow', 'g/s', 2, (entry) => metric(entry)?.averageFlowGps);
  numeric('pump-off-weight', 'Weight at pump off', 'g', 1, (e) => metric(e)?.pumpOffWeightG);
  numeric('tail', 'Tail', 'g', 1, (entry) => metric(entry)?.tailMassG);

  return {
    rows,
    drink: { a: drinkOf(a), b: drinkOf(b) },
    taste: { a: a.shot.direction, b: b.shot.direction },
  };
}

/**
 * The grind setting's row: the grinder's name as the unit when both shots share it, and Δ only
 * then, on the same kind of setting. Null when neither shot has a setting.
 */
function compareGrind(a: Shot, b: Shot): CompareRow | null {
  const settingA = a.grindSetting;
  const settingB = b.grindSetting;
  if (settingA === null && settingB === null) return null;
  const sameGrinder =
    a.grinderId !== null ? a.grinderId === b.grinderId : a.grinderName === b.grinderName;
  const comparable =
    settingA !== null && settingB !== null && sameGrinder && settingA.kind === settingB.kind;
  const digits = (setting: GrindSetting) =>
    setting.kind === 'clicks' ? 0 : decimals(setting.value);
  return {
    id: 'grind',
    name: 'Grind',
    unit: sameGrinder ? (a.grinderName ?? '') : '',
    a: settingA === null ? null : settingText(settingA),
    delta: comparable
      ? signedFixed(settingA.value - settingB.value, Math.max(digits(settingA), digits(settingB)))
      : null,
    b: settingB === null ? null : settingText(settingB),
  };
}

/** The decimals a stepless setting is written with: 6.25 has 2. */
function decimals(value: number): number {
  const text = String(value);
  const point = text.indexOf('.');
  return point === -1 ? 0 : Math.min(3, text.length - point - 1);
}

function grams(value: number | null): string | null {
  return value === null ? null : tenths(value);
}
