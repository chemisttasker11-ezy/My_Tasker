import type { BoardState } from './types';
import { initialState } from './factory';
import { validateImported } from './validation';
export const STORAGE_KEY = 'my-command-centre:v1';
export function readState(): BoardState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    return validateImported(JSON.parse(raw));
  } catch {
    return initialState();
  }
}

