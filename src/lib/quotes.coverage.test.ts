import { describe, expect, it } from 'vitest';
import { createTask } from '../model';
import { dailyQuote, DEFAULT_DIRECTION, QUOTE_LIBRARY, quoteSettings, suggestedTheme, validateQuoteSettings } from './quotes';

describe('quote validation and selection', () => {
  it('provides independent defaults and copies validated values without mutating input', () => {
    expect(validateQuoteSettings(undefined)).toEqual({ direction: DEFAULT_DIRECTION, custom: [], daily: {} });
    const first = quoteSettings(); first.custom.push({ id: 'mine', text: 'Mine', theme: 'My quotes' });
    expect(quoteSettings().custom).toEqual([]);
    const input = { direction: '  Breathe  ', custom: [{ id: 'mine', text: '  Keep going  ', theme: 'Ignored' }], daily: { '2024-02-29': 'Leap day' } };
    const before = structuredClone(input);
    expect(validateQuoteSettings(input)).toEqual({ direction: 'Breathe', custom: [{ id: 'mine', text: 'Keep going', theme: 'My quotes' }], daily: input.daily });
    expect(input).toEqual(before);
  });
  it.each([null, [], 'quote', {}, { ...quoteSettings(), direction: 'x'.repeat(241) },
    { ...quoteSettings(), custom: Array.from({ length: 101 }, (_, i) => ({ id: `${i}`, text: 'Text' })) },
    { ...quoteSettings(), custom: [{ id: QUOTE_LIBRARY[0].id, text: 'Collision' }] },
    { ...quoteSettings(), custom: [{ id: 'same', text: 'One' }, { id: 'same', text: 'Two' }] },
    { ...quoteSettings(), custom: [{ id: '', text: 'Text' }] },
    { ...quoteSettings(), custom: [{ id: 'mine', text: '   ' }] },
    { ...quoteSettings(), custom: [{ id: 'x'.repeat(101), text: 'Text' }] },
    { ...quoteSettings(), custom: [{ id: 'mine', text: 'x'.repeat(241) }] },
    { ...quoteSettings(), daily: { '2023-02-29': 'Invalid leap day' } },
    { ...quoteSettings(), daily: { '2024-04-31': 'Invalid month end' } },
    { ...quoteSettings(), daily: { '2024-02-29': '' } },
    { ...quoteSettings(), daily: [] }
  ])('rejects invalid settings %#', input => {
    expect(() => validateQuoteSettings(input)).toThrow();
  });
  it('accepts exact text, ID, custom-count and daily-count limits and rejects one extra daily quote', () => {
    const daily = Object.fromEntries(Array.from({ length: 1500 }, (_, i) => [new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10), 'x'.repeat(240)]));
    const input = { direction: 'x'.repeat(240), custom: Array.from({ length: 100 }, (_, i) => ({ id: `${i}`.padEnd(100, 'x'), text: 'x'.repeat(240), theme: 'My quotes' })), daily };
    const before = structuredClone(input);
    expect(validateQuoteSettings(input)).toEqual(input);
    expect(input).toEqual(before);
    expect(() => validateQuoteSettings({ ...input, daily: { ...daily, '2030-01-01': 'Extra' } })).toThrow();
  });
  it.each([
    ['', 'Joy'], ['Call family', 'Connection'], ['Rest', 'Balance'], ['Study', 'Courage'],
    ['Tidy paperwork', 'Clarity'], ['Run errands', 'Momentum'], ['Learn together', 'Connection']
  ])('selects theme for %s without mutation', (title, theme) => {
    const tasks = title ? [createTask({ title, category: 'Me' })] : [];
    const before = structuredClone(tasks);
    expect(suggestedTheme(tasks)).toBe(theme);
    expect(dailyQuote(undefined, '2024-02-29', tasks)).toMatchObject({ theme, custom: false });
    expect(tasks).toEqual(before);
  });
  it('selects deterministic library quotes and honours a date-specific override', () => {
    const settings = validateQuoteSettings({ ...quoteSettings(), daily: { '2024-02-29': 'My reminder' } });
    expect(dailyQuote(settings, '2024-02-29', [])).toEqual({ text: 'My reminder', theme: 'Chosen by you', custom: true });
    const next = dailyQuote(settings, '2024-03-01', []);
    expect(dailyQuote(settings, '2024-03-01', [])).toEqual(next);
    expect(QUOTE_LIBRARY.some(q => q.text === next.text && q.theme === next.theme)).toBe(true);
  });
});
