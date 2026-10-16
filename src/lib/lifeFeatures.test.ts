import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createTask, duplicateTask, initialState, toggleCompletion, validateImported } from '../model';
import { addLifeTemplates, LIFE_TEMPLATES, STARTER_IDS } from './lifeLibrary';
import { changeArea, removeArea } from './areas';
import { dailyQuote, QUOTE_LIBRARY, quoteSettings, relevantTasksForDate } from './quotes';
import { trackerData, type TrackerOptions } from './tracker';
import { planTask, setEntryStatus, toggleEntryItem } from './planning';
import {
  allocateTrackerSpace,
  buildTrackerDocument,
  detectTrackerUnsupported,
  detectUnsupportedCharacters,
  formatOmissionWarning,
  hasUnsupportedCharacters,
  isSupportedPdfChar,
  sanitizePdfText,
  setTrackerFontsForTesting
} from './trackerPdf';

// Original v1 export shape: no areas, weekly planning, quotes or newer task fields.
function legacyBackup() {
  const rows: [string, string, 'urgent' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'goals', 'none' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly', 'high' | 'medium'][] = [
    ['Tax', 'Finance', 'urgent', 'none', 'high'],
    ['Take / book appointments', 'Personal', 'urgent', 'none', 'high'],
    ['Clear reports backlog', 'Pharmacy', 'urgent', 'none', 'high'],
    ['Claude setup', 'ChemistTasker', 'urgent', 'none', 'medium'],
    ['Complete any reports', 'Pharmacy', 'daily', 'daily', 'medium'],
    ['Family time', 'Family', 'daily', 'daily', 'high'],
    ['Pharmacy shifts or visits', 'Pharmacy', 'daily', 'daily', 'medium'],
    ['Check emails and reply', 'Personal', 'daily', 'daily', 'medium'],
    ['Review my tasks', 'Personal', 'daily', 'daily', 'medium'],
    ['Training / CPD', 'Pharmacy', 'daily', 'daily', 'medium'],
    ['ChemistTasker progress', 'ChemistTasker', 'daily', 'daily', 'high'],
    ['Invoices for shifts', 'Finance', 'weekly', 'weekly', 'medium'],
    ['Make sure reports are sent', 'Pharmacy', 'weekly', 'weekly', 'medium'],
    ['Check new referrals', 'Pharmacy', 'weekly', 'weekly', 'medium'],
    ['One day outing with family', 'Family', 'weekly', 'weekly', 'high'],
    ['Build a habit with family', 'Family', 'weekly', 'weekly', 'medium'],
    ['Invoices', 'Finance', 'monthly', 'monthly', 'medium'],
    ['Claims', 'Finance', 'monthly', 'monthly', 'medium'],
    ['Review and pay bills', 'Finance', 'monthly', 'monthly', 'medium'],
    ['BAS', 'Finance', 'quarterly', 'quarterly', 'medium'],
    ['Annual tax return', 'Finance', 'quarterly', 'yearly', 'medium'],
    ['Baladi', 'Personal', 'goals', 'none', 'medium'],
    ['Sport', 'Personal', 'goals', 'none', 'medium'],
    ['Grow ChemistTasker', 'ChemistTasker', 'goals', 'none', 'medium'],
    ['Family habits', 'Family', 'goals', 'none', 'medium'],
    ['Lose weight', 'Personal', 'goals', 'none', 'medium']
  ];
  const descriptions: Record<number, string> = {
    0: 'Review outstanding tax paperwork and identify the next step.',
    2: 'Review outstanding HMR and RMMR reports.',
    3: 'Finish the development assistant setup.',
    19: 'Quarterly business activity statement.'
  };
  return {
    version: 1, theme: 'light', completions: [],
    tasks: rows.map(([title, category, lane, recurrence, priority], i) => ({
      id: `notebook-${i + 1}`, title, category, lane, recurrence, priority, description: descriptions[i] ?? '',
      dueDate: '', estimateMinutes: 0, subtasks: [], createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z', completedAt: '', archivedAt: '', origin: 'notebook'
    }))
  };
}
const legacyState = () => validateImported(legacyBackup());

