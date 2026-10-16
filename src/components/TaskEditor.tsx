import { type ComponentProps } from 'react';
import { TaskModal } from './TaskModal';
import type { Task } from '../model';

/** Keep the draft mounted and conflict controls inside the modal's live focus region. */
export function TaskEditor({ conflict, onUseMine, onKeepTheirs, ...props }: Omit<ComponentProps<typeof TaskModal>, 'conflict'> & {
  conflict: Task | null; onUseMine: () => void; onKeepTheirs: () => void;
}) {
  return <TaskModal {...props} onDismiss={() => { if (!conflict) props.onDismiss(); }}
    conflict={conflict ? { title: conflict.title, onUseMine, onKeepTheirs } : undefined}/>;
}
