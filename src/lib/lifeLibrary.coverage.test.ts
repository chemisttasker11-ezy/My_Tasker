import { describe, expect, it } from 'vitest';
import { createTask, initialState, validateImported } from '../model';
import { addLifeTemplates, LIFE_TEMPLATES, STARTER_IDS, templateAdded } from './lifeLibrary';

describe('life library individual templates', () => {
  it.each(LIFE_TEMPLATES.map(template => [template.id, template] as const))('%s creates a valid independent task', (_id, template) => {
    const board = initialState(); const before = structuredClone(board); const originalTemplate = structuredClone(template);
    const next = addLifeTemplates(board, [template.id]);
    const warnings: string[] = []; const imported = validateImported(next, warnings);
    expect(warnings).toEqual([]); expect(imported.tasks).toHaveLength(1);
    const task = imported.tasks[0];
    expect(task).toMatchObject({ templateId: template.id, title: template.title, recurrence: template.recurrence, estimateMinutes: template.estimateMinutes, priority: template.priority });
    expect(task.subtasks.map(s => s.title)).toEqual(template.checklist);
    expect(task.subtasks.every(s => !s.done && s.id)).toBe(true);
    expect(new Set(task.subtasks.map(s => s.id)).size).toBe(task.subtasks.length);
    expect(templateAdded(next.tasks, template)).toBe(true);
    expect(addLifeTemplates(next, [template.id])).toBe(next);
    task.subtasks[0].done = true;
    expect(template).toEqual(originalTemplate); expect(board).toEqual(before);
  });
  it('recognizes matching IDs or normalized titles, including archived cards', () => {
    const template = LIFE_TEMPLATES[0];
    expect(templateAdded([], template)).toBe(false);
    expect(templateAdded([createTask({ title: 'Different', templateId: template.id, archivedAt: '2024-02-29T00:00:00Z' })], template)).toBe(true);
    const task = createTask({ title: template.title.toUpperCase() });
    task.title = `  ${task.title}  `;
    const before = structuredClone(task);
    expect(templateAdded([task], template)).toBe(true);
    expect(templateAdded([createTask({ title: 'Unrelated' })], template)).toBe(false);
    expect(task).toEqual(before);
  });
  it('ignores unknown/duplicate selections and keeps template and starter IDs unique', () => {
    const board = initialState();
    expect(addLifeTemplates(board, [])).toBe(board);
    expect(addLifeTemplates(board, ['missing'])).toBe(board);
    expect(addLifeTemplates(board, [LIFE_TEMPLATES[0].id, LIFE_TEMPLATES[0].id]).tasks).toHaveLength(1);
    expect(new Set(LIFE_TEMPLATES.map(t => t.id)).size).toBe(LIFE_TEMPLATES.length);
    expect(new Set(STARTER_IDS).size).toBe(STARTER_IDS.length);
    STARTER_IDS.forEach(id => expect(LIFE_TEMPLATES.some(t => t.id === id)).toBe(true));
  });
});