const options: TrackerOptions = { anchor: '2026-10-16', scale: 'day', area: 'All', includeUndated: true, includeChecklist: true, paper: 'a4' };

beforeAll(() => {
  const regPath = path.resolve(process.cwd(), 'public/fonts/nunito-sans-400.ttf');
  const boldPath = path.resolve(process.cwd(), 'public/fonts/nunito-sans-700.ttf');
  setTrackerFontsForTesting(
    fs.readFileSync(regPath).toString('base64'),
    fs.readFileSync(boldPath).toString('base64')
  );
});

describe('life library and saved board compatibility', () => {
  it('adds a detailed starter set once, preserving all existing records and progress', () => {
    const original = toggleCompletion(legacyState(), 'notebook-1');
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
    const old = legacyBackup();
    old.tasks[0].completedAt = '2026-10-15T02:00:00.000Z';
    const backup = { ...old, completions: [{ id: 'legacy-done', taskId: old.tasks[0].id, title: old.tasks[0].title,
      category: old.tasks[0].category, completedAt: old.tasks[0].completedAt, periodKey: 'once' }] };
    expect(backup).not.toHaveProperty('areas');
    expect(backup.tasks[0]).not.toHaveProperty('status');
    const next = validateImported(JSON.parse(JSON.stringify(backup)));
    expect(next.tasks).toMatchObject(backup.tasks);
    expect(next.completions).toMatchObject(backup.completions);
    expect(next.areas.map(a => a.id)).toEqual(['ChemistTasker', 'Pharmacy', 'Family', 'Finance', 'Personal']);
    expect(next.areas).toHaveLength(5); expect(next.quotes?.direction).toBeTruthy(); expect(next.tasks).toHaveLength(26);
  });
});

describe('editable life areas', () => {
  it('renames and removes areas without losing tasks, history or plans', () => {
    const board = toggleCompletion(legacyState(), 'notebook-1');
    const renamed = changeArea(board, 'Finance', 'Money');
    expect(renamed.tasks.find(t => t.id === 'notebook-1')?.category).toBe('Money');
    expect(renamed.completions[0].category).toBe('Money');
    const removed = removeArea(renamed, 'Money', 'Personal');
    expect(removed.tasks).toHaveLength(board.tasks.length); expect(removed.completions[0].category).toBe('Personal');
    expect(validateImported(removed).areas).toHaveLength(4);
  });
  it('rejects duplicate names and invalid destinations and uses surviving areas for templates', () => {
    expect(() => changeArea(legacyState(), null, ' family ')).toThrow();
    expect(() => changeArea(legacyState(), null, 'All')).toThrow();
    expect(() => removeArea(legacyState(), 'Family', 'Family')).toThrow();
    const board = removeArea(legacyState(), 'Personal', 'Family');
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
    const board = toggleCompletion(legacyState(), 'notebook-6', new Date('2026-10-16T02:00:00Z'));
    expect(trackerData(board, options).undated.find(t => t.task.id === 'notebook-6')?.completed).toBe(true);
    expect(trackerData(board, { ...options, anchor: '2026-10-17' }).undated.find(t => t.task.id === 'notebook-6')?.completed).toBe(false);
  });
  it('determines relevant tasks for a date deterministically and preserves user-chosen daily quotes', () => {
    const taskDaily = createTask({ title: 'Morning meditation', lane: 'daily', category: 'Health' });
    const taskFamily = createTask({ title: 'Family dinner', dueDate: '2026-10-16', category: 'Family' });
    const taskFuture = createTask({ title: 'Future project', dueDate: '2026-10-25', category: 'Work' });
    const taskPostponed = createTask({ title: 'Postponed chore', status: 'postponed', dueDate: '2026-10-20' });
    const board = {
      ...initialState(),
      tasks: [taskDaily, taskFamily, taskFuture, taskPostponed]
    };
    const relevantToday = relevantTasksForDate(board, '2026-10-16');
    expect(relevantToday.some(t => t.id === taskDaily.id)).toBe(true);
    expect(relevantToday.some(t => t.id === taskFamily.id)).toBe(true);
    expect(relevantToday.some(t => t.id === taskFuture.id)).toBe(false);
    expect(relevantToday.some(t => t.id === taskPostponed.id)).toBe(false);

    // On 2026-10-20, taskPostponed is no longer in the future relative to that date
    const relevantPostponedDate = relevantTasksForDate(board, '2026-10-20');
    expect(relevantPostponedDate.some(t => t.id === taskPostponed.id)).toBe(true);

    // Deterministic check: multiple calls produce identical results
    expect(relevantTasksForDate(board, '2026-10-16')).toEqual(relevantToday);

    // Suggested quote adapts to the date's relevant tasks (Family dinner -> Connection)
    const quoteToday = dailyQuote(board.quotes, '2026-10-16', relevantToday);
    expect(quoteToday.theme).toBe('Connection');

    // User-chosen daily quote always wins over suggested quote
    const boardWithChosen = {
      ...board,
      quotes: { ...quoteSettings(board.quotes), daily: { '2026-10-16': 'My custom day quote' } }
    };
    const chosenQuote = dailyQuote(boardWithChosen.quotes, '2026-10-16', relevantToday);
    expect(chosenQuote.text).toBe('My custom day quote');
    expect(chosenQuote.custom).toBe(true);
  });
});

