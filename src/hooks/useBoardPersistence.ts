import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { type BoardState, STORAGE_KEY, readState, validateImported } from '../model';
import { sampleBoard } from '../lib/sampleBoard';
import { loadBoard as loadCloudBoard, saveBoard as saveCloudBoard, type SignedInUser, type CloudSnapshot } from '../lib/authApi';

export interface BoardPersistence {
  board: BoardState;
  setBoard: Dispatch<SetStateAction<BoardState>>;
  saveError: boolean;
  cloudFailure: string;
  cloudRetrying: boolean;
  retryCloudSync: () => Promise<boolean>;
  flushBeforeNavigation: () => Promise<boolean>;
  loadLegacyBoard: () => BoardState | null;
}

/** Owns all device/cloud persistence and conflict handling.
 * React pages should never write to either localStorage or the cloud API directly.
 */
export function useBoardPersistence(account?: SignedInUser, initialCloud?: CloudSnapshot): BoardPersistence {
  const [board, setBoard] = useState<BoardState>(() =>
    account ? (initialCloud?.board ? validateImported(initialCloud.board) : sampleBoard()) : readState());
  const lastPersisted = useRef(JSON.stringify(board));
  const cloudSaved = useRef(JSON.stringify(initialCloud?.board ?? null));
  const cloudRevision = useRef(initialCloud?.revision ?? 0);
  const cloudQueue = useRef<Promise<void>>(Promise.resolve());
  const cloudBlocked = useRef(false);
  const [cloudFailure, setCloudFailure] = useState('');
  const [cloudRetrying, setCloudRetrying] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = board.theme;
    if (account) return;
    const encoded = JSON.stringify(board);
    if (encoded === lastPersisted.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, encoded);
      lastPersisted.current = encoded;
      setSaveError(false);
    } catch { setSaveError(true); }
  }, [board, account]);

  useEffect(() => {
    if (!account || cloudBlocked.current) return;
    const snapshot = JSON.stringify(board);
    if (snapshot === cloudSaved.current) return;
    const timer = window.setTimeout(() => {
      cloudQueue.current = cloudQueue.current.then(async () => {
        if (cloudBlocked.current || cloudSaved.current === snapshot) return;
        const response = await saveCloudBoard(JSON.parse(snapshot) as BoardState, cloudRevision.current);
        cloudRevision.current = response.revision;
        cloudSaved.current = snapshot;
        setSaveError(false);
      }).catch((error: unknown) => {
        cloudBlocked.current = true;
        setCloudFailure(error instanceof Error ? error.message : 'Could not save to your account.');
        setSaveError(true);
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [board, account]);

  useEffect(() => {
    if (account) return;
    const sync = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const incoming = validateImported(JSON.parse(event.newValue));
        lastPersisted.current = JSON.stringify(incoming);
        setBoard(incoming);
      } catch { /* Ignore invalid cross-tab data. */ }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [account]);

  async function flushBeforeNavigation(): Promise<boolean> {
    if (!account) return true;
    await cloudQueue.current;
    if (cloudBlocked.current) return false;
    const snapshot = JSON.stringify(board);
    if (cloudSaved.current === snapshot) return true;
    try {
      const result = await saveCloudBoard(board, cloudRevision.current);
      cloudRevision.current = result.revision;
      cloudSaved.current = snapshot;
      setSaveError(false);
      return true;
    } catch (error) {
      cloudBlocked.current = true;
      setSaveError(true);
      setCloudFailure(error instanceof Error ? error.message : 'Cloud save could not complete.');
      return false;
    }
  }

  async function retryCloudSync(): Promise<boolean> {
    if (!account || cloudRetrying) return false;
    setCloudRetrying(true);
    await cloudQueue.current;
    try {
      const remote = await loadCloudBoard();
      if (remote.revision !== cloudRevision.current) {
        throw new Error('Another device saved newer changes. Export your current task board before reloading; do not overwrite the other device.');
      }
      const result = await saveCloudBoard(board, cloudRevision.current);
      cloudSaved.current = JSON.stringify(board);
      cloudRevision.current = result.revision;
      cloudBlocked.current = false;
      setCloudFailure('');
      setSaveError(false);
      return true;
    } catch (error) {
      cloudBlocked.current = true;
      setSaveError(true);
      setCloudFailure(error instanceof Error ? error.message : 'Cannot reach your account.');
      return false;
    } finally {
      setCloudRetrying(false);
    }
  }

  function loadLegacyBoard(): BoardState | null {
    const legacy = localStorage.getItem(STORAGE_KEY);
    return legacy ? validateImported(JSON.parse(legacy)) : null;
  }
  return {
    board, setBoard, saveError, cloudFailure, cloudRetrying,
    retryCloudSync, flushBeforeNavigation, loadLegacyBoard
  };
}
