import { describe, expect, it } from 'vitest';
import { MAX_TITLE_LENGTH, parseQuickAdd } from './quickAdd';
import { brisbaneToday } from '../model';
import { addDays } from './calendar';

describe('parseQuickAdd', () => {
  const FIXED_TODAY = '2026-10-17';
  const FIXED_TOMORROW = '2026-10-18';

  describe('pure title and whitespace trimming', () => {
    it('trims leading and trailing whitespace from the title', () => {
      const result = parseQuickAdd('   Buy oat milk   ');
      expect(result).toEqual({ title: 'Buy oat milk' });
    });

    it('returns an empty title for empty input or whitespace only', () => {
      expect(parseQuickAdd('')).toEqual({ title: '' });
      expect(parseQuickAdd('   ')).toEqual({ title: '' });
    });

    it('preserves internal whitespace between words', () => {
      const result = parseQuickAdd('Call the plumber for a quote');
      expect(result).toEqual({ title: 'Call the plumber for a quote' });
    });
  });

  describe('title length limit', () => {
    it('exports MAX_TITLE_LENGTH equal to 120', () => {
      expect(MAX_TITLE_LENGTH).toBe(120);
    });

    it('keeps titles within 120 characters untouched', () => {
      const title = 'A'.repeat(120);
      expect(parseQuickAdd(title)).toEqual({ title });
    });

    it('cuts titles over 120 characters to exactly 120 characters', () => {
      const longTitle = 'B'.repeat(150);
      const result = parseQuickAdd(longTitle);
      expect(result.title).toHaveLength(120);
      expect(result.title).toBe('B'.repeat(120));
    });

    it('cuts long titles correctly even when combined with smart tags', () => {
      const longTitleWithTag = `${'C'.repeat(150)} today!`;
      const result = parseQuickAdd(longTitleWithTag, FIXED_TODAY);
      expect(result.title).toHaveLength(120);
      expect(result.title).toBe('C'.repeat(120));
      expect(result.priority).toBe('high');
      expect(result.due).toBe(FIXED_TODAY);
    });
  });

  describe('smart priority parsing (trailing "!")', () => {
    it('sets priority high with a trailing exclamation mark without space', () => {
      const result = parseQuickAdd('Urgent tax return!');
      expect(result).toEqual({ title: 'Urgent tax return', priority: 'high' });
    });

    it('sets priority high with a trailing exclamation mark preceded by space', () => {
      const result = parseQuickAdd('Urgent tax return !');
      expect(result).toEqual({ title: 'Urgent tax return', priority: 'high' });
    });

    it('handles multiple trailing exclamation marks', () => {
      const result = parseQuickAdd('Critical server fix!!!');
      expect(result).toEqual({ title: 'Critical server fix', priority: 'high' });
    });

    it('does not set priority high if exclamation mark is in the middle of a sentence', () => {
      const result = parseQuickAdd('Yahoo! search is still alive');
      expect(result).toEqual({ title: 'Yahoo! search is still alive' });
      expect(result.priority).toBeUndefined();
    });

    it('handles a bare exclamation mark', () => {
      const result = parseQuickAdd('!');
      expect(result).toEqual({ title: '', priority: 'high' });
    });
  });

  describe('smart due date parsing ("today" or "tomorrow" as the last word)', () => {
    it('sets due date to todayISO when "today" is the last word', () => {
      const result = parseQuickAdd('Submit quarterly report today', FIXED_TODAY);
      expect(result).toEqual({ title: 'Submit quarterly report', due: FIXED_TODAY });
    });

    it('is case-insensitive for "Today" as the last word', () => {
      const result = parseQuickAdd('Submit quarterly report Today', FIXED_TODAY);
      expect(result).toEqual({ title: 'Submit quarterly report', due: FIXED_TODAY });
    });

    it('sets due date to tomorrow when "tomorrow" is the last word', () => {
      const result = parseQuickAdd('Doctor appointment tomorrow', FIXED_TODAY);
      expect(result).toEqual({ title: 'Doctor appointment', due: FIXED_TOMORROW });
    });

    it('is case-insensitive for "Tomorrow" as the last word', () => {
      const result = parseQuickAdd('Doctor appointment Tomorrow', FIXED_TODAY);
      expect(result).toEqual({ title: 'Doctor appointment', due: FIXED_TOMORROW });
    });

    it('does not set due date if "today" is at the start or middle of the string', () => {
      const result1 = parseQuickAdd('Today is a good day', FIXED_TODAY);
      expect(result1).toEqual({ title: 'Today is a good day' });
      expect(result1.due).toBeUndefined();

      const result2 = parseQuickAdd('Review today at noon with team', FIXED_TODAY);
      expect(result2).toEqual({ title: 'Review today at noon with team' });
      expect(result2.due).toBeUndefined();
    });

    it('does not set due date if "tomorrow" is at the start or middle of the string', () => {
      const result = parseQuickAdd('Tomorrow we start early', FIXED_TODAY);
      expect(result).toEqual({ title: 'Tomorrow we start early' });
      expect(result.due).toBeUndefined();
    });

    it('correctly calculates tomorrow with month rollover', () => {
      const endOfMonth = '2026-10-31';
      const result = parseQuickAdd('Prepare monthly invoice tomorrow', endOfMonth);
      expect(result.due).toBe('2026-11-01');
    });

    it('correctly calculates tomorrow with year rollover', () => {
      const endOfYear = '2026-12-31';
      const result = parseQuickAdd('New year celebrations tomorrow', endOfYear);
      expect(result.due).toBe('2027-01-01');
    });

    it('falls back to brisbaneToday() if todayISO is omitted', () => {
      const resultToday = parseQuickAdd('Walk the dog today');
      expect(resultToday.due).toBe(brisbaneToday());

      const resultTomorrow = parseQuickAdd('Walk the dog tomorrow');
      expect(resultTomorrow.due).toBe(addDays(brisbaneToday(), 1));
    });

    it('handles "today" or "tomorrow" as the only word', () => {
      expect(parseQuickAdd('today', FIXED_TODAY)).toEqual({ title: '', due: FIXED_TODAY });
      expect(parseQuickAdd('tomorrow', FIXED_TODAY)).toEqual({ title: '', due: FIXED_TOMORROW });
    });
  });

  describe('combined smart parsing', () => {
    it('parses both "today" and trailing "!"', () => {
      const result = parseQuickAdd('Pay electricity bill today!', FIXED_TODAY);
      expect(result).toEqual({
        title: 'Pay electricity bill',
        priority: 'high',
        due: FIXED_TODAY,
      });
    });

    it('parses both "tomorrow" and trailing "!" with spaces', () => {
      const result = parseQuickAdd('Submit assignment tomorrow !', FIXED_TODAY);
      expect(result).toEqual({
        title: 'Submit assignment',
        priority: 'high',
        due: FIXED_TOMORROW,
      });
    });

    it('parses "!" placed before "today"', () => {
      const result = parseQuickAdd('Submit payroll ! today', FIXED_TODAY);
      expect(result).toEqual({
        title: 'Submit payroll',
        priority: 'high',
        due: FIXED_TODAY,
      });
    });

    it('parses "!" placed before "tomorrow"', () => {
      const result = parseQuickAdd('Pick up dry cleaning ! tomorrow', FIXED_TODAY);
      expect(result).toEqual({
        title: 'Pick up dry cleaning',
        priority: 'high',
        due: FIXED_TOMORROW,
      });
    });
  });
});