describe('PDF layout math and CR-10 space allocation', () => {
  it('allocates day-page space by content density', () => {
    // Case 1: Sparse dated (1), many undated (20)
    const sparseDated = allocateTrackerSpace(400, 'day', 1, 20);
    expect(sparseDated.undatedHeight).toBeGreaterThan(sparseDated.gridHeight);

    // Case 2: Many dated (20), few undated (1)
    const denseDated = allocateTrackerSpace(400, 'day', 20, 1);
    expect(denseDated.gridHeight).toBeGreaterThan(denseDated.undatedHeight);

    // Case 3: Zero undated -> all space to grid
    const noUndated = allocateTrackerSpace(400, 'day', 5, 0);
    expect(noUndated.undatedHeight).toBe(0);
    expect(noUndated.gridHeight).toBe(400);

    // Case 4: Zero dated -> undated gets majority of day space
    const noDated = allocateTrackerSpace(400, 'day', 0, 10);
    expect(noDated.undatedHeight).toBeGreaterThan(noDated.gridHeight);
    expect(noDated.gridHeight).toBeLessThanOrEqual(50);
  });

  it('never produces negative heights or crashes on extreme inputs (CR-10)', () => {
    const zeroSpace = allocateTrackerSpace(0, 'day', 10, 10);
    expect(zeroSpace.gridHeight).toBeGreaterThanOrEqual(0);
    expect(zeroSpace.undatedHeight).toBeGreaterThanOrEqual(0);

    const negativeSpace = allocateTrackerSpace(-50, 'day', 10, 10);
    expect(negativeSpace.gridHeight).toBeGreaterThanOrEqual(0);
    expect(negativeSpace.undatedHeight).toBeGreaterThanOrEqual(0);

    // Week / month scales bound undated height to prevent collapsing the grid
    const weekSpace = allocateTrackerSpace(500, 'week', 15, 30);
    expect(weekSpace.undatedHeight).toBeLessThanOrEqual(500 * 0.35);
    expect(weekSpace.gridHeight).toBeGreaterThan(500 * 0.6);
  });
});

