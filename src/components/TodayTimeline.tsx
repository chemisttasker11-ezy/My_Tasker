import { useEffect, useMemo, useState } from 'react';
import type { BoardState } from '../model';
import type { PlanningActions } from './PlanWorkspace';
import { addDays } from '../lib/calendar';
import { entriesForDay } from '../lib/planning';

/** PR2's Now/timeline/carry-over concept adapted to the authoritative PR1 planning model. */
export function TodayTimeline({ board, day, actions, onFocus }: { board: BoardState; day: string; actions: PlanningActions; onFocus: (id: string) => void }) {
  const [now, setNow] = useState(() => new Date());
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const handleVisibility = () => { if (!document.hidden) refresh(); };
    const interval = window.setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', handleVisibility); };
  }, []);
  const entries = useMemo(() => entriesForDay(board, day), [board, day]);
  const yesterday = addDays(day, -1);
  const unfinished = useMemo(() => entriesForDay(board, yesterday).filter(e => e.status !== 'finished'), [board, yesterday]);
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Australia/Brisbane', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  const minute = Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
  const sorted = [...entries].sort((a,b) => (a.scheduledTime || '99:99').localeCompare(b.scheduledTime || '99:99') || a.order-b.order);
  const available = sorted.filter(e=>e.status !== 'finished');
  const current = available.find(e => {
    if (!e.scheduledTime) return false;
    const start = Number(e.scheduledTime.slice(0,2))*60 + Number(e.scheduledTime.slice(3));
    return start <= minute && minute < start + Math.max(0,e.estimateMinutes);
  });
  const next = current || available.find(e=>e.scheduledTime && e.scheduledTime >= clock) || available[0];
  const plannedMinutes = entries.reduce((sum,e)=>sum+Math.max(0,e.estimateMinutes),0);
  return <section className="pr3-day-timeline panel" aria-label="Today's timeline">
    <header><h2>Now and next</h2><p>Current time {clock} · {Math.round(plannedMinutes/60*10)/10} hours planned</p></header>
    {next ? <div className="pr3-now-card"><strong>{next.title}</strong><span>{next.scheduledTime || 'Anytime'} · {next.estimateMinutes ? next.estimateMinutes+' min' : 'No time estimate'}</span><button type="button" className="button button-primary" onClick={()=>onFocus(next.id)}>Start focus</button><button type="button" className="button button-secondary" onClick={()=>actions.update(next.id,{status:'finished'})}>Mark finished</button></div> : <p>Nothing planned yet. Add a board task to build your day.</p>}
    {unfinished.length>0 && dismissed!==day && <div className="pr3-carry-over" role="group" aria-label="Unfinished tasks from yesterday"><strong>{unfinished.length} unfinished from yesterday</strong><p>Choose whether to carry these planned copies forward.</p><button type="button" onClick={()=>{unfinished.forEach(e=>actions.move(e.id,day));setDismissed(day);}}>Move to today</button><button type="button" onClick={()=>setDismissed(day)}>Decide later</button></div>}
    <ol className="pr3-timeline-list">{sorted.map(e=><li key={e.id}><time>{e.scheduledTime||'Anytime'}</time><div><strong>{e.title}</strong><small>{e.estimateMinutes ? e.estimateMinutes+' min · ' : ''}{e.status} · {e.subtasks.filter(s=>s.done).length}/{e.subtasks.length} steps</small></div><button type="button" onClick={()=>onFocus(e.id)}>Focus</button></li>)}</ol>
  </section>;
}
