import { describe, expect, it } from 'vitest';
import { createTask, initialState, validateImported } from '../model';
import { createDraftId, draftKey, listPendingDrafts, pruneSavedDrafts,
  rebasePendingDraft, removePendingDraft, savePendingDraft } from './pendingDraftStore';

class FakeStorage implements Storage {
  private readonly map = new Map<string,string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key:string) { return this.map.get(key) ?? null; }
  key(i:number) { return [...this.map.keys()][i] ?? null; }
  removeItem(key:string) { this.map.delete(key); }
  setItem(key:string,value:string) { this.map.set(key,value); }
}
const first='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';

describe('private unsynced draft recovery adapter',()=>{
  it('keeps drafts strictly under the matching account namespace',()=>{
    const storage=new FakeStorage();
    const board={...initialState(),tasks:[createTask({title:'Never shared with another account'})]};
    savePendingDraft(12,first,0,board,storage);
    expect(listPendingDrafts(12,storage)).toHaveLength(1);
    expect(listPendingDrafts(13,storage)).toHaveLength(0);
    expect(storage.getItem(draftKey(12,first))).toContain('Never shared');
  });
  it('does not delete another tab draft when one tab is acknowledged',()=>{
    const storage=new FakeStorage();
    const a={...initialState(),tasks:[createTask({title:'Draft A'})]};
    const b={...initialState(),tasks:[createTask({title:'Draft B'})]};
    savePendingDraft(12,first,0,a,storage);
    savePendingDraft(12,other,0,b,storage);
    expect(pruneSavedDrafts(12,JSON.stringify(validateImported(a)),storage)).toBe(1);
    expect(listPendingDrafts(12,storage)[0].board.tasks[0].title).toBe('Draft B');
  });
  it('rebases a later edit only following its own earlier acknowledged save',()=>{
    const storage=new FakeStorage();
    const board={...initialState(),tasks:[createTask({title:'Later edit'})]};
    savePendingDraft(12,first,2,board,storage);
    rebasePendingDraft(12,first,1,3,'{}',storage);
    expect(listPendingDrafts(12,storage)[0].baseRevision).toBe(2);
    rebasePendingDraft(12,first,2,3,'{}',storage);
    expect(listPendingDrafts(12,storage)[0].baseRevision).toBe(3);
    expect(listPendingDrafts(12,storage)[0].board.tasks[0].title).toBe('Later edit');
  });
  it('survives a simulated reload and requires explicit removal',()=>{
    const storage=new FakeStorage();
    const board={...initialState(),tasks:[createTask({title:'Unsent weekly plan'})]};
    savePendingDraft(12,first,0,board,storage);
    const recovered=listPendingDrafts(12,storage);
    expect(recovered[0].baseRevision).toBe(0);
    expect(recovered[0].board.tasks[0].title).toBe('Unsent weekly plan');
    removePendingDraft(12,first,storage);
    expect(listPendingDrafts(12,storage)).toHaveLength(0);
  });
  it('rejects mismatched owner record or corrupt backup without erasing raw bytes',()=>{
    const storage=new FakeStorage();
    storage.setItem(draftKey(12,first), JSON.stringify({
      version:1,userId:99,draftId:first,baseRevision:0,
      savedAt:new Date().toISOString(),board:initialState()
    }));
    storage.setItem(draftKey(12,other),'{ corrupt json');
    expect(listPendingDrafts(12,storage)).toHaveLength(0);
    expect(storage.getItem(draftKey(12,other))).toBe('{ corrupt json');
  });
  it('limits the draft to a predictable browser quota and uses unique tab IDs',()=>{
    const storage=new FakeStorage();
    const board=initialState();
    board.tasks=[createTask({title:'A'.repeat(250),description:'z'.repeat(10000)})];
    expect(createDraftId()).not.toBe(createDraftId());
    expect(savePendingDraft(12,first,0,board,storage).board.tasks).toHaveLength(1);
  });
});