describe('PDF character detector and visible placeholder substitution', () => {
  it('accurately identifies supported Latin and unsupported non-Latin / emoji characters', () => {
    // Supported Latin
    expect(isSupportedPdfChar('A')).toBe(true);
    expect(isSupportedPdfChar('z')).toBe(true);
    expect(isSupportedPdfChar('é')).toBe(true);
    expect(isSupportedPdfChar('ü')).toBe(true);
    expect(isSupportedPdfChar('—')).toBe(true); // em-dash
    expect(isSupportedPdfChar('‘')).toBe(true); // curly quote
    expect(hasUnsupportedCharacters('Hello, world! 123')).toBe(false);
    expect(hasUnsupportedCharacters('Café & Übergrößen')).toBe(false);

    // Unsupported non-Latin
    expect(isSupportedPdfChar('П')).toBe(false); // Cyrillic
    expect(isSupportedPdfChar('你')).toBe(false); // Chinese
    expect(isSupportedPdfChar('Ω')).toBe(false); // Greek
    expect(hasUnsupportedCharacters('Привет мир')).toBe(true);
    expect(detectUnsupportedCharacters('Привет мир')).toEqual(['П', 'р', 'и', 'в', 'е', 'т', 'м']);

    // Unsupported emoji
    expect(isSupportedPdfChar('🚀')).toBe(false);
    expect(isSupportedPdfChar('🍎')).toBe(false);
    expect(detectUnsupportedCharacters('Task 🚀 and 🍎')).toEqual(['🚀', '🍎']);
  });

  it('substitutes a visible placeholder instead of dropping characters silently', () => {
    expect(sanitizePdfText('Task 🚀 with 🍎')).toBe('Task ? with ?');
    expect(sanitizePdfText('Plain Latin text')).toBe('Plain Latin text');
    expect(sanitizePdfText('Привет')).toBe('??????');
  });

  it('scans entire tracker dataset for unsupported characters', () => {
    const taskWithEmoji = createTask({ title: 'Grocery 🛒', subtasks: [{ id: 's1', title: 'Apples 🍏', done: false }] });
    const board = { ...initialState(), tasks: [taskWithEmoji] };
    const data = trackerData(board, options);
    const unsupported = detectTrackerUnsupported(data, 'My direction 🌟', 'Quote with 💡');
    expect(unsupported).toContain('🛒');
    expect(unsupported).toContain('🍏');
    expect(unsupported).toContain('🌟');
    expect(unsupported).toContain('💡');
  });
});

