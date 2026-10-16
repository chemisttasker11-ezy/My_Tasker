import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Maximize2 } from 'lucide-react';
import { type BoardState } from '../model';
import { shiftCalendar, type CalendarScale } from '../lib/calendar';
import { trackerData, type TrackerOptions } from '../lib/tracker';
import { dailyQuote, quoteSettings, relevantTasksForDate } from '../lib/quotes';
import { STATUS_LABEL } from '../lib/progress';
import { buildTrackerDocument, downloadBlob, formatOmissionWarning, type TrackerDocument } from '../lib/trackerPdf';

export interface TrackerLaunch { anchor: string; scale: CalendarScale; area?: string }
export function TrackerView({ board, launch }: { board: BoardState; launch: TrackerLaunch }) {
  const [options, setOptions] = useState<TrackerOptions>({ anchor: launch.anchor, scale: launch.scale, area: launch.area ?? 'All', includeUndated: true, includeChecklist: false, paper: launch.scale === 'year' || launch.scale === 'month' ? 'a3' : 'a4' });
  const [document, setDocument] = useState<TrackerDocument | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const data = useMemo(() => trackerData(board, options), [board, options]);
  const quote = dailyQuote(board.quotes, options.anchor, relevantTasksForDate(board, options.anchor));
  const direction = quoteSettings(board.quotes).direction;
  useEffect(() => {
    let cancelled = false; let url = '';
    setBusy(true); setError('');
    void buildTrackerDocument(data, options, direction, quote.text).then(result => {
      if (cancelled) return;
      url = URL.createObjectURL(new Blob([result.svg], { type: 'image/svg+xml' }));
      setDocument(result); setPreview(url); setBusy(false);
    }).catch(e => { if (!cancelled) { setError((e as Error).message); setBusy(false); } });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [data, options, direction, quote.text]);
  function update<K extends keyof TrackerOptions>(key: K, value: TrackerOptions[K]) { setOptions(old => ({ ...old, [key]: value })); }
  const unsupportedChars = document?.unsupportedChars ?? [];
  return <>
    <div className="page-title-row"><div><span className="eyebrow">YOUR WHOLE PLAN, ONE PAGE</span><h1>Printable tracker</h1><p>See the complete sheet here, then download the same layout as a one-page PDF.</p></div><button className="button button-primary" disabled={busy || !document || Boolean(error)} onClick={() => document && downloadBlob(document.pdf, `my-tasker-${options.scale}-${options.anchor}.pdf`)}><Download size={17}/> Download PDF</button></div>
    <section className="panel tracker-controls" aria-label="Tracker controls"><div className="tracker-scales" role="group" aria-label="Tracker period">{(['day', 'week', 'month', 'year'] as CalendarScale[]).map(scale => <button key={scale} className={`button ${options.scale === scale ? 'button-primary' : 'button-secondary'}`} aria-pressed={options.scale === scale} onClick={() => setOptions(old => ({ ...old, scale, paper: scale === 'year' || scale === 'month' ? 'a3' : 'a4' }))}>{scale[0].toUpperCase() + scale.slice(1)}</button>)}</div><div className="tracker-date"><button className="icon-button" aria-label="Previous tracker period" onClick={() => update('anchor', shiftCalendar(options.anchor, options.scale, -1))}><ChevronLeft/></button><input aria-label="Tracker date" type="date" value={options.anchor} onChange={e => { if (e.target.value) update('anchor', e.target.value); }}/><button className="icon-button" aria-label="Next tracker period" onClick={() => update('anchor', shiftCalendar(options.anchor, options.scale, 1))}><ChevronRight/></button></div><label>Area<select aria-label="Tracker area" value={options.area} onChange={e => update('area', e.target.value)}><option>All</option>{board.areas.map(a => <option key={a.id}>{a.id}</option>)}</select></label><label>Paper<select aria-label="Tracker paper" value={options.paper} onChange={e => update('paper', e.target.value as 'a4' | 'a3')}><option value="a4">A4 landscape</option><option value="a3">A3 landscape</option></select></label><label className="tracker-check"><input type="checkbox" checked={options.includeUndated} onChange={e => update('includeUndated', e.target.checked)}/> Include undated tasks</label><label className="tracker-check"><input type="checkbox" checked={options.includeChecklist} onChange={e => update('includeChecklist', e.target.checked)}/> Include checklists</label></section>
    <div className="tracker-preview-tools"><span role="status">{busy ? 'Preparing your complete tracker…' : `${data.tasks.length} tasks · One page · ${options.paper.toUpperCase()} landscape`}</span><div><button className="button button-secondary" aria-pressed={zoom} onClick={() => setZoom(v => !v)}>{zoom ? 'Fit full page' : 'Zoom for reading'}</button><button className="button button-secondary" onClick={() => void stage.current?.requestFullscreen().catch(() => setError('Full-screen preview is unavailable in this browser. Use the fit-page preview instead.'))}><Maximize2 size={16}/> Full screen</button></div></div>
    {error && <p className="tracker-warning" role="alert">{error}</p>}
    {unsupportedChars.length > 0 && <p className="tracker-warning" role="alert">Some text includes characters (such as emoji or non-Latin scripts: {unsupportedChars.slice(0, 5).join(' ')}{unsupportedChars.length > 5 ? '…' : ''}) that the embedded PDF font cannot render. In the downloaded PDF, these will appear as visible placeholders (?), but they display normally in the preview and text alternative below.</p>}
    {!busy && document && (document.omittedTasks > 0 || document.omittedSteps > 0) && (
      <p className="tracker-warning" role="alert">
        {formatOmissionWarning(document.omittedTasks, document.omittedSteps)}
      </p>
    )}
    {!busy && document && document.smallestFont < 7 && document.omittedTasks === 0 && document.omittedSteps === 0 && <p className="tracker-warning">This is a dense sheet (smallest text: {document.smallestFont.toFixed(1)} pt). All tasks are included. For easier printing, choose A3, one area, or turn off checklists. The PDF stays sharp when zoomed.</p>}
    <div ref={stage} className={`tracker-stage ${zoom ? 'is-zoomed' : ''}`} aria-busy={busy}>{preview && <img src={preview} alt={`Complete ${options.scale} tracker for ${data.title}; ${data.tasks.length} tasks. The text version is below.`}/>}</div>
    <p className="tracker-caption">Year view groups each repeating task within its month and lists its dates. Undated tasks remain separate. Quotes use the selected date. This is a printable snapshot; writing on the PDF does not update your board.</p>
    <details className="panel tracker-text"><summary>Read the tracker as text</summary><p>{direction}</p><p>{quote.text}</p>{[...data.sections, { title: 'Undated tasks', items: data.undated }].map((section, index) => <section key={index}><h2>{section.title}</h2><ul>{section.items.map(item => <li key={item.key}><span>{item.label} — Status: {STATUS_LABEL[item.status]}{item.completed ? ' (completed)' : ''}</span>{options.includeChecklist && item.task.subtasks.length > 0 && <ul>{item.task.subtasks.map(s => { const done = item.checklistCurrent && s.done; return <li key={s.id}>{done ? '[✓] ' : '[ ] '}{s.title} ({done ? 'done' : 'incomplete'})</li>; })}</ul>}</li>)}</ul></section>)}</details>
  </>;
}
