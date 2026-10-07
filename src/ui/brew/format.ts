/**
 * How the brew screens write numbers (spec v2 "Live display"): grams in tenths, the scale's step
 * (D-037), seconds in tenths, ratios as `1:2.09`, and the live readout's state.
 */

import { HOLDS_NOTHING_G, type PourProgress } from '../../core/live';
import type { Grinder } from '../../core/model';

/** The minus sign, not a hyphen: it lines up with the plus in tabular figures. */
const MINUS = '−';

/** Grams in tenths, `-0.0` as `0.0`: `"35.4"`. */
export function tenths(g: number): string {
  const text = (Math.round(g * 10) / 10).toFixed(1);
  return text === '-0.0' ? '0.0' : text.replace('-', MINUS);
}

/** A difference in tenths with its sign: `"+1.6"`, `"−0.6"`, `"±0.0"`. */
export function signedTenths(g: number): string {
  const rounded = Math.round(g * 10) / 10;
  if (rounded === 0) return '±0.0';
  return (rounded > 0 ? '+' : MINUS) + Math.abs(rounded).toFixed(1);
}

/** Seconds in tenths, from ms: `"24.6"`. */
export function seconds(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(1);
}

/** A wait as minutes and seconds, from ms: `"0:42"`, `"12:05"`. */
export function minutesSeconds(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** A shot's ratio, yield over dose, to two decimals: `"1:2.09"`. */
export function shotRatio(ratio: number): string {
  return `1:${ratio.toFixed(2)}`;
}

/** A recipe's ratio as written: `"1:2"`, `"1:1.5"`. */
export function recipeRatio(ratio: number): string {
  return `1:${Number(ratio.toFixed(2))}`;
}

/** A recipe as the screens name it: `"Cappuccino · 1:2 + milk 1:3"`. */
export function recipeLabel(recipe: {
  readonly name: string;
  readonly coffeeRatio: number;
  readonly milkRatio: number | null;
}): string {
  const milk = recipe.milkRatio === null ? '' : ` + milk ${recipeRatio(recipe.milkRatio)}`;
  return `${recipe.name} · ${recipeRatio(recipe.coffeeRatio)}${milk}`;
}

/** The time of day, 24 h, in local time: `"07:12"`. */
export function timeOfDay(epochMs: number): string {
  const date = new Date(epochMs);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** A share as a whole percentage: `"82 %"`. */
export function percent(share: number): string {
  return `${Math.round(Math.max(0, share) * 100)} %`;
}

/**
 * The live readout (Brew-Shot, and Brew-Beans's states): counting down to the target, reached
 * (at it, up to the margin over), or over it (the warning past the margin).
 */
export type ReadoutState = 'pouring' | 'reached' | 'over';

export interface Readout {
  readonly state: ReadoutState;
  /** The big number: what is left to go, or how far past the target. */
  readonly big: string;
  /** In the cup so far, g, in tenths. */
  readonly poured: string;
  readonly target: string;
  /** The bar's fill, 0–100. */
  readonly barPct: number;
  readonly percent: string;
}

export function readout(progress: PourProgress): Readout {
  const poured = progress.targetG - progress.remainingG;
  const left = Math.round(progress.remainingG * 10) / 10;
  const state: ReadoutState = progress.overTarget ? 'over' : left <= 0 ? 'reached' : 'pouring';
  return {
    state,
    big: state === 'pouring' ? tenths(left) : signedTenths(-left),
    poured: tenths(Math.max(0, poured)),
    target: tenths(progress.targetG),
    barPct: Math.min(100, Math.max(0, Math.round(progress.progress * 100))),
    percent: percent(progress.progress),
  };
}

/** A grinder in a word, as board Brew-Beans writes it: `ORO` for the ORO Mignon Single Dose Pro. */
export function grinderWord(grinder: Pick<Grinder, 'brand' | 'model'>): string {
  return (grinder.model || grinder.brand).trim().split(/\s+/)[0] || 'Grinder';
}

/**
 * Whether the beans screen says to put the coffee cup down (T2.31, D-103): beans weighed, and
 * the weight still (or the bean cup off, at the grinder). Not while they pour in.
 */
export function beansSettled({
  beansG,
  vesselOn,
  stable,
}: {
  beansG: number | null;
  vesselOn: boolean;
  stable: boolean;
}): boolean {
  return beansG !== null && beansG >= HOLDS_NOTHING_G && (!vesselOn || stable);
}
