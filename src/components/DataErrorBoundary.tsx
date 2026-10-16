import { Component, type ReactNode } from 'react';
import { STORAGE_KEY } from '../model';

interface Props { children: ReactNode }
interface State { failed: boolean }

/** Non-destructive PR2-inspired fallback around auth + workspace renders. */
export class DataErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State { return { failed: true }; }
  private download() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const blob = new Blob([raw],{type:'application/json'});
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href=url; link.download='my-planner-local-recovery.json';
      link.click(); window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch { /* Never overwrite data to recover from a render failure. */ }
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="panel safety-screen" role="alert">
      <h1>Something interrupted your planner</h1>
      <p>No tasks have been deleted. Signed-in boards remain in the account service. Unsynced recovery drafts should be checked after reopening.</p>
      <button type="button" className="button button-secondary" onClick={()=>this.download()}>Download locally saved board, if available</button>
      <button type="button" className="button button-primary" onClick={()=>window.location.reload()}>Reload planner</button>
    </main>;
  }
}
