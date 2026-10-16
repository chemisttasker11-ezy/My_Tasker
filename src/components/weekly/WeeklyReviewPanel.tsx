import { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import type { WeekReview, WeeklyPlan } from '../../model';

type ReviewNotes=Pick<WeekReview,'wins'|'blockers'|'adjustment'>;
interface Props {
  plan?:WeeklyPlan; planned:number; weekStart:string;
  onReview:(weekStart:string,notes:ReviewNotes)=>void;
}
/** Each week owns a local review draft, never reset by unrelated task changes. */
export function WeeklyReviewPanel({plan,planned,weekStart,onReview}:Props) {
  const [notes,setNotes]=useState<ReviewNotes>(()=>({
    wins:plan?.review?.wins??'',blockers:plan?.review?.blockers??'',
    adjustment:plan?.review?.adjustment??''
  }));
  return <section className="panel week-review" aria-label="Weekly review">
        <header className="week-panel-head"><div><h2>Close the loop</h2><p>A short review makes your next plan more realistic.</p></div><TrendingUp size={20}/></header>
        <form onSubmit={event => { event.preventDefault(); if (planned) onReview(weekStart, notes); }}>
          <label>What went well?<textarea maxLength={1400} rows={3} value={notes.wins} onChange={event => setNotes(s => ({ ...s, wins: event.target.value }))} placeholder="A few wins worth repeating…"/></label>
          <label>What got in the way?<textarea maxLength={1400} rows={3} value={notes.blockers} onChange={event => setNotes(s => ({ ...s, blockers: event.target.value }))} placeholder="Limited time, waiting for a reply…"/></label>
          <label>What will you adjust next week?<textarea maxLength={1400} rows={3} value={notes.adjustment} onChange={event => setNotes(s => ({ ...s, adjustment: event.target.value }))} placeholder="One practical change…"/></label>
          <button className="button button-primary" type="submit" disabled={!planned}>Save weekly review</button>
          <p className="week-review-footnote">{plan?.review?.savedAt ? 'Review saved. Past weeks show the score captured when you last saved it.' : 'Saving records the current score for future reference.'}</p>
        </form>
      </section>;
}
