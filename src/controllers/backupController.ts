import type { Dispatch, SetStateAction } from 'react';
import { type BoardState, validateImported } from '../model';

/** Recovery-aware, account-scoped import; App coordinates but does not own backup validation. */
export async function importBoardWithRecovery(
  file: File, existing: BoardState, accountId: number | string | undefined,
  setBoard: Dispatch<SetStateAction<BoardState>>, notify: (message: string) => void
): Promise<void> {
  if (file.size > 10 * 1024 * 1024) { notify('Backup file is too large (10 MB limit)'); return; }
  try {
    const incoming = validateImported(JSON.parse(await file.text()));
    if (!window.confirm(`Import ${incoming.tasks.length} tasks, ${incoming.areas.length} areas, ${incoming.completions.length} history entries and ${incoming.plannedEntries.length} planned copies? This replaces the current board and saves a local recovery backup first.`)) return;
    try {
      const key = `mytasker:before-import:${accountId ?? 'local'}:${new Date().toISOString()}`;
      localStorage.setItem(key, JSON.stringify(existing));
    } catch {
      notify('Safety backup could not be stored in this browser. Import cancelled; export the current board first.');
      return;
    }
    setBoard(incoming);
    notify('Backup restored. The previous plan is retained on this device as a recovery copy.');
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Could not import backup');
  }
}
