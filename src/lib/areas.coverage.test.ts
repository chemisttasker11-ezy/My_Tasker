import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CATEGORIES, createTask, initialState } from '../model';
import { AreasContext, changeArea, removeArea, useAreas } from './areas';

describe('area helpers', () => {
  it('reads defaults and a supplied context with the real hook', () => {
    function ReadAreas() { return createElement('span', null, useAreas().map(a => a.id).join('|')); }
    expect(renderToStaticMarkup(createElement(ReadAreas))).toContain(CATEGORIES.map(a => a.id).join('|'));
    expect(renderToStaticMarkup(createElement(AreasContext.Provider, { value: [{ id: 'Custom', emoji: '●', tone: 'teal' }] }, createElement(ReadAreas)))).toBe('<span>Custom</span>');
  });
  it('renames and removes an area while preserving task and history snapshots and input', () => {
    const board = initialState();
    board.tasks = [createTask({ title: 'Home task', category: 'Home' }), createTask({ title: 'Other', category: 'Me' })];
    board.completions = [{ id: 'old', taskId: 'deleted', title: 'Historical title', category: 'Home', periodKey: 'once', completedAt: '2024-02-29T00:00:00Z' }];
    const before = structuredClone(board);
    const renamed = changeArea(board, 'Home', '  Household  ');
    expect(renamed.areas[0]).toEqual({ ...board.areas[0], id: 'Household' });
    expect(renamed.tasks[0]).toEqual({ ...board.tasks[0], category: 'Household' });
    expect(renamed.completions[0]).toEqual({ ...board.completions[0], category: 'Household' });
    const removed = removeArea(renamed, 'Household', 'Me');
    expect(removed.areas.some(a => a.id === 'Household')).toBe(false);
    expect(removed.tasks[0].category).toBe('Me'); expect(removed.completions[0].category).toBe('Me');
    expect(renamed.tasks[0].category).toBe('Household'); expect(board).toEqual(before);
  });
  it('accepts exact name/count limits, permits renaming at capacity, and rejects duplicates or missing areas', () => {
    const board = { ...initialState(), areas: Array.from({ length: 39 }, (_, i) => ({ id: `Area ${i}`, emoji: '●', tone: 'teal' })) };
    const name = 'x'.repeat(40); const full = changeArea(board, null, name);
    expect(full.areas).toHaveLength(40); expect(board.areas).toHaveLength(39);
    expect(changeArea(full, name, 'Renamed').areas.at(-1)?.id).toBe('Renamed');
    expect(() => changeArea(full, null, 'Extra')).toThrow('40');
    for (const invalid of ['', '  ', ' ALL ', 'x'.repeat(41), 'aREA 0']) expect(() => changeArea(board, null, invalid)).toThrow();
    expect(() => changeArea(board, 'Missing', 'New')).toThrow('no longer exists');
    for (const [from, to] of [['Area 0', 'Area 0'], ['Missing', 'Area 0'], ['Area 0', 'Missing']]) expect(() => removeArea(board, from, to)).toThrow();
  });
});
