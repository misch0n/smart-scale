/**
 * A pour's progress towards its target (spec v2 "Live display"): the extraction towards its
 * yield now (T1.17), the beans and the milk the same way later (T2.6, T2.11). Display-only.
 */

export interface PourProgress {
  readonly targetG: number;
  /** Target − poured, g: "6.0 g to go"; negative past the target. */
  readonly remainingG: number;
  /** Poured / target: 0 at the start, 1 at the target, above 1 past it; never below 0. */
  readonly progress: number;
  /** Past the target by more than the margin: "+1.2 g over target". */
  readonly overTarget: boolean;
}

/**
 * The extraction's target, g: the dose times the recipe's coffee ratio (spec "Flow and yield":
 * from the actual dose, not a fixed figure). A ratio of 2 is 1:2.
 *
 * @throws RangeError unless both are finite numbers above 0.
 */
export function yieldTargetG(doseG: number, coffeeRatio: number): number {
  for (const [name, value] of [
    ['dose', doseG],
    ['ratio', coffeeRatio],
  ] as const) {
    if (!(value > 0) || !Number.isFinite(value)) {
      throw new RangeError(`yieldTargetG: ${name} ${value} is not a finite number above 0`);
    }
  }
  return doseG * coffeeRatio;
}

/**
 * How far `pouredG` has come towards `targetG`, with the over-target warning past `marginG`.
 *
 * @throws RangeError unless the target is a finite number above 0 and the margin one of at
 *   least 0.
 */
export function pourProgress(pouredG: number, targetG: number, marginG: number): PourProgress {
  if (!(targetG > 0) || !Number.isFinite(targetG)) {
    throw new RangeError(`pourProgress: target ${targetG} is not a finite number above 0`);
  }
  if (!(marginG >= 0) || !Number.isFinite(marginG)) {
    throw new RangeError(`pourProgress: margin ${marginG} is not a finite number of at least 0`);
  }
  return {
    targetG,
    remainingG: targetG - pouredG,
    progress: Math.max(0, pouredG / targetG),
    overTarget: pouredG - targetG > marginG,
  };
}
