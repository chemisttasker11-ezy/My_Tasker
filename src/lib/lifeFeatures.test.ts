import { describe, expect, it } from 'vitest';
import { createTask, duplicateTask, initialState, toggleCompletion, validateImported } from '../model';
import { addLifeTemplates, LIFE_TEMPLATES, STARTER_IDS } from './lifeLibrary';
import { changeArea, removeArea } from './areas';
import { dailyQuote, QUOTE_LIBRARY, quoteSettings } from './quotes';
import { trackerData, type TrackerOptions } from './tracker';

const options: TrackerOptions = { anchor: '2026-10-16', scale: 'day', area: 'All', includeUndated: true, includeChecklist: true, paper: 'a4' };

describe('life library and saved board compatibility', () => {
  it('adds a detailed starter set once, preserving all existing records and progress', () => {
    const original = toggleCompletion(initialState(), 'notebook-1');
    const next = addLifeTemplates(original, STARTER_IDS);
    expect(next.tasks).toHaveLength(original.tasks.length + 12);
    expect(next.completions).toBe(original.completions);
    expect(next.tasks.slice(0, original.tasks.length)).toEqual(original.tasks);
    expect(addLifeTemplates(next, STARTER_IDS)).toBe(next);
    const edited = { ...next, tasks: next.tasks.map(t => t.templateId === 'morning' ? { ...t, title: 'My own morning', archivedAt: '2026-10-16' } : t) };
    expect(addLifeTemplates(edited, STARTER_IDS)).toBe(edited);
  });
  it('all 64 templates create valid, independent checklists and survive export/import', () => {
    expect(LIFE_TEMPLATES).toHaveLength(64);
    expect(new Set(LIFE_TEMPLATES.map(t => t.id)).size).toBe(64);
    const board = addLifeTemplates(initialState(), LIFE_TEMPLATES.map(t => t.id));
    const added = board.tasks.filter(t => t.templateId);
    for (const task of added) {
      expect(task.description).toContain('Suggested timing:'); expect(task.subtasks.length).toBeGreaterThanOrEqual(5);
      expect(task.estimateMinutes).toBeGreaterThan(0); expect(task.dueDate).toBe('');
    }
    const ids = added.flatMap(t => t.subtasks.map(s => s.id)); expect(new Set(ids).size).toBe(ids.length);
    expect(validateImported(JSON.parse(JSON.stringify(board))).tasks).toEqual(board.tasks);
    expect(duplicateTask(added[0]).templateId).toBeUndefined();
  });
  it('migrates original backups without areas or quotes', () => {
    const old = { ...initialState(), areas: undefined, quotes: undefined };
    const next = validateImported(old);
    expect(next.areas).toHaveLength(5); expect(next.quotes?.direction).toBeTruthy(); expect(next.tasks).toHaveLength(26);
  });
});

describe('editable life areas', () => {
  it('renames and removes areas without losing tasks, history or plans', () => {
    const board = toggleCompletion(initialState(), 'notebook-1');
    const renamed = changeArea(board, 'Finance', 'Money');
    expect(renamed.tasks.find(t => t.id === 'notebook-1')?.category).toBe('Money');
    expect(renamed.completions[0].category).toBe('Money');
    const removed = removeArea(renamed, 'Money', 'Personal');
    expect(removed.tasks).toHaveLength(board.tasks.length); expect(removed.completions[0].category).toBe('Personal');
    expect(validateImported(removed).areas).toHaveLength(4);
  });
  it('rejects duplicate names and invalid destinations and uses surviving areas for templates', () => {
    expect(() => changeArea(initialState(), null, ' family ')).toThrow();
    expect(() => changeArea(initialState(), null, 'All')).toThrow();
    expect(() => removeArea(initialState(), 'Family', 'Family')).toThrow();
    const board = removeArea(initialState(), 'Personal', 'Family');
    expect(addLifeTemplates(board, ['morning']).tasks.at(-1)?.category).toBe('ChemistTasker');
  });
});

describe('quotes and tracker content', () => {
  it('keeps daily choices and custom quotes through a backup round trip', () => {
    expect(QUOTE_LIBRARY).toHaveLength(36);
    const quotes = { ...quoteSettings(), direction: 'My purpose', custom: [{ id: 'mine', text: 'Keep going kindly.', theme: 'My quotes' }], daily: { '2026-10-16': 'My day, my pace.' } };
    const board = validateImported({ ...initialState(), quotes });
    expect(dailyQuote(board.quotes, options.anchor, []).text).toBe('My day, my pace.');
    expect(board.quotes).toEqual(quotes);
    expect(() => validateImported({ ...board, quotes: { ...quotes, daily: { '2026-02-31': 'Invalid date' } } })).toThrow();
  });
  it('suggests consistently from the relevant collection', () => {
    const tasks = [createTask({ title: 'Family meal' })];
    expect(dailyQuote(undefined, options.anchor, tasks).theme).toBe('Connection');
    expect(dailyQuote(undefined, options.anchor, tasks)).toEqual(dailyQuote(undefined, options.anchor, tasks));
  });
  it('includes every day entry, groups year repeats, and separates undated tasks', () => {
    const task = createTask({ title: 'Daily practice', lane: 'daily', dueDate: '2026-01-01' });
    const board = { ...initialState(), tasks: [task, createTask({ title: 'Undated task' })] };
    const day = trackerData(board, options); expect(day.sections[0].items).toHaveLength(1); expect(day.undated).toHaveLength(1);
    const year = trackerData(board, { ...options, scale: 'year' });
    expect(year.sections).toHaveLength(12); expect(year.sections.every(s => s.items.length === 1)).toBe(true);
    expect(year.occurrenceCount).toBe(365); expect(year.tasks).toHaveLength(2);
    expect(trackerData(board, { ...options, includeUndated: false }).undated).toHaveLength(0);
  });
  it('shows undated recurring completion for the selected day without carrying it forward', () => {
    const board = toggleCompletion(initialState(), 'notebook-6', new Date('2026-10-16T02:00:00Z'));
    expect(trackerData(board, options).undated.find(t => t.task.id === 'notebook-6')?.completed).toBe(true);
    expect(trackerData(board, { ...options, anchor: '2026-10-17' }).undated.find(t => t.task.id === 'notebook-6')?.completed).toBe(false);
  });
});
