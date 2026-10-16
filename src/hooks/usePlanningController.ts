import { useState, type Dispatch, type SetStateAction } from 'react';
import { brisbaneToday, saveWeekReview, setWeekCommitment, toggleDailyFocus, type BoardState } from '../model';
import { scoreWeek } from '../lib/scoring';
import { addEntry, cloneEntry, moveEntry, editEntry, removeEntry, toggleEntryStep, copyDays, pasteDays, setWeekCapacity, type DayClipboard } from '../lib/planning';
import type { PlanningActions } from '../components/PlanWorkspace';

/** One owner for independent daily copies and weekly commitments.
 * UI components never modify scoring or clipboard state directly.
 */
export function usePlanningController(
  board: BoardState,
  setBoard: Dispatch<SetStateAction<BoardState>>,
  notice: (message:string)=>void
) {
  const [dayClipboard, setDayClipboard] = useState<DayClipboard | null>(null);
  function includeInWeek(weekStart: string, id: string, include: boolean) {
    const task = board.tasks.find(item => item.id === id);
    if (!task) return;
    setBoard(state => setWeekCommitment(state, weekStart, task, include));
    notice(include ? 'Added to weekly commitments' : 'Removed from weekly commitments');
  }
  function chooseDailyFocus(date: string, id: string) {
    const selected = board.dailyFocus?.[date] ?? [];
    if (!selected.includes(id) && selected.length >= 3) {
      notice('Choose no more than three priorities per day');
      return;
    }
    setBoard(state => toggleDailyFocus(state, date, id));
    notice(selected.includes(id) ? 'Removed from daily priorities' : 'Added to daily priorities');
  }
  function saveReview(weekStart: string, notes: { wins: string; blockers: string; adjustment: string }) {
    setBoard(state => {
      const percent = scoreWeek(state.weekPlans?.[weekStart], state, weekStart, brisbaneToday()).percent;
      return saveWeekReview(state, weekStart, notes, percent);
    });
    notice('Weekly review saved');
  }
  const planActions: PlanningActions = {
    add: (id,date) => { setBoard(s => addEntry(s,id,date)); notice('Added an independent copy to your plan'); },
    clone: (id,date) => { setBoard(s => cloneEntry(s,id,date)); notice('Duplicated plan task'); },
    move: (id,date,index) => setBoard(s => moveEntry(s,id,date,index)),
    update: (id,patch) => setBoard(s => editEntry(s,id,patch)),
    remove: id => { setBoard(s => removeEntry(s,id)); notice('Removed from day; board task preserved'); },
    toggleStep: (id,step) => setBoard(s => toggleEntryStep(s,id,step)),
    copy: dates => { setDayClipboard(copyDays(board,dates)); notice('Days copied. Select destination day(s) and Paste.'); },
    paste: (dates,mode) => {
      if (!dayClipboard) return;
      const next = pasteDays(board,dayClipboard,dates,mode);
      if (next === board) { notice('Choose matching dates: 1 source to many, same count, or multiple days to one starting date.'); return; }
      setBoard(next); notice('Day plan pasted with independent task progress');
    },
    clipboard: dayClipboard,
    focus: chooseDailyFocus
  };
  const setCapacity=(date:string,hours:number,intention:string)=>setBoard(s=>setWeekCapacity(s,date,hours,intention));
  return { planActions, chooseDailyFocus, includeInWeek, saveReview, setCapacity };
}
