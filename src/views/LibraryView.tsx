import { useState } from 'react';
import { Check, Library, Plus, Search, Sparkles } from 'lucide-react';
import { LIFE_TEMPLATES, STARTER_IDS, templateAdded } from '../lib/lifeLibrary';
import { RECUR_LABEL } from '../lib/display';
import type { Task } from '../model';

export function LibraryView({ tasks, onAdd }: { tasks: Task[]; onAdd: (ids: string[]) => void }) {
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('All');
  const [selected, setSelected] = useState<string[]>([]);
  const filtered = LIFE_TEMPLATES.filter(t => (group === 'All' || group === t.group) && `${t.title} ${t.description} ${t.checklist.join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  const available = selected.filter(id => !templateAdded(tasks, LIFE_TEMPLATES.find(t => t.id === id)!));
  const starter = LIFE_TEMPLATES.filter(t => STARTER_IDS.includes(t.id) && !templateAdded(tasks, t));
  return <>
    <div className="page-title-row"><div><span className="eyebrow">MAKE LIFE A LITTLE LIGHTER</span><h1>Life task library</h1><p>64 ready-to-use routines. Choose what fits your life, then make it your own.</p></div><Library size={32}/></div>
    <section className="library-intro"><div><span className="eyebrow">A PRACTICAL PLACE TO START</span><h2>Small routines. More room for life.</h2><p>The 12-task starter set covers mornings, home, meals, movement, relationships and a weekly reset. Every task includes notes and a checklist.</p><small>Tasks are added without dates. Set your own first date to put a repeating routine on the calendar. Existing tasks and progress stay intact.</small></div><button className="button button-primary" disabled={!starter.length} onClick={() => onAdd(STARTER_IDS)}><Sparkles size={18}/>{starter.length ? `Add starter set (${starter.length})` : 'Starter set added'}</button></section>
    <div className="library-controls panel"><label className="library-search"><Search size={18}/><input aria-label="Search life tasks" placeholder="Find a routine, topic or checklist step" value={search} onChange={e => setSearch(e.target.value)}/></label><label>Life topic<select aria-label="Life topic" value={group} onChange={e => setGroup(e.target.value)}><option>All</option>{[...new Set(LIFE_TEMPLATES.map(t => t.group))].map(g => <option key={g}>{g}</option>)}</select></label><button className="button button-secondary" onClick={() => setSelected(old => [...new Set([...old, ...filtered.filter(t => !templateAdded(tasks, t)).map(t => t.id)])])}>Select visible</button><button className="button button-primary" disabled={!available.length} onClick={() => { onAdd(available); setSelected([]); }}>Add selected ({available.length})</button>{selected.length > 0 && <button className="text-link" onClick={() => setSelected([])}>Clear selection</button>}</div>
    <p className="library-results" role="status">{filtered.length} routines shown · {LIFE_TEMPLATES.filter(t => templateAdded(tasks, t)).length} already on your board or archived</p>
    <div className="library-grid">{filtered.map(t => {
      const added = templateAdded(tasks, t);
      return <article className="panel library-card" key={t.id}><div className="library-card-top"><span className="eyebrow">{t.group}</span><input type="checkbox" aria-label={`Select ${t.title}`} disabled={added} checked={!added && selected.includes(t.id)} onChange={e => setSelected(old => e.target.checked ? [...old, t.id] : old.filter(id => id !== t.id))}/></div><h2>{t.title}</h2><div className="library-meta"><span>{RECUR_LABEL[t.recurrence]}</span><span>{t.estimateMinutes} min</span><span>Medium priority</span>{STARTER_IDS.includes(t.id) && <span className="starter-badge">Starter</span>}</div><p>{t.description}</p><details><summary>View {t.checklist.length} checklist steps</summary><p><strong>Suggested timing:</strong> {t.timing}</p><ol>{t.checklist.map(step => <li key={step}>{step}</li>)}</ol></details><button className="button button-secondary" disabled={added} onClick={() => onAdd([t.id])}>{added ? <Check size={16}/> : <Plus size={16}/>} {added ? 'Already added' : `Add ${t.title}`}</button></article>;
    })}</div>{!filtered.length && <div className="panel empty-state"><h2>No matching routines</h2><p>Try a different topic or a shorter search.</p></div>}
  </>;
}
