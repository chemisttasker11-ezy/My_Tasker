import { afterEach, describe, expect, it, vi } from 'vitest';
import { CATEGORIES, createTask } from '../model';
import { activeItem, categoryInfo, downloadable, formatDate, greeting, longToday, taskDue } from './display';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('display helpers', () => {
  it('formats leap days, month ends and empty or unstructured labels', () => {
    expect(formatDate('2024-02-29')).toBe('29 Feb 2024');
    expect(formatDate('2026-12-31')).toBe('31 Dec 2026');
    expect(formatDate('')).toBe('');
    expect(formatDate('someday')).toBe('someday');
    expect(longToday('2024-02-29')).toMatch(/^Thursday,? 29 February$/);
    expect(() => longToday('invalid')).toThrow(RangeError);
  });
  it.each([
    ['2024-02-28T13:59:59Z', 'Good evening'],
    ['2024-02-28T14:00:00Z', 'Good morning'],
    ['2024-02-29T01:59:59Z', 'Good morning'],
    ['2024-02-29T02:00:00Z', 'Good afternoon'],
    ['2024-02-29T07:00:00Z', 'Good evening']
  ])('greets at Brisbane boundary %s', (instant, expected) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(instant));
    expect(greeting()).toBe(expected);
  });
  it('looks up known and custom areas without changing defaults', () => {
    const before = structuredClone(CATEGORIES);
    expect(categoryInfo('Family')).toEqual(CATEGORIES.find(a => a.id === 'Family'));
    expect(categoryInfo('Custom')).toEqual({ id: 'Custom', emoji: '●', tone: 'teal' });
    expect(categoryInfo('').id).toBe('');
    expect(CATEGORIES).toEqual(before);
  });
  it('keeps finished cards visible and distinguishes due, future, undated and archived cards', () => {
    const task = Object.freeze(createTask({ title: 'Due', dueDate: '2024-02-29', status: 'finished' }));
    expect(activeItem(task)).toBe(true);
    expect(activeItem({ ...task, archivedAt: '2024-03-01T00:00:00Z' })).toBe(false);
    expect(taskDue(task, '2024-02-29', false)).toBe(true);
    expect(taskDue(task, '2024-03-01', false)).toBe(true);
    expect(taskDue(task, '2024-02-28', false)).toBe(false);
    expect(taskDue(task, '2024-03-01', true)).toBe(false);
    expect(taskDue({ ...task, dueDate: '' }, '2024-03-01', false)).toBe(false);
  });
  it.each(['', '{"title":"Family ♥"}'])('downloads exact JSON bytes and revokes its URL: %s', async value => {
    vi.useFakeTimers();
    const anchor = { href: '', download: '', click: vi.fn() };
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor) });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:backup');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    downloadable('backup.json', value);
    expect(anchor).toMatchObject({ href: 'blob:backup', download: 'backup.json' });
    expect(anchor.click).toHaveBeenCalledOnce();
    const blob = create.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/json;charset=utf-8');
    expect(await blob.text()).toBe(value);
    vi.advanceTimersByTime(999); expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(revoke).toHaveBeenCalledWith('blob:backup');
  });
});
