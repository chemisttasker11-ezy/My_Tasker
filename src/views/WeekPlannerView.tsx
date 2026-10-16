import { useEffect, useMemo, useState } from 'react';
import { PlanWorkspace, type PlanningActions } from '../components/PlanWorkspace';
import { ArrowRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Target } from 'lucide-react';
import { type BoardState, type Lane, type Task, type View, type WeekReview } from '../model';
import { addDays, calendarOccurrences, dateTitle, mondayOf } from '../lib/calendar';
import { scoreWeek } from '../lib/scoring';
import { LegacyWeekSchedule } from '../components/weekly/LegacyWeekSchedule';
import { WeeklyCommitmentsPanel } from '../components/weekly/WeeklyCommitmentsPanel';
import { WeeklyReviewPanel } from '../components/weekly/WeeklyReviewPanel';
import { WeeklyScoreMeter } from '../components/WeeklyScoreMeter';

type ReviewNotes = Pick<WeekReview, 'wins' | 'blockers' | 'adjustment'>;

interface Props {
  planActions: PlanningActions;
  onCapacity: (weekStart: string, hours: number, intention: string) => void;
  board: BoardState;
  today: string;
  navigate: (view: View) => void;
  onEdit: (task: Task | null, lane?: Lane, defaultDate?: string) => void;
  onInclude: (weekStart: string, id: string, include: boolean) => void;
  onFocus: (date: string, id: string) => void;
  onReview: (weekStart: string, notes: ReviewNotes) => void;
}

/** Visual planning composes the shared calendar projector and pure score model. */
export function WeekPlannerView({ board, planActions, onCapacity, today, navigate, onEdit, onInclude, onFocus, onReview }: Props) {
  const [anchor, setAnchor] = useState(today);
  const [capacity, setCapacity] = useState('');
  const [intention, setIntention] = useState('');
  const weekStart = mondayOf(anchor);
  const weekEnd = addDays(weekStart, 6);
  const isPastWeek = weekEnd < today;
  const plan = board.weekPlans?.[weekStart];
  useEffect(() => { setCapacity(String(board.weekPlans[weekStart]?.capacityHours ?? '')); setIntention(board.weekPlans[weekStart]?.intention ?? ''); }, [weekStart]);
  const summary = useMemo(() => scoreWeek(plan, board, weekStart, today), [plan, board, weekStart, today]);
  const shownPercent = isPastWeek && plan?.review?.savedAt ? plan.review.scoreSnapshot : summary.percent;
  const scheduled = useMemo(
    () => calendarOccurrences(board.tasks, board.completions, weekStart, weekEnd),
    [board.tasks, board.completions, weekStart, weekEnd]
  );
  const plannedIds = new Set(plan?.commitments.map(item => item.taskId) ?? []);
  const candidates = [...new Map(scheduled.filter(item => !plannedIds.has(item.task.id)).map(item => [item.task.id, item.task])).values()];
  const backlog = board.tasks.filter(task => !task.archivedAt && !task.dueDate &&
    !task.completedAt && !plannedIds.has(task.id) && task.lane !== 'goals').slice(0, 8);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  return <div className="week-planner">
    <header className="week-page-heading">
      <div><h1>Plan your week</h1><p>Commit to a realistic week, choose three priorities each day and learn from the results.</p></div>
      <button className="button button-secondary" type="button" onClick={() => navigate('calendar')}><CalendarDays size={18}/> Full calendar <ArrowRight size={16}/></button>
    </header>
    <div className="week-navigation panel">
      <div className="week-navigation-controls">
        <button className="icon-button" type="button" onClick={() => setAnchor(addDays(weekStart, -7))} aria-label="Previous week"><ChevronLeft size={20}/></button>
        <button className="button button-secondary" type="button" onClick={() => setAnchor(today)}>This week</button>
        <button className="icon-button" type="button" onClick={() => setAnchor(addDays(weekStart, 7))} aria-label="Next week"><ChevronRight size={20}/></button>
        <h2>{dateTitle(weekStart, 'week')}</h2>
      </div>
      <span className="week-phase">{weekStart === mondayOf(today) ? 'Current week' : isPastWeek ? 'Past week' : 'Coming up'}</span>
    </div>

    <section className="week-overview panel" aria-label="Weekly progress and scoring">
      <div className="week-score-main">
        <span className="week-overline">Your weekly progress</span>
        <WeeklyScoreMeter percent={shownPercent} label="Weighted week score"/>
        <p>{summary.planned
          ? 'Based on work you committed to, not work moved elsewhere. High-priority work carries more weight.'
          : 'Select the work you actually intend to complete. A score appears once you commit to tasks.'}</p>
      </div>
      <div className="week-numbers">
        <div><ClipboardList size={20}/><strong>{summary.planned}</strong><span>Committed</span></div>
        <div><CheckCircle2 size={20}/><strong>{summary.finished}</strong><span>Finished</span></div>
        <div><Target size={20}/><strong>{summary.postponed}</strong><span>Postponed</span></div>
      </div>
    </section>

    <section className="week-intention panel" aria-label="Weekly intention and capacity">
      <div><h2>Make this week realistic</h2><p>Choose your one meaningful outcome and protect time for rest. Don't overfill seven days.</p></div>
      <form onSubmit={event=>{ event.preventDefault();onCapacity(weekStart,Number(capacity||0),intention); }}>
        <label>One meaningful win <input maxLength={400} value={intention} onChange={e=>setIntention(e.target.value)} placeholder="What would make this a successful week?"/></label>
        <label>Capacity (hours) <input type="number" min={0} max={168} step="0.5" value={capacity} onChange={e=>setCapacity(e.target.value)} placeholder="e.g. 20"/></label>
        <button type="submit" className="button button-primary">Save weekly intention</button>
      </form>
      {Number(capacity)>0&&<p className="week-capacity-summary">Estimated planned time: {(board.plannedEntries.filter(e=>e.date>=weekStart&&e.date<=weekEnd).reduce((sum,e)=>sum+e.estimateMinutes,0)/60).toFixed(1)} / {capacity} hours</p>}
    </section>
    <PlanWorkspace board={board} dates={days} actions={planActions} title="Build your seven-day plan"/>
    <LegacyWeekSchedule board={board} days={days} scheduled={scheduled} today={today}
      plannedIds={plannedIds} weekStart={weekStart} onEdit={onEdit} onFocus={onFocus} onInclude={onInclude}/>
    <div className="week-bottom-grid">
      <WeeklyCommitmentsPanel summary={summary} candidates={candidates}
        backlog={backlog} weekStart={weekStart} onInclude={onInclude} onEdit={onEdit}/>
      <WeeklyReviewPanel key={weekStart} plan={plan} planned={summary.planned} weekStart={weekStart} onReview={onReview}/>
    </div>
    <details className="week-scoring-guide panel">
      <summary>How the score works <ChevronRight size={17}/></summary>
      <p>Your weekly score is the weighted average of the status scores for tasks you deliberately committed to. High priority counts 3×, medium 2× and low 1×. Moving or postponing a task does not remove it automatically.</p>
      <div className="week-score-legend"><span>Not started <strong>0</strong></span><span>Started <strong>25</strong></span><span>Progressing <strong>60</strong></span><span>Finished <strong>100</strong></span><span>Postponed <strong>0</strong></span></div>
      <p>Checklist ticks are deliberately separate from status scoring. Finishing any occurrence of a recurring task during the week counts as finished for that weekly commitment.</p>
    </details>
  </div>;
}
