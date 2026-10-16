import type { BoardState } from '../../model';
import { formatDate } from '../../lib/display';
import { PlanWorkspace, type PlanningActions } from '../PlanWorkspace';

interface Props {
  board: BoardState;planActions:PlanningActions;selectionOpen:boolean;selectedDates:string[];
  extraDate:string;anchor:string;planningDay:string|null;
  onCloseSelection:()=>void;onCloseDay:()=>void;onSetExtraDate:(date:string)=>void;
  onIncludeDate:(date:string)=>void;onRemoveDate:(date:string)=>void;
}
/** Both date-selection and day-edit dialogs reuse the same planner workspace. */
export function CalendarPlannerDialogs({board,planActions,selectionOpen,selectedDates,extraDate,anchor,
  planningDay,onCloseSelection,onCloseDay,onSetExtraDate,onIncludeDate,onRemoveDate}:Props){
  return <>
    {selectionOpen && <div className="plan-day-dialog-backdrop" onMouseDown={e=>{ if(e.target===e.currentTarget)onCloseSelection(); }}>
      <section className="plan-day-dialog" role="dialog" aria-modal="true" aria-label="Copy and paste multiple calendar days">
        <header className="plan-day-dialog-head"><div><h2>Copy & paste calendar days</h2><p>Select up to 31 dates and copy their plan. You can paste to one date, selected dates, or a new starting week.</p></div><button type="button" className="button button-primary" onClick={()=>onCloseSelection()}>Close</button></header>
        <div className="calendar-selection-add"><label>Add a date <input type="date" value={extraDate} onChange={e=>onSetExtraDate(e.target.value)}/></label><button type="button" className="button button-secondary" disabled={!extraDate || selectedDates.includes(extraDate) || selectedDates.length>=31} onClick={()=>onIncludeDate(extraDate)}>Include date</button></div>
        <div className="calendar-date-selection">{selectedDates.map(date=><button className="button button-secondary" type="button" key={date} aria-label={`Remove selected day ${date}`} onClick={()=>onRemoveDate(date)}>{date} ×</button>)}</div>
        <PlanWorkspace key={selectedDates.join(',')} board={board} dates={selectedDates.length?selectedDates:[anchor]} actions={planActions} title="Copy or arrange selected days"/>
      </section>
    </div>}
    {planningDay && <div className="plan-day-dialog-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onCloseDay();}}>
      <section className="plan-day-dialog" role="dialog" aria-modal="true" aria-label={`Plan ${formatDate(planningDay)}`}>
        <header className="plan-day-dialog-head"><h2>Plan {formatDate(planningDay)}</h2><button type="button" className="button button-primary" onClick={()=>onCloseDay()}>Close planner</button></header>
        <PlanWorkspace board={board} dates={[planningDay]} actions={planActions} title="Arrange this day" compact/>
      </section>
    </div>}

  </>;
}
