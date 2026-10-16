import { type Dispatch, type RefObject, type SetStateAction } from 'react';
import { ArrowDownToLine, ArrowRight, Bell, Download, Moon, Plus, RotateCcw, Sparkles, Sun, Upload, WandSparkles } from 'lucide-react';
import { SUGGESTIONS, createTask, type BoardState, type View } from '../model';
import { AreaManager } from '../components/AreaManager';

interface Props {
  board: BoardState; setBoard: Dispatch<SetStateAction<BoardState>>;
  exportData: () => void; importData: (file: File | undefined) => Promise<void>;
  reset: () => void; fileInputRef: RefObject<HTMLInputElement | null>;
  navigate: (view: View) => void; alertNotice: (text: string) => void;
}

export function SettingsView({ board, setBoard, exportData, importData, reset, fileInputRef, navigate, alertNotice }: Props) {
  return <>
          <div className="page-title-row"><div><span className="eyebrow">MAKE IT YOURS</span><h1>Settings & backups <span className="heading-sparkle">⚙</span></h1><p>Your tasks stay in this browser unless you export a backup.</p></div></div>
          <section className="panel settings-panel"><h2>Weekly score</h2><label><input type="checkbox" checked={board.weeklyScoreEnabled ?? false} onChange={e => { const checked = e.target.checked; setBoard(s => ({ ...s, weeklyScoreEnabled: checked })); }}/> Show weekly scores</label><p>Optional. Turning this off keeps your commitments, scores and reviews.</p></section>
          <AreaManager board={board} onChange={next => { setBoard(next); alertNotice('Areas updated'); }}/>
          <div className="settings-grid"><section className="panel settings-panel"><div className="settings-icon blue"><Download size={22}/></div><h2>Back up your tasks</h2><p>Download every task, milestone, schedule and completion record as a JSON file. Keep it somewhere safe.</p><button className="button button-primary" onClick={exportData}><ArrowDownToLine size={17}/> Download backup</button></section>
          <section className="panel settings-panel"><div className="settings-icon green"><Upload size={22}/></div><h2>Restore a backup</h2><p>Import a previously exported file. This replaces your current task list after confirmation.</p><input ref={fileInputRef} hidden type="file" accept=".json,application/json" onChange={e => void importData(e.target.files?.[0])}/><button className="button button-secondary" onClick={() => fileInputRef.current?.click()}><Upload size={17}/> Import backup</button></section>
          <section className="panel settings-panel"><div className="settings-icon orange"><RotateCcw size={22}/></div><h2>Start with an empty board</h2><p>Clear your board and start again with neutral areas. Your current board is backed up first.</p><button className="button button-secondary" onClick={reset}><RotateCcw size={17}/> Start fresh</button></section>
          <section className="panel settings-panel"><div className="settings-icon purple"><Moon size={22}/></div><h2>Appearance</h2><p>Choose a comfortable colour theme for your workspace.</p><div className="segmented-theme"><button className={board.theme === 'light' ? 'active' : ''} onClick={() => setBoard(s => ({...s,theme:'light'}))}><Sun size={17}/> Light</button><button className={board.theme === 'dark' ? 'active' : ''} onClick={() => setBoard(s => ({...s,theme:'dark'}))}><Moon size={17}/> Dark</button></div></section></div>
          <section className="panel suggested-panel"><div className="panel-heading"><div><span className="eyebrow">OPTIONAL IDEAS</span><h2>Ideas from your work</h2><p>These are suggestions, not obligations — add only the ones you want.</p></div><WandSparkles size={24}/></div><div className="suggestions-grid">{SUGGESTIONS.map(s => <div className="suggestion-row" key={s.title}><span className="suggestion-icon"><Sparkles size={18}/></span><div><strong>{s.title}</strong><small>{s.category}</small></div><button aria-label={`Add ${s.title}`} className="button button-secondary button-small" onClick={() => { const t = createTask({...s, category: board.areas.some(a => a.id === s.category) ? s.category : board.areas[0].id, origin: 'idea'}); setBoard(old => ({...old, tasks:[...old.tasks,t]})); alertNotice('Idea added to your board'); }}><Plus size={15}/> Add</button></div>)}</div></section>
          <div className="privacy-note"><Bell size={19}/><p><strong>Privacy & syncing:</strong> This version saves locally on your device. It has no user accounts or cloud sync. Publishing the site will not sync tasks between devices automatically. Don't enter patient-identifiable or sensitive clinical information.</p></div>
          <button className="text-link settings-nav" onClick={() => navigate('board')}>Back to task board <ArrowRight size={16}/></button>
        </>;
}
