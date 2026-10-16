import { describe, expect, it } from 'vitest';
import { createTask, initialState } from '../model';
import { addEntry, editEntry, moveEntry, copyDays, pasteDays } from './planning';
import { projectSchedule, relevantTasksForDate } from './planProjection';
import { dailyQuote } from './quotes';
import { trackerData, type TrackerOptions } from './tracker';
import { scoreWeek } from './scoring';

const day='2026-10-16';
const options: TrackerOptions={anchor:day,scale:'day',area:'All',includeUndated:true,includeChecklist:true,paper:'a4'};
describe('schedule projection is shared by calendar, printable tracker and quotes',()=>{
  it('replaces legacy occurrence on copied day but retains unrelated occurrences',()=>{
    const t=createTask({title:'Weekly review',dueDate:day,recurrence:'weekly'});
    const original={...initialState(),tasks:[t]};
    expect(projectSchedule(original,day,day).legacy).toHaveLength(1);
    const state=addEntry(original,t.id,day);
    expect(projectSchedule(state,day,day).planned).toHaveLength(1);
    expect(projectSchedule(state,day,day).legacy).toHaveLength(0);
    expect(projectSchedule(state,'2026-10-23','2026-10-23').legacy).toHaveLength(1);
    expect(state.tasks[0]).toEqual(t);
  });
  it('print uses the independent status, title and checklist in all four scales',()=>{
    const t=createTask({title:'Board source',category:'Pharmacy',subtasks:[{id:'one',title:'Board was done',done:true}]});
    let state=addEntry({...initialState(),tasks:[t]},t.id,day);
    const id=state.plannedEntries[0].id;
    state=editEntry(state,id,{title:'تقرير 📋',status:'finished',subtasks:[
      {id:'fresh',title:'Review notes',done:false},{id:'final',title:'Send summary',done:true}
    ]});
    for(const scale of ['day','week','month','year'] as const){
      const sheet=trackerData(state,{...options,scale});
      const matched=sheet.sections.flatMap(section=>section.items).filter(i=>i.planned);
      expect(matched).toHaveLength(1);
      expect(matched[0].label).toContain('تقرير 📋');
      if(scale!=='year'){
        expect(matched[0].status).toBe('finished');
        expect(matched[0].task.subtasks.map(s=>s.done)).toEqual([false,true]);
      }
    }
  });
  it('quotes reflect selected day, not whichever undated routine happens to be on the board',()=>{
    const family=createTask({title:'Family dinner',lane:'urgent',category:'Family'});
    const work=createTask({title:'Medical report',category:'Pharmacy',lane:'weekly'});
    const state=addEntry({...initialState(),tasks:[family,work]},work.id,day);
    expect(relevantTasksForDate(state,day).map(t=>t.title)).toEqual(['Medical report']);
    expect(relevantTasksForDate(state,'2026-10-18').map(t=>t.title)).toEqual(['Family dinner']);
    expect(dailyQuote(undefined,day,relevantTasksForDate(state,day)).theme).toBe('Momentum');
    expect(dailyQuote(undefined,'2026-10-18',relevantTasksForDate(state,'2026-10-18')).theme).toBe('Connection');
    expect(dailyQuote({direction:'',custom:[],daily:{[day]:'My choice'}},day,relevantTasksForDate(state,day)).text).toBe('My choice');
  });
  it('moving an instance between weeks preserves the previous obligation and starts the new one',()=>{
    const task=createTask({title:'Report',priority:'high'});
    let state=addEntry({...initialState(),tasks:[task]},task.id,'2026-10-12');
    const id=state.plannedEntries[0].id;
    state=editEntry(state,id,{status:'progressing'});
    state=moveEntry(state,id,'2026-10-20');
    expect(scoreWeek(state.weekPlans['2026-10-12'],state,'2026-10-12','2026-10-16').percent).toBe(0);
    expect(scoreWeek(state.weekPlans['2026-10-19'],state,'2026-10-19','2026-10-21').percent).toBe(60);
    expect(state.weekPlans['2026-10-12'].commitments).toHaveLength(1);
    expect(state.weekPlans['2026-10-19'].commitments).toHaveLength(1);
  });
  it('clipboard excludes the legacy event shadowed by an independent copy',()=>{
    const t=createTask({title:'Weekly review',dueDate:day,recurrence:'weekly'});
    const state=addEntry({...initialState(),tasks:[t]},t.id,day);
    const clip=copyDays(state,[day]);
    expect(clip.days[0].entries).toHaveLength(1);
    expect(pasteDays(state,clip,['2026-10-22']).plannedEntries).toHaveLength(2);
  });
});
