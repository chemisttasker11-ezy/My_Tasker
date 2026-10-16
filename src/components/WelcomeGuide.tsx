import { CalendarRange, Check, ClipboardCopy, Compass, LayoutDashboard, Target, X } from 'lucide-react';

export function WelcomeGuide({ open, onClose, onBoard, onWeek }: {
  open: boolean; onClose:()=>void; onBoard:()=>void; onWeek:()=>void;
}) {
  if(!open)return null;
  return <div className="guide-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section className="guide-dialog" role="dialog" aria-modal="true" aria-labelledby="guide-title">
      <button type="button" className="guide-close" aria-label="Close getting started guide" onClick={onClose}><X size={22}/></button>
      <div className="guide-intro"><span><Compass size={24}/></span><p>YOUR 60-SECOND STARTER GUIDE</p><h2 id="guide-title">Make this week yours.</h2>
        <p>Four sample tasks are waiting on your board. Rename or delete them anytime. Your planner stays private to your account.</p></div>
      <ol className="guide-steps">
        <li><LayoutDashboard size={21}/><div><strong>Keep reusable tasks in My task board</strong><p>It's your task library. One task can appear on many different days.</p></div></li>
        <li><CalendarRange size={21}/><div><strong>Plan your seven days</strong><p>Drag from your board, or tap <b>Add</b> on mobile. Copies have separate statuses and checklists.</p></div></li>
        <li><Target size={21}/><div><strong>Pick your daily top three</strong><p>Stay intentional, not overloaded. Set a realistic weekly capacity.</p></div></li>
        <li><ClipboardCopy size={21}/><div><strong>Copy a day, reflect, repeat</strong><p>Paste one or several days, review the weighted score and print your plan.</p></div></li>
      </ol>
      <div className="guide-actions"><button type="button" className="button button-secondary" onClick={()=>{onClose();onBoard()}}><Check size={17}/> See my task board</button><button type="button" className="button button-primary" onClick={()=>{onClose();onWeek()}}>Open week planner →</button></div>
      <p className="guide-privacy">Designed for personal productivity, not for identifiable patient records or clinical documentation.</p>
    </section>
  </div>;
}
