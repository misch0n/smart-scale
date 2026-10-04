/** Argument checks shared by the signal functions. Each throws a RangeError naming its caller. */

/** @throws RangeError unless `value` is an integer of at least `least`. */
export function checkInteger(caller: string, name: string, value: number, least: number): void {
  if (!Number.isInteger(value) || value < least) {
    throw new RangeError(`${caller}: ${name} ${value} is not an integer of at least ${least}`);
  }
}

/** @throws RangeError unless `value` is a finite number above 0. */
export function checkPositive(caller: string, name: string, value: number): void {
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new RangeError(`${caller}: ${name} ${value} is not a positive finite number`);
  }
}

/**
 * @throws RangeError unless `from … to − 1` are indexes into `length` values: integers with
 *   0 ≤ from ≤ to ≤ length, and from < to unless `allowEmpty`.
 */
export function checkRange(
  caller: string,
  length: number,
  from: number,
  to: number,
  allowEmpty = false,
): void {
  const valid =
    Number.isInteger(from) &&
    Number.isInteger(to) &&
    from >= 0 &&
    to <= length &&
    (allowEmpty ? from <= to : from < to);
  if (!valid) {
    throw new RangeError(
      `${caller}: ${from} … ${to} is not a ${allowEmpty ? '' : 'non-empty '}range of indexes into ${length} values`,
    );
  }
}
