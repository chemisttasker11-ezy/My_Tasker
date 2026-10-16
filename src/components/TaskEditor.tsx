import { useEffect, useRef, type ComponentProps } from 'react';
import { TaskModal } from './TaskModal';
import type { Task } from '../model';

/** Keep the modal mounted so an unresolved conflict never loses the form draft. */
export function TaskEditor({ conflict, onUseMine, onKeepTheirs, ...props }: ComponentProps<typeof TaskModal> & {
  conflict: Task | null; onUseMine: () => void; onKeepTheirs: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (conflict) dialog.current?.showModal();
    else dialog.current?.close();
  }, [conflict]);
  return <>
    <div hidden={Boolean(conflict)}><TaskModal {...props} onDismiss={() => { if (!conflict) props.onDismiss(); }}/></div>
    <dialog ref={dialog} className="panel safety-screen" aria-labelledby="task-conflict-title" onCancel={event => event.preventDefault()}>
      <h2 id="task-conflict-title">This task changed in another tab</h2>
      <p>Your draft of <strong>{conflict?.title}</strong> is kept. Choose which version to use.</p>
      <button className="button button-primary" onClick={onUseMine}>Use mine</button>
      <button className="button button-secondary" onClick={onKeepTheirs} autoFocus>Keep theirs</button>
    </dialog>
  </>;
}
