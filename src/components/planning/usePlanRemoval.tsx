import { useRef, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import type { PlannedEntry } from '../../model';

type Removal = { entry: PlannedEntry; undo: () => void };
let pending: Removal[] = [];
const empty: Removal[] = [];
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => pending;
const emit = () => listeners.forEach(listener => listener());
let host: HTMLDivElement | undefined;

function UndoToasts() {
  const items = useSyncExternalStore(subscribe, snapshot, () => empty);
  return <div className="planning-undo-stack">{items.map(({ entry, undo }) => <div className="planning-undo-toast" role="status" key={entry.id}>Removed {entry.title}. <button type="button" onClick={undo}>Undo</button></div>)}</div>;
}

/** One toast host for every DayPlan, surviving day-tab switches and view changes. */
export function usePlanRemoval(entries: PlannedEntry[], onRemove?: (id: string) => void, onRestore?: (entry: PlannedEntry) => void) {
  const items = useSyncExternalStore(subscribe, snapshot, () => empty);
  const latest = useRef({ entries, onRemove, onRestore });
  latest.current = { entries, onRemove, onRestore };
  return {
    visibleEntries: entries.filter(entry => !items.some(item => item.entry.id === entry.id)),
    remove: (id: string) => {
      const { entries, onRemove, onRestore } = latest.current;
      const original = entries.find(entry => entry.id === id);
      if (!original || !onRemove || pending.some(item => item.entry.id === id)) return;
      const entry = structuredClone(original);
      if (!host) {
        host = document.createElement('div');
        document.body.append(host);
        createRoot(host).render(<UndoToasts />);
      }
      if (onRestore) onRemove(id);
      const dismiss = () => { pending = pending.filter(item => item.entry.id !== id); emit(); };
      const timer = setTimeout(() => { if (!onRestore) onRemove(id); dismiss(); }, 8000);
      pending = [...pending, { entry, undo: () => { clearTimeout(timer); if (onRestore) onRestore(entry); dismiss(); } }];
      emit();
    }
  };
}
