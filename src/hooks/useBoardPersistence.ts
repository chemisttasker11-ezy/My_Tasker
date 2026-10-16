import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { createDraftId, listPendingDrafts, pruneSavedDrafts, rebasePendingDraft, removePendingDraft, savePendingDraft, type PendingBoardDraft } from '../lib/pendingDraftStore';
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
  recoveryDrafts: PendingBoardDraft[];
  serverRevision: number;
  restoreDraft: (draftId: string) => boolean;
  discardDraft: (draftId: string) => boolean;
  keepServerBoard: () => void;
  downloadDraft: (draftId: string) => BoardState | null;
  localDraftAvailable: boolean;
}

/** Owns all device/cloud persistence and conflict handling.
 * React pages should never write to either localStorage or the cloud API directly.
 */
export function useBoardPersistence(account?: SignedInUser, initialCloud?: CloudSnapshot): BoardPersistence {
  const [board, setBoard] = useState<BoardState>(() =>
    account ? (initialCloud?.board ? validateImported(initialCloud.board) : sampleBoard()) : readState());
  const lastPersisted = useRef(JSON.stringify(board));
  // Validation rebuilds the imported board into canonical key order. Compare
  // canonical snapshots, otherwise merely signing in writes an unchanged board
  // and increments the shared revision, causing phantom cross-device conflicts.
  const cloudSaved = useRef(JSON.stringify(initialCloud?.board ? validateImported(initialCloud.board) : null));
  const cloudRevision = useRef(initialCloud?.revision ?? 0);
  const cloudQueue = useRef<Promise<void>>(Promise.resolve());
  const cloudBlocked = useRef(false);
  const runtimeDraftId = useRef(createDraftId());
  const [localDraftAvailable, setLocalDraftAvailable] = useState(true);
  const [recoveryDrafts, setRecoveryDrafts] = useState<PendingBoardDraft[]>(() => {
    if (!account) return [];
    try {
      const snapshot = JSON.stringify(initialCloud?.board ? validateImported(initialCloud.board) : null);
      return listPendingDrafts(account.id).filter(record => JSON.stringify(record.board) !== snapshot);
    } catch { return []; }
  });
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

  // Save a per-account, per-runtime durable draft *before* the debounced network
  // effect. A crash after a user edit can then be recovered on the next login.
  // This is not offline authentication: the server still decides who may log in.
  useLayoutEffect(() => {
    if (!account || recoveryDrafts.length) return;
    const snapshot = JSON.stringify(board);
    try {
      if (snapshot === cloudSaved.current) {
        removePendingDraft(account.id, runtimeDraftId.current);
        return;
      }
      savePendingDraft(account.id, runtimeDraftId.current, cloudRevision.current, board);
      setLocalDraftAvailable(true);
    } catch {
      setLocalDraftAvailable(false);
      setCloudFailure('Browser recovery storage is unavailable. Keep this tab open and export a JSON backup if syncing fails.');
      setSaveError(true);
    }
  }, [account, board, recoveryDrafts.length]);

  useEffect(() => {
    if (!account) return;
    try { pruneSavedDrafts(account.id, cloudSaved.current); }
    catch { /* Storage can be disabled. Cloud sync still remains authoritative. */ }
  }, [account]);

  /** A successful server acknowledgement is the only place that can clear an
   * exact unsynced draft or rebase a newer unsent edit. On 409, do neither.
   */
  function afterCloudAck(snapshot: string, revision: number) {
    const previous = cloudRevision.current;
    cloudRevision.current = revision;
    cloudSaved.current = snapshot;
    if (account) {
      try {
        pruneSavedDrafts(account.id, snapshot);
        rebasePendingDraft(account.id, runtimeDraftId.current, previous, revision, snapshot);
      } catch { /* Preserve cloud success; storage may be unavailable. */ }
    }
    setSaveError(false);
    setCloudFailure('');
  }

  useEffect(() => {
    if (!account || recoveryDrafts.length || cloudBlocked.current) return;
    const snapshot = JSON.stringify(board);
    if (snapshot === cloudSaved.current) return;
    const timer = window.setTimeout(() => {
      cloudQueue.current = cloudQueue.current.then(async () => {
        if (cloudBlocked.current || cloudSaved.current === snapshot) return;
        const response = await saveCloudBoard(JSON.parse(snapshot) as BoardState, cloudRevision.current);
        afterCloudAck(snapshot, response.revision);
      }).catch((error: unknown) => {
        cloudBlocked.current = true;
        setCloudFailure(error instanceof Error ? error.message : 'Could not save to your account.');
        setSaveError(true);
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [board, account, recoveryDrafts.length]);

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
    if (recoveryDrafts.length) return false;
    await cloudQueue.current;
    if (cloudBlocked.current) return false;
    const snapshot = JSON.stringify(board);
    if (cloudSaved.current === snapshot) return true;
    try {
      const result = await saveCloudBoard(board, cloudRevision.current);
      afterCloudAck(snapshot, result.revision);
      return true;
    } catch (error) {
      cloudBlocked.current = true;
      setSaveError(true);
      setCloudFailure(error instanceof Error ? error.message : 'Cloud save could not complete.');
      return false;
    }
  }

  async function retryCloudSync(): Promise<boolean> {
    if (!account || cloudRetrying || recoveryDrafts.length) return false;
    setCloudRetrying(true);
    await cloudQueue.current;
    try {
      const remote = await loadCloudBoard();
      if (remote.revision !== cloudRevision.current) {
        throw new Error('Another device saved newer changes. Export your current task board before reloading; do not overwrite the other device.');
      }
      const result = await saveCloudBoard(board, cloudRevision.current);
      afterCloudAck(JSON.stringify(board), result.revision);
      cloudBlocked.current = false;
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

  function restoreDraft(draftId: string): boolean {
    const recovered = recoveryDrafts.find(item => item.draftId === draftId);
    if (!recovered || recovered.baseRevision !== cloudRevision.current) return false;
    setBoard(validateImported(recovered.board));
    // The recovered browser copy is not removed until PostgreSQL ACKs it.
    setRecoveryDrafts([]);
    return true;
  }

  function discardDraft(draftId: string): boolean {
    if (!account || !recoveryDrafts.some(item => item.draftId === draftId)) return false;
    try {
      removePendingDraft(account.id, draftId);
      setRecoveryDrafts(items => items.filter(item => item.draftId !== draftId));
      return true;
    } catch { return false; }
  }

  function keepServerBoard() {
    // Continue using the authenticated server board without deleting a local
    // draft. It will still be available for review on a future login.
    setRecoveryDrafts([]);
  }

  function downloadDraft(draftId: string): BoardState | null {
    return recoveryDrafts.find(item => item.draftId === draftId)?.board ?? null;
  }

  function loadLegacyBoard(): BoardState | null {
    const legacy = localStorage.getItem(STORAGE_KEY);
    return legacy ? validateImported(JSON.parse(legacy)) : null;
  }
  return {
    board, setBoard, saveError, cloudFailure, cloudRetrying,
    retryCloudSync, flushBeforeNavigation, loadLegacyBoard,
    recoveryDrafts, serverRevision: cloudRevision.current, restoreDraft,
    discardDraft, keepServerBoard, downloadDraft, localDraftAvailable
  };
}
