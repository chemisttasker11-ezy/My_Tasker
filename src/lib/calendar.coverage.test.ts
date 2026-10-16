import { describe, expect, it } from 'vitest';
import { addDays, addMonths, dateTitle, dateUTC, isoDay, monthDates } from './calendar';

describe('calendar date primitives', () => {
  it.each(['2024-02-29', '2026-01-31', '2026-12-31'])('round trips %s without mutating the Date', day => {
    const date = dateUTC(day); const timestamp = date.getTime();
    expect(date.toISOString()).toBe(`${day}T12:00:00.000Z`);
    expect(isoDay(date)).toBe(day);
    expect(date.getTime()).toBe(timestamp);
  });
  it('exposes invalid dates and rejects serializing them', () => {
    expect(Number.isNaN(dateUTC('').getTime())).toBe(true);
    expect(Number.isNaN(dateUTC('invalid').getTime())).toBe(true);
    expect(() => isoDay(new Date(NaN))).toThrow(RangeError);
  });
  it.each(['2024-02-29', '2026-02-01', '2026-12-31'])('builds 42 unique consecutive days with Monday first around %s', day => {
    const dates = monthDates(day);
    expect(dates).toHaveLength(42); expect(new Set(dates).size).toBe(42);
    expect(dateUTC(dates[0]).getUTCDay()).toBe(1);
    expect(dates).toContain(day);
    dates.slice(1).forEach((date, i) => expect(date).toBe(addDays(dates[i], 1)));
    expect(monthDates(day)).toEqual(dates);
  });
  it('clamps month ends and preserves leap-day anchors across signed shifts', () => {
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2024-03-31', -1)).toBe('2024-02-29');
    expect(addMonths('2024-02-29', 12)).toBe('2025-02-28');
    expect(addMonths('2024-02-29', 0)).toBe('2024-02-29');
  });
  it('formats titles for every scale including weeks across months and years', () => {
    expect(dateTitle('2024-02-29', 'day')).toMatch(/^Thursday,? 29 February 2024$/);
    expect(dateTitle('2024-02-29', 'month')).toBe('February 2024');
    expect(dateTitle('2024-02-29', 'year')).toBe('2024');
    expect(dateTitle('2024-02-14', 'week')).toBe('12–18 Feb 2024');
    expect(dateTitle('2024-02-29', 'week')).toBe('26 Feb – 3 Mar 2024');
    expect(dateTitle('2025-01-01', 'week')).toBe('30 Dec – 5 Jan 2025');
  });
  // Bug: Date.UTC interprets ISO years 0000–0099 as 1900–1999, corrupting month arithmetic.
  it.fails('preserves a supported early ISO year when crossing into year 0100', () => {
    expect(addMonths('0099-12-31', 1)).toBe('0100-01-31');
  });
});
