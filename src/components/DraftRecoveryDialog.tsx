import { useEffect, useRef, type KeyboardEvent } from 'react';
import { AlertTriangle, Cloud, Download, HardDriveDownload, ShieldCheck, Trash2 } from 'lucide-react';
import type { PendingBoardDraft } from '../lib/pendingDraftStore';

export function DraftRecoveryDialog({ drafts, serverRevision, onRestore, onDownload, onDiscard, onKeepServer }: {
  drafts: PendingBoardDraft[];
  serverRevision: number;
  onRestore: (draftId: string) => void;
  onDownload: (draftId: string) => void;
  onDiscard: (draftId: string) => void;
  onKeepServer: () => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => { if (drafts.length) dialog.current?.focus(); }, [drafts.length]);
  if (!drafts.length) return null;

  function keepFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab' || !dialog.current) return;
    const buttons = Array.from(dialog.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    if (!buttons.length) return;
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  return <div className="draft-recovery-backdrop">
    <section ref={dialog} className="draft-recovery-dialog" tabIndex={-1} role="dialog" aria-modal="true"
      aria-labelledby="draft-recovery-title" aria-describedby="draft-recovery-explanation" onKeyDown={keepFocus}>
      <div className="draft-recovery-head">
        <span className="draft-recovery-icon"><HardDriveDownload size={26}/></span>
        <span className="draft-recovery-eyebrow">UNSENT WORK FOUND</span>
        <h2 id="draft-recovery-title">Your progress is still here.</h2>
        <p id="draft-recovery-explanation">
          We found task edits saved on this device that may not have reached your account.
          Choose what to do before editing your online plan. We will never silently overwrite a newer server version.
        </p>
      </div>
      <div className="draft-recovery-list">
        {drafts.map(draft=>{
          const safe=draft.baseRevision===serverRevision;
          return <article className="draft-recovery-item" key={draft.draftId}>
            <div className="draft-recovery-summary">
              <strong>{new Date(draft.savedAt).toLocaleString('en-AU')}</strong>
              <span>{draft.board.tasks.length} reusable tasks · {draft.board.plannedEntries.length} planned copies</span>
            </div>
            {safe?<p className="draft-recovery-safe"><ShieldCheck size={16}/> The online revision is unchanged. This draft can be restored and synced.</p>:
              <p className="draft-recovery-conflict"><AlertTriangle size={16}/> A newer online version exists. Download this draft for manual reconciliation; automatic restoration is blocked.</p>}
            <div className="draft-recovery-actions">
              <button type="button" className="button button-primary" disabled={!safe} onClick={()=>onRestore(draft.draftId)}>
                <HardDriveDownload size={17}/> Restore edits
              </button>
              <button type="button" className="button button-secondary" onClick={()=>onDownload(draft.draftId)}>
                <Download size={17}/> Download draft
              </button>
              <button type="button" className="button button-secondary draft-recovery-delete" onClick={()=>onDiscard(draft.draftId)}>
                <Trash2 size={16}/> Discard this draft
              </button>
            </div>
          </article>;
        })}
      </div>
      <div className="draft-recovery-footer">
        <p><Cloud size={16}/> Online-first: server login is still required. Recovery files stay in this browser until saved or explicitly discarded. They are not encrypted on this device; avoid patient-identifiable information.</p>
        <button type="button" className="button button-secondary" onClick={onKeepServer}>Continue with online plan — keep these drafts</button>
      </div>
    </section>
  </div>;
}
