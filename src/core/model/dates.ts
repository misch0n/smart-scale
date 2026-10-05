/**
 * Calendar dates as `YYYY-MM-DD` (D-068): days the user names, like a roast date or the day the
 * machine was descaled, which no time zone moves. Core can't read the time zone, so `localDate`
 * takes the offset, as `Date.prototype.getTimezoneOffset` gives it.
 *
 * The functions expect valid dates, as `field.isoDate` checks them on every stored record.
 */

const DAY_MS = 86_400_000;

/** The day's number: days since 1970-01-01. */
export function dayNumber(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

/** The date of a day's number. */
export function dateOfDay(day: number): string {
  const d = new Date(day * DAY_MS);
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${String(d.getUTCFullYear()).padStart(4, '0')}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`;
}

/** Days from `from` to `to`: 0 on the same day, negative when `to` comes first. */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/** The date `days` after `date` (before it, for a negative number). */
export function addDays(date: string, days: number): string {
  return dateOfDay(dayNumber(date) + days);
}

/**
 * The local calendar date at `epochMs`, `offsetMinutes` behind UTC (as `getTimezoneOffset`:
 * -120 for UTC+2).
 *
 * @throws RangeError for a time no date can hold.
 */
export function localDate(epochMs: number, offsetMinutes: number): string {
  const local = epochMs - offsetMinutes * 60_000;
  if (!Number.isFinite(local) || Number.isNaN(new Date(local).getTime())) {
    throw new RangeError(`localDate: no date for ${epochMs} at offset ${offsetMinutes}`);
  }
  return dateOfDay(Math.floor(local / DAY_MS));
}
