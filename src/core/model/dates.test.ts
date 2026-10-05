import { describe, expect, it } from 'vitest';
import { addDays, dateOfDay, dayNumber, daysBetween, localDate } from './dates';

describe('calendar dates', () => {
  it('count days from 1970-01-01, and back', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('2026-10-05')).toBe(20_731);
    for (const date of ['1970-01-01', '2024-02-29', '2026-10-05', '2026-12-31', '9999-12-31']) {
      expect(dateOfDay(dayNumber(date))).toBe(date);
    }
  });

  it('count the days between two dates, across months, years and a leap day', () => {
    expect(daysBetween('2026-09-22', '2026-10-04')).toBe(12);
    expect(daysBetween('2026-10-04', '2026-09-22')).toBe(-12);
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-10-05', '2026-10-05')).toBe(0);
  });

  it('add days', () => {
    expect(addDays('2026-08-01', 60)).toBe('2026-09-30');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('give the local date at a time, by the offset', () => {
    const late = Date.UTC(2026, 9, 4, 22, 30); // 00:30 on the 5th in Central Europe (UTC+2)
    expect(localDate(late, -120)).toBe('2026-10-05');
    expect(localDate(late, 0)).toBe('2026-10-04');
    expect(localDate(Date.UTC(2026, 9, 5, 3, 0), 240)).toBe('2026-10-04'); // New York, UTC-4
    expect(() => localDate(Number.NaN, 0)).toThrow(RangeError);
  });
});
