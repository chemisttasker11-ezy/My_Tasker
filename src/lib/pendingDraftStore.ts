import { validateImported, type BoardState } from '../model';

/** Recoverable, account-scoped browser draft. A draft never grants login access.
 * The canonical board remains in PostgreSQL; only a signed-in user may choose
 * to restore an unsynced copy, and only if the server revision still matches.
 */
export interface PendingBoardDraft {
  version: 1;
  userId: number;
  draftId: string;
  baseRevision: number;
  savedAt: string;
  board: BoardState;
}

const PREFIX = 'mytasker:unsynced:v1:';
const MAX_BYTES = 4 * 1024 * 1024;

export function draftKey(userId: number, draftId: string): string {
  return `${PREFIX}${userId}:${draftId}`;
}

export function createDraftId(): string {
  return crypto.randomUUID();
}

export function listPendingDrafts(userId: number, storage: Storage = localStorage): PendingBoardDraft[] {
  const prefix = `${PREFIX}${userId}:`;
  const records: PendingBoardDraft[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(prefix)) continue;
    try {
      const value: unknown = JSON.parse(storage.getItem(key) ?? '');
      if (!value || typeof value !== 'object') continue;
      const data = value as Partial<PendingBoardDraft>;
      if (data.version !== 1 || data.userId !== userId ||
          typeof data.draftId !== 'string' || !/^[a-zA-Z0-9-]{10,80}$/.test(data.draftId) ||
          key !== draftKey(userId, data.draftId) ||
          !Number.isSafeInteger(data.baseRevision) || Number(data.baseRevision) < 0 ||
          typeof data.savedAt !== 'string' || !Number.isFinite(Date.parse(data.savedAt))) continue;
      records.push({
        version: 1, userId, draftId: data.draftId,
        baseRevision: data.baseRevision!, savedAt: data.savedAt,
        board: validateImported(data.board)
      });
    } catch {
      // Preserve malformed records for manual recovery; never silently delete
      // a user's only potentially salvageable local copy.
    }
  }
  return records.sort((a,b)=>b.savedAt.localeCompare(a.savedAt) || a.draftId.localeCompare(b.draftId));
}

export function savePendingDraft(
  userId: number, draftId: string, baseRevision: number, board: BoardState,
  storage: Storage = localStorage
): PendingBoardDraft {
  const record: PendingBoardDraft = {
    version: 1, userId, draftId, baseRevision, savedAt: new Date().toISOString(), board
  };
  const encoded = JSON.stringify(record);
  if (new TextEncoder().encode(encoded).length > MAX_BYTES) {
    throw new Error('Local recovery draft is too large. Export a JSON backup.');
  }
  storage.setItem(draftKey(userId, draftId), encoded);
  return record;
}

/** An account deletion must also erase any local drafts, including malformed
 * records not eligible for recovery. Do not enumerate drafts for other users.
 */
export function purgeAccountDrafts(userId: number, storage: Storage = localStorage): number {
  const prefix = `${PREFIX}${userId}:`;
  const keys = Array.from({length:storage.length},(_,i)=>storage.key(i))
    .filter((key):key is string=>Boolean(key?.startsWith(prefix)));
  keys.forEach(key=>storage.removeItem(key));
  return keys.length;
}

export function removePendingDraft(userId: number, draftId: string, storage: Storage = localStorage): void {
  storage.removeItem(draftKey(userId, draftId));
}

/** Acknowledgement clears only *identical* drafts. Another tab's unsaved
 * independent changes are never discarded because one tab saved successfully.
 */
export function pruneSavedDrafts(userId: number, serverBoardJSON: string, storage: Storage = localStorage): number {
  let cleared = 0;
  for (const record of listPendingDrafts(userId, storage)) {
    if (JSON.stringify(record.board) !== serverBoardJSON) continue;
    removePendingDraft(userId, record.draftId, storage);
    cleared++;
  }
  return cleared;
}

/** Serial acknowledged saves may advance the local base revision before the
 * latest edit reaches the server. Rebase only this tab's still-pending draft.
 * The operation must never run following a failed/409 server save.
 */
export function rebasePendingDraft(
  userId: number, draftId: string, oldRevision: number, nextRevision: number,
  acknowledgedJSON: string, storage: Storage = localStorage
): void {
  const current = listPendingDrafts(userId, storage).find(d => d.draftId === draftId);
  if (!current || current.baseRevision !== oldRevision ||
      JSON.stringify(current.board) === acknowledgedJSON) return;
  storage.setItem(draftKey(userId, draftId), JSON.stringify({ ...current, baseRevision: nextRevision }));
}
