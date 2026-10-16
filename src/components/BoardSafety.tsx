import { Component, useRef, useState, type ReactNode } from 'react';
import { initialState, STORAGE_KEY, validateImported, type BoardState } from '../model';
import { downloadable } from '../lib/display';
import '../styles/safety.css';

export function RecoveryScreen({ message, raw, storageError, onReplace }: { message: string; raw: string; storageError: boolean; onReplace: (board: BoardState) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Backup exceeds 10 MB.');
      const warnings: string[] = [];
      const board = validateImported(JSON.parse(await file.text()), warnings);
      if (window.confirm(`Restore ${board.tasks.length} tasks, ${board.areas.length} areas and ${board.completions.length} history entries? ${warnings.join(' ')} Your original payload will be preserved.`)) onReplace(board);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not read backup'); }
    finally { if (input.current) input.current.value = ''; }
  }
  return <main className="safety-screen panel"><h1>Recover your board</h1><p>{message}</p>
    {storageError && <p role="alert">Browser storage is unavailable or full. Download your data before leaving.</p>}
    <button className="button button-primary" onClick={() => downloadable('my-command-centre-recovery.json', raw)}>Download raw data</button>
    <input ref={input} hidden type="file" accept=".json,application/json" onChange={e => void importFile(e.target.files?.[0])}/>
    <button className="button button-secondary" onClick={() => input.current?.click()}>Try importing a backup</button>
    <button className="button button-secondary" onClick={() => { if (window.confirm('Start with an empty board? The original payload will be kept in recovery storage.')) onReplace(initialState()); }}>Start fresh</button>
    {error && <p role="alert">{error}</p>}
  </main>;
}

export function OnboardingCard({ step, onStep, onLibrary }: { step: number; onStep: (step: number | undefined) => void; onLibrary: () => void }) {
  return <section className="panel safety-onboarding" aria-label="Getting started"><span>Step {step} of 2</span>
    <h2>{step === 1 ? 'A little space for your life' : 'Choose a few starters'}</h2>
    <p>{step === 1 ? 'Your board starts empty. Add your own tasks, or explore ready-made starters.' : 'The life task library has optional templates with notes and checklists. Choose only what helps.'}</p>
    <button className="button button-primary" onClick={step === 1 ? () => onStep(2) : onLibrary}>{step === 1 ? 'Next' : 'Explore starter templates'}</button>
    <button className="button button-secondary" onClick={() => onStep(undefined)}>Skip setup</button>
  </section>;
}

export class DataErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="panel safety-screen"><h1>Something interrupted your planner</h1><p>Download your saved data, then reload to try again.</p>
      <button className="button button-primary" onClick={() => { try { downloadable('my-command-centre-backup.json', localStorage.getItem(STORAGE_KEY) ?? ''); } catch { window.alert('Storage is unavailable. Please try reloading.'); } }}>Download my data</button>
      <button className="button button-secondary" onClick={() => window.location.reload()}>Reload</button></main>;
  }
}