describe('tracker PDF generation, omission tracking, and SVG Unicode retention', () => {
  it('computes omitted tasks and checklist steps when content cannot fit and prints omission notice (200x10)', async () => {
    const tasks200 = Array.from({ length: 200 }, (_, i) =>
      createTask({
        id: `task-${i + 1}`,
        title: `Task number ${i + 1}`,
        dueDate: '2026-10-16',
        subtasks: Array.from({ length: 10 }, (_, s) => ({
          id: `task-${i + 1}-step-${s + 1}`,
          title: `Step ${s + 1} for task ${i + 1}`,
          done: false
        }))
      })
    );
    const board200 = { ...initialState(), tasks: tasks200 };
    const dayOptions: TrackerOptions = {
      anchor: '2026-10-16',
      scale: 'day',
      area: 'All',
      includeUndated: false,
      includeChecklist: true,
      paper: 'a4'
    };
    const data200 = trackerData(board200, dayOptions);
    const doc200 = await buildTrackerDocument(data200, dayOptions, 'My Direction', 'My Quote');

    // Never drop silently: compute what fits, and return {omittedTasks, omittedSteps}
    expect(doc200.omittedTasks).toBeGreaterThan(0);
    expect(doc200.omittedSteps).toBeGreaterThan(0);

    // Affected panel in PDF/SVG preview prints "+N more tasks not shown"
    expect(doc200.svg).toContain(`+${doc200.omittedTasks} more tasks not shown`);

    // Warning text formatting
    const warning = formatOmissionWarning(doc200.omittedTasks, doc200.omittedSteps);
    expect(warning).toContain(`${doc200.omittedTasks} tasks and ${doc200.omittedSteps} steps didn't fit. Turn off checklists or pick a shorter period.`);
    expect(formatOmissionWarning(12, 40)).toBe("12 tasks and 40 steps didn't fit. Turn off checklists or pick a shorter period.");
    expect(formatOmissionWarning(1, 1)).toBe("1 task and 1 step didn't fit. Turn off checklists or pick a shorter period.");
    expect(formatOmissionWarning(12, 0)).toBe("12 tasks didn't fit. Turn off checklists or pick a shorter period.");
    expect(formatOmissionWarning(0, 40)).toBe("40 steps didn't fit. Turn off checklists or pick a shorter period.");
  });

  it('unsupported-character substitution applies ONLY to PDF text while SVG preview keeps original Unicode', async () => {
    const unicodeTask = createTask({
      id: 'unicode-1',
      title: 'Task with emoji 🚀 and non-Latin привет',
      dueDate: '2026-10-16',
      subtasks: [{ id: 'us1', title: 'Checklist with 🍏 and мир', done: false }]
    });
    const boardUnicode = { ...initialState(), tasks: [unicodeTask] };
    const dayOptions: TrackerOptions = {
      anchor: '2026-10-16',
      scale: 'day',
      area: 'All',
      includeUndated: false,
      includeChecklist: true,
      paper: 'a4'
    };
    const dataUnicode = trackerData(boardUnicode, dayOptions);
    const docUnicode = await buildTrackerDocument(
      dataUnicode,
      dayOptions,
      'Direction with 🌟 and цель',
      'Quote with 💡 and идея'
    );

    // The SVG preview keeps original Unicode (the browser can render it)
    expect(docUnicode.svg).toContain('Task with emoji 🚀 and non-Latin привет');
    expect(docUnicode.svg).toContain('Checklist with 🍏 and мир');
    expect(docUnicode.svg).toContain('Direction with 🌟 and цель');
    expect(docUnicode.svg).toContain('Quote with 💡 and идея');

    // Make sure SVG preview does not replace them with '?'
    expect(docUnicode.svg).not.toContain('Task with emoji ? and non-Latin ??????');
    expect(docUnicode.svg).not.toContain('Checklist with ? and ???');

    // Unsupported character list contains the original unsupported characters
    expect(docUnicode.unsupportedChars).toContain('🚀');
    expect(docUnicode.unsupportedChars).toContain('🍏');
    expect(docUnicode.unsupportedChars).toContain('🌟');
    expect(docUnicode.unsupportedChars).toContain('💡');
  });

  it('projects day, week, month, and year with two copies of one task on different days with different progress', () => {
    const sourceTask = createTask({
      id: 'task-source-1',
      title: 'Prepare quarterly review',
      dueDate: '2026-10-15',
      category: 'Home',
      subtasks: [
        { id: 'sub-1', title: 'Collect notes', done: false },
        { id: 'sub-2', title: 'Draft summary', done: false }
      ]
    });

    let board = {
      ...initialState(),
      tasks: [sourceTask]
    };

    board = planTask(board, sourceTask.id, '2026-10-15');
    const entry1 = board.plannedEntries!.find(e => e.date === '2026-10-15')!;
    board = setEntryStatus(board, entry1.id, 'started');
    board = toggleEntryItem(board, entry1.id, entry1.checklist[0].id);

    board = planTask(board, sourceTask.id, '2026-10-16');
    const entry2 = board.plannedEntries!.find(e => e.date === '2026-10-16')!;
    board = setEntryStatus(board, entry2.id, 'finished');
    board = toggleEntryItem(board, entry2.id, entry2.checklist[0].id);
    board = toggleEntryItem(board, entry2.id, entry2.checklist[1].id);

    // Source task is completely unmodified
    const currentSource = board.tasks.find(t => t.id === sourceTask.id)!;
    expect(currentSource.status).toBe('not-started');
    expect(currentSource.subtasks.every(s => !s.done)).toBe(true);

    // Week projection (includes 2026-10-15 and 2026-10-16)
    const weekOptions: TrackerOptions = {
      anchor: '2026-10-15',
      scale: 'week',
      area: 'All',
      includeUndated: false,
      includeChecklist: true,
      paper: 'a4'
    };
    const weekData = trackerData(board, weekOptions);

    // Oct 15: source task (due) + planned copy 1 (dedupe nothing)
    const oct15Section = weekData.sections.find(s => s.title.includes('15'))!;
    expect(oct15Section.items).toHaveLength(2);

    const sourceDueItem = oct15Section.items.find(i => !i.key.startsWith('planned-'))!;
    expect(sourceDueItem.task.id).toBe(sourceTask.id);
    expect(sourceDueItem.status).toBe('not-started');

    const copy1Item = oct15Section.items.find(i => i.key.startsWith('planned-'))!;
    expect(copy1Item.label).toContain('planned');
    expect(copy1Item.status).toBe('started');
    expect(copy1Item.completed).toBe(false);
    expect(copy1Item.task.subtasks[0].done).toBe(true);
    expect(copy1Item.task.subtasks[1].done).toBe(false);

    // Oct 16: planned copy 2
    const oct16Section = weekData.sections.find(s => s.title.includes('16'))!;
    expect(oct16Section.items).toHaveLength(1);
    const copy2Item = oct16Section.items[0];
    expect(copy2Item.label).toContain('planned');
    expect(copy2Item.status).toBe('finished');
    expect(copy2Item.completed).toBe(true);
    expect(copy2Item.task.subtasks[0].done).toBe(true);
    expect(copy2Item.task.subtasks[1].done).toBe(true);

    // Day projection on 2026-10-15: source task and copy 1
    const day1Data = trackerData(board, { ...weekOptions, anchor: '2026-10-15', scale: 'day' });
    expect(day1Data.sections[0].items).toHaveLength(2);
    expect(day1Data.sections[0].items.some(i => i.label.includes('planned') && i.status === 'started')).toBe(true);

    // Day projection on 2026-10-16: copy 2
    const day2Data = trackerData(board, { ...weekOptions, anchor: '2026-10-16', scale: 'day' });
    expect(day2Data.sections[0].items).toHaveLength(1);
    expect(day2Data.sections[0].items[0].label).toContain('planned');
    expect(day2Data.sections[0].items[0].status).toBe('finished');

    // Month projection
    const monthData = trackerData(board, { ...weekOptions, scale: 'month' });
    const monthOct15 = monthData.sections.find(s => !s.outside && s.title.includes('15'))!;
    expect(monthOct15.items).toHaveLength(2);
    const monthOct16 = monthData.sections.find(s => !s.outside && s.title.includes('16'))!;
    expect(monthOct16.items).toHaveLength(1);

    // Year projection
    const yearData = trackerData(board, { ...weekOptions, scale: 'year' });
    const octSection = yearData.sections[9]; // October (index 9)
    expect(octSection.items).toHaveLength(3);
    const plannedYearItems = octSection.items.filter(i => i.key.startsWith('planned-'));
    expect(plannedYearItems).toHaveLength(2);
    expect(plannedYearItems[0].status).toBe('started');
    expect(plannedYearItems[1].status).toBe('finished');
    expect(plannedYearItems.every(i => i.label.includes('planned'))).toBe(true);
  });

  it('seeded calendar planning board passes validateImported with no warnings', () => {
    const board = initialState();
    board.weeklyScoreEnabled = true;
    board.onboardingStep = undefined;
    board.tasks = [
      createTask({
        id: 'task-due-today',
        title: 'File monthly invoice',
        category: 'Money',
        lane: 'urgent',
        dueDate: '2026-10-17',
        priority: 'high',
        scheduledTime: '09:00',
        subtasks: [
          { id: 'sub-inv-1', title: 'Export line items', done: false },
          { id: 'sub-inv-2', title: 'Send PDF to client', done: false }
        ]
      }),
      createTask({
        id: 'task-board-1',
        title: 'Research planning frameworks',
        category: 'Me',
        lane: 'daily',
        priority: 'medium',
        subtasks: [
          { id: 'sub-res-1', title: 'Read ADHD planning guidelines', done: false },
          { id: 'sub-res-2', title: 'Outline workflow steps', done: false }
        ]
      }),
      createTask({
        id: 'task-board-2',
        title: 'Refactor calendar layout',
        category: 'Work',
        lane: 'weekly',
        priority: 'low'
      })
    ];
    const warnings: string[] = [];
    const validated = validateImported(board, warnings);
    expect(warnings).toHaveLength(0);
    expect(validated.tasks).toHaveLength(3);
    expect(validated.onboardingStep).toBeUndefined();
    expect(validated.weeklyScoreEnabled).toBe(true);
  });
});

