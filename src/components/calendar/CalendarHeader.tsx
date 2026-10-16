import { ChevronLeft,ChevronRight,Plus } from 'lucide-react';
import { dateTitle, type CalendarScale } from '../../lib/calendar';
import { formatDate } from '../../lib/display';
const SCALES: {id:CalendarScale;label:string}[] = [
  {id:'day',label:'Day'},{id:'week',label:'Week'},
  {id:'month',label:'Month'},{id:'year',label:'Year'}
];
interface Props {
  anchor:string;scale:CalendarScale;
  onOpenDay:(date:string)=>void;onOpenTracker:()=>void;onCopyDays:()=>void;
  onShift:(direction:number)=>void;onToday:()=>void;onScale:(next:CalendarScale)=>void;
}
/** Calendar navigation/header owns presentation, not recurrence or mutation rules. */
export function CalendarHeader({anchor,scale,onOpenDay,onOpenTracker,onCopyDays,onShift,onToday,onScale}:Props){
  return <>
    <div className="page-title-row calendar-page-title"><div><span className="eyebrow">MAKE TIME FOR WHAT MATTERS</span><h1>Calendar <span className="heading-sparkle">✳</span></h1><p>Tap a day to open its planner, add board tasks, rearrange independent copies and copy/paste plans.</p></div><button className="button button-primary" onClick={() => onOpenDay(anchor)}><Plus size={17}/> Plan {formatDate(anchor)}</button></div>
    <section className="calendar-toolbar panel" aria-label="Calendar controls">
      <button type="button" className="button button-secondary" onClick={()=>{onCopyDays();}}>Copy / paste days</button>
      <button className="button button-primary" onClick={() => onOpenTracker()}>One-page view & PDF</button>
      <div className="calendar-navigation">
        <button className="icon-button" aria-label="Previous period" onClick={() => onShift(-1)}><ChevronLeft size={20}/></button>
        <button className="button button-secondary calendar-today-button" onClick={() => onToday()}>Today</button>
        <button className="icon-button" aria-label="Next period" onClick={() => onShift(1)}><ChevronRight size={20}/></button>
        <h2>{dateTitle(anchor, scale)}</h2>
      </div>
      <div className="calendar-scale-switch" role="group" aria-label="Calendar view">
        {SCALES.map(item => <button key={item.id} type="button" aria-pressed={scale === item.id} className={scale === item.id ? 'selected' : ''} onClick={() => onScale(item.id)}>{item.label}</button>)}
      </div>
    </section>

  </>;
}
