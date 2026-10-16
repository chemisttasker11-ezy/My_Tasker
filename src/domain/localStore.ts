import type { BoardState } from './types';
import { initialState } from './factory';
import { validateImported } from './validation';
export const STORAGE_KEY = 'my-command-centre:v1';
/** Never replace a corrupt or unreadable legacy board with a new empty board. */
export function readState(): BoardState {
  let raw: string | null;
  try { raw = localStorage.getItem(STORAGE_KEY); }
  catch { throw new Error('Browser storage could not be read. Existing data has not been replaced.'); }
  if (!raw) return initialState();
  try { return validateImported(JSON.parse(raw)); }
  catch { throw new Error('Saved board is invalid. The original data remains in your browser for recovery.'); }
}
