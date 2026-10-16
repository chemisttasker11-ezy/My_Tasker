import { describe, it, expect } from 'vitest';
import { createTask, initialState, validateImported } from '../model';
import { addEntry, cloneEntry, copyDays, dragPayload, editEntry, entriesForDay, moveEntry, parseDragPayload, pasteDays, removeEntry, setEntryStatus, setWeekCapacity, toggleEntryStep } from './planning';
import { scoreWeek } from './scoring';

const monday = '2026-10-12';
function sample() {
  const task = createTask({ title: 'Review HMR', category: 'Pharmacy', priority: 'high',
    recurrence: 'weekly', subtasks: [{ id: 's1', title: 'Review notes', done: true }] });
  return { task, state: { ...initialState(), tasks: [task] } };
}
describe('independent board-to-day planning', () => {
  it('keeps board task untouched and gives each day its own unchecked checklist and status', () => {
    const { state, task } = sample();
    let result = addEntry(addEntry(state, task.id, monday), task.id, '2026-10-13');
    const a = entriesForDay(result, monday)[0], b = entriesForDay(result, '2026-10-13')[0];
    expect(a.id).not.toBe(b.id);
    expect(a.subtasks[0].id).not.toBe(b.subtasks[0].id);
    expect(a.subtasks[0].done).toBe(false);
    result = setEntryStatus(result, a.id, 'finished');
    result = toggleEntryStep(result, a.id, a.subtasks[0].id);
    expect(entriesForDay(result, '2026-10-13')[0].status).toBe('not-started');
    expect(entriesForDay(result, '2026-10-13')[0].subtasks[0].done).toBe(false);
    expect(result.tasks[0]).toEqual(task);
  });
  it('reorders and moves an occurrence without shifting its recurring source', () => {
    const { state, task } = sample();
    let result = addEntry(addEntry(state, task.id, monday), task.id, monday);
    const [first,second] = entriesForDay(result,monday);
    result = moveEntry(result, second.id, monday, 0);
    expect(entriesForDay(result,monday)[0].id).toBe(second.id);
    result = moveEntry(result, first.id, '2026-10-15');
    expect(entriesForDay(result,monday)).toHaveLength(1);
    expect(result.tasks[0].dueDate).toBe(task.dueDate);
    expect(result.weekPlans[monday].commitments).toHaveLength(2);
  });
  it('copy one day to several others; paste multiple days as an offset pattern', () => {
    const { state, task } = sample();
    const source = addEntry(state, task.id, monday);
    const clipboard = copyDays(source, [monday]);
    let result = pasteDays(source, clipboard, ['2026-10-14', '2026-10-16']);
    expect(entriesForDay(result, '2026-10-14')).toHaveLength(1);
    expect(entriesForDay(result, '2026-10-16')).toHaveLength(1);
    const pattern = copyDays(result, [monday, '2026-10-14']);
    result = pasteDays(result, pattern, ['2026-10-19'], 'tasks');
    expect(entriesForDay(result,'2026-10-19')).toHaveLength(1);
    expect(entriesForDay(result,'2026-10-21')).toHaveLength(1);
    expect(entriesForDay(result,'2026-10-21')[0].scheduledTime).toBe('');
  });
  it('keeps a removed occurrence in the committed denominator at zero credit', () => {
    const { state, task } = sample();
    let result = addEntry(state, task.id, monday);
    const id = entriesForDay(result,monday)[0].id;
    result = setEntryStatus(result,id,'progressing');
    expect(scoreWeek(result.weekPlans[monday],result,monday,'2026-10-15').percent).toBe(60);
    result = removeEntry(result,id);
    expect(scoreWeek(result.weekPlans[monday],result,monday,'2026-10-15').percent).toBe(0);
  });
  it('duplicates, edits, persists, validates and preserves old backups', () => {
    const { state, task } = sample();
    let result = addEntry(state,task.id,monday);
    const id = result.plannedEntries[0].id;
    result = editEntry(result,id,{ title:'Private follow-up',scheduledTime:'10:45',status:'started' });
    result = cloneEntry(result,id,'2026-10-13');
    expect(entriesForDay(result,'2026-10-13')[0].title).toBe('Private follow-up');
    expect(entriesForDay(result,'2026-10-13')[0].status).toBe('not-started');
    result = setWeekCapacity(result,monday,12,'Finish important reports');
    expect(validateImported(JSON.parse(JSON.stringify(result))).plannedEntries).toHaveLength(2);
    expect(validateImported(JSON.parse(JSON.stringify(result))).weekPlans[monday].capacityHours).toBe(12);
    const old = { ...initialState() } as Record<string, unknown>; delete old.plannedEntries;
    expect(validateImported(old).plannedEntries).toEqual([]);
    const invalid = JSON.parse(JSON.stringify(result));
    invalid.plannedEntries.push({ ...invalid.plannedEntries[0] });
    expect(() => validateImported(invalid)).toThrow(/Invalid planned entry/);
  });
  it('uses strict drag payloads for board cards and planned copies', () => {
    expect(parseDragPayload(dragPayload({kind:'board',id:'notebook-1'}))).toEqual({kind:'board',id:'notebook-1'});
    expect(parseDragPayload('board:<script>')).toBeNull();
  });
});

describe('actual completion timestamps for independent planned copies', () => {
  it('records the real completion instant, preserves it on edits, clears it on reopening', () => {
    const task=createTask({title:'Timed work'});
    const created=new Date('2026-10-12T09:00:00Z');
    const finished=new Date('2026-10-16T01:00:00Z');
    const edited=new Date('2026-10-17T03:00:00Z');
    let board=addEntry({...initialState(),tasks:[task]},task.id,'2026-10-21',created);
    const id=board.plannedEntries[0].id;
    board=setEntryStatus(board,id,'finished',finished);
    expect(board.plannedEntries[0].completedAt).toBe(finished.toISOString());
    expect(board.plannedEntries[0].date).toBe('2026-10-21');
    board=editEntry(board,id,{title:'Updated title'},edited);
    expect(board.plannedEntries[0].completedAt).toBe(finished.toISOString());
    board=setEntryStatus(board,id,'started',edited);
    expect(board.plannedEntries[0].completedAt).toBe('');
    board=setEntryStatus(board,id,'finished',edited);
    expect(board.plannedEntries[0].completedAt).toBe(edited.toISOString());
  });
  it('imports legacy finished planned copies without corrupting backup version', () => {
    const task=createTask({title:'Legacy'});
    const original=addEntry({...initialState(),tasks:[task]},task.id,monday);
    const previous={...original.plannedEntries[0],status:'finished' as const};
    const {completedAt: _unused, ...legacy}=previous;
    void _unused;
    const restored=validateImported({...original,plannedEntries:[legacy]});
    expect(restored.version).toBe(1);
    expect(restored.plannedEntries[0].completedAt).toBe(legacy.updatedAt);
    expect(restored.plannedEntries[0].status).toBe('finished');
  });
});
